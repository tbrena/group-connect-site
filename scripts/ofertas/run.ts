/**
 * Loop principal: busca ofertas no ML → filtra → publica no Telegram → atualiza o site.
 *
 *   npm run ofertas               # publica
 *   npm run ofertas -- --dry      # só mostra o que publicaria
 *   npm run ofertas -- --so-site  # atualiza public/ofertas.json sem postar no Telegram
 *
 * Estado em .ofertas/: publicadas.json guarda o último preço postado de cada produto — só
 * reposta se o preço caiu ≥5% e passaram 24 h;
 * precos.json acumula o menor preço diário de cada produto (selo "menor preço em 30 dias").
 */
import fs from "node:fs/promises";
import path from "node:path";
import { affiliateLink, linkRastreado } from "./afiliado.ts";
import { carregarCacheProdutos, salvarCacheProdutos } from "./cache-produtos.ts";
import { carregarCacheVendedores, salvarCacheVendedores } from "./cache-vendedores.ts";
import {
  carregarHistorico,
  menorPrecoEm30Dias,
  salvarHistorico,
  tamanhoHistorico,
} from "./historico.ts";
import {
  estatisticas,
  mapLimited,
  revalidarOferta,
  searchDeals,
  type MlItem,
} from "./ml-client.ts";
import {
  cuponsDeCategoria,
  melhorCupom,
  rodadaDeCupons,
  type ConfigCupons,
} from "./cupons-telegram.ts";
import { enfileirar, salvarFila } from "./fila-whatsapp.ts";
import { imagemDaOferta } from "./imagem.ts";
import { botoes, legendaTelegram, textoWhatsApp, type DadosMensagem } from "./mensagem.ts";
import { medalhaDaPosicao } from "../../src/lib/chamadas.ts";
import { revalidarShopee, searchShopeeDeals, shopeeFonte } from "./shopee-client.ts";
import { sendPhoto } from "./telegram.ts";

const DRY = process.argv.includes("--dry");
/** --max=N publica N ofertas nesta rodada em vez do maxPerRun do config. */
const MAX_ARG = Number(process.argv.find((a) => a.startsWith("--max="))?.slice(6)) || 0;
/** Só o site: não posta no Telegram nem marca como publicada (útil para pré-visualizar). */
const SITE_ONLY = process.argv.includes("--so-site");
/** --forcar: posta no Telegram mesmo que a última postagem tenha sido há pouco (disparo manual). */
const FORCAR = process.argv.includes("--forcar");
/**
 * O Actions tenta duas vezes por hora (o agendador do GitHub descarta execuções em
 * pico). Quando as duas rodam, só a primeira posta no Telegram; a outra atualiza o site.
 */
const MIN_INTERVALO_POSTS_MS = 45 * 60_000;
const STATE_FILE = path.resolve(".ofertas/publicadas.json");
const SITE_FILE = path.resolve("public/ofertas.json");
const CONFIG_FILE = path.resolve("scripts/ofertas/config.json");
/** Registro de "já publicada" é guardado por 30 dias (limpeza do arquivo). */
const REPEAT_AFTER_MS = 30 * 24 * 60 * 60 * 1000;
/** Fração do siteMax reservada às ofertas já postadas no Telegram; o resto é disputado pelo critério. */
const GARANTIDAS_MAX_FRACAO = 0.7;
/** Um PRODUTO só volta ao canal se o preço caiu pelo menos isto desde o último post… */
const QUEDA_MINIMA_PARA_REPOSTAR = 0.05;
/** …e nunca antes de 24 h, mesmo com queda. */
const INTERVALO_MINIMO_REPOST_MS = 24 * 60 * 60 * 1000;

/** Estado de "já publicada": só o timestamp (formato antigo) ou timestamp + id da mensagem no canal. */
type Publicada =
  number | { ts: number; msg?: number; price?: number; productId?: string; titulo?: string };
const tsDe = (p: Publicada | undefined) => (typeof p === "number" ? p : p?.ts);

/**
 * Título normalizado (sem acento, caixa, pontuação e espaços repetidos). Na Shopee
 * o mesmo produto é anunciado por várias lojas com o título idêntico e cada anúncio
 * tem um id diferente — o título é o que denuncia que é "a mesma oferta".
 */
const chaveTitulo = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * Já foi postada (este anúncio, outro anúncio do mesmo produto, ou um anúncio com o
 * mesmo título) sem que o preço tenha caído de verdade desde então? "Mesma promoção
 * de novo" é o que mais irrita quem acompanha o canal: sem queda ≥5% e 24 h
 * passadas, não reposta.
 */
function jaPostadaSemQueda(published: Record<string, Publicada>, item: MlItem, now: number) {
  const titulo = chaveTitulo(item.title);
  const registros = Object.entries(published)
    .map(([id, p]) => ({ id, p }))
    .filter(
      ({ id, p }) =>
        id === item.id ||
        (typeof p === "object" &&
          ((p.productId && p.productId === item.productId) || (p.titulo && p.titulo === titulo))),
    );
  for (const { p } of registros) {
    const ts = tsDe(p) ?? 0;
    if (now - ts < INTERVALO_MINIMO_REPOST_MS) return true;
    const precoAnterior = typeof p === "object" ? p.price : undefined;
    // registro antigo sem preço: mantém a regra velha de 7 dias
    if (precoAnterior === undefined) {
      if (now - ts < 7 * 24 * 60 * 60 * 1000) return true;
      continue;
    }
    if (item.price > precoAnterior * (1 - QUEDA_MINIMA_PARA_REPOSTAR)) return true;
  }
  return false;
}
const PAUSA_ENTRE_POSTS_MS = 3000;

async function salvarPublicadas(published: Record<string, Publicada>): Promise<void> {
  await fs.mkdir(path.dirname(STATE_FILE), { recursive: true });
  await fs.writeFile(STATE_FILE, JSON.stringify(published, null, 2));
}

interface Config {
  /** desconto real mínimo (%) contra a mediana dos outros vendedores */
  minDiscount: number;
  /** acima disso costuma ser anúncio errado ou golpe */
  maxDiscount: number;
  /** quantos outros vendedores o produto precisa ter para a comparação valer */
  minSellers: number;
  /** reputação mínima do vendedor no ML (1 a 5; 0 = não filtra) */
  minReputacao: number;
  /** só publica anúncios de loja oficial (corta ~75% das ofertas) */
  somenteLojaOficial: boolean;
  /** teto total de posts no Telegram por rodada */
  maxPerRun: number;
  /** cota por marketplace dentro da rodada (ex.: { ml: 10, shopee: 10 }); sem isso, só o teto total */
  maxPorMarketplace?: Partial<Record<"ml" | "shopee", number>>;
  /** quantas ofertas ficam em public/ofertas.json (home mostra 6, /promo mostra todas) */
  siteMax: number;
  minPrice: number;
  /** critério da Shopee (sem catálogo unificado, o desconto é o declarado: exigimos vendas e avaliação) */
  shopee?: { minDiscount: number; minVendas: number; minAvaliacao: number };
  /** cupons de canais públicos do Telegram (scripts/ofertas/cupons-telegram.ts); ausente = desligado */
  cupons?: ConfigCupons;
  buscas: Array<{
    /** "ml" (padrão) ou "shopee" */
    fonte?: "ml" | "shopee";
    query?: string;
    category?: string;
    shopeeCategory?: number;
    /** lista pronta da Shopee (listType), ex.: 2 = mais vendidos em promoção */
    shopeeLista?: number;
    categoria?: string;
    limit?: number;
    /** Shopee: páginas de `limit` a buscar (padrão 1) */
    paginas?: number;
  }>;
}

/** Oferta como vai para o site (public/ofertas.json). */
export interface SiteOffer {
  id: string;
  productId: string;
  /** de qual marketplace veio ("ml" ou "shopee"); ausente em JSONs antigos = ml */
  marketplace: "ml" | "shopee";
  /** categoria ou busca que achou a oferta (id/termo, uso interno) */
  fonte: string;
  /** nome da categoria mostrado no site (do config.json) */
  categoria: string;
  title: string;
  price: number;
  /** preço de referência do desconto: a mediana dos outros vendedores, ou o "de" declarado (campanha oficial) */
  originalPrice: number;
  /** desconto real (%) contra originalPrice */
  discount: number;
  base: "media" | "vendedor";
  averagePrice: number | null;
  sellers: number;
  image: string;
  url: string;
  freeShipping: boolean;
  /** desconto de campanha oficial do ML (deal_ids) */
  oficial: boolean;
  /** vendedor é loja oficial (marca ou autorizado) */
  lojaOficial: boolean;
  /** nome da loja oficial; null quando não é */
  loja: string | null;
  /** menor preço observado pelo bot nos últimos 30 dias */
  lowest30d: boolean;
  /** unidades vendidas do anúncio (só Shopee; null no ML) */
  vendas: number | null;
  /** quando entrou no site */
  publishedAt: string;
  /** última vez que o bot conferiu preço e estoque (revalidação a cada rodada) */
  checkedAt: string;
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function referencia(item: MlItem): number {
  return item.base === "media" ? item.averagePrice! : item.claimedPrice!;
}

/** fonte (MLB1055 ou "q:air fryer") → nome da categoria configurado em config.json. */
let categorias = new Map<string, string>();
/**
 * Relógio inteligente vira "Smartwatches" venha de onde vier (a categoria de celulares do
 * ML, a busca "relogio masculino" da Shopee…): antes eram ~3/4 da categoria Celulares.
 */
const SMARTWATCH =
  /smart\s?watch|smart\s?band|rel[oó]gio inteligente|\bmi band\b|galaxy watch|apple watch|amazfit/i;
const categoriaDe = (item: { fonte: string; title: string }) =>
  SMARTWATCH.test(item.title) ? "Smartwatches" : (categorias.get(item.fonte) ?? "Outros");

function toSiteOffer(item: MlItem, now: number): SiteOffer {
  return {
    id: item.id,
    productId: item.productId,
    marketplace: item.marketplace,
    fonte: item.fonte,
    categoria: categoriaDe(item),
    title: item.title,
    price: item.price,
    originalPrice: referencia(item),
    discount: item.discount,
    base: item.base,
    averagePrice: item.averagePrice,
    sellers: item.sellers,
    image: item.thumbnail,
    // Shopee: o permalink já é o link de afiliado da API; ML: acrescenta matt_word/matt_tool.
    url: item.marketplace === "shopee" ? item.permalink : affiliateLink(item.permalink),
    freeShipping: Boolean(item.shipping?.free_shipping),
    oficial: item.oficial,
    lojaOficial: item.lojaOficial,
    loja: item.loja,
    lowest30d: menorPrecoEm30Dias(item.productId, item.price),
    vendas: item.vendas ?? null,
    publishedAt: new Date(now).toISOString(),
    checkedAt: new Date(now).toISOString(),
  };
}

const LINKS_FILE = path.resolve("public/links.json");
const LINKS_RETENCAO_MS = 60 * 24 * 60 * 60 * 1000;

/**
 * public/links.json: id → link de afiliado das ofertas Shopee (postadas ou no
 * site). O /ir/ do site consulta este arquivo quando a oferta já saiu do
 * ofertas.json — na Shopee o link não é derivável do id, como é no ML.
 */
async function salvarLinksShopee(
  itens: Array<{ marketplace: "ml" | "shopee"; id: string; permalink: string }>,
): Promise<void> {
  const links = await readJson<Record<string, { url: string; ts: number }>>(LINKS_FILE, {});
  const agora = Date.now();
  for (const it of itens) {
    if (it.marketplace === "shopee" && it.permalink)
      links[it.id] = { url: it.permalink, ts: agora };
  }
  for (const [id, l] of Object.entries(links)) {
    if (agora - l.ts > LINKS_RETENCAO_MS) delete links[id];
  }
  await fs.writeFile(LINKS_FILE, JSON.stringify(links));
}

/** MlItem → o que a mensagem precisa (mensagem.ts serve posts novos e antigos). */
function dadosDe(item: MlItem): DadosMensagem {
  return {
    ...item,
    categoria: categoriaDe(item),
    freeShipping: Boolean(item.shipping?.free_shipping),
    lowest30d: menorPrecoEm30Dias(item.productId, item.price),
    quando: new Date().toISOString(),
  };
}

async function main() {
  const config = await readJson<Config>(CONFIG_FILE, {
    minDiscount: 15,
    maxDiscount: 70,
    minSellers: 3,
    minReputacao: 4,
    somenteLojaOficial: false,
    maxPerRun: 5,
    siteMax: 500,
    minPrice: 0,
    buscas: [],
  });
  // A chave é o `fonte` que o cliente de cada marketplace grava na oferta.
  categorias = new Map(
    config.buscas.map((b) => {
      const chave =
        b.fonte === "shopee"
          ? shopeeFonte({ lista: b.shopeeLista, shopeeCategory: b.shopeeCategory, query: b.query })
          : (b.category ?? `q:${b.query}`);
      return [chave, b.categoria ?? "Outros"] as const;
    }),
  );
  const criterio = {
    minDiscount: config.minDiscount,
    minSellers: config.minSellers,
    minReputacao: config.minReputacao,
    somenteLojaOficial: config.somenteLojaOficial,
  };
  const criterioShopee = config.shopee ?? { minDiscount: 30, minVendas: 100, minAvaliacao: 4.5 };
  const published = await readJson<Record<string, Publicada>>(STATE_FILE, {});
  const siteOffers = await readJson<SiteOffer[]>(SITE_FILE, []);
  // Postagens de antes do registro de título: preenche pelo site, para a proteção
  // contra repost por título valer também para elas.
  const tituloNoSite = new Map(siteOffers.map((o) => [o.id, chaveTitulo(o.title)] as const));
  for (const [id, p] of Object.entries(published)) {
    const titulo = tituloNoSite.get(id);
    if (typeof p === "object" && !p.titulo && titulo) p.titulo = titulo;
  }
  await carregarHistorico();
  await carregarCacheProdutos();
  await carregarCacheVendedores();
  const now = Date.now();

  // 1. Coleta candidatos de todas as buscas, sem repetir item.
  const seen = new Set<string>();
  const candidates: MlItem[] = [];
  let buscasFalhas = 0;
  // Para onde foram os itens (diagnóstico quando a rodada vem vazia).
  const funil = {
    ml: { buscas: 0, vazias: 0, itens: 0 },
    shopee: { buscas: 0, vazias: 0, itens: 0 },
    descartes: { repetido: 0, precoMinimo: 0, descontoAlto: 0, jaPostada: 0 },
  };
  for (const busca of config.buscas) {
    try {
      const items =
        busca.fonte === "shopee"
          ? await searchShopeeDeals({
              query: busca.query,
              shopeeCategory: busca.shopeeCategory,
              lista: busca.shopeeLista,
              limit: busca.limit,
              paginas: busca.paginas,
              ...criterioShopee,
            })
          : await searchDeals({ ...busca, ...criterio });
      const f = funil[busca.fonte === "shopee" ? "shopee" : "ml"];
      f.buscas++;
      f.itens += items.length;
      if (items.length === 0) f.vazias++;
      for (const item of items) {
        if (seen.has(item.id)) {
          funil.descartes.repetido++;
          continue;
        }
        seen.add(item.id);
        if (item.price < config.minPrice) {
          funil.descartes.precoMinimo++;
          continue;
        }
        if (item.discount > config.maxDiscount) {
          funil.descartes.descontoAlto++;
          continue;
        }
        if (jaPostadaSemQueda(published, item, now)) {
          funil.descartes.jaPostada++;
          continue;
        }
        candidates.push(item);
      }
    } catch (err) {
      buscasFalhas++;
      console.error(`Busca ${JSON.stringify(busca)} falhou:`, (err as Error).message);
    }
  }
  console.log(
    `funil: ML ${funil.ml.itens} ofertas em ${funil.ml.buscas} buscas (${funil.ml.vazias} vazias) · ` +
      `Shopee ${funil.shopee.itens} em ${funil.shopee.buscas} (${funil.shopee.vazias} vazias) · ` +
      `descartes ${JSON.stringify(funil.descartes)} · 404 da API ML ${JSON.stringify(estatisticas.naoEncontrado)} · ` +
      `${estatisticas.requisicoes} requisições`,
  );
  // Se a API caiu (metade das buscas falhou, ou as buscas não trouxeram NADA), não publicar
  // um site vazio por cima do bom: sai com erro para o Actions ficar vermelho.
  // Zero candidatos com as buscas trazendo ofertas é outra coisa: tudo já foi postado nas
  // últimas 24 h. A rodada segue (site revalidado, cupons), só não há oferta nova no canal.
  const itensDasBuscas = funil.ml.itens + funil.shopee.itens;
  if (buscasFalhas > config.buscas.length / 2 || (itensDasBuscas === 0 && config.buscas.length)) {
    throw new Error(
      `rodada abortada: ${buscasFalhas}/${config.buscas.length} buscas falharam, ${itensDasBuscas} ofertas encontradas — site mantido como estava`,
    );
  }
  if (candidates.length === 0)
    console.log("Nada novo: tudo o que as buscas acharam já foi postado.");

  // 2. Campanhas oficiais do ML primeiro, depois maior desconto real; limitado por execução.
  candidates.sort((a, b) => Number(b.oficial) - Number(a.oficial) || b.discount - a.discount);
  // Sem repetir dentro da rodada: o mesmo produto pode vir de duas buscas (categoria e
  // palavra-chave) com anúncios diferentes, e na Shopee várias lojas usam o mesmo título.
  // Cota por marketplace: o desconto da Shopee é o declarado pelo vendedor (maior) e o do
  // ML é o real contra a mediana (menor); sem cota a Shopee levava todas as vagas.
  const limite = MAX_ARG || config.maxPerRun;
  const cota = (m: MlItem["marketplace"]) => config.maxPorMarketplace?.[m] ?? limite;
  const porLoja: Record<MlItem["marketplace"], MlItem[]> = { ml: [], shopee: [] };
  const produtosDaRodada = new Set<string>();
  const titulosDaRodada = new Set<string>();
  // Shopee: uma oferta por loja na rodada — a mesma loja anuncia o mesmo produto com
  // títulos diferentes (ex.: dois "Ventilador de Teto 80w" seguidos no canal).
  const lojasShopeeDaRodada = new Set<number>();
  for (const c of candidates) {
    const fila = porLoja[c.marketplace];
    if (fila.length >= cota(c.marketplace)) continue;
    const titulo = chaveTitulo(c.title);
    if (produtosDaRodada.has(c.productId) || titulosDaRodada.has(titulo)) continue;
    if (c.marketplace === "shopee" && lojasShopeeDaRodada.has(c.sellerId)) continue;
    produtosDaRodada.add(c.productId);
    titulosDaRodada.add(titulo);
    if (c.marketplace === "shopee") lojasShopeeDaRodada.add(c.sellerId);
    fila.push(c);
  }
  // Intercala (ML, Shopee, ML…) para o canal não ter uma sequência só de uma loja;
  // cada fila já vem da melhor para a pior, então as medalhas vão para as primeiras.
  const picked: MlItem[] = [];
  for (let i = 0; picked.length < limite; i++) {
    const vez = [porLoja.ml[i], porLoja.shopee[i]].filter((x): x is MlItem => x !== undefined);
    if (!vez.length) break;
    picked.push(...vez.slice(0, limite - picked.length));
  }
  const hist = tamanhoHistorico();
  console.log(
    `${candidates.length} candidatos, publicando ${picked.length}${DRY ? " (dry-run)" : ""} · histórico: ${hist.produtos} produtos, ${hist.observacoes} observações`,
  );
  console.log(
    `API ML: ${estatisticas.requisicoes} requisições · ${estatisticas.cache} produtos do cache · ${estatisticas.repeticoes} repetições por 429/5xx\n`,
  );

  // 3. Publica — a menos que a última postagem tenha sido há pouco (segundo horário da hora).
  const ultimaPostagem = Math.max(0, ...Object.values(published).map((p) => tsDe(p) ?? 0));
  const minutosDesdeUltima = Math.round((now - ultimaPostagem) / 60_000);
  const pularTelegram =
    !DRY && !SITE_ONLY && !FORCAR && now - ultimaPostagem < MIN_INTERVALO_POSTS_MS;
  if (pularTelegram) {
    console.log(
      `Telegram pulado nesta rodada: última postagem há ${minutosDesdeUltima} min (mínimo ${MIN_INTERVALO_POSTS_MS / 60_000}). Site será atualizado.\n`,
    );
  }
  // Cupons de categoria das últimas 12 h (coletados na rodada anterior) para ir junto na oferta.
  const cupons = await cuponsDeCategoria(12).catch(() => []);
  for (const [posicao, item] of picked.entries()) {
    const link = linkRastreado(item, "tg");
    // picked já vem do melhor para o pior: as 3 primeiras da rodada ganham medalha.
    const base = dadosDe(item);
    const cupom = melhorCupom({ ...base, marketplace: item.marketplace }, cupons) ?? undefined;
    const dados = { ...base, medalha: medalhaDaPosicao(posicao), cupom };
    const text = legendaTelegram(dados);
    const etiquetas = [
      item.base === "media" ? `vs. média ${brl(item.averagePrice!)} de ${item.sellers}` : "de/por",
      item.oficial ? "OFICIAL" : "",
      menorPrecoEm30Dias(item.productId, item.price) ? "MENOR 30d" : "",
      cupom ? `CUPOM ${cupom.codigo} → ${brl(cupom.precoFinal)}` : "",
    ]
      .filter(Boolean)
      .join(", ");
    console.log(
      `${item.discount}%  ${brl(item.price)}  ${item.title}\n   [${etiquetas}]\n   ${link}\n`,
    );
    if (DRY) continue;

    if (SITE_ONLY || pularTelegram) continue;

    // Foto com a faixa da marca; se a montagem falhar, vai a foto original.
    const foto = await imagemDaOferta({
      ...item,
      lowest30d: menorPrecoEm30Dias(item.productId, item.price),
    }).catch((err: Error) => {
      console.error(`  imagem com marca falhou (${err.message}); usando a original`);
      return item.thumbnail;
    });
    // Um post que falha (Telegram fora, foto recusada) não derruba a rodada: loga e segue.
    try {
      const enviada = await sendPhoto(foto, text, botoes(dados));
      published[item.id] = {
        ts: now,
        msg: enviada.result?.message_id,
        price: item.price,
        productId: item.productId,
        titulo: chaveTitulo(item.title),
      };
    } catch (err) {
      console.error(`  post de ${item.id} falhou: ${(err as Error).message}`);
      continue;
    }
    // O que saiu no Telegram vai para a fila do bot do WhatsApp (bot/), mesmo texto e cupom.
    enfileirar({
      tipo: "oferta",
      id: item.id,
      ordem: posicao,
      marketplace: item.marketplace,
      texto: textoWhatsApp(dados, { paraLink: false }),
      imagem: item.thumbnail || null,
    });
    // Estado salvo a cada post: se a rodada cair no meio, nada é repostado depois.
    await salvarPublicadas(published);
    // Pausa entre posts: o Telegram limita a ~20 mensagens/min por canal.
    await new Promise((r) => setTimeout(r, PAUSA_ENTRE_POSTS_MS));
  }

  if (DRY) return;
  // Já grava a fila do WhatsApp aqui: se algo abaixo falhar, o que foi postado não se perde.
  await salvarFila();

  // 4. Site: os melhores candidatos desta rodada na frente, depois os que já
  //    estavam (sem repetir), limitado a siteMax. Entradas de antes do critério
  //    de desconto real (sem `base`) são descartadas — o "% OFF" delas não era real.
  // publishedAt é "quando entrou no site": quem já estava mantém a data original
  // (é o que alimenta a aba "Novas" do /promo); checkedAt é sempre agora.
  //    Ordem: (a) o que já está no site e continua válido — inclusive o que foi postado
  //    no Telegram, que sai dos candidatos por 7 dias mas PRECISA ficar no site para o
  //    link /ir/ ter prévia e comissão; (b) candidatos novos completam até siteMax.
  const entradaAnterior = new Map(siteOffers.map((o) => [o.id, o.publishedAt] as const));
  const candidatosPorId = new Map(candidates.map((c) => [c.id, c] as const));
  const antigas = siteOffers.filter((o) => o.base && o.productId);
  let removidas = 0;
  let erros = 0;
  const revalidadas = (
    await mapLimited(antigas, async (o) => {
      // Se a busca desta rodada já reavaliou o item, reaproveita (sem nova requisição).
      const daBusca = candidatosPorId.get(o.id);
      if (daBusca) return { ...toSiteOffer(daBusca, now), publishedAt: o.publishedAt };
      try {
        const atual = await (o.marketplace === "shopee" || o.id.startsWith("SP")
          ? revalidarShopee(o.id, o.fonte, criterioShopee)
          : revalidarOferta(
              {
                productId: o.productId,
                id: o.id,
                title: o.title,
                thumbnail: o.image,
                fonte: o.fonte,
              },
              criterio,
            ));
        if (!atual || atual.discount > config.maxDiscount) {
          removidas++;
          return null;
        }
        return { ...toSiteOffer(atual, now), publishedAt: o.publishedAt };
      } catch (err) {
        // Erro de rede/API não é "sumiu": mantém a oferta como estava.
        erros++;
        console.error(`  revalidação de ${o.id} falhou (${(err as Error).message}); mantida`);
        return o;
      }
    })
  ).filter((o): o is SiteOffer => o !== null);
  if (antigas.length && removidas > antigas.length / 2) {
    throw new Error(
      `rodada abortada: revalidação removeria ${removidas}/${antigas.length} ofertas — provável falha da API; site mantido`,
    );
  }
  const idsMantidos = new Set(revalidadas.map((o) => o.id));
  const novos = candidates
    .filter((c) => !idsMantidos.has(c.id))
    .map((item) => ({
      ...toSiteOffer(item, now),
      publishedAt: entradaAnterior.get(item.id) ?? new Date(now).toISOString(),
    }));
  // Vagas: as postadas no Telegram têm lugar garantido (a prévia do link /ir/ delas usa
  // o site) — mas só até GARANTIDAS_MAX_FRACAO do siteMax, as mais recentes primeiro.
  // Sem esse teto o pool de postadas (30 dias × ~10 posts a cada 45 min) passava de
  // 800 e ocupava o site inteiro: nada novo entrava, nem a Shopee. As postadas que
  // ficam fora do teto não somem: disputam a vaga pelo critério junto com as novas,
  // e o redirect /ir/ delas continua funcionando mesmo fora do site.
  const ordenar = (a: SiteOffer, b: SiteOffer) =>
    Number(b.oficial) - Number(a.oficial) || b.discount - a.discount;
  const vagasGarantidas = Math.floor(config.siteMax * GARANTIDAS_MAX_FRACAO);
  const postadas = revalidadas
    .filter((o) => tsDe(published[o.id]) !== undefined)
    .sort((a, b) => (tsDe(published[b.id]) ?? 0) - (tsDe(published[a.id]) ?? 0));
  const garantidas = postadas.slice(0, vagasGarantidas);
  const disputam = [
    ...postadas.slice(vagasGarantidas),
    ...revalidadas.filter((o) => tsDe(published[o.id]) === undefined),
    ...novos,
  ];
  const site = [...garantidas.sort(ordenar), ...disputam.sort(ordenar)].slice(0, config.siteMax);
  console.log(
    `site: ${garantidas.length} postadas garantidas (de ${postadas.length}, teto ${vagasGarantidas}) + ${site.length - garantidas.length} por critério (${revalidadas.length} antigas revalidadas, ${removidas} removidas, ${erros} com erro mantidas, ${novos.length} novas candidatas) = ${site.length}`,
  );

  // 5. Persiste estado, histórico e o JSON do site.
  for (const [id, p] of Object.entries(published)) {
    if (now - (tsDe(p) ?? 0) > REPEAT_AFTER_MS) delete published[id];
  }
  if (!SITE_ONLY) {
    await fs.mkdir(path.dirname(STATE_FILE), { recursive: true });
    await fs.writeFile(STATE_FILE, JSON.stringify(published, null, 2));
  }
  await salvarLinksShopee([
    ...candidates,
    ...site.map((o) => ({ marketplace: o.marketplace, id: o.id, permalink: o.url })),
  ]);
  await salvarHistorico();
  await salvarCacheProdutos();
  await salvarCacheVendedores();
  await fs.writeFile(SITE_FILE, JSON.stringify(site, null, 2));
  console.log(`Site atualizado (${site.length} ofertas): ${SITE_FILE}`);

  // 6. Cupons dos canais públicos: site sempre; Telegram só nas rodadas que postam.
  //    Falha aqui não derruba a rodada — as ofertas já foram salvas.
  if (config.cupons?.canais.length) {
    try {
      await rodadaDeCupons(config.cupons, !SITE_ONLY);
    } catch (err) {
      console.error(`cupons: rodada falhou (${(err as Error).message})`);
    }
  }
  await salvarFila();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

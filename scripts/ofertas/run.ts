/**
 * Loop principal: busca ofertas no ML → filtra → publica no Telegram → atualiza o site.
 *
 *   npm run ofertas               # publica
 *   npm run ofertas -- --dry      # só mostra o que publicaria
 *   npm run ofertas -- --so-site  # atualiza public/ofertas.json sem postar no Telegram
 *
 * Estado em .ofertas/: publicadas.json evita repetir a mesma oferta por 7 dias;
 * precos.json acumula o menor preço diário de cada produto (selo "menor preço em 30 dias").
 */
import fs from "node:fs/promises";
import path from "node:path";
import { affiliateLink, linkRastreado } from "./afiliado.ts";
import { carregarCacheProdutos, salvarCacheProdutos } from "./cache-produtos.ts";
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
import { imagemDaOferta } from "./imagem.ts";
import { botoes, legendaTelegram, type DadosMensagem } from "./mensagem.ts";
import { sendPhoto } from "./telegram.ts";

const DRY = process.argv.includes("--dry");
/** --max=N publica N ofertas nesta rodada em vez do maxPerRun do config. */
const MAX_ARG = Number(process.argv.find((a) => a.startsWith("--max="))?.slice(6)) || 0;
/** Só o site: não posta no Telegram nem marca como publicada (útil para pré-visualizar). */
const SITE_ONLY = process.argv.includes("--so-site");
const STATE_FILE = path.resolve(".ofertas/publicadas.json");
const SITE_FILE = path.resolve("public/ofertas.json");
const CONFIG_FILE = path.resolve("scripts/ofertas/config.json");
const REPEAT_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

/** Estado de "já publicada": só o timestamp (formato antigo) ou timestamp + id da mensagem no canal. */
type Publicada = number | { ts: number; msg?: number };
const tsDe = (p: Publicada | undefined) => (typeof p === "number" ? p : p?.ts);
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
  maxPerRun: number;
  /** quantas ofertas ficam em public/ofertas.json (home mostra 6, /promo mostra todas) */
  siteMax: number;
  minPrice: number;
  buscas: Array<{ query?: string; category?: string; categoria?: string }>;
}

/** Oferta como vai para o site (public/ofertas.json). */
export interface SiteOffer {
  id: string;
  productId: string;
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
  /** menor preço observado pelo bot nos últimos 30 dias */
  lowest30d: boolean;
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
const categoriaDe = (fonte: string) => categorias.get(fonte) ?? "Outros";

function toSiteOffer(item: MlItem, now: number): SiteOffer {
  return {
    id: item.id,
    productId: item.productId,
    fonte: item.fonte,
    categoria: categoriaDe(item.fonte),
    title: item.title,
    price: item.price,
    originalPrice: referencia(item),
    discount: item.discount,
    base: item.base,
    averagePrice: item.averagePrice,
    sellers: item.sellers,
    image: item.thumbnail,
    url: affiliateLink(item.permalink),
    freeShipping: Boolean(item.shipping?.free_shipping),
    oficial: item.oficial,
    lowest30d: menorPrecoEm30Dias(item.productId, item.price),
    publishedAt: new Date(now).toISOString(),
    checkedAt: new Date(now).toISOString(),
  };
}

/** MlItem → o que a mensagem precisa (mensagem.ts serve posts novos e antigos). */
function dadosDe(item: MlItem): DadosMensagem {
  return {
    ...item,
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
    maxPerRun: 5,
    siteMax: 99,
    minPrice: 0,
    buscas: [],
  });
  categorias = new Map(
    config.buscas.map((b) => [b.category ?? `q:${b.query}`, b.categoria ?? "Outros"] as const),
  );
  const published = await readJson<Record<string, Publicada>>(STATE_FILE, {});
  const siteOffers = await readJson<SiteOffer[]>(SITE_FILE, []);
  await carregarHistorico();
  await carregarCacheProdutos();
  const now = Date.now();

  // 1. Coleta candidatos de todas as buscas, sem repetir item.
  const seen = new Set<string>();
  const candidates: MlItem[] = [];
  for (const busca of config.buscas) {
    try {
      const items = await searchDeals({
        ...busca,
        minDiscount: config.minDiscount,
        minSellers: config.minSellers,
      });
      for (const item of items) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        if (item.price < config.minPrice) continue;
        if (item.discount > config.maxDiscount) continue;
        const antes = tsDe(published[item.id]);
        if (antes !== undefined && now - antes < REPEAT_AFTER_MS) continue;
        candidates.push(item);
      }
    } catch (err) {
      console.error(`Busca ${JSON.stringify(busca)} falhou:`, (err as Error).message);
    }
  }

  // 2. Campanhas oficiais do ML primeiro, depois maior desconto real; limitado por execução.
  candidates.sort((a, b) => Number(b.oficial) - Number(a.oficial) || b.discount - a.discount);
  const picked = candidates.slice(0, MAX_ARG || config.maxPerRun);
  const hist = tamanhoHistorico();
  console.log(
    `${candidates.length} candidatos, publicando ${picked.length}${DRY ? " (dry-run)" : ""} · histórico: ${hist.produtos} produtos, ${hist.observacoes} observações`,
  );
  console.log(
    `API ML: ${estatisticas.requisicoes} requisições · ${estatisticas.cache} produtos do cache · ${estatisticas.repeticoes} repetições por 429/5xx\n`,
  );

  // 3. Publica.
  for (const item of picked) {
    const link = linkRastreado(item, "tg");
    const dados = dadosDe(item);
    const text = legendaTelegram(dados);
    const etiquetas = [
      item.base === "media" ? `vs. média ${brl(item.averagePrice!)} de ${item.sellers}` : "de/por",
      item.oficial ? "OFICIAL" : "",
      menorPrecoEm30Dias(item.productId, item.price) ? "MENOR 30d" : "",
    ]
      .filter(Boolean)
      .join(", ");
    console.log(
      `${item.discount}%  ${brl(item.price)}  ${item.title}\n   [${etiquetas}]\n   ${link}\n`,
    );
    if (DRY) continue;

    if (SITE_ONLY) continue;

    // Foto com a faixa da marca; se a montagem falhar, vai a foto original.
    const foto = await imagemDaOferta({
      ...item,
      lowest30d: menorPrecoEm30Dias(item.productId, item.price),
    }).catch((err: Error) => {
      console.error(`  imagem com marca falhou (${err.message}); usando a original`);
      return item.thumbnail;
    });
    const enviada = await sendPhoto(foto, text, botoes(dados));
    published[item.id] = { ts: now, msg: enviada.result?.message_id };
    // Estado salvo a cada post: se a rodada cair no meio, nada é repostado depois.
    await salvarPublicadas(published);
    // Pausa entre posts: o Telegram limita a ~20 mensagens/min por canal.
    await new Promise((r) => setTimeout(r, PAUSA_ENTRE_POSTS_MS));
  }

  if (DRY) return;

  // 4. Site: os melhores candidatos desta rodada na frente, depois os que já
  //    estavam (sem repetir), limitado a siteMax. Entradas de antes do critério
  //    de desconto real (sem `base`) são descartadas — o "% OFF" delas não era real.
  const novos = candidates.slice(0, config.siteMax).map((item) => toSiteOffer(item, now));
  const idsNovos = new Set(novos.map((o) => o.id));
  //    As que ficam são revalidadas com o preço de agora: sumiu ou subiu, sai.
  const antigas = siteOffers.filter((o) => o.base && o.productId && !idsNovos.has(o.id));
  const revalidadas = (
    await mapLimited(antigas, async (o) => {
      const atual = await revalidarOferta(
        { productId: o.productId, id: o.id, title: o.title, thumbnail: o.image, fonte: o.fonte },
        { minDiscount: config.minDiscount, minSellers: config.minSellers },
      ).catch(() => null);
      if (!atual || atual.discount > config.maxDiscount) return null;
      return { ...toSiteOffer(atual, now), publishedAt: o.publishedAt };
    })
  ).filter((o): o is SiteOffer => o !== null);
  console.log(
    `site: ${novos.length} novas + ${revalidadas.length} antigas ainda válidas (${antigas.length - revalidadas.length} removidas por preço/estoque)`,
  );
  const site = [...novos, ...revalidadas].slice(0, config.siteMax);

  // 5. Persiste estado, histórico e o JSON do site.
  for (const [id, p] of Object.entries(published)) {
    if (now - (tsDe(p) ?? 0) > REPEAT_AFTER_MS) delete published[id];
  }
  if (!SITE_ONLY) {
    await fs.mkdir(path.dirname(STATE_FILE), { recursive: true });
    await fs.writeFile(STATE_FILE, JSON.stringify(published, null, 2));
  }
  await salvarHistorico();
  await salvarCacheProdutos();
  await fs.writeFile(SITE_FILE, JSON.stringify(site, null, 2));
  console.log(`Site atualizado (${site.length} ofertas): ${SITE_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

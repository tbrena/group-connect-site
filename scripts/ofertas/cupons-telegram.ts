/**
 * Cupons a partir de canais PÚBLICOS do Telegram (página web t.me/s/<canal>,
 * sem login e sem usar conta de ninguém).
 *
 * Só aproveitamos o FATO — o código do cupom, a loja e as regras (desconto,
 * limite, compra mínima). Texto, emojis e links do canal ficam para trás: a
 * mensagem é nossa e o link é o nosso de afiliado. Só Mercado Livre e Shopee.
 *
 *   node --env-file-if-exists=.env scripts/ofertas/cupons-telegram.ts [canal1,canal2]
 *
 * Rodado direto é um TESTE: mostra o que seria postado e não posta nada.
 */
import fs from "node:fs/promises";
import path from "node:path";

import { affiliateLink } from "./afiliado.ts";
import { linkAfiliadoShopee } from "./shopee-client.ts";
import { escapeHtml, sendMessage } from "./telegram.ts";

export interface Cupom {
  loja: "ml" | "shopee";
  /** um ou mais códigos anunciados juntos (ex.: faixas de valor) */
  codigos: string[];
  /** "30% OFF" / "R$ 20 OFF" (só quando há um código; faixas variam) */
  desconto: string | null;
  /** teto do desconto, "R$ 500" */
  limite: string | null;
  /** compra mínima, "R$ 99" (omitida quando irrisória, tipo R$ 1) */
  minimo: string | null;
  /** onde vale, tirado do título: "Entregas Full", "Tecnologia e Eletrodomésticos" */
  escopo: string | null;
  /** canal/123 de onde veio (para log e para não repetir) */
  origem: string;
  /** ISO da postagem no canal */
  quando: string;
}

/** Configuração em scripts/ofertas/config.json → "cupons". */
export interface ConfigCupons {
  /** canais públicos do Telegram (sem @) */
  canais: string[];
  /** teto de cupons postados no Telegram por rodada */
  maxPorRodada: number;
  /** só vai para o Telegram cupom anunciado há no máximo isso (cupom velho costuma ter esgotado) */
  maxIdadeHoras: number;
  /** o mesmo código não volta ao Telegram antes disso */
  naoRepetirDias: number;
  /** quanto tempo o cupom fica no site depois de anunciado */
  siteHoras: number;
}

/** Cupom como vai para o site (public/cupons.json). */
export interface SiteCupom extends Cupom {
  /** loja:CODIGO(+CODIGO) */
  id: string;
  /** nosso link de afiliado (página de cupons do ML ou a Shopee) */
  link: string;
}

const ESTADO_FILE = path.resolve(".ofertas/cupons.json");
const SITE_FILE = path.resolve("public/cupons.json");
const HORA_MS = 60 * 60 * 1000;

/** Palavras em maiúsculas que aparecem perto de "cupom" e não são código. */
const NAO_CODIGO = new Set([
  "CUPOM",
  "CUPONS",
  "CODIGO",
  "MERCADO",
  "LIVRE",
  "SHOPEE",
  "MAGALU",
  "AMAZON",
  "FRETE",
  "GRATIS",
  "HOJE",
  "AGORA",
  "LINK",
  "ATIVE",
  "RESGATE",
  "USE",
  "APP",
  "PRIME",
  "MELI",
  "NOVO",
  "NOVOS",
  "OFF",
  "PIX",
]);

const ENTIDADES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&nbsp;": " ",
};

function textoDoHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (e) => ENTIDADES[e] ?? e)
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)));
}

interface Post {
  id: string;
  quando: string;
  texto: string;
}

/** Últimas ~20 postagens do canal pela página pública. */
export async function lerCanal(canal: string): Promise<Post[]> {
  const res = await fetch(`https://t.me/s/${encodeURIComponent(canal)}`, {
    headers: { "user-agent": "Mozilla/5.0 (compatible; PrecoNinjaBot/1.0)" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`t.me/s/${canal}: HTTP ${res.status}`);
  const html = await res.text();
  const posts: Post[] = [];
  // Cada postagem: <div class="tgme_widget_message ..." data-post="canal/123"> … texto … <time datetime=…>
  for (const bloco of html.split(/(?=<div class="tgme_widget_message_wrap)/).slice(1)) {
    const id = /data-post="([^"]+)"/.exec(bloco)?.[1];
    const quando = /<time[^>]+datetime="([^"]+)"/.exec(bloco)?.[1];
    const corpo = /<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/.exec(
      bloco,
    )?.[1];
    if (id && quando && corpo) posts.push({ id, quando, texto: textoDoHtml(corpo) });
  }
  return posts;
}

const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Tira do post só o fato: loja, código(s) e regras. null = não é cupom de ML/Shopee. */
export function extrairCupom(post: Post): Cupom | null {
  const t = post.texto;
  const ml = /mercado\s*livre|\bmeli\b/i.test(t);
  const shopee = /shopee/i.test(t);
  if (ml === shopee) return null; // nenhuma das duas, ou as duas (ambíguo)

  const codigos: string[] = [];
  for (const linha of t.split("\n")) {
    if (!/cupo(m|ns)|c[oó]digo/i.test(linha)) continue;
    for (const m of normalizar(linha).matchAll(/\b(?=[A-Z0-9]*[A-Z])[A-Z0-9]{4,20}\b/g)) {
      const c = m[0];
      if (!NAO_CODIGO.has(c) && !codigos.includes(c)) codigos.push(c);
    }
  }
  if (codigos.length === 0) return null;

  // "R$ 19," no fim da frase: a vírgula/ponto final não faz parte do valor.
  const valor = (v: string | undefined) => v?.replace(/[.,]+$/, "").replace(/,00$/, "");
  const dinheiro = (v: string) => `R$ ${v}`;
  const pct = /(\d{1,2})\s?%\s?(?:off|de desconto|em|no|na)/i.exec(t)?.[1];
  const reais = valor(/R\$\s?([\d.,]+)\s?(?:off|de desconto)/i.exec(t)?.[1]);
  const limite = valor(
    /(?:limitad[oa]\s+a|limite\s+de|m[áa]ximo\s+de)\s+R\$\s?([\d.,]+)/i.exec(t)?.[1],
  );
  const minimo = valor(/(?:acima de|a partir de|m[íi]nim[oa] de)\s+R\$\s?([\d.,]+)/i.exec(t)?.[1]);
  // Mínimo de "R$ 1" é o mesmo que nenhum.
  const minimoUtil = !!minimo && Number(minimo.replace(/\./g, "").replace(",", ".")) >= 10;
  // Título "20% em Queima de Estoque no Mercado Livre" → "Queima de Estoque".
  const escopo =
    /\d+\s?%\s+em\s+(.+?)\s+(?:no|do|na|da)\s+(?:mercado\s*livre|meli|shopee)\b/i
      .exec(t.split("\n")[0] ?? "")?.[1]
      ?.trim() ?? null;

  return {
    loja: ml ? "ml" : "shopee",
    codigos,
    desconto:
      codigos.length > 1 ? null : pct ? `${pct}% OFF` : reais ? `${dinheiro(reais)} OFF` : null,
    limite: limite ? dinheiro(limite) : null,
    minimo: codigos.length > 1 || !minimoUtil ? null : dinheiro(minimo!),
    escopo: escopo && escopo.length <= 50 ? escopo : null,
    origem: post.id,
    quando: post.quando,
  };
}

/** Cupons recentes de ML/Shopee nos canais, sem repetir código. */
export async function buscarCupons(
  canais: string[],
  maxIdadeMs: number,
  agora = Date.now(),
): Promise<Cupom[]> {
  const vistos = new Set<string>();
  const cupons: Cupom[] = [];
  for (const canal of canais) {
    let posts: Post[];
    try {
      posts = await lerCanal(canal);
    } catch (err) {
      console.warn(`cupons: ${(err as Error).message}`);
      continue;
    }
    for (const post of posts.reverse()) {
      if (agora - new Date(post.quando).getTime() > maxIdadeMs) continue;
      const cupom = extrairCupom(post);
      if (!cupom) continue;
      const chave = `${cupom.loja}:${cupom.codigos.join("+")}`;
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      cupons.push(cupom);
    }
  }
  return cupons;
}

/** Nossa mensagem (HTML do Telegram). O código em <code> vira "toque para copiar". */
export function mensagemCupom(c: Cupom, link: string): string {
  const loja = c.loja === "ml" ? "MERCADO LIVRE" : "SHOPEE";
  const linhas = [`🎟️ <b>CUPOM ${loja}</b>`, ""];
  const regras = [c.desconto, c.limite && `limite de ${c.limite} de desconto`].filter(Boolean);
  if (regras.length) linhas.push(`🏷️ ${regras.join(" · ")}`);
  if (c.escopo) linhas.push(`📦 Vale em: ${escapeHtml(c.escopo)}`);
  if (c.minimo) linhas.push(`🛒 Compra mínima: ${c.minimo}`);
  if (c.codigos.length > 1) linhas.push("🏷️ Desconto varia conforme o valor da compra");
  linhas.push(
    "",
    c.codigos.length > 1
      ? `Use um dos cupons: ${c.codigos.map((x) => `<code>${escapeHtml(x)}</code>`).join(", ")}`
      : `Cupom: <code>${escapeHtml(c.codigos[0]!)}</code> (toque para copiar)`,
    "",
    c.loja === "ml"
      ? `👉 Adicione em Meus cupons ou no carrinho: ${link}`
      : `👉 Aplique no carrinho da Shopee: ${link}`,
    "⚠️ Cupom de uso limitado: pode esgotar ou valer só para produtos selecionados.",
  );
  return linhas.join("\n");
}

const chaveCupom = (c: Cupom) => `${c.loja}:${c.codigos.join("+")}`;

async function lerJson<T>(arquivo: string, padrao: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(arquivo, "utf8")) as T;
  } catch {
    return padrao;
  }
}

/**
 * Rodada de cupons (chamada pelo run.ts): atualiza public/cupons.json e, se
 * `postar`, manda para o Telegram os cupons recém-anunciados que ainda não
 * foram postados. Um código já postado não volta antes de naoRepetirDias.
 */
export async function rodadaDeCupons(cfg: ConfigCupons, postar: boolean): Promise<void> {
  const agora = Date.now();
  const achados = await buscarCupons(cfg.canais, cfg.siteHoras * HORA_MS, agora);

  const linkMl = affiliateLink("https://www.mercadolivre.com.br/cupons");
  let linkShopee: string | null = null;
  const linkDe = async (loja: Cupom["loja"]) =>
    loja === "ml" ? linkMl : (linkShopee ??= await linkAfiliadoShopee("https://shopee.com.br/"));

  // Site: o que já estava e ainda está na janela + o que apareceu agora.
  const anteriores = await lerJson<SiteCupom[]>(SITE_FILE, []);
  const porId = new Map<string, SiteCupom>();
  for (const c of anteriores)
    if (agora - new Date(c.quando).getTime() <= cfg.siteHoras * HORA_MS) porId.set(c.id, c);
  for (const c of achados) {
    const id = chaveCupom(c);
    if (!porId.has(id)) porId.set(id, { ...c, id, link: await linkDe(c.loja) });
  }
  const site = [...porId.values()].sort((a, b) => b.quando.localeCompare(a.quando));
  await fs.mkdir(path.dirname(SITE_FILE), { recursive: true });
  await fs.writeFile(SITE_FILE, JSON.stringify(site, null, 2));
  console.log(`cupons: ${achados.length} nos canais, ${site.length} no site`);

  if (!postar) return;
  // Estado: loja:CÓDIGO → quando foi postado. Um código repetido num anúncio novo não reposta.
  const postados = await lerJson<Record<string, number>>(ESTADO_FILE, {});
  for (const [k, ts] of Object.entries(postados))
    if (agora - ts > cfg.naoRepetirDias * 24 * HORA_MS) delete postados[k];
  const fila = site
    .filter((c) => agora - new Date(c.quando).getTime() <= cfg.maxIdadeHoras * HORA_MS)
    .filter((c) => !c.codigos.some((x) => postados[`${c.loja}:${x}`]))
    .slice(0, cfg.maxPorRodada);
  for (const c of fila) {
    try {
      await sendMessage(mensagemCupom(c, c.link), [
        {
          text: c.loja === "ml" ? "🎟️ Abrir cupons do Mercado Livre" : "🛒 Abrir a Shopee",
          url: c.link,
        },
      ]);
    } catch (err) {
      console.error(`  cupom ${c.id} falhou: ${(err as Error).message}`);
      continue;
    }
    for (const x of c.codigos) postados[`${c.loja}:${x}`] = agora;
    // Salvo a cada post: se a rodada cair no meio, nada é repostado.
    await fs.mkdir(path.dirname(ESTADO_FILE), { recursive: true });
    await fs.writeFile(ESTADO_FILE, JSON.stringify(postados, null, 2));
    console.log(`  cupom postado: ${c.id} (${c.origem})`);
    await new Promise((r) => setTimeout(r, 3000));
  }
}

/**
 * Categorias do site cobertas pelo escopo de um cupom ("Tecnologia e Eletrodomésticos").
 * Cupom de lista/seleção de afiliado ("Achados", "Seleção de Produtos") não casa com
 * nada: não há como saber que produtos estão na lista, então não vai em oferta nenhuma.
 */
const ESCOPOS: Array<[RegExp, string[]]> = [
  [/tecnologia/i, ["Informática", "Eletrônicos", "Celulares", "Smartwatches", "Games"]],
  [/eletrodom|eletroport/i, ["Eletrodomésticos"]],
  [/inform[aá]tica|computador|notebook/i, ["Informática"]],
  [/celular|smartphone/i, ["Celulares"]],
  [/eletr[oô]nicos/i, ["Eletrônicos"]],
  [/beleza|perfum/i, ["Beleza"]],
  [/sa[uú]de/i, ["Saúde"]],
  [/casa|decora|m[oó]ve/i, ["Casa e Decoração"]],
  [/moda|cal[çc]ado|roupa|t[eê]nis/i, ["Moda e Calçados"]],
  [/esporte|fitness|suplemento/i, ["Esportes"]],
  [/brinquedo/i, ["Brinquedos"]],
  [/\bgames?\b|videogame|gamer/i, ["Games"]],
  [/\bpets?\b/i, ["Pet"]],
  [/beb[eê]s?\b/i, ["Bebês"]],
  [/ferramenta|constru/i, ["Ferramentas"]],
  [/automotiv|\bcarros?\b|ve[ií]culo/i, ["Automotivo"]],
  [/supermercado|\bmercado\b/i, ["Mercado"]],
];

export function categoriasDoCupom(escopo: string | null): Set<string> {
  const cats = new Set<string>();
  if (escopo)
    for (const [re, lista] of ESCOPOS) if (re.test(escopo)) lista.forEach((c) => cats.add(c));
  return cats;
}

/** Cupons de categoria anunciados nas últimas `horas` (do public/cupons.json da rodada anterior). */
export async function cuponsDeCategoria(horas: number, agora = Date.now()): Promise<SiteCupom[]> {
  const todos = await lerJson<SiteCupom[]>(SITE_FILE, []);
  return todos.filter(
    (c) =>
      c.codigos.length === 1 &&
      c.desconto !== null &&
      agora - new Date(c.quando).getTime() <= horas * HORA_MS &&
      categoriasDoCupom(c.escopo).size > 0,
  );
}

const reais = (v: string | null) =>
  v === null
    ? null
    : Number(
        v
          .replace(/[^\d,.]/g, "")
          .replace(/\./g, "")
          .replace(",", "."),
      );

/** Cupom aplicado a uma oferta: código, preço com cupom e a regra em poucas palavras. */
export interface CupomDaOferta {
  codigo: string;
  precoFinal: number;
  regra: string;
}

/**
 * O cupom de categoria que mais baixa o preço desta oferta (mesma loja, categoria
 * coberta, compra mínima atingida), ou null. Economia abaixo de R$ 5 não vale a linha.
 */
export function melhorCupom(
  oferta: { marketplace: Cupom["loja"]; categoria?: string | null | undefined; price: number },
  cupons: SiteCupom[],
): CupomDaOferta | null {
  let melhor: CupomDaOferta | null = null;
  for (const c of cupons) {
    if (c.loja !== oferta.marketplace || !oferta.categoria) continue;
    if (!categoriasDoCupom(c.escopo).has(oferta.categoria)) continue;
    const minimo = reais(c.minimo);
    if (minimo !== null && oferta.price < minimo) continue;
    const pct = /^(\d+)% OFF$/.exec(c.desconto ?? "")?.[1];
    const fixo = /^R\$ ([\d.,]+) OFF$/.exec(c.desconto ?? "")?.[1];
    let economia = pct ? (oferta.price * Number(pct)) / 100 : fixo ? reais(fixo)! : 0;
    const teto = reais(c.limite);
    if (teto !== null) economia = Math.min(economia, teto);
    economia = Math.floor(economia * 100) / 100;
    if (economia < 5 || economia >= oferta.price) continue;
    if (melhor && oferta.price - economia >= melhor.precoFinal) continue;
    const regra = [
      `${c.desconto}${c.escopo ? ` em ${c.escopo}` : ""}`,
      c.limite && `até ${c.limite}`,
      c.minimo && `mín. ${c.minimo}`,
    ]
      .filter(Boolean)
      .join(", ");
    melhor = {
      codigo: c.codigos[0]!,
      precoFinal: Math.round((oferta.price - economia) * 100) / 100,
      regra,
    };
  }
  return melhor;
}

// Teste: `node scripts/ofertas/cupons-telegram.ts canal1,canal2` só mostra, não posta.
if (import.meta.url === `file://${process.argv[1]}`) {
  const canais = (process.argv[2] || "avidaefeitadedesconto")
    .split(",")
    .map((c) => c.trim().replace(/^@|^https?:\/\/t\.me\/(s\/)?/g, ""))
    .filter(Boolean);
  console.log(`Canais: ${canais.join(", ")}\n`);

  for (const canal of canais) {
    try {
      const posts = await lerCanal(canal);
      console.log(`── ${canal}: ${posts.length} postagens lidas`);
      for (const p of posts) {
        const c = extrairCupom(p);
        const resumo = p.texto.replace(/\s+/g, " ").slice(0, 110);
        console.log(`   ${c ? "🎟️" : "  "} ${p.quando.slice(0, 16)} ${resumo}`);
        if (c)
          console.log(
            `      → ${c.loja} ${c.codigos.join("/")} · ${c.desconto ?? "-"} · limite ${c.limite ?? "-"} · mín ${c.minimo ?? "-"} · em ${c.escopo ?? "-"}`,
          );
        // Fala de ML/Shopee mas não achou código: mostra as linhas com "cupom" para ajustar.
        else if (/mercado\s*livre|\bmeli\b|shopee/i.test(p.texto))
          for (const l of p.texto.split("\n").filter((l) => /cupo|c[oó]digo/i.test(l)))
            console.log(`      ? ${l.slice(0, 140)}`);
      }
    } catch (err) {
      console.log(`── ${canal}: ERRO ${(err as Error).message}`);
    }
  }

  const cupons = await buscarCupons(canais, 3 * HORA_MS);
  console.log(`\n══ Seriam postados ${cupons.length} cupons (últimas 3 h) ══`);
  for (const c of cupons) {
    const link =
      c.loja === "ml"
        ? "https://www.mercadolivre.com.br/cupons (com seu código de afiliado)"
        : "https://shopee.com.br (link de afiliado)";
    console.log(`\n${mensagemCupom(c, link).replace(/<\/?(b|code)>/g, "")}`);
  }
}

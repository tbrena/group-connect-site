/**
 * Cliente da API do Mercado Livre: token (Client Credentials, renovado
 * sozinho a cada 6h) e busca de ofertas.
 *
 * Com token de app (sem login de usuário) o ML bloqueia /sites/MLB/search e
 * /items/{id}. O que funciona é o catálogo:
 *   /products/search           → produtos (nome, fotos)
 *   /products/{id}/items       → ofertas de cada vendedor, com price/original_price
 * Então buscamos produtos e, para cada um, olhamos as ofertas dos vendedores.
 *
 * O que conta como desconto: o preço contra a MEDIANA dos outros vendedores do
 * mesmo produto — não o "de/por" declarado pelo vendedor, que é inflado com
 * frequência. Sem vendedores suficientes para comparar, só aceitamos campanha
 * oficial do ML (deal_ids) usando o "de" declarado.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { guardarProduto, produtoCacheado } from "./cache-produtos.ts";
import {
  guardarVendedor,
  nivelReputacao,
  vendedorCacheado,
  type Vendedor,
} from "./cache-vendedores.ts";
import { env } from "./env.ts";
import { observarPreco } from "./historico.ts";

const API = "https://api.mercadolibre.com";
const TOKEN_FILE = path.resolve(".ofertas/ml-token.json");
/** Requisições simultâneas ao ML (evita 429). */
const CONCURRENCY = 5;

interface StoredToken {
  access_token: string;
  /** epoch ms em que o access_token expira */
  expires_at: number;
}

/**
 * Fluxo Client Credentials: o app se autentica sozinho com id + secret, sem
 * login de usuário. O token vale 6h; guardamos em disco para não pedir um
 * novo a cada execução.
 */
async function requestToken(): Promise<StoredToken> {
  const res = await fetch(`${API}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: env.ml.clientId(),
      client_secret: env.ml.clientSecret(),
    }),
  });
  const json = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    message?: string;
    error?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new Error(`OAuth ${res.status}: ${json.message ?? json.error ?? JSON.stringify(json)}`);
  }
  const token: StoredToken = {
    access_token: json.access_token,
    // margem de 60s para não usar um token prestes a expirar
    expires_at: Date.now() + ((json.expires_in ?? 21600) - 60) * 1000,
  };
  await fs.mkdir(path.dirname(TOKEN_FILE), { recursive: true });
  await fs.writeFile(TOKEN_FILE, JSON.stringify(token, null, 2));
  return token;
}

export async function getAccessToken(): Promise<string> {
  try {
    const stored = JSON.parse(await fs.readFile(TOKEN_FILE, "utf8")) as StoredToken;
    if (Date.now() < stored.expires_at) return stored.access_token;
  } catch {
    // sem token salvo — pede um novo abaixo
  }
  return (await requestToken()).access_token;
}

/** Contadores da rodada, para o log mostrar o peso na API. */
export const estatisticas = { requisicoes: 0, cache: 0, repeticoes: 0 };

const MAX_TENTATIVAS = 4;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * GET autenticado. 404 vira `null` (ex.: produto de catálogo sem vendedor ativo).
 * Em 429 (limite de requisições) ou 5xx, espera e tenta de novo: respeita o
 * Retry-After quando vem; senão 2s, 4s, 8s.
 */
async function apiGet<T>(pathname: string): Promise<T | null> {
  for (let tentativa = 1; ; tentativa++) {
    estatisticas.requisicoes++;
    const res = await fetch(`${API}${pathname}`, {
      headers: { authorization: `Bearer ${await getAccessToken()}`, accept: "application/json" },
    });
    if (res.status === 404) return null;
    if (res.ok) return (await res.json()) as T;

    const transitorio = res.status === 429 || res.status >= 500;
    if (!transitorio || tentativa >= MAX_TENTATIVAS) {
      throw new Error(`ML GET ${pathname} → ${res.status}: ${await res.text()}`);
    }
    const retryAfter = Number(res.headers.get("retry-after")) * 1000;
    const espera = retryAfter > 0 ? retryAfter : 2 ** tentativa * 1000;
    estatisticas.repeticoes++;
    console.error(`  ML ${res.status} em ${pathname}; tentando de novo em ${espera / 1000}s`);
    await sleep(espera);
  }
}

/** Roda `fn` sobre `items` com no máximo CONCURRENCY promessas em voo. */
export async function mapLimited<T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

interface CatalogProduct {
  id: string;
  name: string;
  pictures?: Array<{ url: string }>;
}

interface CatalogItem {
  item_id: string;
  seller_id: number;
  price: number;
  original_price: number | null;
  shipping?: { free_shipping?: boolean };
  /** Campanhas oficiais do ML (Oferta do Dia, Relâmpago, campanha) em que o item está. */
  deal_ids?: string[];
  /** id da loja oficial quando o vendedor é uma (marca ou autorizado); null/ausente se não. */
  official_store_id?: number | null;
}

/** Oferta já resolvida: um item específico de um produto do catálogo. */
export interface MlItem {
  /** id do item (anúncio do vendedor), ex.: MLB5244898411 ou SP<shopId>-<itemId> */
  id: string;
  productId: string;
  /** de qual marketplace veio a oferta */
  marketplace: "ml" | "shopee";
  title: string;
  price: number;
  /** desconto real em %, calculado contra `base` */
  discount: number;
  /** "media": contra a mediana dos outros vendedores; "vendedor": contra o "de" declarado (só campanha oficial) */
  base: "media" | "vendedor";
  /** mediana do preço dos outros vendedores do mesmo produto (null se não houve comparação) */
  averagePrice: number | null;
  /** quantos vendedores anunciam o produto */
  sellers: number;
  /** "de" declarado pelo vendedor — informativo, não confiável */
  claimedPrice: number | null;
  permalink: string;
  thumbnail: string;
  shipping?: { free_shipping?: boolean };
  /** true quando o item está em campanha oficial do ML (deal_ids) */
  oficial: boolean;
  /** de onde veio: id da categoria (MLB1055) ou "q:<busca>" */
  fonte: string;
  sellerId: number;
  /** vendedor é loja oficial (marca ou autorizado) */
  lojaOficial: boolean;
  /** nome da loja oficial (null quando não é loja oficial) */
  loja: string | null;
  /** reputação do vendedor no ML: "1_red" … "5_green" */
  reputacao: string | null;
}

export interface SearchOptions {
  /** busca por palavra-chave no catálogo */
  query?: string;
  /** id de categoria MLB (ex.: MLB1055 = Celulares): usa os mais vendidos dela */
  category?: string;
  /** desconto real mínimo em %, ex.: 15 */
  minDiscount: number;
  /** quantos OUTROS vendedores precisa haver para a mediana valer */
  minSellers: number;
  /** reputação mínima do vendedor (1 a 5; 0 = não filtra) */
  minReputacao: number;
  /** só aceita anúncios de loja oficial */
  somenteLojaOficial: boolean;
  /** quantos produtos do catálogo olhar por busca */
  limit?: number;
}

/**
 * Entre as ofertas de um produto, só consideramos as que estão a até 10% do
 * mais barato — o mais barato tem o maior desconto real; a folga serve para
 * preferir um item em campanha oficial quando o preço é praticamente igual.
 */
const CHEAPEST_TOLERANCE = 1.1;

/** Menor preço de cada vendedor (um vendedor pode ter vários anúncios do mesmo produto). */
function menorPorVendedor(results: CatalogItem[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const r of results) m.set(r.seller_id, Math.min(m.get(r.seller_id) ?? Infinity, r.price));
  return m;
}

const menorPreco = (results: CatalogItem[]) => Math.min(...results.map((r) => r.price));

/** URL pública do anúncio; o ML redireciona MLB-<número> para a página completa. */
export function itemUrl(itemId: string): string {
  return `https://produto.mercadolivre.com.br/${itemId.replace(/^MLB/, "MLB-")}`;
}

export function discountOf(price: number, reference: number): number {
  return Math.round((1 - price / reference) * 100);
}

function mediana(valores: number[]): number {
  const s = [...valores].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  const med = s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  return Math.round(med * 100) / 100;
}

type Criterio = Pick<
  SearchOptions,
  "minDiscount" | "minSellers" | "minReputacao" | "somenteLojaOficial"
>;

/** Nome e reputação do vendedor (/users/{id}), com cache de 30 dias. */
async function dadosDoVendedor(id: number): Promise<Vendedor | null> {
  const cacheado = vendedorCacheado(id);
  if (cacheado) {
    estatisticas.cache++;
    return cacheado;
  }
  const u = await apiGet<{ nickname?: string; seller_reputation?: { level_id?: string | null } }>(
    `/users/${id}`,
  );
  if (!u?.nickname) return null;
  guardarVendedor(id, u.nickname, u.seller_reputation?.level_id ?? null);
  return vendedorCacheado(id) ?? null;
}

/**
 * Preenche loja/reputação dos candidatos, aplica os filtros de vendedor e
 * escolhe: campanha oficial do ML > loja oficial > o mais barato.
 */
async function escolherCandidato(candidatos: MlItem[], opts: Criterio): Promise<MlItem | null> {
  const aptos: MlItem[] = [];
  for (const c of candidatos) {
    if (opts.somenteLojaOficial && !c.lojaOficial) continue;
    const v = await dadosDoVendedor(c.sellerId).catch(() => null);
    if (opts.minReputacao > 0 && nivelReputacao(v?.reputacao) < opts.minReputacao) continue;
    aptos.push({
      ...c,
      loja: c.lojaOficial ? (v?.nickname ?? null) : null,
      reputacao: v?.reputacao ?? null,
    });
  }
  return aptos.find((c) => c.oficial) ?? aptos.find((c) => c.lojaOficial) ?? aptos[0] ?? null;
}

/**
 * Ofertas dos vendedores de um produto, memorizadas durante a rodada: a
 * revalidação das ofertas do site reaproveita o que a busca já baixou.
 */
const itensDaRodada = new Map<string, Promise<CatalogItem[] | null>>();
function itensDoProduto(productId: string): Promise<CatalogItem[] | null> {
  let p = itensDaRodada.get(productId);
  if (!p) {
    p = apiGet<{ results: CatalogItem[] }>(`/products/${productId}/items?limit=50`).then(
      (page) => page?.results ?? null,
    );
    itensDaRodada.set(productId, p);
  }
  return p;
}

interface ProdutoResumo {
  id: string;
  name: string;
  thumbnail: string;
}

/** Aplica o critério de desconto real a um item; null se não é oferta. */
function avaliarItem(
  it: CatalogItem,
  results: CatalogItem[],
  produto: ProdutoResumo,
  opts: Criterio,
  fonte: string,
): MlItem | null {
  // Um preço por VENDEDOR (o menor dele), excluindo o vendedor do candidato: um
  // vendedor com vários anúncios do mesmo produto não pode "ser" a concorrência.
  const outros = [...menorPorVendedor(results).entries()]
    .filter(([sellerId]) => sellerId !== it.seller_id)
    .map(([, price]) => price);
  const oficial = Boolean(it.deal_ids?.length);
  const comum = {
    id: it.item_id,
    productId: produto.id,
    marketplace: "ml" as const,
    title: produto.name,
    price: it.price,
    sellers: outros.length + 1,
    claimedPrice: it.original_price,
    permalink: itemUrl(it.item_id),
    thumbnail: produto.thumbnail,
    shipping: it.shipping,
    oficial,
    fonte,
    sellerId: it.seller_id,
    lojaOficial: it.official_store_id != null,
    // preenchidos depois, em escolherCandidato()
    loja: null,
    reputacao: null,
  };

  if (outros.length >= opts.minSellers) {
    const media = mediana(outros);
    const discount = discountOf(it.price, media);
    if (discount < opts.minDiscount) return null;
    return { ...comum, discount, base: "media", averagePrice: media };
  }
  // Sem vendedores para comparar: só campanha oficial do ML, com o "de" declarado.
  if (oficial && it.original_price != null && it.original_price > it.price) {
    const discount = discountOf(it.price, it.original_price);
    if (discount < opts.minDiscount) return null;
    return { ...comum, discount, base: "vendedor", averagePrice: null };
  }
  return null;
}

async function bestDeal(
  product: CatalogProduct,
  opts: Criterio,
  fonte: string,
): Promise<MlItem | null> {
  const results = await itensDoProduto(product.id);
  if (!results?.length) return null;
  // A ordem da API não é garantida por preço: o mínimo real alimenta o histórico.
  const cheapest = menorPreco(results);
  observarPreco(product.id, cheapest);

  const produto = {
    id: product.id,
    name: product.name,
    thumbnail: product.pictures?.[0]?.url ?? "",
  };
  const candidatos = results
    .filter((it) => it.price <= cheapest * CHEAPEST_TOLERANCE)
    .map((it) => avaliarItem(it, results, produto, opts, fonte))
    .filter((c): c is MlItem => c !== null);
  return escolherCandidato(candidatos, opts);
}

/**
 * Reavalia uma oferta já publicada no site com os preços de agora. Devolve a
 * oferta atualizada, ou null se o anúncio sumiu ou já não é desconto real.
 */
export async function revalidarOferta(
  oferta: { productId: string; id: string; title: string; thumbnail: string; fonte: string },
  opts: Criterio,
): Promise<MlItem | null> {
  const results = await itensDoProduto(oferta.productId);
  if (!results?.length) return null;
  observarPreco(oferta.productId, menorPreco(results));
  const it = results.find((r) => r.item_id === oferta.id);
  if (!it) return null;
  const produto = { id: oferta.productId, name: oferta.title, thumbnail: oferta.thumbnail };
  const avaliado = avaliarItem(it, results, produto, opts, oferta.fonte);
  return avaliado ? escolherCandidato([avaliado], opts) : null;
}

/** Produtos do catálogo por palavra-chave. */
async function productsByQuery(query: string, limit: number): Promise<CatalogProduct[]> {
  const url = new URL(`${API}/products/search`);
  url.searchParams.set("status", "active");
  url.searchParams.set("site_id", "MLB");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", String(limit));
  const page = await apiGet<{ results: CatalogProduct[] }>(url.pathname + url.search);
  return page?.results ?? [];
}

/**
 * Mais vendidos de uma categoria. O endpoint só devolve ids; buscamos nome e
 * foto de cada um em /products/{id}. Entradas do tipo ITEM são ignoradas
 * porque /items/{id} é bloqueado para token de app.
 */
async function productsByCategory(category: string, limit: number): Promise<CatalogProduct[]> {
  const page = await apiGet<{ content: Array<{ id: string; type: string }> }>(
    `/highlights/MLB/category/${category}`,
  );
  const ids = (page?.content ?? [])
    .filter((c) => c.type === "PRODUCT")
    .slice(0, limit)
    .map((c) => c.id);
  const products = await mapLimited(ids, async (id): Promise<CatalogProduct | null> => {
    const cacheado = produtoCacheado(id);
    if (cacheado) {
      estatisticas.cache++;
      return { id, name: cacheado.name, pictures: [{ url: cacheado.picture }] };
    }
    const p = await apiGet<CatalogProduct>(`/products/${id}`);
    if (p?.pictures?.[0]?.url) guardarProduto(id, p.name, p.pictures[0].url);
    return p;
  });
  return products.filter((p): p is CatalogProduct => p !== null);
}

/** Busca produtos (por palavra ou categoria) e devolve os que têm desconto real. */
export async function searchDeals(opts: SearchOptions): Promise<MlItem[]> {
  const limit = opts.limit ?? 20;
  const products = opts.category
    ? await productsByCategory(opts.category, limit)
    : opts.query
      ? await productsByQuery(opts.query, limit)
      : [];

  const fonte = opts.category ?? `q:${opts.query}`;
  const deals = await mapLimited(products, (product) =>
    bestDeal(product, opts, fonte).catch((err: Error) => {
      console.error(`  produto ${product.id}: ${err.message}`);
      return null;
    }),
  );
  return deals.filter((d): d is MlItem => d !== null && d.thumbnail !== "");
}

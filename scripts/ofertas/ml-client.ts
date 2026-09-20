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
async function mapLimited<T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
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
  price: number;
  original_price: number | null;
  shipping?: { free_shipping?: boolean };
  /** Campanhas oficiais do ML (Oferta do Dia, Relâmpago, campanha) em que o item está. */
  deal_ids?: string[];
}

/** Oferta já resolvida: um item específico de um produto do catálogo. */
export interface MlItem {
  /** id do item (anúncio do vendedor), ex.: MLB5244898411 */
  id: string;
  productId: string;
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
  /** quantos produtos do catálogo olhar por busca */
  limit?: number;
}

/**
 * Entre as ofertas de um produto, só consideramos as que estão a até 10% do
 * mais barato — o mais barato tem o maior desconto real; a folga serve para
 * preferir um item em campanha oficial quando o preço é praticamente igual.
 */
const CHEAPEST_TOLERANCE = 1.1;

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

async function bestDeal(
  product: CatalogProduct,
  opts: Pick<SearchOptions, "minDiscount" | "minSellers">,
): Promise<MlItem | null> {
  const page = await apiGet<{ results: CatalogItem[] }>(`/products/${product.id}/items?limit=50`);
  const results = page?.results;
  if (!results?.length) return null;
  // A API devolve ordenado por preço crescente; o mais barato alimenta o histórico.
  observarPreco(product.id, results[0].price);

  const avaliar = (it: CatalogItem): MlItem | null => {
    const outros = results.filter((o) => o.item_id !== it.item_id).map((o) => o.price);
    const oficial = Boolean(it.deal_ids?.length);
    const comum = {
      id: it.item_id,
      productId: product.id,
      title: product.name,
      price: it.price,
      sellers: results.length,
      claimedPrice: it.original_price,
      permalink: itemUrl(it.item_id),
      thumbnail: product.pictures?.[0]?.url ?? "",
      shipping: it.shipping,
      oficial,
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
  };

  const cheapest = results[0].price;
  const candidatos = results
    .filter((it) => it.price <= cheapest * CHEAPEST_TOLERANCE)
    .map(avaliar)
    .filter((c): c is MlItem => c !== null);
  return candidatos.find((c) => c.oficial) ?? candidatos[0] ?? null;
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

  const deals = await mapLimited(products, (product) =>
    bestDeal(product, opts).catch((err: Error) => {
      console.error(`  produto ${product.id}: ${err.message}`);
      return null;
    }),
  );
  return deals.filter((d): d is MlItem => d !== null && d.thumbnail !== "");
}

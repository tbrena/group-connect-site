/**
 * Cliente da API do Mercado Livre: token (Client Credentials, renovado
 * sozinho a cada 6h) e busca de ofertas.
 *
 * Com token de app (sem login de usuário) o ML bloqueia /sites/MLB/search e
 * /items/{id}. O que funciona é o catálogo:
 *   /products/search           → produtos (nome, fotos)
 *   /products/{id}/items       → ofertas de cada vendedor, com price/original_price
 * Então buscamos produtos e, para cada um, olhamos as ofertas mais baratas.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { env } from "./env.ts";

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

/** GET autenticado. 404 vira `null` (ex.: produto de catálogo sem vendedor ativo). */
async function apiGet<T>(pathname: string): Promise<T | null> {
  const res = await fetch(`${API}${pathname}`, {
    headers: { authorization: `Bearer ${await getAccessToken()}`, accept: "application/json" },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`ML GET ${pathname} → ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
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
}

/** Oferta já resolvida: um item específico de um produto do catálogo. */
export interface MlItem {
  /** id do item (anúncio do vendedor), ex.: MLB5244898411 */
  id: string;
  productId: string;
  title: string;
  price: number;
  original_price: number;
  permalink: string;
  thumbnail: string;
  shipping?: { free_shipping?: boolean };
}

export interface SearchOptions {
  /** busca por palavra-chave no catálogo */
  query?: string;
  /** id de categoria MLB (ex.: MLB1055 = Celulares): usa os mais vendidos dela */
  category?: string;
  /** desconto mínimo em %, ex.: 20 */
  minDiscount: number;
  /** quantos produtos do catálogo olhar por busca */
  limit?: number;
}

/**
 * Um "de/por" só vale se o item também estiver entre os mais baratos do
 * produto — senão é o vendedor inflando o preço original. Tolerância de 10%
 * sobre a oferta mais barata.
 */
const CHEAPEST_TOLERANCE = 1.1;

/** URL pública do anúncio; o ML redireciona MLB-<número> para a página completa. */
export function itemUrl(itemId: string): string {
  return `https://produto.mercadolivre.com.br/${itemId.replace(/^MLB/, "MLB-")}`;
}

async function bestDeal(product: CatalogProduct, minDiscount: number): Promise<MlItem | null> {
  const page = await apiGet<{ results: CatalogItem[] }>(`/products/${product.id}/items?limit=10`);
  const results = page?.results;
  if (!results?.length) return null;
  // A API devolve ordenado por preço crescente.
  const cheapest = results[0].price;
  const deal = results.find(
    (it) =>
      it.original_price != null &&
      it.original_price > it.price &&
      it.price <= cheapest * CHEAPEST_TOLERANCE &&
      discountOf(it.price, it.original_price) >= minDiscount,
  );
  if (!deal) return null;
  return {
    id: deal.item_id,
    productId: product.id,
    title: product.name,
    price: deal.price,
    original_price: deal.original_price!,
    permalink: itemUrl(deal.item_id),
    thumbnail: product.pictures?.[0]?.url ?? "",
    shipping: deal.shipping,
  };
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
  const products = await mapLimited(ids, (id) => apiGet<CatalogProduct>(`/products/${id}`));
  return products.filter((p): p is CatalogProduct => p !== null);
}

/** Busca produtos (por palavra ou categoria) e devolve os que têm oferta com desconto. */
export async function searchDeals(opts: SearchOptions): Promise<MlItem[]> {
  const limit = opts.limit ?? 20;
  const products = opts.category
    ? await productsByCategory(opts.category, limit)
    : opts.query
      ? await productsByQuery(opts.query, limit)
      : [];

  const deals = await mapLimited(products, (product) =>
    bestDeal(product, opts.minDiscount).catch((err: Error) => {
      console.error(`  produto ${product.id}: ${err.message}`);
      return null;
    }),
  );
  return deals.filter((d): d is MlItem => d !== null && d.thumbnail !== "");
}

export function discountOf(price: number, originalPrice: number): number {
  return Math.round((1 - price / originalPrice) * 100);
}

export function discountPercent(item: MlItem): number {
  return discountOf(item.price, item.original_price);
}

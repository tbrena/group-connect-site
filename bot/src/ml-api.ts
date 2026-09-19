import { config } from "./config";
import { money } from "./format";
import { log } from "./logger";
import { getAccessToken } from "./ml-auth";
import { buildAffiliateUrl, cleanUrl, type Offer } from "./mercadolivre";

/**
 * Fonte de ofertas pela API oficial do Mercado Livre (/sites/MLB/search).
 * Cada entrada de ML_API_SEARCHES é uma query string da busca, ex.:
 * "category=MLB1051" ou "q=smart tv 50". O bot acrescenta o filtro de desconto
 * mínimo e o limite quando não vierem na entrada.
 */

const SEARCH_URL = "https://api.mercadolibre.com/sites/MLB/search";

interface SearchResult {
  id: string;
  title: string;
  permalink: string;
  price: number;
  original_price?: number | null;
  sale_price?: { amount?: number; regular_amount?: number | null } | null;
  thumbnail?: string;
  thumbnail_id?: string;
  shipping?: { free_shipping?: boolean } | null;
  installments?: { quantity: number; amount: number; rate: number } | null;
}

export async function fetchOffersFromApi(searches: string[] = config.ml.searches): Promise<Offer[]> {
  const token = await getAccessToken();
  const seen = new Map<string, Offer>();

  for (const spec of searches) {
    const url = new URL(SEARCH_URL);
    for (const [key, value] of new URLSearchParams(spec)) url.searchParams.set(key, value);
    if (!url.searchParams.has("discount")) {
      url.searchParams.set("discount", `${config.minDiscountPercent}-100`);
    }
    if (!url.searchParams.has("limit")) url.searchParams.set("limit", "50");

    try {
      const res = await fetch(url, {
        headers: { authorization: `Bearer ${token}`, accept: "application/json" },
      });
      if (res.status === 401 || res.status === 403) {
        throw new Error(`token recusado (HTTP ${res.status}) — rode \`npm run ml:auth\` de novo`);
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);

      const data = (await res.json()) as { results?: SearchResult[] };
      const offers = (data.results ?? [])
        .map((item) => toOffer(item, spec))
        .filter((offer): offer is Offer => offer !== null);
      log.info(`${offers.length} ofertas na API para "${spec}"`);
      for (const offer of offers) if (!seen.has(offer.id)) seen.set(offer.id, offer);
    } catch (err) {
      log.error(`Falha na busca "${spec}"`, err);
    }
  }

  return [...seen.values()];
}

function toOffer(item: SearchResult, source: string): Offer | null {
  const price = item.sale_price?.amount ?? item.price;
  const original = item.sale_price?.regular_amount ?? item.original_price ?? undefined;
  if (!item.id || !item.permalink || !price || price <= 0) return null;

  const url = cleanUrl(item.permalink);
  const discountPercent =
    original && original > price ? Math.round((1 - price / original) * 100) : undefined;

  const inst = item.installments;
  const installments =
    inst && inst.quantity > 1
      ? `em ${inst.quantity}x ${money(inst.amount)}${inst.rate === 0 ? " sem juros" : ""}`
      : undefined;

  const image = largeImage(item);

  return {
    id: item.id,
    title: item.title.trim(),
    url,
    affiliateUrl: buildAffiliateUrl(url),
    ...(image ? { image } : {}),
    price,
    ...(original && original > price ? { originalPrice: original } : {}),
    ...(discountPercent ? { discountPercent } : {}),
    ...(installments ? { installments } : {}),
    freeShipping: Boolean(item.shipping?.free_shipping),
    source: `api:${source}`,
  };
}

/**
 * A busca só traz a miniatura (…-I.jpg). O mesmo CDN entrega a foto grande
 * trocando o sufixo para -O.jpg; se não houver miniatura, monta pelo id.
 */
function largeImage(item: SearchResult): string | undefined {
  if (item.thumbnail) {
    return item.thumbnail.replace(/^http:\/\//, "https://").replace(/-I\.(jpg|webp)$/i, "-O.jpg");
  }
  if (item.thumbnail_id) return `https://http2.mlstatic.com/D_NQ_NP_2X_${item.thumbnail_id}-F.jpg`;
  return undefined;
}

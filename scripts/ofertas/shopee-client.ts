/**
 * Fonte Shopee — Affiliate Open API (GraphQL).
 *
 *   Endpoint : https://open-api.affiliate.shopee.com.br/graphql
 *   Auth     : header "Authorization: SHA256 Credential=<AppId>, Timestamp=<unix>, Signature=<hex>"
 *              Signature = sha256(AppId + Timestamp + corpoJSON + Secret)
 *
 * Sem SHOPEE_APP_ID/SHOPEE_SECRET no ambiente a fonte fica dormente: as buscas
 * com `fonte: "shopee"` são puladas com um aviso e nada mais muda.
 *
 * Diferença importante em relação ao ML: a Shopee não tem catálogo unificado
 * (cada anúncio é único), então não existe "mediana dos outros vendedores".
 * O desconto vem do `priceDiscountRate` da própria Shopee — declarado pelo
 * vendedor, como o "de/por" do ML. Compensamos exigindo volume de vendas e
 * avaliação altos, e o histórico de preços (menor em 30 dias) vale igual.
 * A API já devolve o link de afiliado pronto (`offerLink`).
 *
 * Quando a chave chegar: `npm run ofertas:shopee-teste` imprime uma resposta
 * bruta para confirmar nomes de campos antes da primeira rodada de verdade.
 */
import { createHash } from "node:crypto";
import { observarPreco } from "./historico.ts";
import type { MlItem } from "./ml-client.ts";

const ENDPOINT = "https://open-api.affiliate.shopee.com.br/graphql";

export function shopeeConfigurada(): boolean {
  return Boolean(process.env["SHOPEE_APP_ID"] && process.env["SHOPEE_SECRET"]);
}

/** POST GraphQL assinado. Lança erro com a mensagem da API quando falha. */
export async function shopeeGraphQL<T>(
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const appId = process.env["SHOPEE_APP_ID"] ?? "";
  const secret = process.env["SHOPEE_SECRET"] ?? "";
  const timestamp = Math.floor(Date.now() / 1000);
  const corpo = JSON.stringify({ query, variables });
  const assinatura = createHash("sha256")
    .update(`${appId}${timestamp}${corpo}${secret}`)
    .digest("hex");

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `SHA256 Credential=${appId}, Timestamp=${timestamp}, Signature=${assinatura}`,
    },
    body: corpo,
  });
  const json = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (!res.ok || json.errors?.length) {
    throw new Error(
      `Shopee ${res.status}: ${json.errors?.map((e) => e.message).join("; ") ?? "erro"}`,
    );
  }
  return json.data as T;
}

/** Campos de productOfferV2 que usamos (nomes conforme a documentação da Affiliate Open API). */
export interface ShopeeNode {
  itemId: string | number;
  shopId: string | number;
  productName: string;
  price: string | number;
  priceMin?: string | number;
  priceDiscountRate?: number | null;
  sales?: number | null;
  ratingStar?: string | number | null;
  imageUrl: string;
  shopName?: string;
  /** 1 = Shopee Mall (loja oficial) — confirmar com a resposta real */
  shopType?: number | null;
  productLink: string;
  /** link de afiliado já pronto */
  offerLink: string;
  commissionRate?: string | number | null;
  periodEndTime?: number | null;
}

export const QUERY_PRODUCT_OFFER = `
  query ($keyword: String, $productCatId: Int, $listType: Int, $sortType: Int, $page: Int, $limit: Int) {
    productOfferV2(keyword: $keyword, productCatId: $productCatId, listType: $listType, sortType: $sortType, page: $page, limit: $limit) {
      nodes {
        itemId shopId productName price priceMin priceDiscountRate sales ratingStar
        imageUrl shopName shopType productLink offerLink commissionRate periodEndTime
      }
      pageInfo { page limit hasNextPage }
    }
  }`;

/** sortType da API: 1 relevância · 2 mais vendidos · 3 preço ↑ · 4 preço ↓ · 5 maior comissão */
const SORT_MAIS_VENDIDOS = 2;

export interface ShopeeOptions {
  query?: string;
  /** id de categoria da Shopee (productCatId) */
  shopeeCategory?: number;
  /**
   * Lista pronta da Shopee (listType da API, sem documentação oficial). Testado:
   * 2 = produtos com desconto alto e muitas vendas ("mais vendidos em promoção");
   * 0 = lista genérica; 1 = vazia; 3+ exigem matchId.
   */
  lista?: number;
  minDiscount: number;
  /** vendas mínimas do anúncio (compensa o desconto ser declarado) */
  minVendas: number;
  /** avaliação mínima (0–5) */
  minAvaliacao: number;
  limit?: number;
}

/** `fonte` gravada na oferta (e chave da categoria em config.json). */
export function shopeeFonte(o: { lista?: number; shopeeCategory?: number; query?: string }) {
  if (o.lista !== undefined) return `shopee:lista:${o.lista}`;
  return o.shopeeCategory ? `shopee:${o.shopeeCategory}` : `shopee:q:${o.query}`;
}

/** id único no nosso sistema: SP<shopId>-<itemId> (parseável pelo /ir/ do site). */
export const shopeeId = (shopId: string | number, itemId: string | number) =>
  `SP${shopId}-${itemId}`;

const num = (v: string | number | null | undefined) => Number(v ?? 0) || 0;

function paraOferta(n: ShopeeNode, fonte: string, opts: ShopeeOptions): MlItem | null {
  const price = num(n.price);
  const discount = Math.round(num(n.priceDiscountRate));
  if (!price || discount < opts.minDiscount) return null;
  if (num(n.sales) < opts.minVendas || num(n.ratingStar) < opts.minAvaliacao) return null;
  const id = shopeeId(n.shopId, n.itemId);
  observarPreco(id, price);
  return {
    id,
    productId: id,
    marketplace: "shopee",
    title: n.productName,
    price,
    discount,
    base: "vendedor",
    averagePrice: null,
    sellers: 1,
    claimedPrice: Math.round((price / (1 - discount / 100)) * 100) / 100,
    permalink: n.offerLink || n.productLink,
    thumbnail: n.imageUrl,
    shipping: undefined,
    oficial: false,
    fonte,
    vendas: num(n.sales) || null,
    sellerId: num(n.shopId),
    lojaOficial: n.shopType === 1,
    loja: n.shopType === 1 ? (n.shopName ?? null) : null,
    reputacao: null,
  };
}

/** Busca ofertas na Shopee por palavra-chave ou categoria; [] se a fonte não está configurada. */
export async function searchShopeeDeals(opts: ShopeeOptions): Promise<MlItem[]> {
  if (!shopeeConfigurada()) {
    console.error("  Shopee: SHOPEE_APP_ID/SHOPEE_SECRET ausentes — fonte pulada");
    return [];
  }
  const data = await shopeeGraphQL<{ productOfferV2: { nodes: ShopeeNode[] } }>(
    QUERY_PRODUCT_OFFER,
    {
      keyword: opts.query ?? null,
      productCatId: opts.shopeeCategory ?? null,
      listType: opts.lista ?? null,
      // A lista pronta já vem na ordem da Shopee; ordenar por vendas só nas buscas.
      sortType: opts.lista !== undefined ? null : SORT_MAIS_VENDIDOS,
      page: 1,
      limit: opts.limit ?? 50,
    },
  );
  const fonte = shopeeFonte(opts);
  return (data.productOfferV2?.nodes ?? [])
    .map((n) => paraOferta(n, fonte, opts))
    .filter((o): o is MlItem => o !== null);
}

/** Reavalia um anúncio já publicado (por itemId); null se sumiu ou já não passa no critério. */
export async function revalidarShopee(
  id: string,
  fonte: string,
  opts: ShopeeOptions,
): Promise<MlItem | null> {
  if (!shopeeConfigurada()) return null;
  const m = /^SP(\d+)-(\d+)$/.exec(id);
  if (!m) return null;
  const data = await shopeeGraphQL<{ productOfferV2: { nodes: ShopeeNode[] } }>(
    `query ($itemId: Int64) { productOfferV2(itemId: $itemId) { nodes {
       itemId shopId productName price priceMin priceDiscountRate sales ratingStar
       imageUrl shopName shopType productLink offerLink commissionRate periodEndTime } } }`,
    { itemId: Number(m[2]) },
  );
  const n = data.productOfferV2?.nodes?.[0];
  return n ? paraOferta(n, fonte, opts) : null;
}

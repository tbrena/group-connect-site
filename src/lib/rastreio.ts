import { ML_AFILIADO, SITE_URL } from "@/lib/site";

/** De onde veio o clique: Telegram, WhatsApp ou o próprio site. */
export type Origem = "tg" | "wa" | "site";

export interface DadosLink {
  /** id do anúncio, ex.: MLB3292603939 */
  id: string;
  /** categoria ou busca que achou a oferta (ex.: MLB1055, q:air fryer) */
  fonte?: string | undefined;
  discount: number;
  price: number;
}

/**
 * Link rastreado: passa por /ir/<id> no site, que registra o clique e
 * redireciona para o Mercado Livre com o código de afiliado. Absoluto porque
 * vai para Telegram e WhatsApp também.
 */
export function linkRastreado(o: DadosLink, origem: Origem): string {
  const url = new URL(`/ir/${o.id}`, SITE_URL);
  url.searchParams.set("o", origem);
  // só letras/números/hífen: "q:air fryer" vira "q-air-fryer" e a URL fica sem %XX
  if (o.fonte) url.searchParams.set("f", fonteSegura(o.fonte));
  url.searchParams.set("d", String(o.discount));
  url.searchParams.set("p", String(o.price));
  return url.toString();
}

export const fonteSegura = (fonte: string) =>
  fonte
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** Ids aceitos pelo /ir/: anúncio do ML (MLB…) ou da Shopee (SP<shopId>-<itemId>). */
export const ID_OFERTA = /^(MLB\d{6,}|SP\d+-\d+)$/;

/**
 * Destino final derivável só do id. Para o ML é a página do anúncio com o
 * código de afiliado. Para a Shopee o link de afiliado (offerLink) não é
 * derivável — este é o fallback SEM comissão, usado só quando a oferta não
 * está mais no ofertas.json.
 */
export function linkAfiliado(itemId: string): string {
  const shopee = /^SP(\d+)-(\d+)$/.exec(itemId);
  if (shopee) return `https://shopee.com.br/product/${shopee[1]}/${shopee[2]}`;
  const url = new URL(`https://produto.mercadolivre.com.br/${itemId.replace(/^MLB/, "MLB-")}`);
  url.searchParams.set("matt_word", ML_AFILIADO.word);
  url.searchParams.set("matt_tool", ML_AFILIADO.tool);
  return url.toString();
}

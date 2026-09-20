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
  if (o.fonte) url.searchParams.set("f", o.fonte);
  url.searchParams.set("d", String(o.discount));
  url.searchParams.set("p", String(o.price));
  return url.toString();
}

/** Destino final: página do anúncio no ML com seus parâmetros de afiliado. */
export function linkAfiliado(itemId: string): string {
  const url = new URL(`https://produto.mercadolivre.com.br/${itemId.replace(/^MLB/, "MLB-")}`);
  url.searchParams.set("matt_word", ML_AFILIADO.word);
  url.searchParams.set("matt_tool", ML_AFILIADO.tool);
  return url.toString();
}

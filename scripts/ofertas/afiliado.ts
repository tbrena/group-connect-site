/**
 * Geração de links de afiliado do Mercado Livre.
 *
 * O programa de afiliados rastreia a venda pelos parâmetros `matt_word`
 * (seu identificador) e `matt_tool` (id da ferramenta) anexados à URL do produto.
 * Ambos vêm do .env — pegue-os de qualquer link gerado no painel de afiliados.
 */
import { env } from "./env.ts";

/** Origem do site (o /ir/ mora lá). Mantido aqui para o bot não depender do código do site. */
const SITE_URL = "https://ofertaninja.online";

/**
 * Link que vai nas postagens: passa por ofertaninja.online/ir/<id>, que
 * registra o clique (origem, categoria, desconto, horário) e redireciona para
 * o ML com o código de afiliado.
 */
export function linkRastreado(
  item: { id: string; fonte: string; discount: number; price: number },
  origem: "tg" | "wa" | "site",
): string {
  const url = new URL(`/ir/${item.id}`, SITE_URL);
  url.searchParams.set("o", origem);
  // só letras/números/hífen: "q:air fryer" vira "q-air-fryer" e a URL fica sem %XX
  url.searchParams.set(
    "f",
    item.fonte
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, ""),
  );
  url.searchParams.set("d", String(item.discount));
  url.searchParams.set("p", String(item.price));
  return url.toString();
}

export function affiliateLink(permalink: string): string {
  const url = new URL(permalink);
  url.searchParams.set("matt_word", env.ml.affiliateWord());
  url.searchParams.set("matt_tool", env.ml.affiliateTool());
  return url.toString();
}

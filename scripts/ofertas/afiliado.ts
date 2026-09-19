/**
 * Geração de links de afiliado do Mercado Livre.
 *
 * O programa de afiliados rastreia a venda pelos parâmetros `matt_word`
 * (seu identificador) e `matt_tool` (id da ferramenta) anexados à URL do produto.
 * Ambos vêm do .env — pegue-os de qualquer link gerado no painel de afiliados.
 */
import { env } from "./env.ts";

export function affiliateLink(permalink: string): string {
  const url = new URL(permalink);
  url.searchParams.set("matt_word", env.ml.affiliateWord());
  url.searchParams.set("matt_tool", env.ml.affiliateTool());
  return url.toString();
}

/**
 * Central site configuration.
 *
 * SITE_URL is the canonical origin of the production domain. It is used to
 * build absolute URLs for canonical links, Open Graph tags, JSON-LD and the
 * sitemap — crawlers and WhatsApp/Twitter link previews require absolute URLs.
 */
export const SITE_URL = "https://ofertaninja.online";

export const SITE_NAME = "Preço Ninja";

export const SITE_TITLE = "Preço Ninja — Ofertas que chegam primeiro";

export const SITE_DESCRIPTION =
  "Entre no grupo Preço Ninja e receba descontos, cupons e ofertas relâmpago no WhatsApp antes de todo mundo. Grátis, sem spam.";

export const WHATSAPP_GROUP_URL =
  "https://chat.whatsapp.com/Grj0LpGIotqF8sRbrh9LK5?s=cl&p=a&mlu=4&ilr=4";

/** Turns a site-relative path into an absolute URL on the production domain. */
export function absoluteUrl(path: string): string {
  return new URL(path, SITE_URL).toString();
}

export const OG_IMAGE_URL = absoluteUrl("/og-image.png");

/** ofertas.json publicado pelo bot no repositório público de dados. */
export const OFERTAS_DADOS_URL =
  "https://raw.githubusercontent.com/tbrena/preco-ninja-dados/main/ofertas.json";
/** id → link de afiliado das ofertas Shopee (o /ir/ usa quando a oferta já saiu do ofertas.json). */
export const LINKS_DADOS_URL =
  "https://raw.githubusercontent.com/tbrena/preco-ninja-dados/main/links.json";

/** Código de afiliado do Mercado Livre (é público: vai em toda URL de produto). */
export const ML_AFILIADO = { word: "promoninja", tool: "19839069" };

/**
 * PostHog — registro dos cliques em /ir/<id>. A chave de projeto do PostHog é
 * pública por design (vai no front-end de qualquer site), por isso fica aqui.
 * Vazia = rastreio desligado, redirecionamento continua funcionando.
 */
export const POSTHOG = { key: "", host: "https://us.i.posthog.com" };

/**
 * Meta Pixel (Facebook/Instagram Ads). ID público (Gerenciador de Eventos → Fontes de
 * dados → seu pixel → ID, 15–16 dígitos). Vazio = desligado.
 */
export const META_PIXEL_ID = "";

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
  "Ofertas do Mercado Livre (preço pelo menos 10% abaixo dos outros vendedores) e da Shopee (anúncios bem avaliados e com muitas vendas), conferidas de hora em hora. Receba no WhatsApp ou no Telegram. Grátis.";

export const TELEGRAM_CHANNEL_URL = "https://t.me/preconinjaofertas";

export const WHATSAPP_GROUP_URL = "https://chat.whatsapp.com/EBCbZMCRbcTEnXTvTLzBjC";

/** Turns a site-relative path into an absolute URL on the production domain. */
export function absoluteUrl(path: string): string {
  return new URL(path, SITE_URL).toString();
}

export const OG_IMAGE_URL = absoluteUrl("/og-image.png");

/** ofertas.json publicado pelo bot no repositório público de dados. */
export const OFERTAS_DADOS_URL =
  "https://raw.githubusercontent.com/tbrena/preco-ninja-dados/main/ofertas.json";
/** Cupons de canais públicos do Telegram, publicados pelo bot (scripts/ofertas/cupons-telegram.ts). */
export const CUPONS_DADOS_URL =
  "https://raw.githubusercontent.com/tbrena/preco-ninja-dados/main/cupons.json";
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
export const META_PIXEL_ID = "1814843373271876";

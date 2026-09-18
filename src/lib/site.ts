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

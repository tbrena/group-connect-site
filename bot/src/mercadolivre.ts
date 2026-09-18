import * as cheerio from "cheerio";
import fs from "node:fs/promises";
import path from "node:path";

import { config } from "./config";
import { log } from "./logger";

export interface Offer {
  /** Ex.: MLB12345678 — usado para não repetir o produto. */
  id: string;
  title: string;
  /** URL limpa do produto, sem rastreadores. */
  url: string;
  /** URL com os parâmetros de afiliado (a que vai pro grupo). */
  affiliateUrl: string;
  image?: string;
  price: number;
  originalPrice?: number;
  discountPercent?: number;
  installments?: string;
  freeShipping: boolean;
  /** Página de onde a oferta veio. */
  source: string;
}

const BROWSER_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "pt-BR,pt;q=0.9,en;q=0.8",
  "cache-control": "no-cache",
};

/** Busca todas as páginas configuradas e devolve as ofertas sem duplicatas. */
export async function fetchOffers(urls: string[] = config.offersUrls): Promise<Offer[]> {
  const seen = new Map<string, Offer>();

  for (const [index, url] of urls.entries()) {
    try {
      const html = await fetchHtml(url);
      if (config.debugHtml) await dumpHtml(html, `debug-${index + 1}.html`);

      const offers = parseOffers(html, url);
      if (offers.length === 0) {
        // Sem ofertas quase sempre significa que o HTML mudou: guarda para análise.
        const file = await dumpHtml(html, `debug-vazio-${index + 1}.html`);
        log.warn(`Nenhuma oferta reconhecida em ${url}. HTML salvo em ${file}`);
      }
      for (const offer of offers) if (!seen.has(offer.id)) seen.set(offer.id, offer);
      log.info(`${offers.length} ofertas em ${url}`);
    } catch (err) {
      log.error(`Falha ao buscar ${url}`, err);
    }
  }

  return [...seen.values()];
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, { headers: BROWSER_HEADERS, redirect: "follow" });
  const html = await res.text();

  if (res.status === 403 || res.status === 429 || /Robot or human|captcha/i.test(html.slice(0, 5000))) {
    throw new Error(
      `Mercado Livre bloqueou a requisição (HTTP ${res.status}). Aumente POST_INTERVAL_MINUTES e tente de novo em alguns minutos.`,
    );
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} ao buscar ${url}`);
  return html;
}

async function dumpHtml(html: string, name: string): Promise<string> {
  await fs.mkdir(config.paths.data, { recursive: true });
  const file = path.join(config.paths.data, name);
  await fs.writeFile(file, html, "utf8");
  return file;
}

/**
 * Extrai as ofertas do HTML da página.
 *
 * O ML troca o layout de tempos em tempos, então o parser trabalha em camadas:
 * primeiro os cards atuais (`poly-card`), depois o layout antigo
 * (`promotion-item`) e, por fim, qualquer bloco que tenha um link de produto.
 * Dentro de cada card os valores são lidos pelas classes conhecidas e, se
 * faltarem, por expressões regulares no texto do card.
 */
export function parseOffers(html: string, source: string): Offer[] {
  const $ = cheerio.load(html);

  let cards = $(".poly-card");
  if (cards.length === 0) cards = $(".promotion-item");
  if (cards.length === 0) {
    cards = $("a[href*='MLB']")
      .closest("li, article, .andes-card")
      .filter((_, el) => $(el).find("img").length > 0);
  }

  const offers: Offer[] = [];
  cards.each((_, el) => {
    const offer = parseCard($, $(el), source);
    if (offer) offers.push(offer);
  });
  return offers;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- o tipo do nó varia entre versões do cheerio
type Selection = cheerio.Cheerio<any>;

function parseCard($: cheerio.CheerioAPI, card: Selection, source: string): Offer | null {
  const link = card.find("a[href*='/p/MLB'], a[href*='MLB-'], a[href*='/MLB']").first();
  const href = link.attr("href");
  if (!href) return null;

  const id = extractItemId(href);
  if (!id) return null;

  const title = (
    card.find(".poly-component__title, .promotion-item__title").first().text() ||
    link.attr("title") ||
    link.text()
  )
    .replace(/\s+/g, " ")
    .trim();
  if (!title) return null;

  const text = card.text().replace(/\s+/g, " ");

  // Preços: primeiro pelas classes do componente de moeda do ML, depois por regex.
  const previousEl = card.find(".andes-money-amount--previous").first();
  const currentEl = card
    .find(".poly-price__current .andes-money-amount, .promotion-item__price .andes-money-amount")
    .first();
  let originalPrice = previousEl.length ? parseAmount($, previousEl) : undefined;
  let price = currentEl.length ? parseAmount($, currentEl) : undefined;

  if (price === undefined) {
    const amounts = [...text.matchAll(/R\$\s?(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{2}))?/g)].map(
      (m) => Number(m[1]!.replace(/\./g, "")) + Number(m[2] ?? "0") / 100,
    );
    // Quando há dois valores, o ML mostra o antigo (riscado) antes do atual.
    if (amounts.length >= 2) [originalPrice, price] = [amounts[0], amounts[1]];
    else if (amounts.length === 1) price = amounts[0];
  }
  if (price === undefined || price <= 0) return null;

  let discountPercent = Number(/(\d{1,2})\s*%\s*OFF/i.exec(text)?.[1] ?? "");
  if (!discountPercent && originalPrice && originalPrice > price) {
    discountPercent = Math.round((1 - price / originalPrice) * 100);
  }

  const installments = (
    card.find(".poly-price__installments, .promotion-item__installments").first().text() ||
    /em\s+\d{1,2}x\s+(?:de\s+)?R\$\s?[\d.,]+(?:\s+sem juros)?/i.exec(text)?.[0] ||
    ""
  )
    .replace(/\s+/g, " ")
    .trim();

  const img = card.find("img").first();
  const image = normalizeImage(img.attr("data-src") || img.attr("src"));

  const url = cleanUrl(href);
  return {
    id,
    title,
    url,
    affiliateUrl: buildAffiliateUrl(url),
    ...(image ? { image } : {}),
    price,
    ...(originalPrice && originalPrice > price ? { originalPrice } : {}),
    ...(discountPercent ? { discountPercent } : {}),
    ...(installments ? { installments } : {}),
    freeShipping: /frete gr[áa]tis/i.test(text),
    source,
  };
}

function parseAmount($: cheerio.CheerioAPI, el: Selection): number | undefined {
  const fraction = el.find(".andes-money-amount__fraction").first().text().replace(/\D/g, "");
  if (!fraction) return undefined;
  const cents = el.find(".andes-money-amount__cents").first().text().replace(/\D/g, "");
  return Number(fraction) + Number(cents || "0") / 100;
}

/** Aceita URLs de produto (/p/MLB123), de anúncio (MLB-123-nome) e de clique. */
export function extractItemId(href: string): string | null {
  const match = /MLB-?(\d{6,})/.exec(href);
  return match ? `MLB${match[1]}` : null;
}

/** Remove rastreadores e fragmentos (#polycard_client=..., ?tracking_id=...). */
export function cleanUrl(href: string): string {
  const url = new URL(href, "https://www.mercadolivre.com.br");
  url.hash = "";
  url.search = "";
  return url.toString();
}

/** Anexa os parâmetros do programa de afiliados do ML (matt_tool / matt_word). */
export function buildAffiliateUrl(productUrl: string): string {
  const { tool, word } = config.affiliate;
  if (!tool || !word) return productUrl;
  const url = new URL(productUrl);
  url.searchParams.set("matt_tool", tool);
  url.searchParams.set("matt_word", word);
  return url.toString();
}

/**
 * O ML serve as fotos em WebP, que o WhatsApp não aceita como imagem comum.
 * O mesmo CDN entrega a versão JPG trocando só a extensão; também pedimos a
 * variante grande (D_NQ_NP_2X_) no lugar da miniatura (D_Q_NP_2X_).
 */
function normalizeImage(src: string | undefined): string | undefined {
  if (!src || src.startsWith("data:")) return undefined;
  return src.replace(/\.webp(\?.*)?$/i, ".jpg").replace("/D_Q_NP_", "/D_NQ_NP_");
}

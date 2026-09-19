/**
 * Loop principal: busca ofertas no ML → filtra → publica no Telegram → atualiza o site.
 *
 *   npm run ofertas               # publica
 *   npm run ofertas -- --dry      # só mostra o que publicaria
 *   npm run ofertas -- --so-site  # atualiza public/ofertas.json sem postar no Telegram
 *
 * Estado em .ofertas/publicadas.json evita repetir a mesma oferta por 7 dias.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { affiliateLink } from "./afiliado.ts";
import { discountPercent, searchDeals, type MlItem } from "./ml-client.ts";
import { escapeHtml, sendPhoto } from "./telegram.ts";

const DRY = process.argv.includes("--dry");
/** Só o site: não posta no Telegram nem marca como publicada (útil para pré-visualizar). */
const SITE_ONLY = process.argv.includes("--so-site");
const STATE_FILE = path.resolve(".ofertas/publicadas.json");
const SITE_FILE = path.resolve("public/ofertas.json");
const CONFIG_FILE = path.resolve("scripts/ofertas/config.json");
const REPEAT_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

interface Config {
  minDiscount: number;
  /** acima disso costuma ser preço original inflado pelo vendedor */
  maxDiscount: number;
  maxPerRun: number;
  /** quantas ofertas ficam em public/ofertas.json (home mostra 6, /promo mostra todas) */
  siteMax: number;
  minPrice: number;
  buscas: Array<{ query?: string; category?: string }>;
}

/** Oferta como vai para o site (public/ofertas.json). */
export interface SiteOffer {
  id: string;
  title: string;
  price: number;
  originalPrice: number;
  discount: number;
  image: string;
  url: string;
  freeShipping: boolean;
  publishedAt: string;
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function toSiteOffer(item: MlItem, now: number): SiteOffer {
  return {
    id: item.id,
    title: item.title,
    price: item.price,
    originalPrice: item.original_price,
    discount: discountPercent(item),
    image: item.thumbnail,
    url: affiliateLink(item.permalink),
    freeShipping: Boolean(item.shipping?.free_shipping),
    publishedAt: new Date(now).toISOString(),
  };
}

function caption(item: MlItem, link: string): string {
  const off = discountPercent(item);
  const lines = [
    `🔥 <b>${off}% OFF</b> · ${escapeHtml(item.title)}`,
    "",
    `❌ De: <s>${brl(item.original_price)}</s>`,
    `✅ Por: <b>${brl(item.price)}</b>`,
  ];
  if (item.shipping?.free_shipping) lines.push("🚚 Frete grátis");
  lines.push(
    "",
    `🛒 <a href="${link}">Comprar no Mercado Livre</a>`,
    "",
    "⚡ Preço pode mudar a qualquer momento.",
  );
  return lines.join("\n");
}

async function main() {
  const config = await readJson<Config>(CONFIG_FILE, {
    minDiscount: 20,
    maxDiscount: 70,
    maxPerRun: 5,
    siteMax: 30,
    minPrice: 0,
    buscas: [],
  });
  const published = await readJson<Record<string, number>>(STATE_FILE, {});
  const siteOffers = await readJson<SiteOffer[]>(SITE_FILE, []);
  const now = Date.now();

  // 1. Coleta candidatos de todas as buscas, sem repetir item.
  const seen = new Set<string>();
  const candidates: MlItem[] = [];
  for (const busca of config.buscas) {
    try {
      const items = await searchDeals({ ...busca, minDiscount: config.minDiscount });
      for (const item of items) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        if (item.price < config.minPrice) continue;
        if (discountPercent(item) > config.maxDiscount) continue;
        if (published[item.id] && now - published[item.id] < REPEAT_AFTER_MS) continue;
        candidates.push(item);
      }
    } catch (err) {
      console.error(`Busca ${JSON.stringify(busca)} falhou:`, (err as Error).message);
    }
  }

  // 2. Maior desconto primeiro, limitado por execução.
  candidates.sort((a, b) => discountPercent(b) - discountPercent(a));
  const picked = candidates.slice(0, config.maxPerRun);
  console.log(
    `${candidates.length} candidatos, publicando ${picked.length}${DRY ? " (dry-run)" : ""}\n`,
  );

  // 3. Publica.
  for (const item of picked) {
    const link = affiliateLink(item.permalink);
    const text = caption(item, link);
    console.log(`${discountPercent(item)}% OFF  ${brl(item.price)}  ${item.title}\n   ${link}\n`);
    if (DRY) continue;

    if (SITE_ONLY) continue;

    await sendPhoto(item.thumbnail, text);
    published[item.id] = now;
  }

  if (DRY) return;

  // 4. Site: os melhores candidatos desta rodada na frente, depois os que já
  //    estavam (sem repetir), limitado a siteMax.
  const novos = candidates.slice(0, config.siteMax).map((item) => toSiteOffer(item, now));
  const idsNovos = new Set(novos.map((o) => o.id));
  const site = [...novos, ...siteOffers.filter((o) => !idsNovos.has(o.id))].slice(
    0,
    config.siteMax,
  );

  // 5. Persiste estado e o JSON do site.
  for (const [id, ts] of Object.entries(published)) {
    if (now - ts > REPEAT_AFTER_MS) delete published[id];
  }
  if (!SITE_ONLY) {
    await fs.mkdir(path.dirname(STATE_FILE), { recursive: true });
    await fs.writeFile(STATE_FILE, JSON.stringify(published, null, 2));
  }
  await fs.writeFile(SITE_FILE, JSON.stringify(site, null, 2));
  console.log(`Site atualizado (${site.length} ofertas): ${SITE_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

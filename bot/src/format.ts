import { config } from "./config";
import type { Offer } from "./mercadolivre";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** R$ 1.299,90 (o Intl usa espaço inseparável após o R$; trocamos por espaço normal). */
export function money(value: number): string {
  return brl.format(value).replace(/ /g, " ");
}

function headline(offer: Offer): string {
  const pct = offer.discountPercent ?? 0;
  if (pct >= 50) return "🚨 *MENOR PREÇO DO ANO?*";
  if (pct >= 35) return "🔥 *OFERTA IMPERDÍVEL*";
  return "⚡ *OFERTA RELÂMPAGO*";
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Monta a legenda que vai junto da foto do produto. Usa a formatação do
 * WhatsApp: *negrito*, ~riscado~, _itálico_.
 */
export function formatOfferMessage(offer: Offer): string {
  const lines: string[] = [];

  lines.push(
    offer.discountPercent ? `${headline(offer)} — ${offer.discountPercent}% OFF` : headline(offer),
  );
  lines.push("");
  lines.push(`📦 *${truncate(offer.title, 110)}*`);
  lines.push("");

  if (offer.originalPrice) lines.push(`❌ De: ~${money(offer.originalPrice)}~`);
  lines.push(`✅ Por: *${money(offer.price)}*`);
  if (offer.installments) lines.push(`💳 ${offer.installments}`);
  if (offer.freeShipping) lines.push("🚚 Frete grátis");
  lines.push("");
  lines.push("🛒 Compre aqui:");
  lines.push(offer.affiliateUrl);
  lines.push("");
  lines.push("⏳ Corre que o preço pode mudar a qualquer momento!");

  const site = config.siteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
  lines.push(`_${config.brand} • ${site}_`);

  return lines.join("\n");
}

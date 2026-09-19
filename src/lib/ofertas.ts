import { useEffect, useState } from "react";

/** Mesmo formato gravado por scripts/ofertas/run.ts em public/ofertas.json. */
export interface Oferta {
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

export const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Carrega o JSON no cliente para não travar o SSR e para as seções sumirem
 * sozinhas quando não há ofertas.
 */
export function useOfertas(): Oferta[] {
  const [ofertas, setOfertas] = useState<Oferta[]>([]);

  useEffect(() => {
    fetch("/ofertas.json")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Oferta[]) => setOfertas(Array.isArray(data) ? data : []))
      .catch(() => setOfertas([]));
  }, []);

  return ofertas;
}

/** Texto pronto para colar no WhatsApp (usa a formatação *negrito* e ~riscado~ dele). */
export function textoWhatsApp(oferta: Oferta): string {
  const linhas = [
    `🔥 *${oferta.discount}% OFF* — ${oferta.title}`,
    "",
    `❌ De: ~${brl(oferta.originalPrice)}~`,
    `✅ Por: *${brl(oferta.price)}*`,
  ];
  if (oferta.freeShipping) linhas.push("🚚 Frete grátis");
  linhas.push("", `🛒 Comprar: ${oferta.url}`, "", "⚡ Preço pode mudar a qualquer momento.");
  return linhas.join("\n");
}

/** Abre o WhatsApp com a mensagem preenchida; a pessoa só escolhe o grupo. */
export function linkCompartilharWhatsApp(oferta: Oferta): string {
  return `https://wa.me/?text=${encodeURIComponent(textoWhatsApp(oferta))}`;
}

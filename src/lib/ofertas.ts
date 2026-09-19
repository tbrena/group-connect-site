import { useCallback, useEffect, useState } from "react";

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

/** Repositório e workflow que o botão "Puxar novas ofertas" dispara em produção. */
export const GITHUB_REPO = "tbrena/group-connect-site";
export const OFERTAS_WORKFLOW = "ofertas.yml";
export const ACTIONS_URL = `https://github.com/${GITHUB_REPO}/actions/workflows/${OFERTAS_WORKFLOW}`;

export const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Carrega o JSON no cliente para não travar o SSR e para as seções sumirem
 * sozinhas quando não há ofertas. `recarregar` busca de novo sem cache — é o
 * que o botão de atualizar usa para pegar a versão recém-publicada.
 */
export function useOfertas() {
  const [ofertas, setOfertas] = useState<Oferta[]>([]);
  const [carregando, setCarregando] = useState(true);

  const recarregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await fetch(`/ofertas.json?v=${Date.now()}`, { cache: "no-store" });
      const data: unknown = r.ok ? await r.json() : [];
      setOfertas(Array.isArray(data) ? (data as Oferta[]) : []);
    } catch {
      setOfertas([]);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  return { ofertas, carregando, recarregar };
}

/** Identifica "quais ofertas estão na tela" para detectar quando o site publicou novas. */
export function assinaturaOfertas(ofertas: Oferta[]): string {
  return ofertas.map((o) => o.id).join(",");
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

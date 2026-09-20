import { useCallback, useEffect, useState } from "react";

import { linkRastreado } from "@/lib/rastreio";
import { OFERTAS_DADOS_URL } from "@/lib/site";

/** Mesmo formato gravado por scripts/ofertas/run.ts em public/ofertas.json. */
export interface Oferta {
  id: string;
  /** produto de catálogo do ML a que o anúncio pertence */
  productId?: string;
  /** categoria ou busca que achou a oferta (ex.: MLB1055, q:air fryer) */
  fonte?: string;
  title: string;
  price: number;
  /** referência do desconto: mediana dos outros vendedores, ou "de" declarado (campanha oficial) */
  originalPrice: number;
  /** desconto real (%) contra originalPrice */
  discount: number;
  /** "media" = contra a mediana dos outros vendedores; "vendedor" = contra o "de" declarado. Ausente em JSONs antigos. */
  base?: "media" | "vendedor";
  averagePrice?: number | null;
  sellers?: number;
  image: string;
  url: string;
  freeShipping: boolean;
  /** desconto de campanha oficial do ML; opcional porque JSONs antigos não têm */
  oficial?: boolean;
  /** menor preço observado pelo bot nos últimos 30 dias */
  lowest30d?: boolean;
  publishedAt: string;
}

/** Repositório e workflow que o botão "Puxar novas ofertas" dispara em produção. */
export const GITHUB_REPO = "tbrena/group-connect-site";
export const OFERTAS_WORKFLOW = "ofertas.yml";
export const ACTIONS_URL = `https://github.com/${GITHUB_REPO}/actions/workflows/${OFERTAS_WORKFLOW}`;

/**
 * Em produção o JSON vem do repositório público de dados: o bot (GitHub
 * Actions) empurra public/ofertas.json para lá a cada rodada e o site reflete
 * em minutos, sem republicar no Lovable — que só é preciso quando o CÓDIGO
 * muda. O arquivo local fica como fallback (e é o que o dev usa).
 */
const FONTES_OFERTAS = import.meta.env.PROD
  ? [OFERTAS_DADOS_URL, "/ofertas.json"]
  : ["/ofertas.json"];

async function buscarOfertas(): Promise<Oferta[]> {
  for (const fonte of FONTES_OFERTAS) {
    try {
      const r = await fetch(`${fonte}?v=${Date.now()}`, { cache: "no-store" });
      if (!r.ok) continue;
      const data: unknown = await r.json();
      if (Array.isArray(data) && data.length > 0) return data as Oferta[];
    } catch {
      // tenta a próxima fonte
    }
  }
  return [];
}

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
      setOfertas(await buscarOfertas());
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
  const linhas: string[] = [];
  if (oferta.base === "media" && oferta.averagePrice) {
    linhas.push(
      `🔥 *${oferta.discount}% abaixo do preço médio* — ${oferta.title}`,
      "",
      `💰 Média no Mercado Livre: ${brl(oferta.averagePrice)} (${oferta.sellers} vendedores)`,
      `✅ Por: *${brl(oferta.price)}*`,
    );
  } else {
    linhas.push(
      `🔥 *${oferta.discount}% OFF* — ${oferta.title}`,
      "",
      `❌ De: ~${brl(oferta.originalPrice)}~`,
      `✅ Por: *${brl(oferta.price)}*`,
    );
  }
  if (oferta.lowest30d) linhas.push("📉 Menor preço dos últimos 30 dias");
  if (oferta.freeShipping) linhas.push("🚚 Frete grátis");
  if (oferta.oficial) linhas.push("🏷️ Promoção oficial do Mercado Livre");
  linhas.push(
    "",
    `🛒 Comprar: ${linkRastreado(oferta, "wa")}`,
    "",
    "⚡ Preço pode mudar a qualquer momento.",
  );
  // "％" (porcento largo) no lugar de "%": o wa.me decodifica a URL mais de uma
  // vez em alguns aparelhos e o "%" comum, que é o escape de URL, chega errado.
  return linhas.join("\n").replace(/%/g, "％");
}

/** Abre o WhatsApp com a mensagem preenchida; a pessoa só escolhe o grupo. */
export function linkCompartilharWhatsApp(oferta: Oferta): string {
  return `https://wa.me/?text=${encodeURIComponent(textoWhatsApp(oferta))}`;
}

import { useEffect, useState } from "react";

import { CUPONS_DADOS_URL } from "@/lib/site";

/** Mesmo formato gravado por scripts/ofertas/cupons-telegram.ts em public/cupons.json. */
export interface Cupom {
  id: string;
  loja: "ml" | "shopee";
  /** um ou mais códigos anunciados juntos (faixas de valor) */
  codigos: string[];
  /** "30% OFF" / "R$ 20 OFF" */
  desconto: string | null;
  /** teto do desconto, "R$ 500" */
  limite: string | null;
  /** compra mínima, "R$ 99" */
  minimo: string | null;
  /** onde vale: "Entregas Full", "Tecnologia e Eletrodomésticos" */
  escopo: string | null;
  /** nosso link de afiliado (página de cupons do ML ou a Shopee) */
  link: string;
  /** ISO de quando o cupom foi anunciado */
  quando: string;
}

const FONTES = import.meta.env.PROD ? [CUPONS_DADOS_URL, "/cupons.json"] : ["/cupons.json"];

async function buscarCupons(): Promise<Cupom[]> {
  for (const fonte of FONTES) {
    try {
      const r = await fetch(`${fonte}?v=${Date.now()}`, { cache: "no-store" });
      if (!r.ok) continue;
      const data: unknown = await r.json();
      if (Array.isArray(data)) return data as Cupom[];
    } catch {
      // tenta a próxima fonte
    }
  }
  return [];
}

/** Cupons do dia, carregados no navegador (a seção some sozinha quando não há nenhum). */
export function useCupons(): Cupom[] {
  const [cupons, setCupons] = useState<Cupom[]>([]);
  useEffect(() => {
    void buscarCupons().then(setCupons);
  }, []);
  return cupons;
}

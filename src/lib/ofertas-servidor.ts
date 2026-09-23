import { createServerFn } from "@tanstack/react-start";
import { getRequestUrl } from "@tanstack/react-start/server";

import type { Oferta } from "@/lib/ofertas";
import { OFERTAS_DADOS_URL } from "@/lib/site";

/** Quantas ofertas vêm prontas no HTML do /promo (e quantos cards a página mostra por vez). */
export const OFERTAS_POR_PAGINA = 60;

export interface OfertasIniciais {
  /** as primeiras da lista, na ordem do bot (destaques) */
  ofertas: Oferta[];
  /** tamanho da lista inteira, para o texto do topo não mostrar só as primeiras */
  total: number;
}

/**
 * Primeiras ofertas do /promo, lidas no servidor: vão no HTML já renderizado,
 * então o Google (e a prévia de link) enxerga produtos e preços, não uma página
 * vazia esperando o JavaScript. Só as primeiras, para o HTML não carregar o
 * JSON inteiro duas vezes — o navegador busca a lista completa logo depois.
 * Server function: na navegação dentro do site também roda no servidor.
 */
export const carregarOfertasIniciais = createServerFn({ method: "GET" }).handler(
  async (): Promise<OfertasIniciais> => {
    const todas = await lerOfertas();
    return { ofertas: todas.slice(0, OFERTAS_POR_PAGINA), total: todas.length };
  },
);

async function lerOfertas(): Promise<Oferta[]> {
  // Mesmas fontes do navegador (src/lib/ofertas.ts): o repositório de dados em produção,
  // e o public/ofertas.json do próprio site (o que o dev usa).
  const local = new URL("/ofertas.json", getRequestUrl()).toString();
  const fontes = import.meta.env.PROD ? [OFERTAS_DADOS_URL, local] : [local];
  for (const fonte of fontes) {
    try {
      // Sem ?v=: aqui o cache curto do CDN do GitHub ajuda. Timeout para a página
      // nunca travar esperando — sem ofertas, o navegador busca sozinho.
      const r = await fetch(fonte, { signal: AbortSignal.timeout(3000) });
      if (!r.ok) continue;
      const data: unknown = await r.json();
      if (Array.isArray(data) && data.length > 0) return data as Oferta[];
    } catch {
      // tenta a próxima fonte
    }
  }
  return [];
}

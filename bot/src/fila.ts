import { config } from "./config";

/**
 * A fila que o bot do GitHub publica a cada rodada (scripts/ofertas/fila-whatsapp.ts):
 * cada post que saiu no Telegram, com o texto já no formato do WhatsApp e a foto.
 */
export interface ItemFila {
  tipo: "oferta" | "cupom";
  id: string;
  /** início da rodada que gerou o item (ISO) */
  rodada: string;
  /** posição na rodada (0 = melhor; cupom = -1) */
  ordem: number;
  marketplace: "ml" | "shopee";
  texto: string;
  imagem: string | null;
}

/** Chave de "já enviado": o mesmo produto em outra rodada (preço caiu de novo) conta como novo. */
export const chaveItem = (i: ItemFila) => `${i.tipo}:${i.id}:${i.rodada}`;

export async function lerFila(): Promise<ItemFila[]> {
  const res = await fetch(`${config.filaUrl}?v=${Date.now()}`, {
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`fila: HTTP ${res.status} em ${config.filaUrl}`);
  const dados = (await res.json()) as { itens?: ItemFila[] };
  return dados.itens ?? [];
}

/**
 * Próximos itens a postar, na ordem: rodada mais nova primeiro e, dentro dela, a
 * ordem do bot (cupons, depois 🥇🥈🥉…, alternando Mercado Livre e Shopee).
 * Pula o que já foi enviado, o que é velho demais e as lojas/cupons desligados.
 */
export function candidatos(
  itens: ItemFila[],
  jaEnviado: (chave: string, id: string) => boolean,
  agora = Date.now(),
): ItemFila[] {
  return itens
    .filter((i) => agora - new Date(i.rodada).getTime() <= config.maxAgeMinutes * 60_000)
    .filter((i) => config.lojas.includes(i.marketplace))
    .filter((i) => config.cupons || i.tipo !== "cupom")
    .filter((i) => !jaEnviado(chaveItem(i), i.id))
    .sort((a, b) => b.rodada.localeCompare(a.rodada) || a.ordem - b.ordem);
}

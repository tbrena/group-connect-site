/**
 * Fila do WhatsApp (public/whatsapp.json, publicada no repositório de dados).
 *
 * O bot do WhatsApp (pasta bot/, roda no PC ou num servidor com um número
 * conectado) não escolhe ofertas: ele lê esta fila e posta no grupo no ritmo
 * dele. Aqui entra cada post que saiu no Telegram — oferta ou cupom — com o
 * texto já no formato do WhatsApp e a foto. Assim os dois canais recebem as
 * mesmas ofertas, com a mesma curadoria (desconto real, cupom, chamada).
 */
import fs from "node:fs/promises";
import path from "node:path";

export interface ItemFila {
  tipo: "oferta" | "cupom";
  id: string;
  /** início da rodada que gerou o item (ISO); o bot prefere as rodadas mais novas */
  rodada: string;
  /** posição na rodada (0 = melhor); cupom vem com -1 para sair antes das ofertas */
  ordem: number;
  marketplace: "ml" | "shopee";
  /** texto pronto no formato do WhatsApp (*negrito*, ~riscado~) */
  texto: string;
  /** foto do produto; null = só texto */
  imagem: string | null;
}

const FILA_FILE = path.resolve("public/whatsapp.json");
/** O bot não posta item mais velho que isso (preço pode ter mudado); guardar mais é desperdício. */
const RETENCAO_MS = 24 * 60 * 60 * 1000;
const MAX_ITENS = 400;

const RODADA = new Date().toISOString();
const novos: ItemFila[] = [];

export function enfileirar(item: Omit<ItemFila, "rodada">): void {
  novos.push({ ...item, rodada: RODADA });
}

const chave = (i: ItemFila) => `${i.tipo}:${i.id}:${i.rodada}`;

/** Junta os itens desta rodada aos das últimas 24 h e grava. Pode ser chamada mais de uma vez. */
export async function salvarFila(agora = Date.now()): Promise<void> {
  // Rodada sem post (só site, ou Telegram pulado) não mexe no arquivo: evita commit à toa.
  if (novos.length === 0) return;
  let antigos: ItemFila[] = [];
  try {
    const dados = JSON.parse(await fs.readFile(FILA_FILE, "utf8")) as { itens?: ItemFila[] };
    antigos = dados.itens ?? [];
  } catch {
    // primeira vez
  }
  const porChave = new Map<string, ItemFila>();
  for (const i of [...antigos, ...novos]) {
    if (agora - new Date(i.rodada).getTime() <= RETENCAO_MS) porChave.set(chave(i), i);
  }
  const itens = [...porChave.values()]
    .sort((a, b) => b.rodada.localeCompare(a.rodada) || a.ordem - b.ordem)
    .slice(0, MAX_ITENS);
  await fs.mkdir(path.dirname(FILA_FILE), { recursive: true });
  await fs.writeFile(
    FILA_FILE,
    JSON.stringify({ atualizadoEm: new Date(agora).toISOString(), itens }, null, 2),
  );
  if (novos.length)
    console.log(`whatsapp: ${novos.length} itens na fila (${itens.length} no total)`);
}

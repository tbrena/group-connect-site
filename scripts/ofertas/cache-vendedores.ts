/**
 * Cache de /users/{seller_id}: nome e reputação do vendedor, que mudam devagar.
 * Fica em .ofertas/vendedores.json (versionado, o CI aproveita). Validade de 30 dias.
 */
import fs from "node:fs/promises";
import path from "node:path";

const FILE = path.resolve(".ofertas/vendedores.json");
const VALIDADE_MS = 30 * 24 * 60 * 60 * 1000;

export interface Vendedor {
  nickname: string;
  /** level_id da reputação: "1_red" … "5_green"; null quando o ML não informa */
  reputacao: string | null;
  ts: number;
}

let dados: Record<string, Vendedor> = {};

export async function carregarCacheVendedores(): Promise<void> {
  try {
    dados = JSON.parse(await fs.readFile(FILE, "utf8")) as Record<string, Vendedor>;
  } catch {
    dados = {};
  }
}

export function vendedorCacheado(id: number): Vendedor | undefined {
  const v = dados[id];
  return v && Date.now() - v.ts < VALIDADE_MS ? v : undefined;
}

export function guardarVendedor(id: number, nickname: string, reputacao: string | null): void {
  dados[id] = { nickname, reputacao, ts: Date.now() };
}

export async function salvarCacheVendedores(): Promise<void> {
  for (const [id, v] of Object.entries(dados)) {
    if (Date.now() - v.ts >= VALIDADE_MS) delete dados[id];
  }
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(dados));
}

/** "5_green" → 5, "3_yellow" → 3; null/desconhecido → 0. */
export function nivelReputacao(reputacao: string | null | undefined): number {
  return Number(reputacao?.split("_")[0]) || 0;
}

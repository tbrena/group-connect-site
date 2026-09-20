/**
 * Cache de /products/{id} (nome e foto do produto de catálogo), que quase
 * não mudam. Evita ~180 requisições por rodada. Fica em .ofertas/produtos.json,
 * versionado para o CI aproveitar entre execuções.
 */
import fs from "node:fs/promises";
import path from "node:path";

const FILE = path.resolve(".ofertas/produtos.json");
const VALIDADE_MS = 7 * 24 * 60 * 60 * 1000;

export interface ProdutoCacheado {
  name: string;
  picture: string;
  /** epoch ms de quando foi buscado */
  ts: number;
}

let dados: Record<string, ProdutoCacheado> = {};

export async function carregarCacheProdutos(): Promise<void> {
  try {
    dados = JSON.parse(await fs.readFile(FILE, "utf8")) as Record<string, ProdutoCacheado>;
  } catch {
    dados = {};
  }
}

/** Produto ainda válido no cache, ou undefined. */
export function produtoCacheado(id: string): ProdutoCacheado | undefined {
  const p = dados[id];
  return p && Date.now() - p.ts < VALIDADE_MS ? p : undefined;
}

export function guardarProduto(id: string, name: string, picture: string): void {
  dados[id] = { name, picture, ts: Date.now() };
}

export async function salvarCacheProdutos(): Promise<void> {
  for (const [id, p] of Object.entries(dados)) {
    if (Date.now() - p.ts >= VALIDADE_MS) delete dados[id];
  }
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(dados));
}

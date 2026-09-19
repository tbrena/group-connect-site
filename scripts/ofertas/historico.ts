/**
 * Histórico de preços observados pelo bot (menor preço de cada produto por dia).
 *
 * Fica em .ofertas/precos.json, versionado no git para o CI acumular entre
 * execuções. Com ele dá para afirmar "menor preço dos últimos 30 dias" — um
 * selo que o vendedor não consegue manipular, ao contrário do "de/por".
 */
import fs from "node:fs/promises";
import path from "node:path";

const FILE = path.resolve(".ofertas/precos.json");
/** Dias de histórico mantidos no arquivo. */
const RETENCAO_DIAS = 90;
/** Janela do selo "menor preço". */
const JANELA_DIAS = 30;
/** Dias distintos de observação necessários antes de dar o selo. */
const MIN_DIAS_OBSERVADOS = 7;

/** { productId: { "2026-09-20": 999.0, ... } } */
type Historico = Record<string, Record<string, number>>;

let dados: Historico = {};
const hoje = new Date().toISOString().slice(0, 10);

export async function carregarHistorico(): Promise<void> {
  try {
    dados = JSON.parse(await fs.readFile(FILE, "utf8")) as Historico;
  } catch {
    dados = {};
  }
}

/** Registra o menor preço visto hoje para o produto (mantém o menor se já houver). */
export function observarPreco(productId: string, price: number): void {
  const dias = (dados[productId] ??= {});
  dias[hoje] = Math.min(dias[hoje] ?? Infinity, price);
}

function diasAnteriores(productId: string): Array<[string, number]> {
  const limite = new Date(Date.now() - JANELA_DIAS * 86_400_000).toISOString().slice(0, 10);
  return Object.entries(dados[productId] ?? {}).filter(([dia]) => dia !== hoje && dia >= limite);
}

/**
 * true quando `price` é menor ou igual a tudo que vimos nos últimos 30 dias
 * e já temos histórico suficiente para a afirmação valer alguma coisa.
 */
export function menorPrecoEm30Dias(productId: string, price: number): boolean {
  const anteriores = diasAnteriores(productId);
  if (anteriores.length < MIN_DIAS_OBSERVADOS) return false;
  return anteriores.every(([, p]) => price <= p);
}

/** Quantos dias de histórico o produto tem (para mostrar "em N dias" na mensagem). */
export function diasDeHistorico(productId: string): number {
  return diasAnteriores(productId).length;
}

export async function salvarHistorico(): Promise<void> {
  const limite = new Date(Date.now() - RETENCAO_DIAS * 86_400_000).toISOString().slice(0, 10);
  for (const [productId, dias] of Object.entries(dados)) {
    for (const dia of Object.keys(dias)) if (dia < limite) delete dias[dia];
    if (Object.keys(dias).length === 0) delete dados[productId];
  }
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(dados));
}

export function tamanhoHistorico(): { produtos: number; observacoes: number } {
  const produtos = Object.keys(dados).length;
  const observacoes = Object.values(dados).reduce((n, d) => n + Object.keys(d).length, 0);
  return { produtos, observacoes };
}

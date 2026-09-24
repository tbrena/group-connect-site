import fs from "node:fs/promises";
import path from "node:path";

import { config } from "./config";

/**
 * data/enviados.json: o que já foi para o grupo e quando. Serve para não
 * repetir e para contar quantos posts saíram na última hora (MAX_POR_HORA).
 */

interface StoreData {
  /** chave do item (tipo:id:rodada) → ISO do envio */
  enviados: Record<string, string>;
  /** id do produto/cupom → ISO do último envio (o mesmo produto não volta no mesmo dia) */
  ids: Record<string, string>;
}

const file = path.join(config.paths.data, "enviados.json");
const DIA_MS = 24 * 60 * 60 * 1000;
let cache: StoreData | null = null;

async function load(): Promise<StoreData> {
  if (cache) return cache;
  try {
    const parsed = JSON.parse(await fs.readFile(file, "utf8")) as Partial<StoreData>;
    cache = { enviados: parsed.enviados ?? {}, ids: parsed.ids ?? {} };
  } catch {
    cache = { enviados: {}, ids: {} };
  }
  return cache;
}

async function save(data: StoreData): Promise<void> {
  await fs.mkdir(config.paths.data, { recursive: true });
  // Escreve num arquivo temporário e renomeia, para nunca deixar um JSON pela metade.
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmp, file);
}

/** Já foi enviado (este item, ou o mesmo produto nas últimas 24 h)? */
export async function carregarEnviados(): Promise<(chave: string, id: string) => boolean> {
  const data = await load();
  const agora = Date.now();
  return (chave, id) =>
    Boolean(data.enviados[chave]) ||
    (data.ids[id] !== undefined && agora - new Date(data.ids[id]).getTime() < DIA_MS);
}

export async function marcarEnviado(chave: string, id: string): Promise<void> {
  const data = await load();
  const agora = new Date().toISOString();
  data.enviados[chave] = agora;
  data.ids[id] = agora;
  // Esquece o que tem mais de 3 dias, para o arquivo não crescer para sempre.
  const corte = Date.now() - 3 * DIA_MS;
  for (const registro of [data.enviados, data.ids]) {
    for (const [k, quando] of Object.entries(registro)) {
      if (new Date(quando).getTime() < corte) delete registro[k];
    }
  }
  await save(data);
}

/** Quantos posts saíram nos últimos 60 minutos. */
export async function enviadosNaUltimaHora(): Promise<number> {
  const { enviados } = await load();
  const corte = Date.now() - 60 * 60 * 1000;
  return Object.values(enviados).filter((q) => new Date(q).getTime() >= corte).length;
}

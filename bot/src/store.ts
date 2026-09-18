import fs from "node:fs/promises";
import path from "node:path";

import { config } from "./config";

/**
 * Guarda em data/posted.json quando cada produto foi postado, para o bot não
 * repetir a mesma oferta dentro de REPOST_AFTER_DAYS.
 */

interface StoreData {
  /** id do produto → data/hora ISO da última postagem */
  posted: Record<string, string>;
}

const file = path.join(config.paths.data, "posted.json");
let cache: StoreData | null = null;

async function load(): Promise<StoreData> {
  if (cache) return cache;
  try {
    const parsed = JSON.parse(await fs.readFile(file, "utf8")) as Partial<StoreData>;
    cache = { posted: parsed.posted ?? {} };
  } catch {
    cache = { posted: {} };
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

export async function wasPostedRecently(id: string, days = config.repostAfterDays): Promise<boolean> {
  const { posted } = await load();
  const when = posted[id];
  if (!when) return false;
  return Date.now() - new Date(when).getTime() < days * 24 * 60 * 60 * 1000;
}

export async function markPosted(id: string): Promise<void> {
  const data = await load();
  data.posted[id] = new Date().toISOString();

  // Esquece registros antigos para o arquivo não crescer para sempre.
  const cutoff = Date.now() - Math.max(config.repostAfterDays, 1) * 2 * 24 * 60 * 60 * 1000;
  for (const [key, when] of Object.entries(data.posted)) {
    if (new Date(when).getTime() < cutoff) delete data.posted[key];
  }
  await save(data);
}

export async function postedCount(): Promise<number> {
  return Object.keys((await load()).posted).length;
}

import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Toda configuração vem do arquivo bot/.env (veja .env.example).
 * Aqui só lemos, validamos e damos valores padrão.
 */

const botRoot = fileURLToPath(new URL("..", import.meta.url));

function str(name: string, fallback = ""): string {
  const value = process.env[name];
  return value === undefined || value.trim() === "" ? fallback : value.trim();
}

function int(name: string, fallback: number): number {
  const raw = str(name);
  if (raw === "") return fallback;
  const value = Number.parseInt(raw, 10);
  if (Number.isNaN(value)) throw new Error(`${name} deve ser um número inteiro (recebi "${raw}")`);
  return value;
}

function list(name: string, fallback: string[] = []): string[] {
  const raw = str(name);
  if (raw === "") return fallback;
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

/** "08-23" → { start: 8, end: 23 } (fim exclusivo: posta das 8h às 22h59). */
function hours(name: string, fallback: string): { start: number; end: number } {
  const raw = str(name, fallback);
  const match = /^(\d{1,2})\s*-\s*(\d{1,2})$/.exec(raw);
  if (!match) throw new Error(`${name} deve ter o formato HH-HH, ex.: 08-23 (recebi "${raw}")`);
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (start < 0 || start > 23 || end < 1 || end > 24 || start >= end) {
    throw new Error(`${name} inválido: "${raw}"`);
  }
  return { start, end };
}

const lojas = list("LOJAS", ["ml", "shopee"]).map((l) => l.toLowerCase());
for (const l of lojas) {
  if (l !== "ml" && l !== "shopee") throw new Error(`LOJAS aceita ml e shopee (recebi "${l}")`);
}

export const config = {
  group: {
    /** um ou mais grupos (JIDs separados por vírgula) — tem prioridade sobre o nome */
    jids: list("GROUP_JID"),
    name: str("GROUP_NAME"),
  },
  /** fila publicada pelo bot do GitHub a cada rodada */
  filaUrl: str(
    "FILA_URL",
    "https://raw.githubusercontent.com/tbrena/preco-ninja-dados/main/whatsapp.json",
  ),
  intervalMinutes: int("INTERVALO_MINUTOS", 6),
  maxPerHour: int("MAX_POR_HORA", 10),
  activeHours: hours("ACTIVE_HOURS", "08-23"),
  /** item da fila mais velho que isso não é postado (o preço pode ter mudado) */
  maxAgeMinutes: int("MAX_IDADE_MINUTOS", 180),
  lojas: lojas as Array<"ml" | "shopee">,
  cupons: str("CUPONS", "1") !== "0",
  paths: {
    auth: path.join(botRoot, "auth"),
    data: path.join(botRoot, "data"),
  },
};

/** Avisa sobre o que está faltando sem impedir os comandos de teste de rodar. */
export function warnAboutConfig(warn: (msg: string) => void): void {
  if (!config.group.name && config.group.jids.length === 0) {
    warn("GROUP_NAME ou GROUP_JID não configurado — rode `npm run grupos` para descobrir.");
  }
  if (config.maxPerHour > 15) {
    warn(`MAX_POR_HORA=${config.maxPerHour} é alto: grupo cansa e o risco de banimento cresce.`);
  }
}

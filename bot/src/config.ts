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

function list(name: string, fallback: string[] = [], separator = ","): string[] {
  const raw = str(name);
  if (raw === "") return fallback;
  return raw
    .split(separator)
    .map((item) => item.trim())
    .filter(Boolean);
}

/** "08-22" → { start: 8, end: 22 } (fim exclusivo: posta das 8h às 21h59). */
function hours(name: string, fallback: string): { start: number; end: number } {
  const raw = str(name, fallback);
  const match = /^(\d{1,2})\s*-\s*(\d{1,2})$/.exec(raw);
  if (!match) throw new Error(`${name} deve ter o formato HH-HH, ex.: 08-22 (recebi "${raw}")`);
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (start < 0 || start > 23 || end < 1 || end > 24 || start >= end) {
    throw new Error(`${name} inválido: "${raw}"`);
  }
  return { start, end };
}

const ML_SOURCES = ["auto", "api", "page"] as const;
type MlSource = (typeof ML_SOURCES)[number];

function mlSource(): MlSource {
  const raw = str("ML_SOURCE", "auto");
  if ((ML_SOURCES as readonly string[]).includes(raw)) return raw as MlSource;
  throw new Error(`ML_SOURCE deve ser auto, api ou page (recebi "${raw}")`);
}

/** Categorias grandes do ML usadas quando ML_API_SEARCHES não é informado. */
const DEFAULT_API_SEARCHES = [
  "category=MLB1051", // Celulares e Telefones
  "category=MLB1648", // Informática
  "category=MLB1000", // Eletrônicos, Áudio e Vídeo
  "category=MLB5726", // Eletrodomésticos
  "category=MLB1574", // Casa, Móveis e Decoração
  "category=MLB1144", // Games
];

export const config = {
  group: {
    name: str("GROUP_NAME"),
    jid: str("GROUP_JID"),
  },
  affiliate: {
    tool: str("ML_AFFILIATE_TOOL"),
    word: str("ML_AFFILIATE_WORD"),
  },
  offersUrls: list("ML_OFFERS_URLS", ["https://www.mercadolivre.com.br/ofertas"]),
  ml: {
    appId: str("ML_APP_ID"),
    appSecret: str("ML_APP_SECRET"),
    redirectUri: str("ML_REDIRECT_URI", "https://ofertaninja.online/ml-callback"),
    source: mlSource(),
    // "|" como separador porque uma busca pode ter vírgula (q=fone, bluetooth).
    searches: list("ML_API_SEARCHES", DEFAULT_API_SEARCHES, "|"),
  },
  minDiscountPercent: int("MIN_DISCOUNT_PERCENT", 20),
  intervalMinutes: int("POST_INTERVAL_MINUTES", 30),
  postsPerRun: int("POSTS_PER_RUN", 1),
  activeHours: hours("ACTIVE_HOURS", "08-22"),
  repostAfterDays: int("REPOST_AFTER_DAYS", 7),
  blockedWords: list("BLOCKED_WORDS").map((word) => word.toLowerCase()),
  brand: str("BRAND_NAME", "Preço Ninja"),
  siteUrl: str("SITE_URL", "https://ofertaninja.online"),
  debugHtml: str("DEBUG_HTML") === "1",
  paths: {
    auth: path.join(botRoot, "auth"),
    data: path.join(botRoot, "data"),
  },
};

/** Avisa sobre o que está faltando sem impedir os comandos de teste de rodar. */
export function warnAboutConfig(warn: (msg: string) => void): void {
  if (config.ml.source !== "page" && (!config.ml.appId || !config.ml.appSecret)) {
    warn("ML_APP_ID / ML_APP_SECRET não configurados — as ofertas vêm da página do ML, que é menos confiável que a API.");
  }
  if (!config.affiliate.tool || !config.affiliate.word) {
    warn(
      "ML_AFFILIATE_TOOL / ML_AFFILIATE_WORD não configurados — os links vão sair SEM comissão.",
    );
  }
  if (!config.group.name && !config.group.jid) {
    warn("GROUP_NAME ou GROUP_JID não configurado — rode `npm run groups` para descobrir.");
  }
}

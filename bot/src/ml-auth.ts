import fs from "node:fs/promises";
import path from "node:path";

import { config } from "./config";
import { log } from "./logger";

/**
 * OAuth do Mercado Livre.
 *
 * Fluxo: a pessoa abre `authorizationUrl()`, autoriza, o ML redireciona para
 * ML_REDIRECT_URI com `?code=...`, ela cola o código no terminal e
 * `exchangeCode()` troca por tokens. O access token vence em 6 h e o refresh
 * token é de uso único (cada renovação devolve um novo), então tudo fica em
 * data/ml-token.json e `getAccessToken()` renova sozinho quando precisa.
 */

const AUTH_URL = "https://auth.mercadolivre.com.br/authorization";
const TOKEN_URL = "https://api.mercadolibre.com/oauth/token";
const REFRESH_MARGIN_MS = 10 * 60 * 1000;

interface StoredToken {
  accessToken: string;
  refreshToken: string;
  /** Momento (ms desde 1970) em que o access token expira. */
  expiresAt: number;
  userId: number | null;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  user_id?: number;
  error?: string;
  message?: string;
}

const tokenFile = path.join(config.paths.data, "ml-token.json");

export function isApiConfigured(): boolean {
  return Boolean(config.ml.appId && config.ml.appSecret);
}

export function authorizationUrl(): string {
  const url = new URL(AUTH_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.ml.appId);
  url.searchParams.set("redirect_uri", config.ml.redirectUri);
  return url.toString();
}

/** Aceita o código puro (TG-...) ou a URL inteira da página de retorno. */
export function extractCode(input: string): string {
  const value = input.trim();
  if (/^https?:\/\//i.test(value)) {
    const code = new URL(value).searchParams.get("code");
    if (!code) throw new Error("Essa URL não tem o parâmetro code=.");
    return code;
  }
  if (!value) throw new Error("Código vazio.");
  return value;
}

async function readToken(): Promise<StoredToken | null> {
  try {
    return JSON.parse(await fs.readFile(tokenFile, "utf8")) as StoredToken;
  } catch {
    return null;
  }
}

async function writeToken(token: StoredToken): Promise<void> {
  await fs.mkdir(config.paths.data, { recursive: true });
  await fs.writeFile(tokenFile, JSON.stringify(token, null, 2), "utf8");
}

export async function hasToken(): Promise<boolean> {
  return (await readToken()) !== null;
}

async function requestToken(params: Record<string, string>): Promise<StoredToken> {
  const body = new URLSearchParams({
    client_id: config.ml.appId,
    client_secret: config.ml.appSecret,
    ...params,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const json = (await res.json().catch(() => ({}))) as TokenResponse;

  if (!res.ok || !json.access_token) {
    throw new Error(
      `Mercado Livre recusou (HTTP ${res.status}): ${json.message ?? json.error ?? "sem detalhes"}`,
    );
  }
  if (!json.refresh_token) {
    throw new Error(
      "O ML não devolveu refresh token. No painel do aplicativo, marque o escopo offline_access e autorize de novo.",
    );
  }

  const token: StoredToken = {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: Date.now() + (json.expires_in ?? 21600) * 1000,
    userId: json.user_id ?? null,
  };
  await writeToken(token);
  return token;
}

export async function exchangeCode(codeOrUrl: string): Promise<StoredToken> {
  return requestToken({
    grant_type: "authorization_code",
    code: extractCode(codeOrUrl),
    redirect_uri: config.ml.redirectUri,
  });
}

/** Devolve um access token válido, renovando pelo refresh token se estiver perto de vencer. */
export async function getAccessToken(): Promise<string> {
  const token = await readToken();
  if (!token) throw new Error("API do Mercado Livre ainda não autorizada. Rode `npm run ml:auth`.");
  if (Date.now() < token.expiresAt - REFRESH_MARGIN_MS) return token.accessToken;

  log.info("Renovando o token do Mercado Livre...");
  try {
    const fresh = await requestToken({
      grant_type: "refresh_token",
      refresh_token: token.refreshToken,
    });
    return fresh.accessToken;
  } catch (err) {
    throw new Error(
      `Não consegui renovar o token do ML (${err instanceof Error ? err.message : String(err)}). Rode \`npm run ml:auth\` de novo.`,
    );
  }
}

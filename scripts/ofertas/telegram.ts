/**
 * Publicação no Telegram via Bot API (oficial, gratuita).
 * O bot precisa ser admin do canal/grupo em TELEGRAM_CHAT_ID.
 *
 * O Telegram limita a ~20 mensagens por minuto por canal; ao receber
 * "Too Many Requests" esperamos o tempo que ele pede e tentamos de novo.
 */
import { env } from "./env.ts";

interface TelegramResposta {
  ok: boolean;
  description?: string;
  result?: { message_id?: number };
  parameters?: { retry_after?: number };
}

const MAX_TENTATIVAS = 4;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** POST na API; corpo JSON ou FormData (upload). Respeita retry_after do 429. */
async function post(method: string, body: BodyInit, headers?: Record<string, string>) {
  for (let tentativa = 1; ; tentativa++) {
    const res = await fetch(`https://api.telegram.org/bot${env.telegram.botToken()}/${method}`, {
      method: "POST",
      headers,
      body,
    });
    const json = (await res.json()) as TelegramResposta;
    if (json.ok) return json;

    const espera = json.parameters?.retry_after;
    if (espera && tentativa < MAX_TENTATIVAS) {
      console.error(`  Telegram pediu para esperar ${espera}s (${method}); aguardando…`);
      await sleep((espera + 1) * 1000);
      continue;
    }
    throw new Error(`Telegram ${method}: ${json.description}`);
  }
}

function call(method: string, payload: Record<string, unknown>) {
  return post(method, JSON.stringify({ chat_id: env.telegram.chatId(), ...payload }), {
    "content-type": "application/json",
  });
}

export interface BotaoUrl {
  text: string;
  url: string;
}

/** Teclado com uma linha de botões-link embaixo da mensagem. */
const teclado = (botoes?: BotaoUrl[]) =>
  botoes?.length ? { inline_keyboard: [botoes] } : undefined;

/**
 * Foto + legenda (limite de 1024 caracteres na legenda).
 * `photo` pode ser uma URL (o Telegram baixa) ou um Buffer JPEG (upload multipart).
 */
export async function sendPhoto(photo: string | Buffer, caption: string, botoes?: BotaoUrl[]) {
  if (typeof photo === "string") {
    return call("sendPhoto", {
      photo,
      caption: caption.slice(0, 1024),
      parse_mode: "HTML",
      reply_markup: teclado(botoes),
    });
  }
  const form = new FormData();
  form.set("chat_id", env.telegram.chatId());
  form.set("caption", caption.slice(0, 1024));
  form.set("parse_mode", "HTML");
  if (botoes?.length) form.set("reply_markup", JSON.stringify(teclado(botoes)));
  form.set("photo", new Blob([photo], { type: "image/jpeg" }), "oferta.jpg");
  return post("sendPhoto", form);
}

/** Troca (ou adiciona) os botões de um post já publicado. */
export function editarBotoes(messageId: number, botoes: BotaoUrl[]) {
  return call("editMessageReplyMarkup", { message_id: messageId, reply_markup: teclado(botoes) });
}

export function sendMessage(text: string) {
  return call("sendMessage", { text, parse_mode: "HTML" });
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

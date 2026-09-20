/**
 * Publicação no Telegram via Bot API (oficial, gratuita).
 * O bot precisa ser admin do canal/grupo em TELEGRAM_CHAT_ID.
 */
import { env } from "./env.ts";

interface TelegramResposta {
  ok: boolean;
  description?: string;
  result?: { message_id?: number };
}

async function call(method: string, payload: Record<string, unknown>) {
  const res = await fetch(`https://api.telegram.org/bot${env.telegram.botToken()}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: env.telegram.chatId(), ...payload }),
  });
  const json = (await res.json()) as TelegramResposta;
  if (!json.ok) throw new Error(`Telegram ${method}: ${json.description}`);
  return json;
}

/**
 * Foto + legenda (limite de 1024 caracteres na legenda).
 * `photo` pode ser uma URL (o Telegram baixa) ou um Buffer JPEG (upload multipart).
 */
export interface BotaoUrl {
  text: string;
  url: string;
}

/** Teclado com uma linha de botões-link embaixo da mensagem. */
const teclado = (botoes?: BotaoUrl[]) =>
  botoes?.length ? { inline_keyboard: [botoes] } : undefined;

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
  const res = await fetch(`https://api.telegram.org/bot${env.telegram.botToken()}/sendPhoto`, {
    method: "POST",
    body: form,
  });
  const json = (await res.json()) as TelegramResposta;
  if (!json.ok) throw new Error(`Telegram sendPhoto (upload): ${json.description}`);
  return json;
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

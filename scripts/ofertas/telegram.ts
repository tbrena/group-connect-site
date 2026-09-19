/**
 * Publicação no Telegram via Bot API (oficial, gratuita).
 * O bot precisa ser admin do canal/grupo em TELEGRAM_CHAT_ID.
 */
import { env } from "./env.ts";

async function call(method: string, payload: Record<string, unknown>) {
  const res = await fetch(`https://api.telegram.org/bot${env.telegram.botToken()}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: env.telegram.chatId(), ...payload }),
  });
  const json = (await res.json()) as { ok: boolean; description?: string };
  if (!json.ok) throw new Error(`Telegram ${method}: ${json.description}`);
  return json;
}

/** Foto + legenda (limite de 1024 caracteres na legenda). */
export function sendPhoto(photo: string, caption: string) {
  return call("sendPhoto", { photo, caption: caption.slice(0, 1024), parse_mode: "HTML" });
}

export function sendMessage(text: string) {
  return call("sendMessage", { text, parse_mode: "HTML" });
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

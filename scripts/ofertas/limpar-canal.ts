/**
 * Apaga as postagens de oferta do canal do Telegram (mantém a mensagem fixada).
 *
 *   npm run ofertas:limpar -- --confirmar
 *
 * Os ids vêm da prévia pública do canal (t.me/s/<canal>); o Telegram só
 * permite apagar mensagens de até 48h. Depois de limpar, zere
 * .ofertas/publicadas.json se quiser que as melhores ofertas possam voltar.
 */
import { env } from "./env.ts";

const CONFIRMAR = process.argv.includes("--confirmar");
const chat = env.telegram.chatId();
const canal = chat.replace(/^@/, "");

async function api<T = unknown>(method: string, payload: Record<string, unknown>) {
  const res = await fetch(`https://api.telegram.org/bot${env.telegram.botToken()}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chat, ...payload }),
  });
  return (await res.json()) as { ok: boolean; description?: string; result?: T };
}

const info = await api<{ pinned_message?: { message_id: number } }>("getChat", {});
const fixada = info.result?.pinned_message?.message_id;

const html = await (
  await fetch(`https://t.me/s/${canal}`, { headers: { "user-agent": "Mozilla/5.0" } })
).text();
const ids = [...html.matchAll(new RegExp(`data-post="${canal}/(\\d+)"`, "g"))]
  .map((m) => Number(m[1]))
  .filter((id) => id !== fixada)
  .sort((a, b) => a - b);

console.log(
  `canal ${chat} · fixada: ${fixada ?? "nenhuma"} · para apagar: ${ids.join(", ") || "nada"}`,
);
if (!CONFIRMAR) {
  console.log("\nNada apagado. Rode com --confirmar para apagar de verdade.");
} else {
  let apagadas = 0;
  for (const id of ids) {
    const r = await api("deleteMessage", { message_id: id });
    if (r.ok) apagadas++;
    else console.log(`  #${id}: ${r.description}`);
  }
  console.log(`\n${apagadas} mensagens apagadas.`);
}

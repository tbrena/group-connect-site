/**
 * Mensagem de boas-vindas fixada no canal do Telegram + perfil do bot.
 *
 *   npm run ofertas:boas-vindas
 *
 * Roda uma vez (ou de novo quando quiser trocar o texto). Fixar a mensagem
 * exige que o bot tenha o direito "Editar mensagens de outros" no canal; sem
 * ele, a mensagem é enviada mesmo assim e avisamos para fixar na mão.
 *
 * A foto do perfil do bot não tem API: é pelo BotFather (/setuserpic).
 */
import { env } from "./env.ts";

const SITE = "https://ofertaninja.online";
const WHATSAPP = "https://chat.whatsapp.com/Grj0LpGIotqF8sRbrh9LK5?s=cl&p=a&mlu=4&ilr=4";
const LOGO = `${SITE}/preco-ninja-logo.png`;

const BOAS_VINDAS = [
  "🥷 <b>Bem-vindo ao Preço Ninja!</b>",
  "",
  "Aqui chegam as melhores ofertas do Mercado Livre — <b>só desconto de verdade</b>: antes de postar, comparamos o preço com o que os outros vendedores cobram pelo mesmo produto.",
  "",
  "🔥 Ofertas novas a cada 2 horas",
  "💰 Preço médio do mercado em cada oferta",
  "📉 Alerta de menor preço dos últimos 30 dias",
  "🚚 Frete grátis sinalizado",
  "",
  `📲 Grupo no WhatsApp: ${WHATSAPP}`,
  `🌐 Todas as promoções: ${SITE}/promo`,
  "",
  "🔔 Ative as notificações pra não perder oferta relâmpago.",
  "",
  "<i>Podemos receber comissão pelas compras feitas nos links. Preços podem mudar a qualquer momento.</i>",
].join("\n");

async function call(method: string, payload: Record<string, unknown>) {
  const res = await fetch(`https://api.telegram.org/bot${env.telegram.botToken()}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  return (await res.json()) as { ok: boolean; description?: string; result?: any };
}

function status(label: string, r: { ok: boolean; description?: string }) {
  console.log(`${r.ok ? "✅" : "⚠️"} ${label}${r.ok ? "" : `: ${r.description}`}`);
  return r.ok;
}

const chat_id = env.telegram.chatId();

// 1. Mensagem de boas-vindas com a logo.
const msg = await call("sendPhoto", {
  chat_id,
  photo: LOGO,
  caption: BOAS_VINDAS,
  parse_mode: "HTML",
});
status("boas-vindas enviada", msg);

// 2. Fixar (precisa do direito "Editar mensagens de outros").
if (msg.ok) {
  const pin = await call("pinChatMessage", {
    chat_id,
    message_id: msg.result.message_id,
    disable_notification: true,
  });
  if (!status("mensagem fixada", pin)) {
    console.log("   → fixe na mão: toque na mensagem no canal → Fixar. Ou dê ao bot o direito");
    console.log('     "Editar mensagens de outros" e rode este script de novo.');
  }
}

// 3. Perfil do bot (o que aparece ao abrir a conversa com ele).
status("nome do bot", await call("setMyName", { name: "Preço Ninja Ofertas" }));
status(
  "bio curta",
  await call("setMyShortDescription", {
    short_description:
      "Ofertas do Mercado Livre com desconto de verdade. Canal: @preconinjaofertas",
  }),
);
status(
  "descrição",
  await call("setMyDescription", {
    description: `Eu publico as melhores ofertas do Mercado Livre no canal @preconinjaofertas — só desconto real, comparado com o preço dos outros vendedores.\n\nGrupo no WhatsApp: ${WHATSAPP}\nSite: ${SITE}/promo`,
  }),
);

// 4. Descrição do canal (precisa do direito "Alterar informações do canal").
const desc = await call("setChatDescription", {
  chat_id,
  description: `Ofertas do Mercado Livre com desconto de verdade, comparado com os outros vendedores. Novas a cada 2h. Site: ${SITE}/promo`,
});
if (!status("descrição do canal", desc)) {
  console.log(
    '   → opcional: dê ao bot "Alterar informações do canal" ou edite a descrição na mão.',
  );
}

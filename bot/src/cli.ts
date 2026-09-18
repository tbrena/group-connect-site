import { config, warnAboutConfig } from "./config";
import { formatOfferMessage, money } from "./format";
import { log } from "./logger";
import { fetchOffers } from "./mercadolivre";
import { pickOffers, postOffer } from "./scheduler";
import { WhatsApp } from "./whatsapp";

/**
 * Comandos de teste, para conferir cada parte separadamente:
 *
 *   npm run groups     lista os grupos do número conectado (nome + JID)
 *   npm run ml:test    mostra as ofertas que o bot está enxergando no ML
 *   npm run post:dry   mostra a mensagem que seria postada, sem enviar
 *   npm run post:test  envia UMA oferta agora no grupo configurado
 */

async function groups(): Promise<void> {
  const wa = new WhatsApp();
  await wa.connect();
  const list = await wa.listGroups();
  console.log(`\n${list.length} grupos encontrados:\n`);
  for (const g of list) console.log(`  ${g.name}  (${g.members} membros)\n    GROUP_JID=${g.jid}\n`);
  await wa.close();
}

async function ml(): Promise<void> {
  const offers = await fetchOffers();
  const sorted = [...offers].sort((a, b) => (b.discountPercent ?? 0) - (a.discountPercent ?? 0));
  console.log(`\n${offers.length} ofertas encontradas (mostrando até 25, maiores descontos primeiro):\n`);
  for (const o of sorted.slice(0, 25)) {
    const pct = o.discountPercent ? `-${String(o.discountPercent).padStart(2)}%` : "  --";
    const from = o.originalPrice ? ` (de ${money(o.originalPrice)})` : "";
    console.log(`  ${pct}  ${money(o.price).padStart(12)}${from}  ${o.id}  ${o.title.slice(0, 60)}`);
  }
  const eligible = sorted.filter((o) => (o.discountPercent ?? 0) >= config.minDiscountPercent);
  console.log(`\n${eligible.length} passam no desconto mínimo de ${config.minDiscountPercent}%.`);
  if (offers.length > 0 && !offers.some((o) => o.image)) {
    console.log("Nenhuma oferta veio com foto — o bot vai postar só texto até isso ser ajustado.");
  }
}

async function post(dry: boolean): Promise<void> {
  const [offer] = await pickOffers(1);
  if (!offer) {
    log.warn("Nenhuma oferta passa nos filtros agora (veja `npm run ml:test`).");
    return;
  }

  console.log("\n─────────── mensagem ───────────\n");
  console.log(formatOfferMessage(offer));
  console.log("\n────────────────────────────────");
  console.log(`foto: ${offer.image ?? "(sem foto)"}\n`);

  if (dry) {
    log.info("Modo --dry: nada foi enviado.");
    return;
  }

  const wa = new WhatsApp();
  await wa.connect();
  const group = await wa.resolveGroup();
  log.info(`Enviando para "${group.name}"...`);
  await postOffer(wa, group.jid, offer);
  await wa.close();
}

async function main(): Promise<void> {
  const [command, ...flags] = process.argv.slice(2);
  warnAboutConfig(log.warn);

  switch (command) {
    case "groups":
      return groups();
    case "ml":
      return ml();
    case "post":
      return post(flags.includes("--dry"));
    default:
      console.log("Uso: npm run groups | npm run ml:test | npm run post:dry | npm run post:test");
      return;
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    log.error("Comando falhou.", err);
    process.exit(1);
  });

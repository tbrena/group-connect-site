import { config, warnAboutConfig } from "./config";
import { candidatos, lerFila } from "./fila";
import { log } from "./logger";
import { postarItem } from "./scheduler";
import { carregarEnviados } from "./store";
import { WhatsApp } from "./whatsapp";

/**
 * Comandos de teste, para conferir cada parte separadamente:
 *
 *   npm run grupos   conecta (QR code na 1ª vez) e lista os grupos com o JID
 *   npm run fila     mostra o que está na fila e o próximo post, sem enviar
 *   npm run teste    envia o próximo item da fila AGORA no(s) grupo(s)
 */

async function grupos(): Promise<void> {
  const wa = new WhatsApp();
  await wa.connect();
  const list = await wa.listGroups();
  console.log(`\n${list.length} grupos encontrados:\n`);
  for (const g of list)
    console.log(`  ${g.name}  (${g.members} membros)\n    GROUP_JID=${g.jid}\n`);
  await wa.close();
}

async function fila(): Promise<void> {
  const itens = await lerFila();
  const proximos = candidatos(itens, await carregarEnviados());
  const rodadas = new Set(itens.map((i) => i.rodada));
  console.log(
    `\nFila: ${itens.length} itens de ${rodadas.size} rodadas · ${proximos.length} podem ser postados agora (até ${config.maxAgeMinutes} min de idade).\n`,
  );
  for (const i of proximos.slice(0, 10)) {
    const hora = new Date(i.rodada).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
    console.log(`  ${hora}  ${i.tipo === "cupom" ? "cupom " : i.marketplace.padEnd(6)} ${i.id}`);
  }
  const [primeiro] = proximos;
  if (!primeiro) return;
  console.log("\n─────────── próximo post ───────────\n");
  console.log(primeiro.texto);
  console.log("\n────────────────────────────────────");
  console.log(`foto: ${primeiro.imagem ?? "(só texto)"}\n`);
}

async function teste(): Promise<void> {
  const [item] = candidatos(await lerFila(), await carregarEnviados());
  if (!item) {
    log.warn("Nada para postar na fila agora (veja `npm run fila`).");
    return;
  }
  const wa = new WhatsApp();
  await wa.connect();
  const groups = await wa.resolveGroups();
  log.info(`Enviando para ${groups.map((g) => `"${g.name}"`).join(", ")}...`);
  await postarItem(
    wa,
    groups.map((g) => g.jid),
    item,
  );
  await wa.close();
}

async function main(): Promise<void> {
  const [command] = process.argv.slice(2);
  warnAboutConfig(log.warn);

  switch (command) {
    case "grupos":
      return grupos();
    case "fila":
      return fila();
    case "teste":
      return teste();
    default:
      console.log("Uso: npm run grupos | fila | teste   (e npm start para rodar)");
      return;
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    log.error("Comando falhou.", err);
    process.exit(1);
  });

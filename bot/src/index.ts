import { config, warnAboutConfig } from "./config";
import { log } from "./logger";
import { runForever } from "./scheduler";
import { WhatsApp } from "./whatsapp";

/**
 * Ponto de entrada: conecta no WhatsApp, acha o(s) grupo(s) e fica postando
 * o que o bot do GitHub coloca na fila. Para rodar: `npm start` (na pasta bot/).
 */
async function main(): Promise<void> {
  log.info(`Preço Ninja — bot do WhatsApp (fila: ${config.filaUrl})`);
  warnAboutConfig(log.warn);

  const wa = new WhatsApp();
  await wa.connect();

  const groups = await wa.resolveGroups();
  for (const g of groups) log.info(`Grupo: ${g.name} (${g.members} membros)`);

  const shutdown = async () => {
    log.info("Encerrando...");
    await wa.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await runForever(
    wa,
    groups.map((g) => g.jid),
  );
}

main().catch((err) => {
  log.error("O bot parou.", err);
  process.exit(1);
});

import { config, warnAboutConfig } from "./config";
import { log } from "./logger";
import { runForever } from "./scheduler";
import { WhatsApp } from "./whatsapp";

/**
 * Ponto de entrada do bot: conecta no WhatsApp, acha o grupo e fica postando.
 * Para rodar: `npm start` (dentro da pasta bot/).
 */
async function main(): Promise<void> {
  log.info(`${config.brand} bot — ${config.siteUrl}`);
  warnAboutConfig(log.warn);

  const wa = new WhatsApp();
  await wa.connect();

  const group = await wa.resolveGroup();
  log.info(`Grupo: ${group.name} (${group.members} membros)`);

  const shutdown = async () => {
    log.info("Encerrando...");
    await wa.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await runForever(wa, group.jid);
}

main().catch((err) => {
  log.error("O bot parou.", err);
  process.exit(1);
});

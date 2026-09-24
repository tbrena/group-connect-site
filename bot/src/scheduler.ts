import { config } from "./config";
import { candidatos, chaveItem, lerFila, type ItemFila } from "./fila";
import { log } from "./logger";
import { carregarEnviados, enviadosNaUltimaHora, marcarEnviado } from "./store";
import type { WhatsApp } from "./whatsapp";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Horário de Brasília, mesmo que o PC/servidor esteja em outro fuso. */
function horaBrasilia(now = new Date()): number {
  return Number(
    new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      hour12: false,
    })
      .format(now)
      .slice(0, 2),
  );
}

function inActiveHours(): boolean {
  const hour = horaBrasilia();
  return hour >= config.activeHours.start && hour < config.activeHours.end;
}

/** Intervalo configurado com variação de ±25%, para o ritmo não parecer de robô. */
function nextDelayMs(): number {
  const base = config.intervalMinutes * 60 * 1000;
  const jitter = (Math.random() * 0.5 - 0.25) * base;
  return Math.max(60_000, Math.round(base + jitter));
}

const resumo = (i: ItemFila) =>
  `${i.tipo === "cupom" ? "🎟️ cupom" : i.marketplace === "shopee" ? "Shopee" : "ML"} ${i.id} — ${
    i.texto
      .split("\n")
      .find((l) => l.includes("—"))
      ?.slice(0, 70) ?? i.texto.split("\n")[0]
  }`;

/** O próximo item a postar agora, ou null (fila vazia/tudo enviado). */
export async function proximoItem(): Promise<ItemFila | null> {
  const [itens, jaEnviado] = await Promise.all([lerFila(), carregarEnviados()]);
  return candidatos(itens, jaEnviado)[0] ?? null;
}

export async function postarItem(wa: WhatsApp, jids: string[], item: ItemFila): Promise<void> {
  for (const [n, jid] of jids.entries()) {
    await wa.sendItem(jid, item);
    // Vários grupos: um intervalo curto entre eles, não tudo no mesmo segundo.
    if (n < jids.length - 1) await sleep(8_000 + Math.random() * 12_000);
  }
  await marcarEnviado(chaveItem(item), item.id);
  log.info(`Postado: ${resumo(item)}`);
}

/**
 * Loop principal: dentro do horário, a cada ~INTERVALO_MINUTOS posta o próximo
 * item da fila, sem passar de MAX_POR_HORA. Fila vazia = espera a próxima rodada
 * do bot do GitHub (a cada 30 min).
 */
export async function runForever(wa: WhatsApp, jids: string[]): Promise<never> {
  log.info(
    `Postando 1 item a cada ~${config.intervalMinutes} min (máx. ${config.maxPerHour}/hora), das ${config.activeHours.start}h às ${config.activeHours.end}h (Brasília). Lojas: ${config.lojas.join(" + ")}${config.cupons ? " + cupons" : ""}.`,
  );

  for (;;) {
    if (!inActiveHours()) {
      log.info("Fora do horário — aguardando.");
      while (!inActiveHours()) await sleep(5 * 60 * 1000);
      log.info("Horário de postar começou.");
    }

    try {
      if ((await enviadosNaUltimaHora()) >= config.maxPerHour) {
        log.info(`Já foram ${config.maxPerHour} posts na última hora — segurando.`);
      } else {
        const item = await proximoItem();
        if (item) await postarItem(wa, jids, item);
        else log.info("Nada novo na fila — espero a próxima rodada do bot.");
      }
    } catch (err) {
      log.error("Erro nesta rodada — continuo na próxima.", err);
    }

    await sleep(nextDelayMs());
  }
}

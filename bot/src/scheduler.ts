import { config } from "./config";
import { formatOfferMessage } from "./format";
import { log } from "./logger";
import { fetchOffers, type Offer } from "./mercadolivre";
import { markPosted, wasPostedRecently } from "./store";
import type { WhatsApp } from "./whatsapp";

const OFFERS_CACHE_MS = 20 * 60 * 1000;
let cachedOffers: { at: number; offers: Offer[] } | null = null;

/** Busca as ofertas no ML, reaproveitando o resultado por 20 min para não martelar o site. */
async function getOffers(): Promise<Offer[]> {
  if (cachedOffers && Date.now() - cachedOffers.at < OFFERS_CACHE_MS) return cachedOffers.offers;
  const offers = await fetchOffers();
  cachedOffers = { at: Date.now(), offers };
  return offers;
}

function isBlocked(offer: Offer): boolean {
  const title = offer.title.toLowerCase();
  return config.blockedWords.some((word) => title.includes(word));
}

/**
 * Escolhe o que postar: só ofertas com desconto mínimo, ainda não postadas e
 * sem palavras bloqueadas. Ordena por desconto e sorteia entre as melhores,
 * para o grupo não receber sempre "a maior de todas" de forma previsível.
 */
export async function pickOffers(count = config.postsPerRun): Promise<Offer[]> {
  const offers = await getOffers();
  const candidates: Offer[] = [];

  for (const offer of offers) {
    if ((offer.discountPercent ?? 0) < config.minDiscountPercent) continue;
    if (isBlocked(offer)) continue;
    if (await wasPostedRecently(offer.id)) continue;
    candidates.push(offer);
  }

  candidates.sort((a, b) => (b.discountPercent ?? 0) - (a.discountPercent ?? 0));

  const picked: Offer[] = [];
  const pool = candidates.slice(0, Math.max(count * 5, 5));
  while (picked.length < count && pool.length > 0) {
    const [offer] = pool.splice(Math.floor(Math.random() * pool.length), 1);
    if (offer) picked.push(offer);
  }
  return picked;
}

export async function postOffer(wa: WhatsApp, jid: string, offer: Offer): Promise<void> {
  const caption = formatOfferMessage(offer);
  await wa.sendOffer(jid, offer, caption);
  await markPosted(offer.id);
  log.info(`Postado: -${offer.discountPercent ?? 0}% ${offer.title.slice(0, 60)} (${offer.id})`);
}

function inActiveHours(now = new Date()): boolean {
  const hour = now.getHours();
  return hour >= config.activeHours.start && hour < config.activeHours.end;
}

/** Intervalo configurado com variação de ±20%, para o ritmo não parecer de robô. */
function nextDelayMs(): number {
  const base = config.intervalMinutes * 60 * 1000;
  const jitter = (Math.random() * 0.4 - 0.2) * base;
  return Math.max(60_000, Math.round(base + jitter));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Loop principal: posta dentro do horário ativo e espera o intervalo entre rodadas. */
export async function runForever(wa: WhatsApp, jid: string): Promise<never> {
  log.info(
    `Postando a cada ~${config.intervalMinutes} min, das ${config.activeHours.start}h às ${config.activeHours.end}h, desconto mínimo ${config.minDiscountPercent}%.`,
  );

  for (;;) {
    if (!inActiveHours()) {
      log.info("Fora do horário ativo — aguardando.");
      while (!inActiveHours()) await sleep(5 * 60 * 1000);
      log.info("Horário ativo começou.");
    }

    try {
      const offers = await pickOffers();
      if (offers.length === 0) {
        log.warn("Nenhuma oferta nova que passe nos filtros. Tento de novo na próxima rodada.");
      }
      for (const offer of offers) {
        await postOffer(wa, jid, offer);
        // Pausa curta entre postagens da mesma rodada.
        if (offers.length > 1) await sleep(15_000 + Math.random() * 30_000);
      }
    } catch (err) {
      log.error("Erro nesta rodada — continuo na próxima.", err);
    }

    const delay = nextDelayMs();
    log.info(`Próxima rodada em ${Math.round(delay / 60_000)} min.`);
    await sleep(delay);
  }
}

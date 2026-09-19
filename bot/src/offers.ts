import { config } from "./config";
import { log } from "./logger";
import { fetchOffersFromPage, type Offer } from "./mercadolivre";
import { fetchOffersFromApi } from "./ml-api";
import { hasToken, isApiConfigured } from "./ml-auth";

/**
 * Escolhe de onde vêm as ofertas conforme ML_SOURCE:
 *   auto  (padrão) → API se estiver configurada e autorizada; senão, a página de ofertas
 *   api             → só a API (erro se não estiver autorizada)
 *   page            → só a página de ofertas
 * No modo auto, se a API falhar ou vier vazia, a página entra como reserva.
 */
export async function fetchOffers(): Promise<Offer[]> {
  const mode = config.ml.source;
  const apiReady = isApiConfigured() && (await hasToken());

  if (mode === "page") return fetchOffersFromPage();

  if (!apiReady) {
    if (mode === "api") {
      throw new Error(
        "ML_SOURCE=api, mas a API não está pronta: preencha ML_APP_ID/ML_APP_SECRET e rode `npm run ml:auth`.",
      );
    }
    if (isApiConfigured()) {
      log.warn("App do ML configurado mas ainda não autorizado — usando a página de ofertas. Rode `npm run ml:auth`.");
    }
    return fetchOffersFromPage();
  }

  try {
    const offers = await fetchOffersFromApi();
    if (offers.length > 0 || mode === "api") return offers;
    log.warn("A API não devolveu ofertas — tentando a página de ofertas.");
  } catch (err) {
    if (mode === "api") throw err;
    log.error("A API do ML falhou — usando a página de ofertas como reserva.", err);
  }
  return fetchOffersFromPage();
}

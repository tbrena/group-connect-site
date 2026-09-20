/**
 * Reaplica os botões (Comprar / Compartilhar) em todos os posts registrados em
 * .ofertas/publicadas.json, com os dados atuais de public/ofertas.json.
 *
 *   npm run ofertas:botoes
 *
 * Útil depois de mudar texto ou formato dos botões em mensagem.ts.
 */
import fs from "node:fs/promises";
import { botoes, type DadosMensagem } from "./mensagem.ts";
import type { SiteOffer } from "./run.ts";
import { editarBotoes } from "./telegram.ts";

type Publicada = number | { ts: number; msg?: number };

const publicadas = JSON.parse(await fs.readFile(".ofertas/publicadas.json", "utf8")) as Record<
  string,
  Publicada
>;
const site = JSON.parse(await fs.readFile("public/ofertas.json", "utf8")) as SiteOffer[];

let ok = 0;
for (const [id, p] of Object.entries(publicadas)) {
  const msg = typeof p === "number" ? undefined : p.msg;
  const o = site.find((x) => x.id === id);
  if (!msg || !o) continue;
  const dados: DadosMensagem = {
    ...o,
    claimedPrice: o.base === "vendedor" ? o.originalPrice : null,
  };
  try {
    await editarBotoes(msg, botoes(dados));
    ok++;
  } catch (err) {
    console.log(`  #${msg}: ${(err as Error).message}`);
  }
}
console.log(`${ok} posts atualizados.`);

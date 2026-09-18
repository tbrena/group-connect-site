/** Logger mínimo com horário local — o bot roda num terminal, então texto puro basta. */

const ts = () =>
  new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export const log = {
  info: (msg: string) => console.log(`[${ts()}] ${msg}`),
  warn: (msg: string) => console.warn(`[${ts()}] ⚠️  ${msg}`),
  error: (msg: string, err?: unknown) => {
    console.error(`[${ts()}] ❌ ${msg}`);
    if (err instanceof Error) console.error(`           ${err.message}`);
    else if (err !== undefined) console.error(`           ${String(err)}`);
  },
};

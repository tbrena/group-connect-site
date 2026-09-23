import { Check, Copy, ExternalLink, Ticket } from "lucide-react";
import { useState } from "react";

import { useCupons, type Cupom } from "@/lib/cupons";
import { quandoBR } from "@/lib/ofertas";

const NOME_LOJA = { ml: "Mercado Livre", shopee: "Shopee" } as const;

function CodigoCopiavel({ codigo }: { codigo: string }) {
  const [copiado, setCopiado] = useState(false);
  async function copiar() {
    try {
      await navigator.clipboard.writeText(codigo);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sem permissão de área de transferência: o código fica selecionável na tela.
    }
  }
  return (
    <button
      type="button"
      onClick={copiar}
      title="Copiar o cupom"
      className="flex w-full items-center justify-between gap-2 rounded-xl border border-dashed border-ninja/60 bg-ninja/5 px-3 py-2 text-left transition-colors hover:bg-ninja/10"
    >
      <code className="truncate font-mono text-sm font-bold tracking-wide text-foreground select-all">
        {codigo}
      </code>
      <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-ninja">
        {copiado ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        {copiado ? "Copiado!" : "Copiar"}
      </span>
    </button>
  );
}

function CartaoCupom({ cupom }: { cupom: Cupom }) {
  const regras = [
    cupom.limite && `limite de ${cupom.limite}`,
    cupom.minimo && `compra mínima de ${cupom.minimo}`,
  ].filter(Boolean);
  return (
    <li className="flex w-64 shrink-0 snap-start flex-col gap-3 rounded-2xl border border-border bg-secondary/40 p-4 sm:w-auto">
      <div className="flex items-center justify-between text-xs">
        <span
          className={`rounded px-1.5 py-0.5 font-semibold ${
            cupom.loja === "shopee"
              ? "bg-orange-500/15 text-orange-400"
              : "bg-yellow-400/15 text-yellow-300"
          }`}
        >
          {NOME_LOJA[cupom.loja]}
        </span>
        <span className="text-muted-foreground">{quandoBR(cupom.quando)}</span>
      </div>
      <div>
        <p className="text-2xl font-extrabold text-ninja">{cupom.desconto ?? "Cupom"}</p>
        {cupom.escopo && <p className="text-sm font-medium text-foreground">em {cupom.escopo}</p>}
        {cupom.codigos.length > 1 && (
          <p className="text-sm text-muted-foreground">desconto conforme o valor da compra</p>
        )}
        {regras.length > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">{regras.join(" · ")}</p>
        )}
      </div>
      <div className="mt-auto flex flex-col gap-2">
        {cupom.codigos.map((c) => (
          <CodigoCopiavel key={c} codigo={c} />
        ))}
        <a
          href={cupom.link}
          target="_blank"
          rel="noopener noreferrer sponsored"
          className="inline-flex items-center justify-center gap-1.5 rounded-full bg-ninja px-4 py-2 text-sm font-bold text-ninja-foreground transition-transform hover:scale-[1.02]"
        >
          Usar {cupom.loja === "ml" ? "no Mercado Livre" : "na Shopee"}
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
    </li>
  );
}

/** Cupons do dia no topo do /promo; some quando não há nenhum (ou nenhum da loja escolhida). */
export function CuponsDoDia({ loja }: { loja: "ml" | "shopee" | null }) {
  const cupons = useCupons().filter((c) => !loja || c.loja === loja);
  if (cupons.length === 0) return null;
  return (
    <section aria-labelledby="cupons-titulo" className="mt-10">
      <h2
        id="cupons-titulo"
        className="flex items-center gap-2 text-lg font-bold text-foreground sm:text-xl"
      >
        <Ticket className="h-5 w-5 text-ninja" aria-hidden />
        Cupons de hoje
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Copie o código e aplique no carrinho. Cupons de uso limitado: podem esgotar ou valer só para
        produtos selecionados.
      </p>
      <ul className="-mx-6 mt-4 flex snap-x scroll-px-6 gap-3 overflow-x-auto px-6 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4">
        {cupons.map((c) => (
          <CartaoCupom key={c.id} cupom={c} />
        ))}
      </ul>
    </section>
  );
}

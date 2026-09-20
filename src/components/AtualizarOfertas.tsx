import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, ExternalLink, RefreshCw, TriangleAlert } from "lucide-react";

import { atualizarOfertas } from "@/lib/atualizar-ofertas";
import { ACTIONS_URL } from "@/lib/ofertas";

interface Props {
  /** Ids das ofertas na tela; quando muda, o site publicou a rodada nova. */
  assinatura: string;
  /** Busca o ofertas.json de novo, sem cache. */
  recarregar: () => Promise<void>;
}

type Estado =
  | { tipo: "parado" }
  | { tipo: "rodando" }
  | { tipo: "aguardando"; desde: number }
  | { tipo: "ok" }
  | { tipo: "erro"; motivo: string; semToken?: boolean | undefined };

/** Em produção o Actions leva ~1 min e o Lovable publica em mais 1–2. */
const INTERVALO_POLL_MS = 20_000;
const TEMPO_MAXIMO_MS = 6 * 60_000;

export function AtualizarOfertas({ assinatura, recarregar }: Props) {
  const executar = useServerFn(atualizarOfertas);
  const [estado, setEstado] = useState<Estado>({ tipo: "parado" });
  const assinaturaInicial = useRef(assinatura);

  async function clicar() {
    setEstado({ tipo: "rodando" });
    assinaturaInicial.current = assinatura;
    try {
      const resultado = await executar();
      if (!resultado.ok) {
        setEstado({ tipo: "erro", motivo: resultado.motivo, semToken: resultado.semToken });
        return;
      }
      if (resultado.modo === "local") {
        await recarregar();
        setEstado({ tipo: "ok" });
        return;
      }
      setEstado({ tipo: "aguardando", desde: Date.now() });
    } catch (err) {
      setEstado({ tipo: "erro", motivo: (err as Error).message });
    }
  }

  // Enquanto o GitHub roda, busca o JSON de novo a cada 20s até as ofertas mudarem.
  useEffect(() => {
    if (estado.tipo !== "aguardando") return;
    const timer = setInterval(() => {
      if (Date.now() - estado.desde > TEMPO_MAXIMO_MS) {
        setEstado({
          tipo: "erro",
          motivo: "Demorou mais que o esperado. Recarregue a página daqui a alguns minutos.",
        });
        return;
      }
      void recarregar();
    }, INTERVALO_POLL_MS);
    return () => clearInterval(timer);
  }, [estado, recarregar]);

  useEffect(() => {
    if (estado.tipo === "aguardando" && assinatura !== assinaturaInicial.current) {
      setEstado({ tipo: "ok" });
    }
  }, [assinatura, estado.tipo]);

  const ocupado = estado.tipo === "rodando" || estado.tipo === "aguardando";

  // Em produção o servidor (Cloudflare via Lovable) não guarda segredos, então não
  // consegue disparar o Actions sozinho: o botão leva direto à página do workflow,
  // onde são dois toques ("Run workflow" → "Run workflow").
  if (import.meta.env.PROD) {
    return (
      <div className="mt-8 flex flex-col items-center gap-2">
        <a
          href={ACTIONS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-full border border-ninja/40 bg-ninja/10 px-6 py-3 text-sm font-bold text-ninja transition-colors hover:bg-ninja/20"
        >
          <RefreshCw className="h-4 w-4" />
          Puxar novas ofertas
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
        <p className="text-center text-xs text-muted-foreground">
          Abre o GitHub: toque em <b>Run workflow</b> duas vezes. As ofertas novas aparecem aqui em
          ~3 min. (O bot também roda sozinho a cada hora.)
        </p>
      </div>
    );
  }

  return (
    <div className="mt-8 flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={clicar}
        disabled={ocupado}
        className="inline-flex items-center gap-2 rounded-full border border-ninja/40 bg-ninja/10 px-6 py-3 text-sm font-bold text-ninja transition-colors hover:bg-ninja/20 disabled:cursor-wait disabled:opacity-70"
      >
        <RefreshCw className={`h-4 w-4 ${ocupado ? "animate-spin" : ""}`} />
        {estado.tipo === "rodando"
          ? "Buscando no Mercado Livre…"
          : estado.tipo === "aguardando"
            ? "Publicando novas ofertas…"
            : "Puxar novas ofertas"}
      </button>

      {estado.tipo === "aguardando" && (
        <p className="text-xs text-muted-foreground">
          Isso leva uns 3 minutos. Pode deixar a página aberta — as ofertas trocam sozinhas.
        </p>
      )}

      {estado.tipo === "ok" && (
        <p className="inline-flex items-center gap-1 text-xs text-ninja">
          <Check className="h-3.5 w-3.5" /> Ofertas atualizadas!
        </p>
      )}

      {estado.tipo === "erro" && (
        <div className="max-w-md text-center text-xs text-muted-foreground">
          <p className="inline-flex items-center gap-1">
            <TriangleAlert className="h-3.5 w-3.5 text-amber-400" /> {estado.motivo}
          </p>
          {estado.semToken && (
            <p className="mt-1">
              <a
                href={ACTIONS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-ninja hover:underline"
              >
                Rodar manualmente no GitHub <ExternalLink className="h-3 w-3" />
              </a>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

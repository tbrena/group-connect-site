import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, Copy, TerminalSquare } from "lucide-react";
import { useState } from "react";

import { SITE_NAME } from "@/lib/site";

/**
 * Página de retorno da autorização OAuth do Mercado Livre.
 *
 * O ML exige uma URL de retorno em HTTPS, e o bot roda no PC do dono do grupo,
 * sem HTTPS. Então o ML redireciona para cá com `?code=...`, a página mostra o
 * código, e a pessoa cola no terminal (`npm run ml:auth` na pasta bot/).
 * Nada é enviado a lugar nenhum — a página só exibe o que veio na URL.
 */
export const Route = createFileRoute("/ml-callback")({
  component: MlCallback,
  validateSearch: (search: Record<string, unknown>) => ({
    code: typeof search["code"] === "string" ? search["code"] : "",
  }),
  head: () => ({
    meta: [
      { title: `Autorização do Mercado Livre — ${SITE_NAME}` },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

function MlCallback() {
  const { code } = Route.useSearch();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Sem permissão de área de transferência: a pessoa seleciona o texto na mão.
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12 text-foreground">
      <div className="w-full max-w-lg rounded-3xl border border-border bg-secondary/30 p-8">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-ninja/30 bg-ninja/10 px-4 py-1.5 text-sm font-medium text-ninja">
          <TerminalSquare className="h-4 w-4" />
          Autorização do Mercado Livre
        </div>

        {code ? (
          <>
            <h1 className="text-2xl font-bold">Autorizado! Agora cole este código no terminal:</h1>
            <div className="mt-6 rounded-2xl border border-ninja/40 bg-background p-4">
              <code className="block break-all font-mono text-sm text-ninja">{code}</code>
            </div>
            <button
              type="button"
              onClick={copy}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-ninja px-6 py-3 font-bold text-ninja-foreground transition-all hover:scale-[1.02]"
            >
              {copied ? <Check className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
              {copied ? "Copiado!" : "Copiar código"}
            </button>
            <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
              Volte à janela onde <code className="text-foreground">npm run ml:auth</code> está
              rodando e cole o código. Ele vale por poucos minutos — se expirar, é só rodar o
              comando de novo.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold">Nenhum código nesta URL</h1>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              Esta página é usada pelo bot do {SITE_NAME} durante a autorização com o Mercado
              Livre. Para chegar aqui do jeito certo, rode{" "}
              <code className="text-foreground">npm run ml:auth</code> na pasta do bot e abra o
              link que ele mostra.
            </p>
            <div className="mt-6">
              <Link to="/" className="text-sm font-medium text-ninja hover:underline">
                ← Voltar ao início
              </Link>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

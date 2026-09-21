import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, MessageCircle } from "lucide-react";

import { OfertaCard } from "@/components/OfertaCard";
import { useOfertas } from "@/lib/ofertas";
import { SITE_NAME, SITE_URL, WHATSAPP_GROUP_URL, absoluteUrl } from "@/lib/site";

const PAGE_TITLE = `Promoções do dia — ${SITE_NAME}`;
const PAGE_DESCRIPTION =
  "As melhores promoções do Mercado Livre selecionadas hoje pelo Preço Ninja: descontos reais, frete grátis e link direto para comprar ou compartilhar no WhatsApp.";

export const Route = createFileRoute("/promo")({
  component: Promo,
  head: () => ({
    meta: [
      { title: PAGE_TITLE },
      { name: "description", content: PAGE_DESCRIPTION },
      { property: "og:title", content: PAGE_TITLE },
      { property: "og:description", content: PAGE_DESCRIPTION },
      { property: "og:url", content: absoluteUrl("/promo") },
    ],
    links: [{ rel: "canonical", href: absoluteUrl("/promo") }],
  }),
});

function Promo() {
  const ofertas = useOfertas();

  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden bg-background text-foreground">
      {/* Ambient grid */}
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-40" aria-hidden />
      <div
        className="pointer-events-none absolute -top-40 -right-40 h-96 w-96 rounded-full bg-ninja/20 blur-[100px]"
        aria-hidden
      />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-6 py-5">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-ninja"
        >
          <ArrowLeft className="h-4 w-4" />
          Início
        </Link>
        <Link to="/" aria-label={`${SITE_NAME} — início`}>
          <img
            src="/preco-ninja-logo.png"
            alt={SITE_NAME}
            className="h-14 w-auto"
          />
        </Link>
        <a
          href={WHATSAPP_GROUP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="hidden items-center gap-2 rounded-full bg-ninja px-4 py-2 text-sm font-bold text-ninja-foreground sm:inline-flex"
        >
          <MessageCircle className="h-4 w-4" />
          Entrar no grupo
        </a>
      </header>

      <section className="relative z-10 flex-1 px-6 pt-6 pb-24">
        <div className="mx-auto max-w-6xl">
          <h1 className="text-center text-3xl font-extrabold tracking-tight text-foreground sm:text-5xl">
            Promoções de <span className="text-ninja text-glow">hoje</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-center text-base text-muted-foreground sm:text-lg">
            {ofertas.length > 0
              ? `${ofertas.length} ofertas do Mercado Livre com desconto de verdade. Toque em Compartilhar para mandar no WhatsApp com o texto e o link prontos.`
              : "Estamos garimpando as ofertas de hoje. Volte daqui a pouco!"}
          </p>

          {ofertas.length > 0 && (
            <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {ofertas.map((oferta) => (
                <li key={oferta.id}>
                  <OfertaCard oferta={oferta} compartilhar />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border px-6 py-8 pb-28 text-center text-sm text-muted-foreground sm:pb-8">
        <p>
          <a href={SITE_URL} className="font-medium text-foreground hover:text-ninja">
            ofertaninja.online
          </a>
        </p>
        <p className="mt-2">
          © {new Date().getFullYear()} {SITE_NAME}. Podemos receber comissão por compras feitas
          através dos links divulgados. Preços e estoque podem mudar sem aviso.
        </p>
      </footer>

      {/* Sticky CTA (mobile only) */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/90 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur sm:hidden">
        <a
          href={WHATSAPP_GROUP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-full items-center justify-center gap-2 rounded-full bg-ninja px-6 py-3 text-base font-bold text-ninja-foreground"
        >
          <MessageCircle className="h-5 w-5" />
          Entrar no grupo grátis
        </a>
      </div>
    </main>
  );
}

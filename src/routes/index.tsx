import { createFileRoute } from "@tanstack/react-router";
import { MessageCircle, Percent, Zap, ShoppingCart, ArrowRight, Check } from "lucide-react";

import logoAsset from "@/assets/preco-ninja-logo.png.asset.json";

const WHATSAPP_GROUP_URL = "https://chat.whatsapp.com/Grj0LpGIotqF8sRbrh9LK5?s=cl&p=a&mlu=4&ilr=4";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Preço Ninja — Ofertas que chegam primeiro" },
      {
        name: "description",
        content:
          "Entre no grupo Preço Ninja e receba descontos, ofertas e achados do dia antes de todo mundo.",
      },
      { property: "og:title", content: "Preço Ninja — Ofertas que chegam primeiro" },
      {
        property: "og:description",
        content:
          "Descontos, ofertas e achados todo dia no seu WhatsApp.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "/" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "/" }],
  }),
});

const benefits = [
  {
    icon: Percent,
    title: "Descontos",
    description: "Cupons e promoções reais, selecionados antes de viralizar.",
  },
  {
    icon: Zap,
    title: "Ofertas Relâmpago",
    description: "Alertas rápidos para você pegar o menor preço antes que acabe.",
  },
  {
    icon: ShoppingCart,
    title: "Achados Todo Dia",
    description: "Produtos com preço imperdível em marketplaces e lojas online.",
  },
];

function Index() {
  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden bg-background text-foreground">
      {/* Ambient grid */}
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-40" aria-hidden />
      <div className="pointer-events-none absolute -top-40 -right-40 h-96 w-96 rounded-full bg-ninja/20 blur-[100px]" aria-hidden />
      <div className="pointer-events-none absolute -bottom-40 -left-40 h-96 w-96 rounded-full bg-ninja/10 blur-[100px]" aria-hidden />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-center px-6 py-6">
        <img
          src={logoAsset.url}
          alt="Preço Ninja"
          className="h-16 w-auto drop-shadow-[0_0_18px_rgba(57,255,20,0.35)]"
        />
      </header>

      {/* Hero */}
      <section className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
        <div className="max-w-3xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-ninja/30 bg-ninja/10 px-4 py-1.5 text-sm font-medium text-ninja">
            <MessageCircle className="h-4 w-4" />
            Grupo exclusivo no WhatsApp
          </div>

          <h1 className="text-4xl leading-tight font-extrabold tracking-tight text-foreground sm:text-6xl md:text-7xl">
            Ofertas que{" "}
            <span className="text-ninja text-glow">chegam primeiro</span>
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
            Receba descontos, ofertas relâmpago e achados do dia direto no seu celular. Sem spam, só economia real.
          </p>

          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <a
              href={WHATSAPP_GROUP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-2 rounded-full bg-ninja px-8 py-4 text-lg font-bold text-ninja-foreground shadow-[0_0_32px_-4px_var(--color-ninja)] transition-all hover:scale-105 hover:shadow-[0_0_48px_-6px_var(--color-ninja)]"
            >
              Entrar no grupo
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
            </a>
            <span className="text-sm text-muted-foreground">Gratuito · Sair quando quiser</span>
          </div>
        </div>

        {/* Benefits */}
        <div className="mt-20 grid max-w-5xl gap-6 sm:grid-cols-3">
          {benefits.map((benefit) => (
            <div
              key={benefit.title}
              className="group rounded-2xl border border-border bg-secondary/50 p-6 text-left transition-colors hover:border-ninja/40 hover:bg-secondary"
            >
              <div className="mb-4 inline-flex rounded-xl bg-ninja/15 p-3 text-ninja ring-glow">
                <benefit.icon className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-foreground">{benefit.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {benefit.description}
              </p>
            </div>
          ))}
        </div>

        {/* Social proof / trust */}
        <div className="mt-16 flex flex-col items-center gap-3 rounded-2xl border border-border bg-secondary/30 px-6 py-5 text-sm text-muted-foreground sm:flex-row">
          <div className="flex -space-x-2">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-background bg-ninja/20 text-xs font-bold text-ninja"
              >
                {i}
              </div>
            ))}
          </div>
          <span>Milhares de pessoas já economizam com a gente.</span>
        </div>
      </section>

      {/* FAQ-like quick info */}
      <section className="relative z-10 px-6 py-16">
        <div className="mx-auto max-w-3xl rounded-3xl border border-border bg-secondary/30 p-8 sm:p-12">
          <h2 className="text-center text-2xl font-bold text-foreground sm:text-3xl">
            Por que entrar no <span className="text-ninja">Preço Ninja</span>?
          </h2>
          <ul className="mt-8 space-y-4">
            {[
              "Alertas em tempo direto no WhatsApp",
              "Curadoria sem spam e sem encher o saco",
              "Ofertas de eletrônicos, casa, moda e mais",
              "Economia de verdade, comparada antes de postar",
            ].map((item) => (
              <li key={item} className="flex items-start gap-3 text-foreground">
                <span className="mt-0.5 inline-flex rounded-full bg-ninja/20 p-1 text-ninja">
                  <Check className="h-4 w-4" />
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>

          <div className="mt-10 text-center">
            <a
              href={WHATSAPP_GROUP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-2 rounded-full bg-ninja px-8 py-4 text-lg font-bold text-ninja-foreground shadow-[0_0_32px_-4px_var(--color-ninja)] transition-all hover:scale-105"
            >
              Quero economizar agora
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border px-6 py-8 text-center text-sm text-muted-foreground">
        <p>© {new Date().getFullYear()} Preço Ninja. Não somos afiliados ao WhatsApp.</p>
      </footer>
    </main>
  );
}

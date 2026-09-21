import { createFileRoute } from "@tanstack/react-router";
import {
  MessageCircle,
  Percent,
  Zap,
  ShoppingCart,
  ArrowRight,
  Check,
  BellRing,
  Tag,
} from "lucide-react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { OfertasDoDia } from "@/components/OfertasDoDia";
import {
  OG_IMAGE_URL,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TITLE,
  SITE_URL,
  WHATSAPP_GROUP_URL,
  absoluteUrl,
} from "@/lib/site";

const LOGO_URL = "/preco-ninja-logo.png";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    // The shared tags (og:image, twitter:*, robots…) live in __root.tsx; this
    // route only declares what is page-specific.
    meta: [
      { title: SITE_TITLE },
      { name: "description", content: SITE_DESCRIPTION },
      { property: "og:title", content: SITE_TITLE },
      { property: "og:description", content: SITE_DESCRIPTION },
      { property: "og:url", content: absoluteUrl("/") },
    ],
    links: [{ rel: "canonical", href: absoluteUrl("/") }],
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

const steps = [
  {
    icon: MessageCircle,
    title: "Entre no grupo",
    description: "Um toque no botão e você já está dentro. Não precisa cadastro nem e-mail.",
  },
  {
    icon: BellRing,
    title: "Receba os alertas",
    description: "As ofertas chegam no seu WhatsApp assim que a gente confirma o preço.",
  },
  {
    icon: Tag,
    title: "Compre com desconto",
    description: "Clique no link da oferta e finalize direto na loja, com o cupom aplicado.",
  },
];

const reasons = [
  "Alertas em tempo real direto no WhatsApp",
  "Curadoria sem spam e sem encher o saco",
  "Ofertas de eletrônicos, casa, moda e mais",
  "Economia de verdade, comparada antes de postar",
];

const faq = [
  {
    question: "O grupo é gratuito?",
    answer:
      "Sim, o grupo é 100% gratuito. Você entra, recebe as ofertas e sai quando quiser, sem pagar nada.",
  },
  {
    question: "Vou receber spam ou mensagens demais?",
    answer:
      "Não. Cada oferta passa por curadoria antes de ir ao ar, então você recebe poucas mensagens por dia — e todas com desconto de verdade.",
  },
  {
    question: "Preciso me cadastrar ou informar meus dados?",
    answer:
      "Não pedimos cadastro, e-mail, CPF nem dados de pagamento. Basta entrar no grupo pelo link do WhatsApp.",
  },
  {
    question: "Que tipo de oferta vocês publicam?",
    answer:
      "Eletrônicos, celulares, informática, casa, cozinha, moda e itens do dia a dia nos principais marketplaces e lojas online do Brasil.",
  },
  {
    question: "Como faço para sair do grupo?",
    answer:
      "Basta abrir o grupo no WhatsApp e escolher a opção de sair. Você pode voltar a qualquer momento pelo site.",
  },
];

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: absoluteUrl("/"),
      name: SITE_NAME,
      description: SITE_DESCRIPTION,
      inLanguage: "pt-BR",
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: SITE_NAME,
      url: absoluteUrl("/"),
      logo: OG_IMAGE_URL,
      sameAs: [WHATSAPP_GROUP_URL],
    },
    {
      "@type": "FAQPage",
      "@id": `${SITE_URL}/#faq`,
      mainEntity: faq.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: { "@type": "Answer", text: item.answer },
      })),
    },
  ],
};

function JoinButton({ label, className = "" }: { label: string; className?: string }) {
  return (
    <a
      href={WHATSAPP_GROUP_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`group inline-flex items-center gap-2 rounded-full bg-ninja px-8 py-4 text-lg font-bold text-ninja-foreground shadow-[0_0_32px_-4px_var(--color-ninja)] transition-all hover:scale-105 hover:shadow-[0_0_48px_-6px_var(--color-ninja)] focus-visible:ring-2 focus-visible:ring-ninja focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none ${className}`}
    >
      {label}
      <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
    </a>
  );
}

function Index() {
  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden bg-background text-foreground">
      {/* Structured data for Google rich results (site, organization and FAQ). */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      {/* Ambient grid */}
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-40" aria-hidden />
      <div
        className="pointer-events-none absolute -top-40 -right-40 h-96 w-96 rounded-full bg-ninja/20 blur-[100px]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-40 -left-40 h-96 w-96 rounded-full bg-ninja/10 blur-[100px]"
        aria-hidden
      />

      {/* Header */}
      <header className="relative z-10 flex flex-col items-center gap-2 px-6 py-6">
        <img
          src={LOGO_URL}
          alt={`${SITE_NAME} — grupo de ofertas no WhatsApp`}
          fetchPriority="high"
          className="h-24 w-auto sm:h-28 md:h-32"
        />
        <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
          ofertaninja.online
        </p>
      </header>

      {/* Hero */}
      <section className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
        <div className="max-w-3xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-ninja/30 bg-ninja/10 px-4 py-1.5 text-sm font-medium text-ninja">
            <MessageCircle className="h-4 w-4" />
            Grupo exclusivo no WhatsApp
          </div>

          <h1 className="text-4xl leading-tight font-extrabold tracking-tight text-foreground sm:text-6xl md:text-7xl">
            Ofertas que <span className="text-ninja text-glow">chegam primeiro</span>
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
            Receba descontos, ofertas relâmpago e achados do dia direto no seu celular. Sem spam, só
            economia real.
          </p>

          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <JoinButton label="Entrar no grupo" />
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
              <h2 className="text-lg font-bold text-foreground">{benefit.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {benefit.description}
              </p>
            </div>
          ))}
        </div>

        {/* Social proof / trust */}
        <div className="mt-16 flex flex-col items-center gap-3 rounded-2xl border border-border bg-secondary/30 px-6 py-5 text-sm text-muted-foreground sm:flex-row">
          <div className="flex -space-x-2" aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-background bg-gradient-to-br from-ninja/40 to-ninja/10 text-ninja"
              >
                <MessageCircle className="h-3.5 w-3.5" />
              </span>
            ))}
          </div>
          <span>Milhares de pessoas já economizam com a gente.</span>
        </div>
      </section>

      {/* Ofertas publicadas pelo bot (scripts/ofertas) */}
      <OfertasDoDia />

      {/* How it works */}
      <section className="relative z-10 px-6 py-16">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-2xl font-bold text-foreground sm:text-3xl">
            Como funciona
          </h2>
          <ol className="mt-10 grid gap-6 sm:grid-cols-3">
            {steps.map((step, i) => (
              <li
                key={step.title}
                className="relative rounded-2xl border border-border bg-secondary/40 p-6"
              >
                <span className="absolute -top-3 left-6 inline-flex h-7 w-7 items-center justify-center rounded-full bg-ninja text-sm font-bold text-ninja-foreground">
                  {i + 1}
                </span>
                <div className="mt-2 mb-4 inline-flex rounded-xl bg-ninja/15 p-3 text-ninja">
                  <step.icon className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-bold text-foreground">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {step.description}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Why join */}
      <section className="relative z-10 px-6 py-16">
        <div className="mx-auto max-w-3xl rounded-3xl border border-border bg-secondary/30 p-8 sm:p-12">
          <h2 className="text-center text-2xl font-bold text-foreground sm:text-3xl">
            Por que entrar no <span className="text-ninja">{SITE_NAME}</span>?
          </h2>
          <ul className="mt-8 space-y-4">
            {reasons.map((item) => (
              <li key={item} className="flex items-start gap-3 text-foreground">
                <span className="mt-0.5 inline-flex rounded-full bg-ninja/20 p-1 text-ninja">
                  <Check className="h-4 w-4" />
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>

          <div className="mt-10 text-center">
            <JoinButton label="Quero economizar agora" />
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="relative z-10 px-6 pb-24">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-center text-2xl font-bold text-foreground sm:text-3xl">
            Perguntas frequentes
          </h2>
          <Accordion type="single" collapsible className="mt-8">
            {faq.map((item) => (
              <AccordionItem key={item.question} value={item.question}>
                <AccordionTrigger className="text-left text-base font-semibold">
                  {item.question}
                </AccordionTrigger>
                <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                  {item.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
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
          © {new Date().getFullYear()} {SITE_NAME}. Não somos afiliados ao WhatsApp. Podemos receber
          comissão por compras feitas através dos links divulgados.
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

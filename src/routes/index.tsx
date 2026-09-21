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
import { Send } from "lucide-react";
import { pixelLead } from "@/lib/pixel";
import {
  OG_IMAGE_URL,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TITLE,
  SITE_URL,
  TELEGRAM_CHANNEL_URL,
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
    title: "Desconto de verdade",
    description:
      'Só entra oferta com preço pelo menos 15% abaixo do que os outros vendedores cobram pelo mesmo produto — nada de "de/por" inventado.',
  },
  {
    icon: Zap,
    title: "Conferido toda hora",
    description:
      "O robô revisa preço e estoque de hora em hora. Subiu ou acabou? Sai do ar. Caiu de novo? Você recebe outro aviso.",
  },
  {
    icon: ShoppingCart,
    title: "Vendedor confiável",
    description:
      "Preferência a lojas oficiais e a vendedores com reputação alta no Mercado Livre. O nome da loja vai junto com a oferta.",
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
    description: "As ofertas chegam no WhatsApp ou no Telegram assim que o robô confirma o preço.",
  },
  {
    icon: Tag,
    title: "Compre com desconto",
    description:
      "Clique no link da oferta e finalize direto no Mercado Livre, no preço que mostramos.",
  },
];

const reasons = [
  "Preço comparado com todos os vendedores antes de postar",
  "Ofertas novas toda hora, no WhatsApp e no Telegram",
  "Eletrodomésticos, eletrônicos, beleza, casa, games e mais",
  "Loja oficial e reputação do vendedor indicadas em cada oferta",
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
      "No Telegram saem cerca de 10 ofertas por hora, todas com desconto real. No WhatsApp mandamos as melhores do dia. Se preferir só olhar quando quiser, a página de promoções tem tudo, com busca e filtros.",
  },
  {
    question: "Preciso me cadastrar ou informar meus dados?",
    answer:
      "Não pedimos cadastro, e-mail, CPF nem dados de pagamento. Basta entrar no grupo do WhatsApp ou no canal do Telegram pelo link.",
  },
  {
    question: "Que tipo de oferta vocês publicam?",
    answer:
      "Ofertas do Mercado Livre em eletrodomésticos, eletrônicos, informática, beleza, casa, brinquedos, games, esportes e mais. Em breve, Shopee.",
  },
  {
    question: "Como vocês sabem que o desconto é real?",
    answer:
      'Ignoramos o "de/por" que o vendedor escreve. Para cada produto, olhamos o preço de todos os vendedores no Mercado Livre e só chamamos de oferta quando o anúncio está pelo menos 15% abaixo da mediana deles. O preço médio e o número de vendedores aparecem em cada oferta.',
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
      sameAs: [WHATSAPP_GROUP_URL, TELEGRAM_CHANNEL_URL],
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
      onClick={() => pixelLead("whatsapp")}
      target="_blank"
      rel="noopener noreferrer"
      className={`group inline-flex items-center gap-2 rounded-full bg-ninja px-8 py-4 text-lg font-bold text-ninja-foreground shadow-[0_0_32px_-4px_var(--color-ninja)] transition-all hover:scale-105 hover:shadow-[0_0_48px_-6px_var(--color-ninja)] focus-visible:ring-2 focus-visible:ring-ninja focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none ${className}`}
    >
      {label}
      <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
    </a>
  );
}

function TelegramButton() {
  return (
    <a
      href={TELEGRAM_CHANNEL_URL}
      onClick={() => pixelLead("telegram")}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 rounded-full border border-ninja/40 bg-ninja/10 px-8 py-4 text-lg font-bold text-ninja transition-colors hover:bg-ninja/20 focus-visible:ring-2 focus-visible:ring-ninja focus-visible:outline-none"
    >
      <Send className="h-5 w-5" />
      Canal no Telegram
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
            No WhatsApp e no Telegram
          </div>

          <h1 className="text-4xl leading-tight font-extrabold tracking-tight text-foreground sm:text-6xl md:text-7xl">
            Ofertas que <span className="text-ninja text-glow">chegam primeiro</span>
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
            Um robô compara o preço de cada produto com o de todos os outros vendedores do Mercado
            Livre e só avisa quando o desconto é real. Você recebe no WhatsApp ou no Telegram.
          </p>

          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <JoinButton label="Entrar no grupo" />
            <TelegramButton />
          </div>
          <div className="mt-4">
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
          <span>
            Ofertas novas toda hora, cada uma conferida contra o preço dos outros vendedores.
          </span>
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

          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <JoinButton label="Quero economizar agora" />
            <TelegramButton />
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
          © {new Date().getFullYear()} {SITE_NAME}. Não somos afiliados ao WhatsApp, ao Telegram nem
          ao Mercado Livre. Podemos receber comissão por compras feitas através dos links
          divulgados.
        </p>
        <p className="mt-2 text-xs">
          Privacidade: usamos cookies e o pixel da Meta para medir visitas e melhorar anúncios; não
          coletamos nome, e-mail ou CPF. Os links de oferta levam ao Mercado Livre.
        </p>
      </footer>

      {/* Sticky CTA (mobile only) */}
      <div className="fixed inset-x-0 bottom-0 z-20 flex gap-2 border-t border-border bg-background/90 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur sm:hidden">
        <a
          href={WHATSAPP_GROUP_URL}
          onClick={() => pixelLead("whatsapp")}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-1 items-center justify-center gap-2 rounded-full bg-ninja px-4 py-3 text-base font-bold text-ninja-foreground"
        >
          <MessageCircle className="h-5 w-5" />
          WhatsApp
        </a>
        <a
          href={TELEGRAM_CHANNEL_URL}
          onClick={() => pixelLead("telegram")}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-1 items-center justify-center gap-2 rounded-full border border-ninja/40 bg-ninja/10 px-4 py-3 text-base font-bold text-ninja"
        >
          <Send className="h-5 w-5" />
          Telegram
        </a>
      </div>
    </main>
  );
}

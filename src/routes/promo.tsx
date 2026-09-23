import { Link, createFileRoute } from "@tanstack/react-router";
import { MessageCircle, Search, Send, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AtualizarOfertas } from "@/components/AtualizarOfertas";
import { pixelLead } from "@/lib/pixel";
import { OfertaCard } from "@/components/OfertaCard";
import {
  assinaturaOfertas,
  conferidaEm,
  ehNova,
  quandoBR,
  useOfertas,
  type Oferta,
} from "@/lib/ofertas";
import { OFERTAS_POR_PAGINA, carregarOfertasIniciais } from "@/lib/ofertas-servidor";
import {
  SITE_NAME,
  SITE_URL,
  TELEGRAM_CHANNEL_URL,
  WHATSAPP_GROUP_URL,
  absoluteUrl,
} from "@/lib/site";

const PAGE_TITLE = `Promoções do dia — ${SITE_NAME}`;
const PAGE_DESCRIPTION =
  "As melhores promoções do Mercado Livre e da Shopee selecionadas hoje pelo Preço Ninja: preço comparado com os outros vendedores, frete grátis e link direto para comprar ou compartilhar no WhatsApp.";

export const Route = createFileRoute("/promo")({
  component: Promo,
  // Primeiras ofertas já no HTML (SEO e prévia de link); se falhar, a página busca no navegador.
  loader: () => carregarOfertasIniciais().catch(() => ({ ofertas: [] as Oferta[], total: 0 })),
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

const SEM_CATEGORIA = "Outros";

/** Filtro por marketplace; também vem da URL (/promo?loja=shopee) para dar pra divulgar o link. */
type Loja = "ml" | "shopee";
const lojaDaUrl = (): Loja | null => {
  const v = new URLSearchParams(location.search).get("loja");
  return v === "ml" || v === "shopee" ? v : null;
};

type Ordem = "destaques" | "desconto" | "preco" | "novas";
const ORDENS: Array<[Ordem, string]> = [
  ["destaques", "Destaques"],
  ["desconto", "🔥 Maior desconto"],
  ["preco", "Menor preço"],
  ["novas", "Mais recentes"],
];

/** Busca sem acento e sem maiúscula: "cafe" acha "Cafeteira Nespresso". */
const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function Chip({
  ativo,
  onClick,
  children,
}: {
  ativo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
        ativo
          ? "border-ninja bg-ninja text-ninja-foreground"
          : "border-border bg-secondary/50 text-muted-foreground hover:border-ninja/40 hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * Lista de produtos para o Google (schema.org ItemList), com as ofertas que já
 * vêm no HTML. `<` escapado para um título nunca fechar a tag <script>.
 */
function dadosEstruturados(ofertas: Oferta[]): string {
  const dados = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: PAGE_TITLE,
    itemListElement: ofertas.slice(0, 30).map((o, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "Product",
        name: o.title,
        image: o.image,
        offers: {
          "@type": "Offer",
          price: o.price.toFixed(2),
          priceCurrency: "BRL",
          availability: "https://schema.org/InStock",
          url: o.url,
          seller: {
            "@type": "Organization",
            name: o.loja || (o.marketplace === "shopee" ? "Shopee" : "Mercado Livre"),
          },
        },
      },
    })),
  };
  return JSON.stringify(dados).replace(/</g, "\\u003c");
}

function Promo() {
  const iniciais = Route.useLoaderData();
  const { ofertas, carregando, recarregar } = useOfertas(iniciais.ofertas);
  // Até a lista completa chegar, o topo mostra o total que o servidor contou.
  const totalOfertas = carregando ? Math.max(iniciais.total, ofertas.length) : ofertas.length;
  const [categoria, setCategoria] = useState<string | null>(null);

  const [soLojaOficial, setSoLojaOficial] = useState(false);
  const [soNovas, setSoNovas] = useState(false);
  const [loja, setLoja] = useState<Loja | null>(null);
  // Lê ?loja= ao abrir (no cliente: o SSR não conhece a URL do filtro)…
  useEffect(() => setLoja(lojaDaUrl()), []);
  /** …e mantém a barra de endereço em dia, sem recarregar nem empilhar histórico. */
  function alternarLoja(valor: Loja) {
    const nova = loja === valor ? null : valor;
    setLoja(nova);
    const url = new URL(location.href);
    if (nova) url.searchParams.set("loja", nova);
    else url.searchParams.delete("loja");
    history.replaceState(history.state, "", url);
  }
  const [busca, setBusca] = useState("");
  // Só no PC do dono (localhost): o preview do Lovable também roda em modo dev, mas lá
  // o botão não funciona (sem .env) e só confunde.
  const [ehLocalhost, setEhLocalhost] = useState(false);
  useEffect(() => setEhLocalhost(import.meta.env.DEV && location.hostname === "localhost"), []);
  const [ordem, setOrdem] = useState<Ordem>("destaques");
  const totalShopee = ofertas.filter((o) => o.marketplace === "shopee").length;
  const totalMl = ofertas.length - totalShopee;

  // Os demais chips contam só dentro da loja escolhida: com "Shopee" marcado, "Saúde (7)"
  // não pode aparecer se as 7 forem do Mercado Livre — escolher dava lista vazia.
  const daLoja = useMemo(
    () => (loja ? ofertas.filter((o) => (o.marketplace ?? "ml") === loja) : ofertas),
    [ofertas, loja],
  );
  const totalLojaOficial = daLoja.filter((o) => o.lojaOficial).length;
  const totalNovas = daLoja.filter((o) => ehNova(o)).length;

  // Nome → quantidade, da maior para a menor; ofertas antigas sem categoria caem em "Outros".
  // A categoria escolhida continua na lista mesmo zerada, para dar pra desmarcar.
  const categorias = useMemo(() => {
    const contagem = new Map<string, number>();
    for (const o of daLoja) {
      const nome = o.categoria ?? SEM_CATEGORIA;
      contagem.set(nome, (contagem.get(nome) ?? 0) + 1);
    }
    if (categoria && !contagem.has(categoria)) contagem.set(categoria, 0);
    return [...contagem.entries()].sort((a, b) => b[1] - a[1]);
  }, [daLoja, categoria]);

  function limparFiltros() {
    setCategoria(null);
    setSoLojaOficial(false);
    setSoNovas(false);
    setBusca("");
    if (ordem === "novas") setOrdem("destaques");
    if (loja) alternarLoja(loja);
  }

  const termo = normalizar(busca.trim());
  const filtradas = ofertas.filter(
    (o) =>
      (!categoria || (o.categoria ?? SEM_CATEGORIA) === categoria) &&
      (!soLojaOficial || o.lojaOficial) &&
      (!soNovas || ehNova(o)) &&
      (!loja || (o.marketplace ?? "ml") === loja) &&
      (!termo || normalizar(`${o.title} ${o.loja ?? ""} ${o.categoria ?? ""}`).includes(termo)),
  );
  // "destaques" é a ordem do bot (campanha oficial primeiro, depois maior desconto real).
  const ordenar: Record<Ordem, ((a: Oferta, b: Oferta) => number) | null> = {
    destaques: null,
    desconto: (a, b) => b.discount - a.discount || a.price - b.price,
    preco: (a, b) => a.price - b.price,
    novas: (a, b) => b.publishedAt.localeCompare(a.publishedAt),
  };
  const comparador = ordenar[ordem];
  const visiveis = comparador ? [...filtradas].sort(comparador) : filtradas;

  // Cards em lotes: centenas de uma vez pesam no celular. Mudou o filtro, volta ao primeiro lote.
  const [limite, setLimite] = useState(OFERTAS_POR_PAGINA);
  useEffect(
    () => setLimite(OFERTAS_POR_PAGINA),
    [categoria, soLojaOficial, soNovas, loja, busca, ordem],
  );
  const naTela = visiveis.slice(0, limite);

  /** Ligar a aba Novas passa a ordenar por chegada, a menos que a pessoa já tenha escolhido outra ordem. */
  function alternarNovas() {
    const ligar = !soNovas;
    setSoNovas(ligar);
    if (ligar && ordem === "destaques") setOrdem("novas");
    if (!ligar && ordem === "novas") setOrdem("destaques");
  }

  // Conferência mais recente entre as ofertas: é a "hora da última rodada" do bot.
  const atualizadoEm = ofertas.reduce<string | null>((max, o) => {
    const q = conferidaEm(o);
    return !max || q > max ? q : max;
  }, null);

  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden bg-background text-foreground">
      {iniciais.ofertas.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: dadosEstruturados(iniciais.ofertas) }}
        />
      )}

      {/* Ambient grid */}
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-40" aria-hidden />
      <div
        className="pointer-events-none absolute -top-40 -right-40 h-96 w-96 rounded-full bg-ninja/20 blur-[100px]"
        aria-hidden
      />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-6 py-5">
        <Link to="/" aria-label={`${SITE_NAME} — início`}>
          <img src="/preco-ninja-logo.png" alt={SITE_NAME} className="h-16 w-auto" />
        </Link>
        <div className="hidden items-center gap-2 sm:flex">
          <a
            href={WHATSAPP_GROUP_URL}
            onClick={() => pixelLead("whatsapp")}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden items-center gap-2 rounded-full bg-ninja px-4 py-2 text-sm font-bold text-ninja-foreground sm:inline-flex"
          >
            <MessageCircle className="h-4 w-4" />
            Grupo no WhatsApp
          </a>
          <a
            href={TELEGRAM_CHANNEL_URL}
            onClick={() => pixelLead("telegram")}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden items-center gap-2 rounded-full border border-ninja/40 bg-ninja/10 px-4 py-2 text-sm font-bold text-ninja sm:inline-flex"
          >
            <Send className="h-4 w-4" />
            Telegram
          </a>
        </div>
      </header>

      <section className="relative z-10 flex-1 px-6 pt-6 pb-24">
        <div className="mx-auto max-w-6xl">
          <h1 className="text-center text-3xl font-extrabold tracking-tight text-foreground sm:text-5xl">
            Promoções de <span className="text-ninja text-glow">hoje</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-center text-base text-muted-foreground sm:text-lg">
            {totalOfertas > 0
              ? `${totalOfertas} ofertas do Mercado Livre e da Shopee. Toque em Compartilhar para mandar no WhatsApp com o texto e o link prontos.`
              : "Estamos garimpando as ofertas de hoje. Volte daqui a pouco!"}
          </p>
          {atualizadoEm && (
            <p className="mt-3 text-center text-xs text-muted-foreground">
              Preços conferidos {quandoBR(atualizadoEm)} (horário de Brasília)
            </p>
          )}

          {/* Ferramenta do dono: só em desenvolvimento. Em produção o bot roda sozinho a cada
              30 min (cron-job.org → GitHub Actions) e o botão só ocupava espaço do visitante. */}
          {ehLocalhost && (
            <AtualizarOfertas assinatura={assinaturaOfertas(ofertas)} recarregar={recarregar} />
          )}

          {ofertas.length > 0 && (
            <div className="mt-10 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              {/* Busca */}
              <label className="relative flex-1">
                <Search
                  className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <input
                  type="search"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar produto, marca, loja ou categoria…"
                  aria-label="Buscar ofertas"
                  autoComplete="off"
                  className="w-full rounded-full border border-border bg-secondary/50 py-2.5 pr-10 pl-11 text-sm text-foreground placeholder:text-muted-foreground focus:border-ninja/60 focus:outline-none"
                />
                {busca && (
                  <button
                    type="button"
                    onClick={() => setBusca("")}
                    aria-label="Limpar busca"
                    className="absolute top-1/2 right-3 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </label>

              {/* Ordenação */}
              <div
                role="group"
                aria-label="Ordenar por"
                className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
              >
                <span className="mr-1">Ordenar:</span>
                {ORDENS.map(([valor, rotulo]) => (
                  <Chip key={valor} ativo={ordem === valor} onClick={() => setOrdem(valor)}>
                    {rotulo}
                  </Chip>
                ))}
              </div>
            </div>
          )}

          {categorias.length > 1 && (
            <nav
              aria-label="Filtrar por categoria"
              className="mt-10 flex flex-wrap justify-center gap-2"
            >
              <Chip ativo={categoria === null} onClick={() => setCategoria(null)}>
                Todas ({daLoja.length})
              </Chip>
              {totalNovas > 0 && (
                <Chip ativo={soNovas} onClick={alternarNovas}>
                  🆕 Novas ({totalNovas})
                </Chip>
              )}
              {totalShopee > 0 && totalMl > 0 && (
                <>
                  <Chip ativo={loja === "ml"} onClick={() => alternarLoja("ml")}>
                    🤝 Mercado Livre ({totalMl})
                  </Chip>
                  <Chip ativo={loja === "shopee"} onClick={() => alternarLoja("shopee")}>
                    🛒 Shopee ({totalShopee})
                  </Chip>
                </>
              )}
              {categorias.map(([nome, qtd]) => (
                <Chip
                  key={nome}
                  ativo={categoria === nome}
                  onClick={() => setCategoria(categoria === nome ? null : nome)}
                >
                  {nome} ({qtd})
                </Chip>
              ))}
              {totalLojaOficial > 0 && (
                <Chip ativo={soLojaOficial} onClick={() => setSoLojaOficial(!soLojaOficial)}>
                  🏬 Só lojas oficiais ({totalLojaOficial})
                </Chip>
              )}
            </nav>
          )}

          {termo && visiveis.length > 0 && (
            <p className="mt-6 text-center text-sm text-muted-foreground">
              {`${visiveis.length} ${visiveis.length === 1 ? "oferta" : "ofertas"} para “${busca.trim()}”`}
            </p>
          )}

          {ofertas.length > 0 && visiveis.length === 0 && (
            <div className="mt-10 flex flex-col items-center gap-3 text-center">
              <p className="text-sm text-muted-foreground">
                {termo
                  ? `Nada encontrado para “${busca.trim()}” com esses filtros.`
                  : "Nenhuma oferta com essa combinação de filtros agora."}
              </p>
              <button
                type="button"
                onClick={limparFiltros}
                className="rounded-full border border-ninja/40 bg-ninja/10 px-5 py-2 text-sm font-bold text-ninja transition-colors hover:bg-ninja/20"
              >
                Limpar filtros
              </button>
            </div>
          )}

          {visiveis.length > 0 && (
            <ul className="mt-8 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
              {naTela.map((oferta) => (
                <li key={oferta.id}>
                  <OfertaCard oferta={oferta} compartilhar />
                </li>
              ))}
            </ul>
          )}

          {visiveis.length > naTela.length && (
            <div className="mt-8 flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={() => setLimite((l) => l + OFERTAS_POR_PAGINA)}
                className="rounded-full border border-ninja/40 bg-ninja/10 px-6 py-3 text-sm font-bold text-ninja transition-colors hover:bg-ninja/20"
              >
                Ver mais ofertas
              </button>
              <p className="text-xs text-muted-foreground">
                {`Mostrando ${naTela.length} de ${visiveis.length}`}
              </p>
            </div>
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
        <p className="mt-2 text-xs">
          Privacidade: usamos cookies e o pixel da Meta para medir visitas e melhorar anúncios; não
          coletamos nome, e-mail ou CPF. Os links de oferta levam ao Mercado Livre ou à Shopee.
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

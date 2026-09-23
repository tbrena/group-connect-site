/**
 * Textos e botões de uma postagem — usados pelo run.ts (posts novos) e por
 * scripts avulsos que mexem em posts já publicados (a partir do ofertas.json).
 */
import { chamadaDaOferta } from "../../src/lib/chamadas.ts";
import { linkRastreado } from "./afiliado.ts";
import { escapeHtml } from "./telegram.ts";

/** O mínimo que uma oferta precisa ter para virar mensagem (MlItem e SiteOffer atendem). */
export interface DadosMensagem {
  id: string;
  title: string;
  price: number;
  discount: number;
  base: "media" | "vendedor";
  averagePrice: number | null;
  sellers: number;
  /** "de" declarado pelo vendedor (só usado quando base = "vendedor") */
  claimedPrice: number | null;
  freeShipping: boolean;
  oficial: boolean;
  lowest30d: boolean;
  fonte: string;
  /** ISO de quando o preço foi conferido; sem isso usa agora */
  quando?: string | undefined;
  /** vendedor é loja oficial; `loja` traz o nome */
  lojaOficial?: boolean | undefined;
  loja?: string | null | undefined;
  /** "ml" (padrão) ou "shopee" — muda o nome da loja nos textos */
  marketplace?: "ml" | "shopee" | undefined;
  /** unidades vendidas do anúncio (Shopee) */
  vendas?: number | null | undefined;
  /** nome da categoria no site — escolhe a chamada de efeito da primeira linha */
  categoria?: string | null | undefined;
  /** 🥇🥈🥉 das 3 melhores da rodada (só posts novos); no lugar do emoji da categoria */
  medalha?: string | undefined;
}

/** "+56 mil" / "+1,2 mil" / "463" — como os apps mostram. */
export function formatarVendas(n: number): string {
  if (n < 1000) return String(n);
  const mil = n / 1000;
  // Trunca (nunca arredonda pra cima): prova social não pode inflar o número.
  const texto = mil < 10 ? String(Math.floor(mil * 10) / 10).replace(".", ",") : Math.floor(mil);
  return `+${texto} mil`;
}

const nomeDoMarketplace = (d: DadosMensagem) =>
  d.marketplace === "shopee" ? "Comprar na Shopee" : "Comprar no Mercado Livre";

/** "20/09 14:32" em Brasília. */
export function dataHoraBR(iso?: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(iso ? new Date(iso) : new Date())
    .replace(",", "");
}

const linhaHora = (d: DadosMensagem) =>
  `⚡ Preço visto em ${dataHoraBR(d.quando)} — pode mudar a qualquer momento.`;

export interface Botao {
  text: string;
  url: string;
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Linhas comuns à legenda e ao texto do WhatsApp, já com a formatação de cada um. */
function linhas(d: DadosMensagem, f: { b: (s: string) => string; s: (s: string) => string }) {
  const out: string[] = [];
  const { emoji, frase } = chamadaDaOferta(d.categoria, d.id);
  out.push(`${d.medalha ?? emoji} ${f.b(frase)}`, "");
  if (d.base === "media" && d.averagePrice != null) {
    out.push(
      `🔥 ${f.b(`${d.discount}% abaixo do preço médio`)} — ${d.title}`,
      "",
      `💰 Média no Mercado Livre: ${brl(d.averagePrice)} (${d.sellers} vendedores)`,
      `✅ Por: ${f.b(brl(d.price))}`,
    );
  } else {
    out.push(
      `🔥 ${f.b(`${d.discount}% OFF`)} — ${d.title}`,
      "",
      `❌ De: ${f.s(brl(d.claimedPrice ?? 0))}`,
      `✅ Por: ${f.b(brl(d.price))}`,
    );
  }
  // Prova social: só a partir de 100 vendas, que é quando o número impressiona.
  if (d.vendas && d.vendas >= 100) out.push(`🛍️ ${formatarVendas(d.vendas)} vendidos`);
  if (d.lowest30d) out.push("📉 Menor preço dos últimos 30 dias");
  if (d.freeShipping) out.push("🚚 Frete grátis");
  if (d.oficial) out.push("🏷️ Promoção oficial do Mercado Livre");
  if (d.lojaOficial) out.push(`🏬 Loja oficial${d.loja ? `: ${d.loja}` : ""}`);
  return out;
}

/** Legenda do post no Telegram (HTML). */
export function legendaTelegram(d: DadosMensagem): string {
  const esc = { ...d, title: escapeHtml(d.title) };
  return [
    ...linhas(esc, { b: (s) => `<b>${s}</b>`, s: (s) => `<s>${s}</s>` }),
    "",
    `🛒 <a href="${linkRastreado(d, "tg")}">${nomeDoMarketplace(d)}</a>`,
    "",
    linhaHora(d),
  ].join("\n");
}

/**
 * Texto pronto para o WhatsApp (formatação *negrito* e ~riscado~ dele), com link
 * de origem "wa". Usa "％" (porcento largo) no lugar de "%": o wa.me decodifica
 * a URL mais de uma vez em alguns aparelhos e o "%" comum, que é o escape de
 * URL, chega errado.
 */
export function textoWhatsApp(d: DadosMensagem): string {
  return [
    ...linhas(d, { b: (s) => `*${s}*`, s: (s) => `~${s}~` }),
    "",
    `🛒 Comprar: ${linkRastreado(d, "wa")}`,
    "",
    linhaHora(d),
  ]
    .join("\n")
    .replace(/%/g, "％");
}

/** Botões embaixo do post: comprar (origem tg) e compartilhar no WhatsApp com o texto pronto. */
export function botoes(d: DadosMensagem): Botao[] {
  return [
    { text: "🛒 Comprar", url: linkRastreado(d, "tg") },
    {
      text: "📲 Compartilhar",
      url: `https://wa.me/?text=${encodeURIComponent(textoWhatsApp(d))}`,
    },
  ];
}

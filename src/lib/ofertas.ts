import { useCallback, useEffect, useState } from "react";

import { chamadaDaOferta } from "@/lib/chamadas";
import { linkRastreado } from "@/lib/rastreio";
import { OFERTAS_DADOS_URL } from "@/lib/site";

/** Mesmo formato gravado por scripts/ofertas/run.ts em public/ofertas.json. */
export interface Oferta {
  id: string;
  /** produto de catálogo do ML a que o anúncio pertence */
  productId?: string;
  /** de qual marketplace veio; ausente em JSONs antigos = Mercado Livre */
  marketplace?: "ml" | "shopee";
  /** categoria ou busca que achou a oferta (ex.: MLB1055, q:air fryer) */
  fonte?: string;
  /** nome da categoria mostrado no site; ausente em JSONs antigos */
  categoria?: string;
  title: string;
  price: number;
  /** referência do desconto: mediana dos outros vendedores, ou "de" declarado (campanha oficial) */
  originalPrice: number;
  /** desconto real (%) contra originalPrice */
  discount: number;
  /** "media" = contra a mediana dos outros vendedores; "vendedor" = contra o "de" declarado. Ausente em JSONs antigos. */
  base?: "media" | "vendedor";
  averagePrice?: number | null;
  sellers?: number;
  image: string;
  url: string;
  freeShipping: boolean;
  /** desconto de campanha oficial do ML; opcional porque JSONs antigos não têm */
  oficial?: boolean;
  /** vendedor é loja oficial (marca ou autorizado); `loja` traz o nome */
  lojaOficial?: boolean;
  loja?: string | null;
  /** menor preço observado pelo bot nos últimos 30 dias */
  lowest30d?: boolean;
  /** unidades vendidas do anúncio (só Shopee) */
  vendas?: number | null;
  /** quando entrou no site */
  publishedAt: string;
  /** última vez que o bot conferiu preço e estoque; ausente em JSONs antigos */
  checkedAt?: string;
}

/** Quando o preço foi conferido (cai para publishedAt nos JSONs antigos). */
export const conferidaEm = (o: Oferta) => o.checkedAt ?? o.publishedAt;

/** Janela do que conta como "nova" na aba Novas e na etiqueta do card. */
export const JANELA_NOVA_MS = 24 * 60 * 60 * 1000;

/** Entrou no site nas últimas 24 h. */
export const ehNova = (o: Oferta, agora = Date.now()) =>
  agora - new Date(o.publishedAt).getTime() < JANELA_NOVA_MS;

const fmtBR = (opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", ...opts });

/** "20/09 14:32" em Brasília. */
export function dataHoraBR(iso: string): string {
  return fmtBR({ day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    .format(new Date(iso))
    .replace(",", "");
}

/** "hoje 14:32", "ontem 09:10" ou "18/09 22:05". */
export function quandoBR(iso: string): string {
  const dia = (d: Date) => fmtBR({ year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const alvo = new Date(iso);
  const hoje = new Date();
  const ontem = new Date(hoje.getTime() - 86_400_000);
  const hora = fmtBR({ hour: "2-digit", minute: "2-digit" }).format(alvo);
  if (dia(alvo) === dia(hoje)) return `hoje ${hora}`;
  if (dia(alvo) === dia(ontem)) return `ontem ${hora}`;
  return dataHoraBR(iso);
}

/** Repositório e workflow que o botão "Puxar novas ofertas" dispara em produção. */
export const GITHUB_REPO = "tbrena/group-connect-site";
export const OFERTAS_WORKFLOW = "ofertas.yml";
export const ACTIONS_URL = `https://github.com/${GITHUB_REPO}/actions/workflows/${OFERTAS_WORKFLOW}`;

/**
 * Em produção o JSON vem do repositório público de dados: o bot (GitHub
 * Actions) empurra public/ofertas.json para lá a cada rodada e o site reflete
 * em minutos, sem republicar no Lovable — que só é preciso quando o CÓDIGO
 * muda. O arquivo local fica como fallback (e é o que o dev usa).
 */
const FONTES_OFERTAS = import.meta.env.PROD
  ? [OFERTAS_DADOS_URL, "/ofertas.json"]
  : ["/ofertas.json"];

async function buscarOfertas(): Promise<Oferta[]> {
  for (const fonte of FONTES_OFERTAS) {
    try {
      const r = await fetch(`${fonte}?v=${Date.now()}`, { cache: "no-store" });
      if (!r.ok) continue;
      const data: unknown = await r.json();
      if (Array.isArray(data) && data.length > 0) return data as Oferta[];
    } catch {
      // tenta a próxima fonte
    }
  }
  return [];
}

export const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Carrega o JSON no cliente para não travar o SSR e para as seções sumirem
 * sozinhas quando não há ofertas. `recarregar` busca de novo sem cache — é o
 * que o botão de atualizar usa para pegar a versão recém-publicada.
 */
export function useOfertas() {
  const [ofertas, setOfertas] = useState<Oferta[]>([]);
  const [carregando, setCarregando] = useState(true);

  const recarregar = useCallback(async () => {
    setCarregando(true);
    try {
      setOfertas(await buscarOfertas());
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  return { ofertas, carregando, recarregar };
}

/** Identifica "quais ofertas estão na tela" para detectar quando o site publicou novas. */
export function assinaturaOfertas(ofertas: Oferta[]): string {
  return ofertas.map((o) => o.id).join(",");
}

/** Texto pronto para colar no WhatsApp (usa a formatação *negrito* e ~riscado~ dele). */
/** "+56 mil" / "+1,2 mil" / "463" — mesmo formato do bot (scripts/ofertas/mensagem.ts). */
export function formatarVendas(n: number): string {
  if (n < 1000) return String(n);
  const mil = n / 1000;
  // Trunca (nunca arredonda pra cima): prova social não pode inflar o número.
  const texto = mil < 10 ? String(Math.floor(mil * 10) / 10).replace(".", ",") : Math.floor(mil);
  return `+${texto} mil`;
}

export function textoWhatsApp(oferta: Oferta): string {
  const linhas: string[] = [];
  // Mesma chamada de efeito do post do Telegram (src/lib/chamadas.ts).
  const { emoji, frase } = chamadaDaOferta(oferta.categoria, oferta.id);
  linhas.push(`${emoji} *${frase}*`, "");
  if (oferta.base === "media" && oferta.averagePrice) {
    linhas.push(
      `🔥 *${oferta.discount}% abaixo do preço médio* — ${oferta.title}`,
      "",
      `💰 Média no Mercado Livre: ${brl(oferta.averagePrice)} (${oferta.sellers} vendedores)`,
      `✅ Por: *${brl(oferta.price)}*`,
    );
  } else {
    linhas.push(
      `🔥 *${oferta.discount}% OFF* — ${oferta.title}`,
      "",
      `❌ De: ~${brl(oferta.originalPrice)}~`,
      `✅ Por: *${brl(oferta.price)}*`,
    );
  }
  if (oferta.vendas && oferta.vendas >= 100)
    linhas.push(`🛍️ ${formatarVendas(oferta.vendas)} vendidos`);
  if (oferta.lowest30d) linhas.push("📉 Menor preço dos últimos 30 dias");
  if (oferta.freeShipping) linhas.push("🚚 Frete grátis");
  if (oferta.oficial) linhas.push("🏷️ Promoção oficial do Mercado Livre");
  if (oferta.lojaOficial) linhas.push(`🏬 Loja oficial${oferta.loja ? `: ${oferta.loja}` : ""}`);
  linhas.push(
    "",
    `🛒 Comprar: ${linkRastreado(oferta, "wa")}`,
    "",
    `⚡ Preço visto em ${dataHoraBR(conferidaEm(oferta))} — pode mudar a qualquer momento.`,
  );
  // "％" (porcento largo) no lugar de "%": o wa.me decodifica a URL mais de uma
  // vez em alguns aparelhos e o "%" comum, que é o escape de URL, chega errado.
  return linhas.join("\n").replace(/%/g, "％");
}

/** Abre o WhatsApp com a mensagem preenchida; a pessoa só escolhe o grupo. */
export function linkCompartilharWhatsApp(oferta: Oferta): string {
  return `https://wa.me/?text=${encodeURIComponent(textoWhatsApp(oferta))}`;
}

/**
 * Cupons a partir de canais PÚBLICOS do Telegram (página web t.me/s/<canal>,
 * sem login e sem usar conta de ninguém).
 *
 * Só aproveitamos o FATO — o código do cupom, a loja e as regras (desconto,
 * limite, compra mínima). Texto, emojis e links do canal ficam para trás: a
 * mensagem é nossa e o link é o nosso de afiliado. Só Mercado Livre e Shopee.
 *
 *   node --env-file-if-exists=.env scripts/ofertas/cupons-telegram.ts [canal1,canal2]
 *
 * Rodado direto é um TESTE: mostra o que seria postado e não posta nada.
 */
import { escapeHtml } from "./telegram.ts";

export interface Cupom {
  loja: "ml" | "shopee";
  /** um ou mais códigos anunciados juntos (ex.: faixas de valor) */
  codigos: string[];
  /** "30% OFF" / "R$ 20 OFF" (só quando há um código; faixas variam) */
  desconto: string | null;
  /** teto do desconto, "R$ 500" */
  limite: string | null;
  /** compra mínima, "R$ 99" */
  minimo: string | null;
  /** canal/123 de onde veio (para log e para não repetir) */
  origem: string;
  /** ISO da postagem no canal */
  quando: string;
}

/** Janela: cupom anunciado há mais que isso provavelmente já esgotou. */
const MAX_IDADE_MS = 12 * 60 * 60 * 1000;

/** Palavras em maiúsculas que aparecem perto de "cupom" e não são código. */
const NAO_CODIGO = new Set([
  "CUPOM",
  "CUPONS",
  "CODIGO",
  "MERCADO",
  "LIVRE",
  "SHOPEE",
  "MAGALU",
  "AMAZON",
  "FRETE",
  "GRATIS",
  "HOJE",
  "AGORA",
  "LINK",
  "ATIVE",
  "RESGATE",
  "USE",
  "APP",
  "PRIME",
  "MELI",
  "NOVO",
  "NOVOS",
  "OFF",
  "PIX",
]);

const ENTIDADES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&nbsp;": " ",
};

function textoDoHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (e) => ENTIDADES[e] ?? e)
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)));
}

interface Post {
  id: string;
  quando: string;
  texto: string;
}

/** Últimas ~20 postagens do canal pela página pública. */
export async function lerCanal(canal: string): Promise<Post[]> {
  const res = await fetch(`https://t.me/s/${encodeURIComponent(canal)}`, {
    headers: { "user-agent": "Mozilla/5.0 (compatible; PrecoNinjaBot/1.0)" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`t.me/s/${canal}: HTTP ${res.status}`);
  const html = await res.text();
  const posts: Post[] = [];
  // Cada postagem: <div class="tgme_widget_message ..." data-post="canal/123"> … texto … <time datetime=…>
  for (const bloco of html.split(/(?=<div class="tgme_widget_message_wrap)/).slice(1)) {
    const id = /data-post="([^"]+)"/.exec(bloco)?.[1];
    const quando = /<time[^>]+datetime="([^"]+)"/.exec(bloco)?.[1];
    const corpo = /<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/.exec(
      bloco,
    )?.[1];
    if (id && quando && corpo) posts.push({ id, quando, texto: textoDoHtml(corpo) });
  }
  return posts;
}

const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Tira do post só o fato: loja, código(s) e regras. null = não é cupom de ML/Shopee. */
export function extrairCupom(post: Post): Cupom | null {
  const t = post.texto;
  const ml = /mercado\s*livre|\bmeli\b/i.test(t);
  const shopee = /shopee/i.test(t);
  if (ml === shopee) return null; // nenhuma das duas, ou as duas (ambíguo)

  const codigos: string[] = [];
  for (const linha of t.split("\n")) {
    if (!/cupo(m|ns)|c[oó]digo/i.test(linha)) continue;
    for (const m of normalizar(linha).matchAll(/\b[A-Z][A-Z0-9]{3,19}\b/g)) {
      const c = m[0];
      if (!NAO_CODIGO.has(c) && !codigos.includes(c)) codigos.push(c);
    }
  }
  if (codigos.length === 0) return null;

  const dinheiro = (v: string) => `R$ ${v.replace(/,00$/, "")}`;
  const pct = /(\d{1,2})\s?%\s?(?:off|de desconto|em|no|na)/i.exec(t)?.[1];
  const reais = /R\$\s?([\d.,]+)\s?(?:off|de desconto)/i.exec(t)?.[1];
  const limite = /limitad[oa]\s+a\s+R\$\s?([\d.,]+)/i.exec(t)?.[1];
  const minimo = /(?:acima de|a partir de|m[íi]nim[oa] de)\s+R\$\s?([\d.,]+)/i.exec(t)?.[1] ?? null;

  return {
    loja: ml ? "ml" : "shopee",
    codigos,
    desconto:
      codigos.length > 1 ? null : pct ? `${pct}% OFF` : reais ? `${dinheiro(reais)} OFF` : null,
    limite: limite ? dinheiro(limite) : null,
    minimo: codigos.length > 1 || !minimo ? null : dinheiro(minimo),
    origem: post.id,
    quando: post.quando,
  };
}

/** Cupons recentes de ML/Shopee nos canais, sem repetir código. */
export async function buscarCupons(canais: string[], agora = Date.now()): Promise<Cupom[]> {
  const vistos = new Set<string>();
  const cupons: Cupom[] = [];
  for (const canal of canais) {
    let posts: Post[];
    try {
      posts = await lerCanal(canal);
    } catch (err) {
      console.warn(`cupons: ${(err as Error).message}`);
      continue;
    }
    for (const post of posts.reverse()) {
      if (agora - new Date(post.quando).getTime() > MAX_IDADE_MS) continue;
      const cupom = extrairCupom(post);
      if (!cupom) continue;
      const chave = `${cupom.loja}:${cupom.codigos.join("+")}`;
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      cupons.push(cupom);
    }
  }
  return cupons;
}

/** Nossa mensagem (HTML do Telegram). O código em <code> vira "toque para copiar". */
export function mensagemCupom(c: Cupom, link: string): string {
  const loja = c.loja === "ml" ? "MERCADO LIVRE" : "SHOPEE";
  const linhas = [`🎟️ <b>CUPOM ${loja}</b>`, ""];
  const regras = [c.desconto, c.limite && `limite de ${c.limite} de desconto`].filter(Boolean);
  if (regras.length) linhas.push(`🏷️ ${regras.join(" · ")}`);
  if (c.minimo) linhas.push(`🛒 Compra mínima: ${c.minimo}`);
  if (c.codigos.length > 1) linhas.push("🏷️ Desconto varia conforme o valor da compra");
  linhas.push(
    "",
    c.codigos.length > 1
      ? `Use um dos cupons: ${c.codigos.map((x) => `<code>${escapeHtml(x)}</code>`).join(", ")}`
      : `Cupom: <code>${escapeHtml(c.codigos[0]!)}</code> (toque para copiar)`,
    "",
    c.loja === "ml"
      ? `👉 Adicione em Meus cupons ou no carrinho: ${link}`
      : `👉 Aplique no carrinho da Shopee: ${link}`,
    "⚠️ Cupom de uso limitado: pode esgotar ou valer só para produtos selecionados.",
  );
  return linhas.join("\n");
}

// Teste: `node scripts/ofertas/cupons-telegram.ts canal1,canal2` só mostra, não posta.
if (import.meta.url === `file://${process.argv[1]}`) {
  const canais = (process.argv[2] || "avidaefeitadedesconto")
    .split(",")
    .map((c) => c.trim().replace(/^@|^https?:\/\/t\.me\/(s\/)?/g, ""))
    .filter(Boolean);
  console.log(`Canais: ${canais.join(", ")}\n`);

  for (const canal of canais) {
    try {
      const posts = await lerCanal(canal);
      console.log(`── ${canal}: ${posts.length} postagens lidas`);
      for (const p of posts) {
        const c = extrairCupom(p);
        const resumo = p.texto.replace(/\s+/g, " ").slice(0, 110);
        console.log(`   ${c ? "🎟️" : "  "} ${p.quando.slice(0, 16)} ${resumo}`);
        if (c)
          console.log(
            `      → ${c.loja} ${c.codigos.join("/")} · ${c.desconto ?? "-"} · limite ${c.limite ?? "-"} · mín ${c.minimo ?? "-"}`,
          );
      }
    } catch (err) {
      console.log(`── ${canal}: ERRO ${(err as Error).message}`);
    }
  }

  const cupons = await buscarCupons(canais);
  console.log(`\n══ Seriam postados ${cupons.length} cupons (últimas 12 h) ══`);
  for (const c of cupons) {
    const link =
      c.loja === "ml"
        ? "https://www.mercadolivre.com.br/cupons (com seu código de afiliado)"
        : "https://shopee.com.br (link de afiliado)";
    console.log(`\n${mensagemCupom(c, link).replace(/<\/?(b|code)>/g, "")}`);
  }
}

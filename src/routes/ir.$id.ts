import { createFileRoute } from "@tanstack/react-router";

import { ID_OFERTA, linkAfiliado } from "@/lib/rastreio";
import { LINKS_DADOS_URL, OFERTAS_DADOS_URL, POSTHOG, SITE_NAME, absoluteUrl } from "@/lib/site";

/**
 * /ir/<id>?o=tg|wa|site&f=<fonte>&d=<desconto>&p=<preço>
 *
 * Todo link de oferta (Telegram, WhatsApp, cards do site) passa por aqui: o
 * clique é registrado no PostHog e a pessoa é redirecionada para o anúncio no
 * Mercado Livre com o código de afiliado. É o que permite saber qual post,
 * origem, categoria e horário geram clique — sem isso a curadoria é chute.
 *
 * Para os robôs de prévia (WhatsApp, Telegram, Facebook…) a resposta é uma
 * página com Open Graph — título, preço e foto do produto — para a mensagem
 * compartilhada mostrar o card com a imagem. Robô não conta como clique.
 *
 * Só roda no servidor (Cloudflare Worker). Sem POSTHOG.key configurado, o
 * redirecionamento funciona igual e apenas não registra.
 */
export const Route = createFileRoute("/ir/$id")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const id = params.id.toUpperCase();
        const url = new URL(request.url);
        if (!ID_OFERTA.test(id)) {
          return new Response(null, {
            status: 302,
            headers: { location: new URL("/promo", url.origin).toString() },
          });
        }

        if (ROBO_DE_PREVIA.test(request.headers.get("user-agent") ?? "")) {
          return paginaDePrevia(id, url);
        }

        // Shopee: o link de afiliado (offerLink) só existe no ofertas.json; sem ele,
        // cai no link do produto sem comissão. ML: derivável do id.
        const [destino] = await Promise.all([
          id.startsWith("SP") ? destinoShopee(id, url.origin) : Promise.resolve(linkAfiliado(id)),
          registrarClique({
            item: id,
            marketplace: id.startsWith("SP") ? "shopee" : "ml",
            origem: url.searchParams.get("o") ?? "desconhecida",
            fonte: url.searchParams.get("f") ?? "",
            desconto: Number(url.searchParams.get("d")) || null,
            preco: Number(url.searchParams.get("p")) || null,
            referer: request.headers.get("referer") ?? "",
          }),
        ]);

        return new Response(null, {
          status: 302,
          headers: { location: destino, "cache-control": "no-store" },
        });
      },
    },
  },
});

const ROBO_DE_PREVIA =
  /WhatsApp|facebookexternalhit|Facebot|TelegramBot|Twitterbot|LinkedInBot|Slackbot|Discordbot|Googlebot|bingbot/i;

interface OfertaResumo {
  id: string;
  title: string;
  price: number;
  discount: number;
  base?: string;
  averagePrice?: number | null;
  image: string;
  /** link de afiliado gravado pelo bot (na Shopee é o único jeito de chegar com comissão) */
  url?: string;
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

/** Procura a oferta no JSON publicado (repositório de dados, depois o do próprio site). */
async function buscarOferta(id: string, origin: string): Promise<OfertaResumo | null> {
  for (const fonte of [OFERTAS_DADOS_URL, new URL("/ofertas.json", origin).toString()]) {
    try {
      const r = await fetch(fonte);
      if (!r.ok) continue;
      const lista = (await r.json()) as OfertaResumo[];
      const o = lista.find((x) => x.id === id);
      if (o) return o;
    } catch {
      // tenta a próxima fonte
    }
  }
  return null;
}

/**
 * Link de afiliado de uma oferta Shopee: primeiro no ofertas.json, depois no
 * links.json (ofertas que já saíram do site), por fim o produto sem comissão.
 */
async function destinoShopee(id: string, origin: string): Promise<string> {
  const oferta = await buscarOferta(id, origin);
  if (oferta?.url) return oferta.url;
  for (const fonte of [LINKS_DADOS_URL, new URL("/links.json", origin).toString()]) {
    try {
      const r = await fetch(fonte);
      if (!r.ok) continue;
      const links = (await r.json()) as Record<string, { url?: string }>;
      if (links[id]?.url) return links[id].url;
    } catch {
      // tenta a próxima fonte
    }
  }
  return linkAfiliado(id);
}

async function paginaDePrevia(id: string, url: URL): Promise<Response> {
  const o = await buscarOferta(id, url.origin);
  const titulo = o
    ? `${brl(o.price)} · ${o.discount}% ${o.base === "media" ? "abaixo do preço médio" : "OFF"}`
    : `Oferta no Mercado Livre — ${SITE_NAME}`;
  const descricao = o
    ? `${o.title}${o.averagePrice ? ` — preço médio ${brl(o.averagePrice)}` : ""}. Via ${SITE_NAME}.`
    : "Ofertas com desconto de verdade, comparadas com os outros vendedores.";
  const imagem = o?.image ?? absoluteUrl("/og-image.png");
  const destino = linkAfiliado(id);

  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<title>${esc(titulo)}</title>
<meta property="og:type" content="product">
<meta property="og:site_name" content="${esc(SITE_NAME)}">
<meta property="og:title" content="${esc(titulo)}">
<meta property="og:description" content="${esc(descricao)}">
<meta property="og:image" content="${esc(imagem)}">
<meta property="og:url" content="${esc(url.toString())}">
<meta name="twitter:card" content="summary_large_image">
<meta http-equiv="refresh" content="0;url=${esc(destino)}">
</head><body><a href="${esc(destino)}">${esc(titulo)}</a></body></html>`;

  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
  });
}

/** Hora e dia da semana em Brasília, para agrupar cliques por horário de postagem. */
function agora() {
  const fmt = (opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", ...opts }).format(new Date());
  return {
    hora: Number(fmt({ hour: "numeric", hour12: false })),
    dia_semana: fmt({ weekday: "short" }),
  };
}

/**
 * Evento `clique_oferta` no PostHog via API HTTP. Sem dado pessoal: o
 * distinct_id é aleatório por clique e o IP do visitante não é enviado.
 * Nunca atrasa mais que 1,5 s nem quebra o redirecionamento.
 */
async function registrarClique(props: Record<string, unknown>): Promise<void> {
  if (!POSTHOG.key) return;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 1500);
  try {
    await fetch(`${POSTHOG.host}/capture/`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: ctrl.signal,
      body: JSON.stringify({
        api_key: POSTHOG.key,
        event: "clique_oferta",
        distinct_id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        properties: { ...props, ...agora(), $process_person_profile: false },
      }),
    });
  } catch {
    // analytics fora do ar não pode impedir a pessoa de chegar na oferta
  } finally {
    clearTimeout(timer);
  }
}

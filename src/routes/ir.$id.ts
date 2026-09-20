import { createFileRoute } from "@tanstack/react-router";

import { linkAfiliado } from "@/lib/rastreio";
import { POSTHOG } from "@/lib/site";

/**
 * /ir/<id>?o=tg|wa|site&f=<fonte>&d=<desconto>&p=<preço>
 *
 * Todo link de oferta (Telegram, WhatsApp, cards do site) passa por aqui: o
 * clique é registrado no PostHog e a pessoa é redirecionada para o anúncio no
 * Mercado Livre com o código de afiliado. É o que permite saber qual post,
 * origem, categoria e horário geram clique — sem isso a curadoria é chute.
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
        if (!/^MLB\d{6,}$/.test(id)) {
          return new Response(null, {
            status: 302,
            headers: { location: new URL("/promo", url.origin).toString() },
          });
        }

        await registrarClique({
          item: id,
          origem: url.searchParams.get("o") ?? "desconhecida",
          fonte: url.searchParams.get("f") ?? "",
          desconto: Number(url.searchParams.get("d")) || null,
          preco: Number(url.searchParams.get("p")) || null,
          referer: request.headers.get("referer") ?? "",
        });

        return new Response(null, {
          status: 302,
          headers: { location: linkAfiliado(id), "cache-control": "no-store" },
        });
      },
    },
  },
});

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

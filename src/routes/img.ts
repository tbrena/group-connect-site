import { createFileRoute } from "@tanstack/react-router";

/**
 * /img?u=<url> — proxy de imagem de produto (CDN do Mercado Livre e da Shopee).
 *
 * Existe por um motivo só: o botão "Compartilhar" do site desenha a imagem da
 * oferta num canvas e a envia como arquivo pelo compartilhamento nativo. Para
 * o canvas poder exportar, a foto precisa chegar com CORS liberado, e as CDNs
 * dos marketplaces não garantem isso. Só hosts da lista passam (não é proxy
 * aberto), e a resposta fica em cache por um dia.
 */
// cf.shopee.com.br é a CDN das fotos que a Affiliate API da Shopee devolve (imageUrl);
// só ela — não o domínio shopee.com.br inteiro, que tem encurtador e páginas.
const HOSTS_PERMITIDOS = ["mlstatic.com", "susercontent.com", "cf.shopee.com.br"];

export const Route = createFileRoute("/img")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const bruto = new URL(request.url).searchParams.get("u") ?? "";
        let alvo: URL;
        try {
          alvo = new URL(bruto);
        } catch {
          return new Response("url inválida", { status: 400 });
        }
        const hostOk = HOSTS_PERMITIDOS.some(
          (h) => alvo.hostname === h || alvo.hostname.endsWith(`.${h}`),
        );
        if (alvo.protocol !== "https:" || !hostOk) {
          return new Response("host não permitido", { status: 403 });
        }

        const origem = await fetch(alvo.toString(), { headers: { accept: "image/*" } });
        const tipo = origem.headers.get("content-type") ?? "";
        if (!origem.ok || !tipo.startsWith("image/")) {
          return new Response("imagem indisponível", { status: 502 });
        }
        return new Response(origem.body, {
          status: 200,
          headers: {
            "content-type": tipo,
            "cache-control": "public, max-age=86400",
            "access-control-allow-origin": "*",
          },
        });
      },
    },
  },
});

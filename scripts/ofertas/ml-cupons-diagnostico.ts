/**
 * Diagnóstico: dá para achar cupons oficiais do Mercado Livre automaticamente?
 *
 *   node --env-file-if-exists=.env scripts/ofertas/ml-cupons-diagnostico.ts
 *
 * 1. Páginas públicas do ML (como um celular abriria): status, para onde
 *    redireciona (login?), título, trechos com "cupom" e códigos candidatos.
 * 2. Endpoints da API com o token do app: quais respondem algo de cupom/campanha.
 *
 * Só lê; não publica nada. Não imprime as chaves nem o conteúdo das respostas da
 * API (o log do Actions é público e o token do app é ligado à conta do dono). Roda pelo workflow
 * "Mercado Livre (cupons — diagnóstico)".
 */
import { getAccessToken } from "./ml-client.ts";

const NAVEGADOR = {
  "user-agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  "accept-language": "pt-BR,pt;q=0.9",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

const PAGINAS = [
  "https://www.mercadolivre.com.br/cupons",
  "https://www.mercadolivre.com.br/cupons/filter",
  "https://www.mercadolivre.com.br/l/cupons",
  "https://www.mercadolivre.com.br/ofertas",
  "https://www.mercadolivre.com.br/ofertas?promotion_type=lightning",
  "https://www.mercadolivre.com.br/descontos",
  "https://www.mercadolivre.com.br/campanhas",
  "https://www.mercadolivre.com.br/afiliados",
  "https://www.mercadolivre.com.br/afiliados/cupons",
];

const API = "https://api.mercadolibre.com";
const ENDPOINTS = [
  "/sites/MLB/coupons",
  "/coupons?site_id=MLB",
  "/marketplace/coupons?site_id=MLB",
  "/sites/MLB/deals",
  "/deals/search?site_id=MLB",
  "/sites/MLB/campaigns",
  "/seller-promotions/promotions?site_id=MLB",
  "/affiliates/coupons?site_id=MLB",
];

/** Palavras que costumam ficar em volta de um código de cupom. */
const PERTO_DE_CUPOM =
  /(cupom|cupon|c[oó]digo|coupon|voucher)[^A-Za-z0-9]{0,40}([A-Z][A-Z0-9]{4,19})\b/g;
/** Maiúsculas comuns que não são código. */
const NAO_CODIGO = new Set([
  "MERCADO",
  "LIVRE",
  "FRETE",
  "GRATIS",
  "GRÁTIS",
  "PARA",
  "DESCONTO",
  "OFF",
]);

async function abrirPagina(inicial: string): Promise<void> {
  let url = inicial;
  let res: Response | null = null;
  const saltos: string[] = [];
  try {
    for (let salto = 0; salto < 8; salto++) {
      res = await fetch(url, {
        redirect: "manual",
        headers: NAVEGADOR,
        signal: AbortSignal.timeout(15_000),
      });
      const destino = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && destino) {
        url = new URL(destino, url).toString();
        saltos.push(`${res.status} → ${url.slice(0, 140)}`);
        continue;
      }
      break;
    }
  } catch (err) {
    console.log(`❌ ${inicial}: ${(err as Error).message}`);
    return;
  }
  if (!res) return;

  const html = await res.text();
  const login = /login|registration|jms\/mlb\/lgz/i.test(url);
  console.log(`\n${res.ok && !login ? "✅" : "⚠️"} ${inicial}`);
  for (const s of saltos) console.log(`   ${s}`);
  const titulo = /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]?.trim();
  console.log(
    `   status ${res.status} · ${html.length} bytes · título: ${titulo ?? "(sem)"}${login ? " · CAIU NO LOGIN" : ""}`,
  );

  // Texto visível aproximado (sem scripts/estilos) para achar os trechos.
  const texto = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");
  const trechos = new Set<string>();
  for (const m of texto.matchAll(/.{0,70}(cupom|cupons|c[oó]digo).{0,90}/gi)) {
    trechos.add(m[0].trim());
    if (trechos.size >= 12) break;
  }
  console.log(`   trechos com "cupom" no texto (${trechos.size}):`);
  for (const t of trechos) console.log(`     … ${t} …`);

  // Códigos candidatos no HTML inteiro (inclui o JSON que a página embute).
  const codigos = new Map<string, number>();
  for (const m of html.matchAll(PERTO_DE_CUPOM)) {
    const c = m[2]!;
    if (NAO_CODIGO.has(c)) continue;
    codigos.set(c, (codigos.get(c) ?? 0) + 1);
  }
  console.log(
    `   códigos candidatos: ${[...codigos].map(([c, n]) => `${c}(${n})`).join(", ") || "nenhum"}`,
  );

  // Chaves de JSON embutido com cara de cupom (a página pode trazer os dados num script).
  const chaves = new Set<string>();
  for (const m of html.matchAll(
    /"([a-zA-Z_]*(?:coupon|cupom|voucher|campaign)[a-zA-Z_]*)"\s*:/gi,
  )) {
    chaves.add(m[1]!);
    if (chaves.size >= 20) break;
  }
  if (chaves.size) console.log(`   chaves JSON: ${[...chaves].join(", ")}`);
}

async function sondarApi(): Promise<void> {
  let token: string | null = null;
  try {
    token = await getAccessToken();
    console.log("token do app: ok");
  } catch (err) {
    console.log(`sem token (${(err as Error).message}) — sondando sem autenticação`);
  }
  for (const caminho of ENDPOINTS) {
    try {
      const res = await fetch(`${API}${caminho}`, {
        headers: token ? { authorization: `Bearer ${token}` } : {},
        signal: AbortSignal.timeout(15_000),
      });
      // O log do Actions é público: nunca imprime o corpo (pode trazer dados da conta),
      // só o status e os NOMES dos campos da resposta.
      const texto = await res.text();
      let campos = `${texto.length} bytes`;
      try {
        const json: unknown = JSON.parse(texto);
        const obj = Array.isArray(json) ? json[0] : json;
        if (obj && typeof obj === "object") campos = `campos: ${Object.keys(obj).join(", ")}`;
      } catch {
        // não é JSON
      }
      console.log(`   ${res.status}  ${caminho}  ${campos}`);
    } catch (err) {
      console.log(`   ERRO ${caminho}: ${(err as Error).message}`);
    }
  }
}

console.log("── 1. Páginas públicas ─────────────────────────────────────");
for (const p of PAGINAS) await abrirPagina(p);
console.log("\n── 2. API do Mercado Livre ──────────────────────────────────");
await sondarApi();

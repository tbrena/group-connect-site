/**
 * Abre um link (ex.: s.shopee.com.br/…) seguindo os redirecionamentos e mostra
 * para onde ele leva e o que a página traz de cupom/voucher.
 *
 *   node scripts/ofertas/link-diagnostico.ts <url>
 *
 * Só lê. Usado pelo workflow "Shopee (diagnóstico)" com o input `url`.
 */
const NAVEGADOR = {
  "user-agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  "accept-language": "pt-BR,pt;q=0.9",
};

const inicial = process.argv[2];
if (!inicial) {
  console.log("Uso: node scripts/ofertas/link-diagnostico.ts <url>");
  process.exit(0);
}

let url = inicial;
let res: Response | null = null;
for (let salto = 0; salto < 10; salto++) {
  res = await fetch(url, { redirect: "manual", headers: NAVEGADOR });
  const destino = res.headers.get("location");
  console.log(`${res.status}  ${url}`);
  if (res.status >= 300 && res.status < 400 && destino) {
    url = new URL(destino, url).toString();
    continue;
  }
  break;
}

if (res) {
  const final = new URL(url);
  console.log(`\nDestino final: ${final.origin}${final.pathname}`);
  console.log("Parâmetros:");
  for (const [k, v] of final.searchParams) console.log(`  ${k} = ${v.slice(0, 120)}`);

  const html = await res.text();
  const titulo = /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]?.trim();
  console.log(`\nTipo: ${res.headers.get("content-type")} · ${html.length} bytes`);
  console.log(`Título: ${titulo ?? "(sem título)"}`);
  const og = [
    ...html.matchAll(/<meta[^>]+property="og:(title|description)"[^>]+content="([^"]*)"/gi),
  ];
  for (const m of og) console.log(`og:${m[1]}: ${m[2]}`);

  // Trechos com cara de cupom (o HTML da Shopee é quase todo montado por JS; pode vir pouco).
  const trechos = new Set<string>();
  for (const m of html.matchAll(
    /.{0,60}(voucher|cupom|coupon|promotion_?id|signature|R\$\s?\d).{0,60}/gi,
  )) {
    trechos.add(m[0].replace(/\s+/g, " "));
    if (trechos.size >= 25) break;
  }
  console.log(`\nTrechos com cara de cupom (${trechos.size}):`);
  for (const t of trechos) console.log(`  … ${t} …`);

  // Estrutura da página (para estudar landing pages): descrição, títulos, botões/links e o
  // texto visível. Página montada só por JavaScript vem quase vazia aqui.
  const semTags = (h: string) =>
    h
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim();
  const descricao = /<meta[^>]+name="description"[^>]+content="([^"]*)"/i.exec(html)?.[1];
  if (descricao) console.log(`\nDescrição: ${descricao}`);
  console.log("\nTítulos:");
  for (const m of html.matchAll(/<(h[1-4])[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const t = semTags(m[2]!);
    if (t) console.log(`  ${m[1]!.toUpperCase()}: ${t.slice(0, 200)}`);
  }
  console.log("\nBotões e links:");
  const vistos = new Set<string>();
  for (const m of html.matchAll(/<(a|button)\b([^>]*)>([\s\S]*?)<\/\1>/gi)) {
    const texto = semTags(m[3]!);
    const href = /href="([^"]*)"/i.exec(m[2]!)?.[1] ?? "";
    const linha = `${texto.slice(0, 80)} → ${href.slice(0, 120)}`;
    if (!texto || vistos.has(linha)) continue;
    vistos.add(linha);
    console.log(`  ${linha}`);
    if (vistos.size >= 80) break;
  }
  const visivel = semTags(
    html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " "),
  );
  console.log(`\nTexto visível (${visivel.length} caracteres):`);
  for (let i = 0; i < Math.min(visivel.length, 12_000); i += 200)
    console.log(`  ${visivel.slice(i, i + 200)}`);
}

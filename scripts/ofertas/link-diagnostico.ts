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
}

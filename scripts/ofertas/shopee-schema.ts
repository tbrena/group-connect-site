/**
 * Diagnóstico da Affiliate Open API da Shopee: o que ela expõe além de produtos?
 *
 *   npm run ofertas:shopee-schema
 *
 * 1. Introspecção GraphQL: lista as consultas disponíveis (com argumentos) e
 *    destaca tudo que tenha cara de cupom/voucher/campanha.
 * 2. Se a introspecção estiver desligada, cutuca nomes prováveis — o GraphQL
 *    costuma responder "Did you mean …?" com os nomes verdadeiros.
 * 3. Mostra uma amostra de shopeeOfferV2 (campanhas), com os campos que existirem.
 *
 * Só lê; não publica nada. Não imprime as chaves.
 */
import { shopeeConfigurada, shopeeGraphQL } from "./shopee-client.ts";

const SUSPEITOS = /voucher|coupon|cupom|promo|campaign|campanha|offer|discount|code/i;

interface TipoRef {
  name: string | null;
  kind: string;
  ofType?: TipoRef | null;
}
interface Campo {
  name: string;
  description?: string | null;
  args?: Array<{ name: string; type: TipoRef }>;
  type: TipoRef;
}
interface Tipo {
  name: string;
  kind: string;
  fields?: Campo[] | null;
}

const nomeTipo = (t: TipoRef | null | undefined): string => {
  if (!t) return "?";
  if (t.kind === "NON_NULL") return `${nomeTipo(t.ofType)}!`;
  if (t.kind === "LIST") return `[${nomeTipo(t.ofType)}]`;
  return t.name ?? "?";
};
/** Tipo "de verdade" por trás de NON_NULL/LIST. */
const base = (t: TipoRef | null | undefined): string | null =>
  !t ? null : (t.name ?? base(t.ofType));

const INTROSPECCAO = `
  query {
    __schema {
      queryType { name }
      mutationType { name }
      types {
        name kind
        fields {
          name description
          args { name type { name kind ofType { name kind ofType { name kind } } } }
          type { name kind ofType { name kind ofType { name kind ofType { name kind } } } }
        }
      }
    }
  }`;

async function tentar(rotulo: string, query: string): Promise<unknown> {
  try {
    const data = await shopeeGraphQL<unknown>(query, {});
    console.log(`✅ ${rotulo}`);
    return data;
  } catch (err) {
    console.log(`❌ ${rotulo}: ${(err as Error).message}`);
    return null;
  }
}

async function main(): Promise<void> {
  if (!shopeeConfigurada()) {
    console.log("SHOPEE_APP_ID/SHOPEE_SECRET ausentes.");
    return;
  }

  console.log("── 1. Introspecção ─────────────────────────────────────────");
  const intro = (await tentar("introspecção", INTROSPECCAO)) as {
    __schema: { queryType: { name: string }; mutationType: { name: string } | null; types: Tipo[] };
  } | null;

  let tipos = new Map<string, Tipo>();
  if (intro) {
    tipos = new Map(intro.__schema.types.map((t) => [t.name, t]));
    for (const raiz of [intro.__schema.queryType, intro.__schema.mutationType]) {
      if (!raiz) continue;
      const tipo = tipos.get(raiz.name);
      console.log(`\n${raiz.name}:`);
      for (const f of tipo?.fields ?? []) {
        const args = (f.args ?? []).map((a) => `${a.name}: ${nomeTipo(a.type)}`).join(", ");
        const marca = SUSPEITOS.test(f.name) ? "  ◀" : "";
        console.log(`  ${f.name}(${args}) → ${nomeTipo(f.type)}${marca}`);
        if (f.description) console.log(`      ${f.description.replace(/\s+/g, " ")}`);
      }
    }

    const suspeitos = intro.__schema.types.filter(
      (t) => !t.name.startsWith("__") && t.kind === "OBJECT" && SUSPEITOS.test(t.name),
    );
    console.log(`\nTipos com cara de cupom/campanha/oferta (${suspeitos.length}):`);
    for (const t of suspeitos) {
      const campos = (t.fields ?? []).map((f) => `${f.name}: ${nomeTipo(f.type)}`).join(", ");
      console.log(`  ${t.name} { ${campos} }`);
    }
  }

  console.log("\n── 2. Sondagem por nome (sugestões de erro) ────────────────");
  for (const nome of [
    "voucherOffer",
    "voucherOfferV2",
    "couponOffer",
    "vouchers",
    "shopVoucher",
    "promotionOffer",
    "campaignOffer",
  ]) {
    await tentar(nome, `query { ${nome} { __typename } }`);
  }

  console.log("\n── 3. Amostra de shopeeOfferV2 (campanhas) ─────────────────");
  // Campos escalares do nó, descobertos pela introspecção; senão, os da documentação.
  const conexao = base(
    tipos.get(intro?.__schema.queryType.name ?? "")?.fields?.find((f) => f.name === "shopeeOfferV2")
      ?.type,
  );
  const tipoNo = base(tipos.get(conexao ?? "")?.fields?.find((f) => f.name === "nodes")?.type);
  const escalares = (tipos.get(tipoNo ?? "")?.fields ?? [])
    .filter((f) => {
      const b = base(f.type);
      return b !== null && ["String", "Int", "Int64", "Float", "Boolean", "ID"].includes(b);
    })
    .map((f) => f.name);
  const campos = escalares.length
    ? escalares.join(" ")
    : "commissionRate imageUrl offerLink originalLink offerName offerType categoryId collectionId periodStartTime periodEndTime";
  const amostra = (await tentar(
    `shopeeOfferV2 { ${campos} }`,
    `query { shopeeOfferV2(page: 1, limit: 5) { nodes { ${campos} } } }`,
  )) as { shopeeOfferV2?: { nodes?: unknown[] } } | null;
  for (const n of amostra?.shopeeOfferV2?.nodes ?? []) console.log(JSON.stringify(n, null, 2));
}

await main();

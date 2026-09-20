/**
 * Teste de fumaça da Shopee — rode no dia em que a chave chegar:
 *
 *   npm run ofertas:shopee-teste            # busca "air fryer" e mostra a resposta bruta
 *   npm run ofertas:shopee-teste -- "fone bluetooth"
 *
 * Serve para confirmar autenticação e nomes de campos antes da primeira rodada.
 */
import {
  QUERY_PRODUCT_OFFER,
  shopeeConfigurada,
  shopeeGraphQL,
  type ShopeeNode,
} from "./shopee-client.ts";

if (!shopeeConfigurada()) {
  console.log("Defina SHOPEE_APP_ID e SHOPEE_SECRET no .env antes de testar.");
} else {
  const keyword = process.argv[2] ?? "air fryer";
  const data = await shopeeGraphQL<{ productOfferV2: { nodes: ShopeeNode[] } }>(
    QUERY_PRODUCT_OFFER,
    {
      keyword,
      productCatId: null,
      sortType: 2,
      page: 1,
      limit: 3,
    },
  );
  const nodes = data.productOfferV2?.nodes ?? [];
  console.log(`✅ autenticou · ${nodes.length} resultados para "${keyword}"\n`);
  console.log(JSON.stringify(nodes[0], null, 2));
  console.log("\nCampos recebidos:", Object.keys(nodes[0] ?? {}).join(", "));
}

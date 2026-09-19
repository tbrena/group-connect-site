# Preço Ninja

Landing page do grupo de ofertas **Preço Ninja** no WhatsApp.

- **Produção:** https://ofertaninja.online
- **Grupo:** link em `src/lib/site.ts` (`WHATSAPP_GROUP_URL`)

Todos os dados do site (domínio, título, descrição, link do grupo) ficam em
`src/lib/site.ts` — é o único arquivo a mudar se o domínio ou o grupo mudarem.
A imagem de preview dos links (`public/og-image.png`) é gerada a partir de
`scripts/og-image.html`; as instruções estão no comentário do próprio arquivo.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/f36b2873-4647-49e2-8a52-a31615bdec92).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Bot de ofertas (Mercado Livre → Telegram + site)

`scripts/ofertas/` busca produtos com desconto na API do Mercado Livre, monta o
link de afiliado e publica no canal do Telegram; também grava
`public/ofertas.json`, que alimenta a seção "Ofertas do dia" da landing.

```sh
cp .env.example .env      # preencha as chaves (nunca commitar o .env)
npm run ofertas -- --dry  # mostra o que publicaria, sem publicar
npm run ofertas           # publica no Telegram e atualiza public/ofertas.json
```

- Buscas, desconto mínimo/máximo e quantidade por rodada: `scripts/ofertas/config.json`
- Token do ML (Client Credentials, 6h) e histórico do que já foi publicado ficam em `.ofertas/` (ignorado pelo git)
- Uma oferta não repete por 7 dias; a home mostra 6 e `/promo` mostra até `siteMax` (99)

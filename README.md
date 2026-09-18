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

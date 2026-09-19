# Bot de ofertas — Preço Ninja

Busca as ofertas do Mercado Livre, escolhe as melhores e posta no grupo do
WhatsApp com foto, preço, desconto e **seu link de afiliado**. Roda no seu PC.

## Antes de começar (leia, é importante)

- **Use um número só para o bot.** O bot usa o WhatsApp como se fosse um
  celular conectado ("Dispositivos conectados"). Isso não é permitido pelos
  termos do WhatsApp e o número **pode ser banido**. Não use o seu número
  pessoal. Um chip pré-pago novo resolve — deixe ele alguns dias em uso
  normal (conversas, foto de perfil) antes de ligar o bot.
- **O número do bot precisa ser participante do grupo** (e de preferência
  admin, para ninguém apagar as postagens).
- **Ritmo importa.** O padrão é 1 oferta a cada ~30 min, das 8h às 22h. Postar
  a cada 2 minutos é o jeito mais rápido de ser banido.

## 1. Instalar

Precisa do [Node.js](https://nodejs.org) 20 ou mais novo.

```sh
cd bot
npm install
```

## 2. Configurar

```sh
cp .env.example .env      # no Windows: copy .env.example .env
```

Abra o `.env` e preencha:

| Variável | O que é |
| --- | --- |
| `ML_AFFILIATE_TOOL` e `ML_AFFILIATE_WORD` | No painel de afiliados do ML, gere um link de qualquer produto e copie os valores de `matt_tool=` e `matt_word=` da URL. |
| `GROUP_NAME` | Nome do grupo (um trecho basta). Ou use `GROUP_JID`, veja o passo 3. |
| `MIN_DISCOUNT_PERCENT` | Desconto mínimo para postar. Comece em 20–25%. |
| `POST_INTERVAL_MINUTES` / `ACTIVE_HOURS` | Ritmo e horário das postagens. |

As outras variáveis têm valores padrão e estão explicadas no próprio `.env.example`.

## 2b. Ligar a API do Mercado Livre (recomendado)

Sem isso o bot funciona lendo a página de ofertas do ML, que quebra quando o
site muda de layout. Com a API oficial (gratuita) ele busca "tudo com X% de
desconto em tal categoria" direto na fonte. Leva uns 10 minutos, uma vez só:

1. Entre em [developers.mercadolivre.com.br](https://developers.mercadolivre.com.br)
   com a sua conta do ML → **Minhas aplicações** → **Criar aplicação**.
2. Preencha: nome (ex.: Preço Ninja Bot), **URL de redirecionamento**
   `https://ofertaninja.online/ml-callback`, escopos **read** e
   **offline_access** (o `offline_access` é o que permite renovar o token
   sozinho). Os outros campos podem ficar no padrão.
3. Copie o **App ID** e a **Secret Key** para `ML_APP_ID` e `ML_APP_SECRET` no `.env`.
4. Rode `npm run ml:auth`. Ele mostra um link; abra, clique em **Autorizar**,
   e a página ofertaninja.online/ml-callback mostra um código. Cole no terminal.

Pronto: o token fica em `data/ml-token.json` e é renovado automaticamente.
Se um dia aparecer "rode npm run ml:auth de novo", é só repetir o passo 4.

Para escolher o que buscar, veja `ML_API_SEARCHES` no `.env.example`.

## 3. Testar cada parte

```sh
npm run groups     # conecta (mostra o QR code na 1ª vez) e lista seus grupos com o JID
npm run ml:auth    # autoriza a API do Mercado Livre (só se fez o passo 2b)
npm run ml:test    # mostra as ofertas que o bot está enxergando no ML e de qual fonte
npm run post:dry   # mostra a mensagem que seria postada, sem enviar nada
npm run post:test  # envia UMA oferta de verdade no grupo, para você ver como fica
```

Na primeira conexão aparece um QR code no terminal: no celular do bot, abra
WhatsApp → **Dispositivos conectados** → **Conectar dispositivo** e escaneie.
A sessão fica salva na pasta `auth/`; não precisa escanear de novo.

## 4. Rodar

```sh
npm start
```

Deixe o terminal aberto. `Ctrl+C` para parar. Se o PC desligar, é só rodar
`npm start` de novo — o bot lembra o que já postou (`data/posted.json`).

Para o bot subir sozinho quando o PC ligar (Windows): Agendador de Tarefas →
Criar tarefa básica → "Ao fazer logon" → Ação: iniciar `npm` com argumentos
`start` e "Iniciar em" apontando para a pasta `bot`.

## Como a mensagem fica

```
⚡ *OFERTA RELÂMPAGO* — 32% OFF

📦 *Smart TV Samsung 50" 4K UHD Crystal HDR*

❌ De: ~R$ 2.799,00~
✅ Por: *R$ 1.899,00*
💳 em 10x R$ 189,90 sem juros
🚚 Frete grátis

🛒 Compre aqui:
https://www.mercadolivre.com.br/.../p/MLB19647811?matt_tool=...&matt_word=...

⏳ Corre que o preço pode mudar a qualquer momento!
_Preço Ninja • ofertaninja.online_
```

O texto está em `src/format.ts` — pode mudar à vontade.

## Problemas comuns

**"Nenhuma oferta reconhecida"** — o Mercado Livre mudou o HTML da página de
ofertas. O bot salva a página em `data/debug-vazio-1.html`; mande esse
arquivo para ajustar o leitor em `src/mercadolivre.ts` (função `parseCard`).
Ou melhor: ligue a API (passo 2b) e esse problema deixa de existir.

**"token recusado" / "Não consegui renovar o token"** — a autorização da API
venceu ou foi revogada. Rode `npm run ml:auth` de novo.

**"Mercado Livre bloqueou a requisição"** — o ML achou que era robô. Espere
alguns minutos e aumente `POST_INTERVAL_MINUTES`. O bot já reaproveita a
lista de ofertas por 20 min entre postagens justamente para não abusar.

**"Sessão encerrada pelo WhatsApp"** — o aparelho foi desconectado no celular
(ou o número foi banido). Apague a pasta `auth/` e rode de novo para ler um
novo QR code.

**A foto não vai, só o texto** — o bot tenta a foto e, se falhar, manda o
texto para não perder a postagem. Se acontecer sempre, veja a URL da foto em
`npm run post:dry`.

**Quero postar só uma categoria** — em `ML_OFFERS_URLS`, use a página de
ofertas com filtro de categoria (ex.: `...ofertas?category=MLB1051` para
celulares). Abra mercadolivre.com.br/ofertas, filtre pela categoria e copie a
URL.

## Estrutura

```
src/index.ts         inicia tudo (npm start)
src/cli.ts           comandos de teste
src/config.ts        lê o .env
src/offers.ts        decide a fonte das ofertas (API ou página)
src/ml-api.ts        busca na API oficial do ML
src/ml-auth.ts       autorização OAuth e renovação do token do ML
src/mercadolivre.ts  lê a página de ofertas (reserva); monta o link de afiliado
src/format.ts        texto da mensagem
src/scheduler.ts     escolhe as ofertas e controla o ritmo
src/whatsapp.ts      conexão com o WhatsApp (Baileys)
src/store.ts         memória do que já foi postado (data/posted.json)
```

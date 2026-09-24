# Bot do WhatsApp — Preço Ninja

Posta no seu grupo do WhatsApp **as mesmas ofertas e cupons do canal do
Telegram**: foto, preço, desconto real, cupom quando houver, chamada de efeito
e **seu link de afiliado** (Mercado Livre e Shopee).

Quem escolhe as ofertas é o bot do GitHub (roda sozinho a cada 30 min). A cada
rodada ele publica uma **fila** com os posts prontos; este bot, rodando no seu
PC (ou num servidor), lê a fila e posta no grupo num ritmo seguro. É o mesmo
modelo das ferramentas pagas para afiliados: um "cérebro" na nuvem e um número
de WhatsApp conectado que só dispara.

## Antes de começar (leia, é importante)

- **Use um número só para o bot, nunca o seu pessoal.** O bot entra no
  WhatsApp como um aparelho conectado ("Dispositivos conectados"), o que não é
  permitido pelos termos do WhatsApp: o número **pode ser banido**. Um chip
  pré-pago resolve. Deixe o chip uns dias em uso normal (foto de perfil,
  algumas conversas) antes de ligar o bot.
- **Tenha um número reserva.** É o que as ferramentas pagas chamam de
  "contingência": se o número do bot cair, você conecta o reserva (apaga a pasta
  `auth/` e lê o QR code com ele) e segue postando.
- **O número do bot precisa estar no grupo, como admin.** Deixe o grupo em
  "só admins enviam mensagens" para ele virar um canal de ofertas.
- **Ritmo importa.** Padrão: 1 post a cada ~6 min, no máximo 10 por hora, das
  8h às 23h. Número novo: comece com `MAX_POR_HORA=4` na primeira semana.

## 1. Instalar (uma vez)

Precisa do [Node.js](https://nodejs.org) 22 ou mais novo (baixe a versão LTS).

```sh
cd bot
npm install
copy .env.example .env      # no Mac/Linux: cp .env.example .env
```

## 2. Conectar o WhatsApp e escolher o grupo

```sh
npm run grupos
```

Aparece um QR code no terminal: no celular **do número do bot**, abra WhatsApp
→ **Dispositivos conectados** → **Conectar dispositivo** e escaneie. Depois o
comando lista os grupos com o `GROUP_JID` de cada um. Copie o do seu grupo para
o `.env` (linha `GROUP_JID=`). A sessão fica salva na pasta `auth/`; não precisa
escanear de novo.

## 3. Testar

```sh
npm run fila     # mostra o que está na fila e o próximo post, sem enviar nada
npm run teste    # envia o próximo post AGORA no grupo, para ver como fica
```

## 4. Rodar

**Windows:** dê dois cliques em `iniciar.bat`. Deixe a janela aberta
(pode minimizar). Se cair a internet ou o bot parar, ele volta sozinho em 30 s.

Para subir junto com o PC: tecla Windows + R → `shell:startup` → cole ali um
**atalho** para o `iniciar.bat`.

**Mac/Linux/servidor:** `npm start` (use `pm2` ou `systemd` para reiniciar sozinho).

O PC precisa ficar ligado e com internet. Se preferir não depender do PC, um
servidor Linux simples (VPS de ~R$ 25/mês) roda o mesmo bot 24 h.

## Ajustes (arquivo `.env`)

| Variável            | Padrão    | O que faz                                                          |
| ------------------- | --------- | ------------------------------------------------------------------ |
| `GROUP_JID`         | —         | Grupo(s) onde postar. Vários: separe por vírgula.                  |
| `INTERVALO_MINUTOS` | 6         | Tempo entre posts (varia ±25% para não parecer robô).              |
| `MAX_POR_HORA`      | 10        | Teto de posts por hora.                                            |
| `ACTIVE_HOURS`      | 08-23     | Horário de Brasília em que posta.                                  |
| `LOJAS`             | ml,shopee | Só `ml`, só `shopee` ou as duas.                                   |
| `CUPONS`            | 1         | `0` para não postar os cupons.                                     |
| `MAX_IDADE_MINUTOS` | 180       | Post mais velho que isso na fila é pulado (preço pode ter mudado). |

O texto das mensagens vem pronto do bot do GitHub (o mesmo do Telegram, com
`*negrito*` do WhatsApp); para mudar o texto, muda lá, não aqui.

## Problemas comuns

**"Sessão encerrada pelo WhatsApp"** — o aparelho foi desconectado no celular
ou o número foi banido. Apague a pasta `auth/` e rode `npm run grupos` para ler
um novo QR code (com o número reserva, se o outro caiu).

**"Nada novo na fila"** — normal: o bot do GitHub publica uma rodada a cada
30 min, e este bot já postou o que tinha. Veja com `npm run fila`.

**A foto não vai, só o texto** — o bot tenta a foto e, se falhar, manda o texto
para não perder o post.

## Estrutura

```
src/index.ts      inicia tudo (npm start)
src/cli.ts        comandos de teste (grupos, fila, teste)
src/config.ts     lê o .env
src/fila.ts       lê a fila publicada pelo bot do GitHub e escolhe o próximo post
src/scheduler.ts  ritmo, horário e limite por hora
src/whatsapp.ts   conexão com o WhatsApp (Baileys)
src/store.ts      memória do que já foi postado (data/enviados.json)
iniciar.bat       Windows: roda e reinicia sozinho se parar
```

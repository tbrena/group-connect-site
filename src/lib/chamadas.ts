/**
 * Chamada de efeito na primeira linha de cada oferta ("💻 SETUP NOVO COM PREÇO
 * DE AMIGO"). Compartilhado pelo bot (scripts/ofertas/mensagem.ts, posts do
 * Telegram) e pelo site (src/lib/ofertas.ts, texto de compartilhar), para os
 * dois saírem iguais. Sem imports: roda no Node do bot e no Vite do site.
 *
 * A frase é escolhida pelo id da oferta — a mesma oferta tem sempre a mesma
 * chamada (no post, no compartilhar e ao reeditar), e ofertas diferentes variam.
 * Regra das frases: animar sem prometer o que o bot não sabe (nada de
 * "esgotando", "menor preço" ou "no Pix" aqui).
 */

const CHAMADAS: Record<string, { emoji: string; frases: string[] }> = {
  Celulares: {
    emoji: "📲",
    frases: [
      "HORA DE TROCAR DE CELULAR",
      "UPGRADE NO SEU CELULAR",
      "CELULAR NOVO SEM PESAR NO BOLSO",
      "DESCONTO PRA QUEM VIVE NO CELULAR",
    ],
  },
  Informática: {
    emoji: "💻",
    frases: [
      "SETUP NOVO COM PREÇO DE AMIGO",
      "BOM PRA TRABALHAR E ESTUDAR",
      "UPGRADE NO PC SEM SUSTO",
      "PRA QUEM VIVE NO COMPUTADOR",
    ],
  },
  Eletrônicos: {
    emoji: "🎧",
    frases: [
      "TECNOLOGIA COM PREÇO BAIXO",
      "PRA QUEM AMA UM GADGET",
      "SOM, IMAGEM E DESCONTO",
      "ESSE AQUI TÁ VALENDO A PENA",
    ],
  },
  Eletrodomésticos: {
    emoji: "🏠",
    frases: [
      "FACILITA A VIDA EM CASA",
      "A COZINHA AGRADECE",
      "MENOS TRABALHO, MAIS DESCONTO",
      "PRA CASA FICAR COMPLETA",
    ],
  },
  "Casa e Decoração": {
    emoji: "🛋️",
    frases: [
      "DEIXA A CASA COM A SUA CARA",
      "CASA ARRUMADA GASTANDO POUCO",
      "ACHADINHO PRA CASA",
      "PRA DAR AQUELE TAPA NA CASA",
    ],
  },
  "Moda e Calçados": {
    emoji: "👟",
    frases: [
      "PRA SAIR NO ESTILO",
      "LOOK NOVO NO PRECINHO",
      "ESTILO SEM ESTOURAR O CARTÃO",
      "RENOVA O GUARDA-ROUPA",
    ],
  },
  Esportes: {
    emoji: "🏋️",
    frases: [
      "BORA TREINAR",
      "FOCO NO TREINO, NÃO NO PREÇO",
      "EQUIPAMENTO NOVO PRO TREINO",
      "PRA SAIR DO SEDENTARISMO",
    ],
  },
  Beleza: {
    emoji: "💄",
    frases: [
      "AUTOCUIDADO EM DIA",
      "BELEZA COM DESCONTO",
      "SKINCARE NO PRECINHO",
      "PRA SE SENTIR BEM",
    ],
  },
  Brinquedos: {
    emoji: "🧸",
    frases: [
      "A CRIANÇADA VAI AMAR",
      "PRESENTE CERTO PRA CRIANÇA",
      "DIVERSÃO GARANTIDA",
      "PRA ALEGRAR OS PEQUENOS",
    ],
  },
  Games: {
    emoji: "🎮",
    frases: [
      "PLAYER, ESSA É PRA VOCÊ",
      "UPGRADE NO SETUP GAMER",
      "PRA JOGAR MAIS GASTANDO MENOS",
      "GAMEPLAY NO PRECINHO",
    ],
  },
  Pet: {
    emoji: "🐾",
    frases: ["O PET MERECE", "MIMO PRO SEU PET", "PRA QUEM É PAI E MÃE DE PET"],
  },
  Bebês: {
    emoji: "🍼",
    frases: ["PRA CUIDAR DO BEBÊ", "O BEBÊ AGRADECE", "AJUDA PRA MAMÃE E PRO PAPAI"],
  },
  Ferramentas: {
    emoji: "🛠️",
    frases: ["FAZ VOCÊ MESMO", "A CAIXA DE FERRAMENTAS AGRADECE", "PRA RESOLVER TUDO EM CASA"],
  },
  Automotivo: {
    emoji: "🚗",
    frases: ["CARRO EM DIA GASTANDO POUCO", "PRA QUEM CUIDA DO CARRO", "ACESSÓRIO NOVO PRO CARRO"],
  },
  Saúde: {
    emoji: "💊",
    frases: ["SAÚDE EM PRIMEIRO LUGAR", "BEM-ESTAR NO PRECINHO", "CUIDAR DE SI COM DESCONTO"],
  },
  Mercado: {
    emoji: "🛒",
    frases: ["ECONOMIA NO MERCADO", "DESPENSA CHEIA GASTANDO MENOS", "PRA ABASTECER A CASA"],
  },
  "Mais vendidos": {
    emoji: "🔥",
    frases: ["TODO MUNDO TÁ COMPRANDO", "SUCESSO DE VENDAS", "O QUERIDINHO DA GALERA"],
  },
};

const PADRAO = {
  emoji: "⚡",
  frases: [
    "ACHADINHO DO DIA",
    "OLHA ESSE PREÇO",
    "VALE A PENA CONFERIR",
    "PROMOÇÃO QUE CHAMOU ATENÇÃO",
  ],
};

/** Hash estável (djb2) do id: mesma oferta → mesma frase. */
function hash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Emoji da categoria e frase de efeito para a oferta. */
export function chamadaDaOferta(
  categoria: string | null | undefined,
  id: string,
): { emoji: string; frase: string } {
  const grupo = (categoria && CHAMADAS[categoria]) || PADRAO;
  return { emoji: grupo.emoji, frase: grupo.frases[hash(id) % grupo.frases.length]! };
}

/** Medalha das 3 melhores de uma rodada (posição 0, 1, 2); nada para as demais. */
export const medalhaDaPosicao = (posicao: number): string | undefined =>
  ["🥇", "🥈", "🥉"][posicao];

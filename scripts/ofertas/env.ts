/**
 * Leitura centralizada das variáveis de ambiente.
 * Os scripts rodam com `node --env-file=.env`, então tudo já está em process.env.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variável ${name} não definida. Adicione no arquivo .env (veja .env.example).`);
  }
  return value;
}

export const env = {
  ml: {
    clientId: () => required("ML_CLIENT_ID"),
    clientSecret: () => required("ML_CLIENT_SECRET"),
    /** Seu identificador no programa de afiliados (matt_word). */
    affiliateWord: () => required("ML_AFFILIATE_WORD"),
    /** ID da ferramenta de afiliado (matt_tool). */
    affiliateTool: () => required("ML_AFFILIATE_TOOL"),
  },
  telegram: {
    botToken: () => required("TELEGRAM_BOT_TOKEN"),
    chatId: () => required("TELEGRAM_CHAT_ID"),
  },
};

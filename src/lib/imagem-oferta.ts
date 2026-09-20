import { brl, type Oferta } from "@/lib/ofertas";

/**
 * Gera, no navegador, a mesma imagem que o bot manda pro Telegram
 * (scripts/ofertas/imagem.ts): foto do produto sobre branco, pílula de
 * desconto, selos, faixa de preço e a faixa da marca. É o que o botão
 * "Compartilhar" envia pro WhatsApp junto com o texto.
 *
 * Mesma geometria do bot: 1080 de largura; foto 980 · preço 130 · marca 150.
 */
const W = 1080;
const FOTO_H = 980;
const MARGEM = 40;
const PRECO_H = 130;
const MARCA_H = 150;
const FONTE = '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const VERDE = "#39ff14";
const ESCURO = "#0a0a0a";

/** A foto do produto passa pelo /img do site para o canvas poder exportar (CORS). */
export const viaProxy = (url: string) => `/img?u=${encodeURIComponent(url)}`;

function carregar(src: string): Promise<HTMLImageElement> {
  return new Promise((ok, falha) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => ok(img);
    img.onerror = () => falha(new Error(`não carregou: ${src}`));
    img.src = src;
  });
}

function retanguloArredondado(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

interface Pilula {
  tamanho: number;
  fundo: string;
  cor: string;
  borda?: string;
  alinhar?: "esq" | "dir";
}

/** Desenha a pílula e devolve a altura ocupada (para empilhar). */
function pilula(ctx: CanvasRenderingContext2D, texto: string, x: number, y: number, o: Pilula) {
  ctx.font = `800 ${o.tamanho}px ${FONTE}`;
  const largura = Math.round(ctx.measureText(texto).width + o.tamanho * 1.2);
  const altura = Math.round(o.tamanho * 1.7);
  const x0 = o.alinhar === "dir" ? x - largura : x;
  retanguloArredondado(ctx, x0, y, largura, altura, altura / 2);
  ctx.fillStyle = o.fundo;
  ctx.fill();
  if (o.borda) {
    ctx.strokeStyle = o.borda;
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  ctx.fillStyle = o.cor;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(texto, x0 + largura / 2, y + altura / 2 + 1);
  return altura;
}

export async function gerarImagemOferta(oferta: Oferta): Promise<Blob> {
  const [foto, marca] = await Promise.all([
    carregar(viaProxy(oferta.image)),
    carregar("/marca.png"),
  ]);

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = FOTO_H + PRECO_H + MARCA_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas indisponível");

  // Fundo branco + foto "contain" dentro da área, com margem.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, FOTO_H);
  const caixaW = W - MARGEM * 2;
  const caixaH = FOTO_H - MARGEM * 2;
  const escala = Math.min(caixaW / foto.naturalWidth, caixaH / foto.naturalHeight);
  const fw = foto.naturalWidth * escala;
  const fh = foto.naturalHeight * escala;
  ctx.drawImage(foto, MARGEM + (caixaW - fw) / 2, MARGEM + (caixaH - fh) / 2, fw, fh);

  // Pílula de desconto (esquerda) e selos (direita, empilhados).
  const contraMedia = oferta.base === "media" && oferta.averagePrice != null;
  pilula(
    ctx,
    contraMedia ? `${oferta.discount}% ABAIXO DA MÉDIA` : `${oferta.discount}% OFF`,
    32,
    32,
    {
      tamanho: 38,
      fundo: VERDE,
      cor: ESCURO,
    },
  );
  const selo: Pilula = { tamanho: 26, fundo: ESCURO, cor: VERDE, borda: VERDE, alinhar: "dir" };
  let y = 32;
  for (const [ativo, texto] of [
    [oferta.oficial, "OFICIAL ML"],
    [oferta.lowest30d, "MENOR PREÇO EM 30 DIAS"],
    [oferta.lojaOficial, "LOJA OFICIAL"],
  ] as Array<[boolean | undefined, string]>) {
    if (!ativo) continue;
    pilula(ctx, texto, W - 32, y, selo);
    y += 60;
  }

  // Faixa de preço.
  const topo = FOTO_H;
  ctx.fillStyle = "#111111";
  ctx.fillRect(0, topo, W, PRECO_H);
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillStyle = VERDE;
  ctx.font = `800 78px ${FONTE}`;
  ctx.fillText(brl(oferta.price), 40, topo + 92);

  ctx.textAlign = "right";
  ctx.fillStyle = "#9a9a9a";
  ctx.font = `22px ${FONTE}`;
  ctx.fillText(
    contraMedia
      ? `preço médio no Mercado Livre · ${oferta.sellers} vendedores`
      : "preço anunciado pelo vendedor",
    W - 40,
    topo + 48,
  );
  ctx.fillStyle = "#e5e5e5";
  ctx.font = `600 40px ${FONTE}`;
  const referencia = brl(oferta.originalPrice);
  ctx.fillText(referencia, W - 40, topo + 96);
  // riscado por cima do preço de referência
  const larguraRef = ctx.measureText(referencia).width;
  ctx.strokeStyle = "#e5e5e5";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(W - 40 - larguraRef, topo + 82);
  ctx.lineTo(W - 40, topo + 82);
  ctx.stroke();

  // Faixa da marca.
  ctx.drawImage(marca, 0, FOTO_H + PRECO_H, W, MARCA_H);

  return new Promise((ok, falha) => {
    canvas.toBlob(
      (blob) => (blob ? ok(blob) : falha(new Error("toBlob falhou"))),
      "image/jpeg",
      0.88,
    );
  });
}

/** Nome de arquivo amigável para download/compartilhamento. */
export const nomeArquivo = (oferta: Oferta) => `oferta-${oferta.id.toLowerCase()}.jpg`;

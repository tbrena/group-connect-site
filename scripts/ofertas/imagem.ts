/**
 * Monta a imagem da postagem (1080 de largura):
 *
 *   ┌──────────────────────────────┐
 *   │ [−27% vs. média]  [OFICIAL ML]│  foto do produto sobre branco
 *   │          (produto)           │
 *   ├──────────────────────────────┤
 *   │ R$ 42,99     média R$ 58,88  │  faixa de preço
 *   ├──────────────────────────────┤
 *   │ logo  ofertaninja.online …   │  faixa da marca (assets/marca.png)
 *   └──────────────────────────────┘
 *
 * Os textos são desenhados por SVG; a fonte é a que o sistema tiver
 * (Segoe UI no Windows, DejaVu Sans no GitHub Actions) — a faixa da marca é
 * pré-renderizada justamente para não depender disso.
 */
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const W = 1080;
/** Altura da área da foto. */
const FOTO_H = 980;
/** Margem branca ao redor do produto. */
const MARGEM = 40;
const PRECO_H = 130;
const MARCA = path.resolve(import.meta.dirname, "assets/marca.png");
const FONTE = "Segoe UI, DejaVu Sans, Arial, Helvetica, sans-serif";
const VERDE = "#39ff14";
const ESCURO = "#0a0a0a";

export interface DadosImagem {
  thumbnail: string;
  price: number;
  discount: number;
  base: "media" | "vendedor";
  averagePrice: number | null;
  claimedPrice: number | null;
  sellers: number;
  oficial: boolean;
  lowest30d: boolean;
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

let marcaCache: Promise<{ buf: Buffer; altura: number }> | undefined;
function marca() {
  return (marcaCache ??= (async () => {
    const buf = await fs.readFile(MARCA);
    const { height } = await sharp(buf).metadata();
    return { buf, altura: height ?? 150 };
  })());
}

/** Pílula com texto; largura estimada pelo número de caracteres (SVG não mede texto). */
function pilula(
  texto: string,
  x: number,
  y: number,
  opts: { tamanho: number; fundo: string; cor: string; borda?: string; alinhar?: "esq" | "dir" },
): string {
  const largura = Math.round(texto.length * opts.tamanho * 0.62 + opts.tamanho * 1.2);
  const altura = Math.round(opts.tamanho * 1.7);
  const x0 = opts.alinhar === "dir" ? x - largura : x;
  const borda = opts.borda ? `stroke="${opts.borda}" stroke-width="3"` : "";
  return `
    <rect x="${x0}" y="${y}" rx="${altura / 2}" width="${largura}" height="${altura}" fill="${opts.fundo}" ${borda}/>
    <text x="${x0 + largura / 2}" y="${y + altura * 0.68}" text-anchor="middle" font-family="${FONTE}"
          font-size="${opts.tamanho}" font-weight="800" fill="${opts.cor}">${esc(texto)}</text>`;
}

/** Camada SVG com pílulas sobre a foto e a faixa de preço. */
function sobreposicao(d: DadosImagem): string {
  const partes: string[] = [];

  // Pílula de desconto no canto superior esquerdo da foto.
  const rotulo = d.base === "media" ? `${d.discount}% ABAIXO DA MÉDIA` : `${d.discount}% OFF`;
  partes.push(pilula(rotulo, 32, 32, { tamanho: 38, fundo: VERDE, cor: ESCURO }));

  // Selos no canto superior direito, empilhados.
  let y = 32;
  if (d.oficial) {
    partes.push(
      pilula("OFICIAL ML", W - 32, y, {
        tamanho: 26,
        fundo: ESCURO,
        cor: VERDE,
        borda: VERDE,
        alinhar: "dir",
      }),
    );
    y += 60;
  }
  if (d.lowest30d) {
    partes.push(
      pilula("MENOR PREÇO EM 30 DIAS", W - 32, y, {
        tamanho: 26,
        fundo: ESCURO,
        cor: VERDE,
        borda: VERDE,
        alinhar: "dir",
      }),
    );
  }

  // Faixa de preço.
  const topo = FOTO_H;
  const referencia = d.base === "media" ? d.averagePrice : d.claimedPrice;
  const rotuloRef =
    d.base === "media"
      ? `preço médio no Mercado Livre · ${d.sellers} vendedores`
      : "preço anunciado pelo vendedor";
  partes.push(`
    <rect x="0" y="${topo}" width="${W}" height="${PRECO_H}" fill="#111111"/>
    <text x="40" y="${topo + 92}" font-family="${FONTE}" font-size="78" font-weight="800" fill="${VERDE}">${esc(brl(d.price))}</text>`);
  if (referencia != null) {
    partes.push(`
    <text x="${W - 40}" y="${topo + 48}" text-anchor="end" font-family="${FONTE}" font-size="22" fill="#9a9a9a">${esc(rotuloRef)}</text>
    <text x="${W - 40}" y="${topo + 96}" text-anchor="end" font-family="${FONTE}" font-size="40" font-weight="600" fill="#e5e5e5" text-decoration="line-through">${esc(brl(referencia))}</text>`);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${FOTO_H + PRECO_H}">${partes.join("")}</svg>`;
}

export async function imagemDaOferta(d: DadosImagem): Promise<Buffer> {
  const res = await fetch(d.thumbnail);
  if (!res.ok) throw new Error(`foto ${res.status}: ${d.thumbnail}`);
  const foto = Buffer.from(await res.arrayBuffer());
  const { buf: faixaMarca, altura: marcaH } = await marca();

  const produto = await sharp(foto)
    .resize(W - MARGEM * 2, FOTO_H - MARGEM * 2, { fit: "contain", background: "#ffffff" })
    .toBuffer();

  return sharp({
    create: { width: W, height: FOTO_H + PRECO_H + marcaH, channels: 3, background: "#ffffff" },
  })
    .composite([
      { input: produto, left: MARGEM, top: MARGEM },
      { input: Buffer.from(sobreposicao(d)), left: 0, top: 0 },
      { input: faixaMarca, left: 0, top: FOTO_H + PRECO_H },
    ])
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
}

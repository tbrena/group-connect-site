/**
 * Monta a imagem da postagem: foto do produto em 1080×1080 sobre fundo branco
 * + faixa da marca (assets/marca.png) embaixo. Sai um JPEG pronto para o
 * sendPhoto do Telegram.
 */
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const LADO = 1080;
const MARCA = path.resolve(import.meta.dirname, "assets/marca.png");
/** Margem branca ao redor do produto, para a foto não encostar na faixa. */
const MARGEM = 40;

let marcaCache: Promise<{ buf: Buffer; altura: number }> | undefined;
function marca() {
  return (marcaCache ??= (async () => {
    const buf = await fs.readFile(MARCA);
    const { height } = await sharp(buf).metadata();
    return { buf, altura: height ?? 150 };
  })());
}

export async function imagemComMarca(urlFoto: string): Promise<Buffer> {
  const res = await fetch(urlFoto);
  if (!res.ok) throw new Error(`foto ${res.status}: ${urlFoto}`);
  const foto = Buffer.from(await res.arrayBuffer());
  const { buf: faixa, altura } = await marca();

  const produto = await sharp(foto)
    .resize(LADO - MARGEM * 2, LADO - MARGEM * 2, {
      fit: "contain",
      background: "#ffffff",
    })
    .toBuffer();

  return sharp({
    create: { width: LADO, height: LADO + altura, channels: 3, background: "#ffffff" },
  })
    .composite([
      { input: produto, left: MARGEM, top: MARGEM },
      { input: faixa, left: 0, top: LADO },
    ])
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
}

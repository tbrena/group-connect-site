/**
 * Gera assets/marca.png — a faixa com logo + site + canal que vai embaixo da
 * foto do produto nas postagens. Pré-renderizada aqui (uma vez) para a imagem
 * sair idêntica no PC e no GitHub Actions, sem depender das fontes instaladas.
 *
 *   npm run ofertas:marca      # depois de mudar texto/cores abaixo
 */
import path from "node:path";
import sharp from "sharp";

export const MARCA_W = 1080;
export const MARCA_H = 150;
const SAIDA = path.resolve(import.meta.dirname, "assets/marca.png");
const LOGO = path.resolve(import.meta.dirname, "../../public/preco-ninja-logo.png");
const FONTE = "Segoe UI, Arial, Helvetica, sans-serif";

const logo = await sharp(LOGO).resize(118, 118).png().toBuffer();

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${MARCA_W}" height="${MARCA_H}">
  <rect width="${MARCA_W}" height="${MARCA_H}" fill="#0a0a0a"/>
  <rect width="${MARCA_W}" height="3" fill="#39ff14"/>
  <text x="172" y="72" font-family="${FONTE}" font-size="46" font-weight="800" fill="#39ff14">ofertaninja.online</text>
  <text x="172" y="114" font-family="${FONTE}" font-size="27" fill="#bdbdbd">Telegram <tspan fill="#ffffff" font-weight="600">@preconinjaofertas</tspan>  ·  ofertas com desconto de verdade</text>
</svg>`;

await sharp(Buffer.from(svg))
  .composite([{ input: logo, left: 36, top: 16 }])
  .png()
  .toFile(SAIDA);

const meta = await sharp(SAIDA).metadata();
console.log(`marca.png gerada: ${meta.width}x${meta.height} → ${SAIDA}`);

import { useEffect, useRef, useState } from "react";
import {
  BadgeCheck,
  Check,
  Clock,
  Copy,
  Download,
  ExternalLink,
  MessageCircle,
  Store,
  TrendingDown,
  Truck,
} from "lucide-react";

import { gerarImagemOferta, nomeArquivo } from "@/lib/imagem-oferta";
import {
  brl,
  conferidaEm,
  dataHoraBR,
  ehNova,
  formatarVendas,
  linkCompartilharWhatsApp,
  quandoBR,
  textoWhatsApp,
  type Oferta,
} from "@/lib/ofertas";
import { pixelOferta, pixelShare } from "@/lib/pixel";
import { linkRastreado } from "@/lib/rastreio";

/** O navegador consegue compartilhar arquivos (celulares e alguns desktops)? */
function suportaCompartilharArquivo(): boolean {
  try {
    const teste = new File([new Blob(["x"])], "t.jpg", { type: "image/jpeg" });
    return (
      typeof navigator.share === "function" && navigator.canShare?.({ files: [teste] }) === true
    );
  } catch {
    return false;
  }
}

interface Props {
  oferta: Oferta;
  /** Mostra os botões de compartilhar no WhatsApp e copiar o texto. */
  compartilhar?: boolean;
}

export function OfertaCard({ oferta, compartilhar = false }: Props) {
  const [copiado, setCopiado] = useState(false);
  const [comArquivo, setComArquivo] = useState(false);
  const [gerando, setGerando] = useState(false);
  // A imagem começa a ser gerada no toque (pointerdown) para o share() ainda estar
  // dentro do gesto do usuário quando o clique chega — Safari é rígido com isso.
  const imagem = useRef<Promise<Blob> | null>(null);
  const contraMedia = oferta.base === "media" && oferta.averagePrice != null;
  const link = linkRastreado(oferta, "site");

  useEffect(() => setComArquivo(suportaCompartilharArquivo()), []);

  const prepararImagem = () => (imagem.current ??= gerarImagemOferta(oferta));

  async function copiar() {
    try {
      await navigator.clipboard.writeText(textoWhatsApp(oferta));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // clipboard indisponível (http, permissão) — o botão do WhatsApp continua funcionando
    }
  }

  /** Imagem + texto pelo compartilhamento nativo (WhatsApp usa o texto como legenda). */
  async function compartilharComImagem() {
    const texto = textoWhatsApp(oferta);
    setGerando(true);
    try {
      const blob = await prepararImagem();
      const arquivo = new File([blob], nomeArquivo(oferta), { type: "image/jpeg" });
      await navigator.share({ files: [arquivo], text: texto });
      pixelShare(oferta);
    } catch (err) {
      if ((err as Error).name === "AbortError") return; // a pessoa fechou o menu
      imagem.current = null;
      // Sem imagem (ou share negado): vai só o texto, como antes.
      try {
        await navigator.share({ text: texto });
      } catch {
        window.open(linkCompartilharWhatsApp(oferta), "_blank", "noopener");
      }
    } finally {
      setGerando(false);
    }
  }

  /** Salva a imagem — para quem compartilha pelo WhatsApp Web no computador. */
  async function baixarImagem() {
    setGerando(true);
    try {
      const blob = await prepararImagem();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nomeArquivo(oferta);
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      imagem.current = null;
    } finally {
      setGerando(false);
    }
  }

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-secondary/50 transition-colors hover:border-ninja/40 hover:bg-secondary">
      {/* Área da foto com altura fixa: todos os cards iguais, independente da imagem. */}
      <a
        href={link}
        onClick={() => pixelOferta(oferta)}
        target="_blank"
        rel="noopener noreferrer sponsored"
        className="relative block h-36 bg-white sm:h-40"
      >
        <img
          src={oferta.image}
          alt={oferta.title}
          loading="lazy"
          className="h-full w-full object-contain p-3"
        />
        <span
          title={
            contraMedia
              ? "Abaixo do preço médio dos outros vendedores do Mercado Livre"
              : "Desconto sobre o preço declarado pelo vendedor"
          }
          className="absolute top-2 left-2 rounded-full bg-ninja px-2 py-0.5 text-[11px] font-bold text-ninja-foreground"
        >
          {contraMedia ? `−${oferta.discount}%` : `${oferta.discount}% OFF`}
        </span>
        <span className="absolute top-2 right-2 flex flex-col items-end gap-1">
          {oferta.lowest30d && (
            <span
              title="Menor preço que o bot observou nos últimos 30 dias"
              className="inline-flex items-center gap-1 rounded-full bg-ninja-foreground/90 px-2 py-0.5 text-[10px] font-semibold text-ninja"
            >
              <TrendingDown className="h-3 w-3" /> Menor em 30d
            </span>
          )}
          {oferta.oficial && (
            <span
              title="Desconto de campanha oficial do Mercado Livre"
              className="inline-flex items-center gap-1 rounded-full bg-ninja-foreground/90 px-2 py-0.5 text-[10px] font-semibold text-ninja"
            >
              <BadgeCheck className="h-3 w-3" /> Oficial ML
            </span>
          )}
        </span>
      </a>

      <div className="flex flex-1 flex-col p-3">
        {(oferta.categoria || oferta.lojaOficial || ehNova(oferta)) && (
          <p className="mb-1 flex items-center justify-between gap-2 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
            <span>
              {oferta.categoria}
              {ehNova(oferta) && (
                <span
                  title="Entrou no site nas últimas 24 horas"
                  className="ml-1.5 rounded bg-ninja/15 px-1.5 py-0.5 font-bold text-ninja"
                >
                  Nova
                </span>
              )}
              {oferta.marketplace === "shopee" && (
                <span className="ml-1.5 rounded bg-orange-500/15 px-1.5 py-0.5 text-orange-400">
                  Shopee
                </span>
              )}
            </span>
            {oferta.lojaOficial && (
              <span
                title={`Vendido por loja oficial${oferta.loja ? `: ${oferta.loja}` : ""}`}
                className="inline-flex items-center gap-1 truncate text-ninja"
              >
                <Store className="h-3 w-3 shrink-0" /> {oferta.loja ?? "Loja oficial"}
              </span>
            )}
          </p>
        )}
        <h3 className="line-clamp-2 text-xs font-semibold text-foreground sm:text-sm">
          {oferta.title}
        </h3>
        <div className="mt-2">
          <span className="text-base font-extrabold text-ninja sm:text-lg">
            {brl(oferta.price)}
          </span>
          {contraMedia ? (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              média {brl(oferta.averagePrice!)} · {oferta.sellers} vendedores
            </p>
          ) : (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              De <span className="line-through">{brl(oferta.originalPrice)}</span>
              {oferta.marketplace === "shopee" && (
                <span title="Na Shopee cada anúncio é único: não dá para comparar com outros vendedores, então o desconto é o que a loja informa.">
                  {" "}
                  · desconto informado pela loja
                </span>
              )}
            </p>
          )}
        </div>

        {oferta.vendas != null && oferta.vendas >= 100 && (
          <p className="mt-1.5 text-[11px] font-semibold text-orange-400">
            🛍️ {formatarVendas(oferta.vendas)} vendidos
          </p>
        )}
        <p
          className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground"
          title={`Preço conferido pelo bot em ${dataHoraBR(conferidaEm(oferta))} (horário de Brasília)`}
        >
          <Clock className="h-3 w-3" /> conferido {quandoBR(conferidaEm(oferta))}
        </p>

        <div className="mt-auto flex items-center justify-between pt-3 text-[11px] text-muted-foreground">
          {oferta.freeShipping ? (
            <span className="inline-flex items-center gap-1">
              <Truck className="h-3.5 w-3.5" /> Frete grátis
            </span>
          ) : (
            <span />
          )}
          <a
            href={link}
            onClick={() => pixelOferta(oferta)}
            target="_blank"
            rel="noopener noreferrer sponsored"
            className="inline-flex items-center gap-1 font-medium text-ninja hover:underline"
          >
            Ver oferta <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>

        {compartilhar && (
          <div className="mt-4 flex gap-2">
            {comArquivo ? (
              <button
                type="button"
                onPointerDown={prepararImagem}
                onClick={compartilharComImagem}
                disabled={gerando}
                title="Compartilhar imagem e texto (WhatsApp usa o texto como legenda)"
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-ninja px-4 py-2.5 text-sm font-bold text-ninja-foreground transition-transform hover:scale-[1.03] disabled:opacity-70"
              >
                <MessageCircle className="h-4 w-4" />
                {gerando ? "Preparando…" : "Compartilhar"}
              </button>
            ) : (
              <a
                href={linkCompartilharWhatsApp(oferta)}
                onClick={() => pixelShare(oferta)}
                target="_blank"
                rel="noopener noreferrer"
                title="Compartilhar texto no WhatsApp (neste navegador não dá para anexar a imagem; use o botão de baixar)"
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-ninja px-4 py-2.5 text-sm font-bold text-ninja-foreground transition-transform hover:scale-[1.03]"
              >
                <MessageCircle className="h-4 w-4" />
                Compartilhar
              </a>
            )}
            <button
              type="button"
              onPointerDown={prepararImagem}
              onClick={baixarImagem}
              disabled={gerando}
              aria-label="Baixar imagem da oferta"
              title="Baixar imagem (foto + preço + marca)"
              className="inline-flex items-center justify-center rounded-full border border-border px-3 text-muted-foreground transition-colors hover:border-ninja/40 hover:text-ninja disabled:opacity-70"
            >
              <Download className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={copiar}
              aria-label="Copiar texto da oferta"
              title="Copiar texto"
              className="inline-flex items-center justify-center rounded-full border border-border px-3 text-muted-foreground transition-colors hover:border-ninja/40 hover:text-ninja"
            >
              {copiado ? <Check className="h-4 w-4 text-ninja" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

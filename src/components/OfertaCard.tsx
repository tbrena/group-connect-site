import { useState } from "react";
import {
  BadgeCheck,
  Check,
  Clock,
  Copy,
  ExternalLink,
  MessageCircle,
  Store,
  TrendingDown,
  Truck,
} from "lucide-react";

import {
  brl,
  conferidaEm,
  dataHoraBR,
  linkCompartilharWhatsApp,
  quandoBR,
  textoWhatsApp,
  type Oferta,
} from "@/lib/ofertas";
import { linkRastreado } from "@/lib/rastreio";

interface Props {
  oferta: Oferta;
  /** Mostra os botões de compartilhar no WhatsApp e copiar o texto. */
  compartilhar?: boolean;
}

export function OfertaCard({ oferta, compartilhar = false }: Props) {
  const [copiado, setCopiado] = useState(false);
  const contraMedia = oferta.base === "media" && oferta.averagePrice != null;
  const link = linkRastreado(oferta, "site");

  async function copiar() {
    try {
      await navigator.clipboard.writeText(textoWhatsApp(oferta));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // clipboard indisponível (http, permissão) — o botão do WhatsApp continua funcionando
    }
  }

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-secondary/50 transition-colors hover:border-ninja/40 hover:bg-secondary">
      {/* Área da foto com altura fixa: todos os cards iguais, independente da imagem. */}
      <a
        href={link}
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
        {(oferta.categoria || oferta.lojaOficial) && (
          <p className="mb-1 flex items-center justify-between gap-2 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
            <span>{oferta.categoria}</span>
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
            </p>
          )}
        </div>

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
            target="_blank"
            rel="noopener noreferrer sponsored"
            className="inline-flex items-center gap-1 font-medium text-ninja hover:underline"
          >
            Ver oferta <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>

        {compartilhar && (
          <div className="mt-4 flex gap-2">
            <a
              href={linkCompartilharWhatsApp(oferta)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-ninja px-4 py-2.5 text-sm font-bold text-ninja-foreground transition-transform hover:scale-[1.03]"
            >
              <MessageCircle className="h-4 w-4" />
              Compartilhar
            </a>
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

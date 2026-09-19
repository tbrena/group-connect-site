import { useState } from "react";
import { BadgeCheck, Check, Copy, ExternalLink, MessageCircle, Truck } from "lucide-react";

import { brl, linkCompartilharWhatsApp, textoWhatsApp, type Oferta } from "@/lib/ofertas";

interface Props {
  oferta: Oferta;
  /** Mostra os botões de compartilhar no WhatsApp e copiar o texto. */
  compartilhar?: boolean;
}

export function OfertaCard({ oferta, compartilhar = false }: Props) {
  const [copiado, setCopiado] = useState(false);

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
      <a
        href={oferta.url}
        target="_blank"
        rel="noopener noreferrer sponsored"
        className="relative block aspect-square bg-white"
      >
        <img
          src={oferta.image}
          alt={oferta.title}
          loading="lazy"
          className="h-full w-full object-contain p-4"
        />
        <span className="absolute top-3 left-3 rounded-full bg-ninja px-3 py-1 text-xs font-bold text-ninja-foreground">
          {oferta.discount}% OFF
        </span>
        {oferta.oficial && (
          <span
            title="Desconto de campanha oficial do Mercado Livre"
            className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-full bg-ninja-foreground/90 px-2.5 py-1 text-[11px] font-semibold text-ninja"
          >
            <BadgeCheck className="h-3.5 w-3.5" /> Oficial ML
          </span>
        )}
      </a>

      <div className="flex flex-1 flex-col p-4">
        <h3 className="line-clamp-2 text-sm font-semibold text-foreground">{oferta.title}</h3>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-xs text-muted-foreground line-through">
            {brl(oferta.originalPrice)}
          </span>
          <span className="text-lg font-extrabold text-ninja">{brl(oferta.price)}</span>
        </div>

        <div className="mt-auto flex items-center justify-between pt-4 text-xs text-muted-foreground">
          {oferta.freeShipping ? (
            <span className="inline-flex items-center gap-1">
              <Truck className="h-3.5 w-3.5" /> Frete grátis
            </span>
          ) : (
            <span />
          )}
          <a
            href={oferta.url}
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

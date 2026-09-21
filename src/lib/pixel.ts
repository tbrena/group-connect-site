import { META_PIXEL_ID } from "@/lib/site";

/**
 * Meta Pixel (Facebook/Instagram Ads). O ID é público por natureza — vai no HTML de
 * qualquer site que anuncia — por isso mora em site.ts. Vazio = pixel desligado, e
 * todas as chamadas aqui viram no-op.
 *
 * Eventos que o site dispara (nomes padrão do Meta, para otimização de campanha):
 *   PageView    — toda página e toda navegação interna
 *   Lead        — clique em "Entrar no grupo" (WhatsApp) ou no canal do Telegram
 *   ViewContent — clique numa oferta (id + preço, para públicos e retargeting)
 *   Share       — compartilhou uma oferta (evento personalizado)
 */
type Fbq = ((...args: unknown[]) => void) & { queue?: unknown[]; loaded?: boolean };

declare global {
  interface Window {
    fbq?: Fbq;
    _fbq?: Fbq;
  }
}

export const pixelAtivo = () => Boolean(META_PIXEL_ID);

/** Snippet oficial do Meta, inline no <head> (só quando há ID). */
export const PIXEL_SNIPPET = META_PIXEL_ID
  ? `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${META_PIXEL_ID}');fbq('track','PageView');`
  : "";

/** Dispara um evento; silencioso quando o pixel está desligado ou bloqueado. */
export function pixel(evento: string, params?: Record<string, unknown>, personalizado = false) {
  if (typeof window === "undefined" || !window.fbq) return;
  try {
    window.fbq(personalizado ? "trackCustom" : "track", evento, params ?? {});
  } catch {
    // bloqueador de anúncios etc. — nunca pode quebrar a página
  }
}

export const pixelPageView = () => pixel("PageView");

export const pixelLead = (origem: "whatsapp" | "telegram") =>
  pixel("Lead", { content_name: origem });

export const pixelOferta = (o: { id: string; title: string; price: number; categoria?: string }) =>
  pixel("ViewContent", {
    content_ids: [o.id],
    content_name: o.title.slice(0, 100),
    content_type: "product",
    content_category: o.categoria,
    value: o.price,
    currency: "BRL",
  });

export const pixelShare = (o: { id: string }) => pixel("Share", { content_ids: [o.id] }, true);

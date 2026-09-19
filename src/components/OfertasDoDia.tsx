import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { OfertaCard } from "@/components/OfertaCard";
import { useOfertas } from "@/lib/ofertas";

/** Quantas ofertas a home mostra; o resto fica em /promo. */
const NA_HOME = 6;

/** Prévia das últimas ofertas publicadas pelo bot. Some sozinha se não houver nenhuma. */
export function OfertasDoDia() {
  const ofertas = useOfertas();

  if (ofertas.length === 0) return null;

  return (
    <section className="relative z-10 px-6 py-16">
      <div className="mx-auto max-w-5xl">
        <h2 className="text-center text-2xl font-bold text-foreground sm:text-3xl">
          Ofertas do <span className="text-ninja">dia</span>
        </h2>
        <p className="mt-3 text-center text-sm text-muted-foreground">
          As últimas que passaram pela nossa curadoria. Preço pode mudar a qualquer momento.
        </p>

        <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {ofertas.slice(0, NA_HOME).map((oferta) => (
            <li key={oferta.id}>
              <OfertaCard oferta={oferta} />
            </li>
          ))}
        </ul>

        {ofertas.length > NA_HOME && (
          <div className="mt-10 text-center">
            <Link
              to="/promo"
              className="inline-flex items-center gap-2 rounded-full border border-ninja/40 bg-ninja/10 px-6 py-3 text-sm font-bold text-ninja transition-colors hover:bg-ninja/20"
            >
              Ver todas as {ofertas.length} promoções
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}

import Link from "next/link";
import { AlertTriangle } from "lucide-react";

export interface CriticalItem {
  id: string;
  number: string | null;
  reason: string;
  department: string;
}

/**
 * Bandeau d'alerte du Responsable : chaque arrêt de production encore « À valider ».
 * Sobre (DESIGN.md §5) : fond rouge très clair, texte rouge foncé, bord gauche rouge ; 40 px par demande.
 * Recalculé à chaque navigation (composant serveur) ; disparaît dès que la DA est décidée.
 */
export function CriticalBanner({ items }: { items: CriticalItem[] }) {
  if (items.length === 0) return null;
  return (
    <div role="alert" className="border-b border-l-4 border-b-red-200 border-l-red-600 bg-red-50 px-4 text-sm text-red-800" data-testid="critical-banner">
      <ul>
        {items.map((it) => (
          <li key={it.id} className="flex min-h-10 flex-wrap items-center gap-x-3 gap-y-0.5 py-1" data-testid="critical-banner-item">
            <AlertTriangle className="size-4 shrink-0" aria-hidden />
            <span className="font-semibold">Arrêt de production : {it.number ?? "DA"} à valider</span>
            <span className="min-w-0 flex-1 truncate">
              {it.department} – {it.reason}
            </span>
            <Link
              href={`/achats/demandes/${it.id}`}
              className="inline-flex min-h-8 items-center font-semibold underline underline-offset-2 hover:no-underline"
              data-testid="critical-banner-link"
            >
              Ouvrir la demande
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

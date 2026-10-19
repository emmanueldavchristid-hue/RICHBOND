import Link from "next/link";
import { AlertTriangle } from "lucide-react";

export interface CriticalItem {
  id: string;
  number: string | null;
  reason: string;
  department: string;
}

/**
 * Bandeau rouge persistant du Responsable : chaque arrêt de production encore « À valider ».
 * Recalculé à chaque navigation (composant serveur) ; disparaît dès que la DA est décidée.
 */
export function CriticalBanner({ items }: { items: CriticalItem[] }) {
  if (items.length === 0) return null;
  return (
    <div role="alert" className="bg-red-700 px-4 py-2 text-sm text-white" data-testid="critical-banner">
      <ul className="space-y-1">
        {items.map((it) => (
          <li key={it.id} className="flex flex-wrap items-center gap-x-3 gap-y-1" data-testid="critical-banner-item">
            <AlertTriangle className="size-4 shrink-0" aria-hidden />
            <span className="font-semibold">
              Arrêt de production : {it.number ?? "DA"} à valider
            </span>
            <span className="min-w-0 truncate">
              {it.department} – {it.reason}
            </span>
            <Link href={`/achats/demandes/${it.id}`} className="inline-flex min-h-11 items-center font-semibold underline underline-offset-2" data-testid="critical-banner-link">
              Ouvrir la demande
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

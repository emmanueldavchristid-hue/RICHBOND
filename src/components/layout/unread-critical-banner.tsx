import Link from "next/link";
import { AlertTriangle } from "lucide-react";

/** Bandeau d'accueil : alertes CRITIQUES non lues de l'utilisateur, lien vers la liste filtrée. */
export function UnreadCriticalBanner({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <div
      role="alert"
      className="border-b border-l-4 border-b-red-200 border-l-red-600 bg-red-50 px-4 text-sm text-red-800"
      data-testid="unread-critical-banner"
    >
      <div className="flex min-h-10 flex-wrap items-center gap-x-3 gap-y-0.5 py-1">
        <AlertTriangle className="size-4 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 font-semibold">
          Vous avez {count} alerte{count > 1 ? "s" : ""} critique{count > 1 ? "s" : ""} non lue{count > 1 ? "s" : ""}
        </span>
        <Link
          href="/notifications?gravite=CRITIQUE&nonLues=1"
          className="inline-flex min-h-8 items-center font-semibold underline underline-offset-2 hover:no-underline"
          data-testid="unread-critical-banner-link"
        >
          Voir les alertes
        </Link>
      </div>
    </div>
  );
}

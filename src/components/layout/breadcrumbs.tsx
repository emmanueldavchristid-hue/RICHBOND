"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";

const LABELS: Record<string, string> = {
  accueil: "Accueil",
  achats: "Achats",
  demandes: "Demandes d'achat",
  commandes: "Bons de commande",
  "a-commander": "À commander",
  factures: "Factures",
  nouvelle: "Nouvelle",
  nouveau: "Nouveau",
  modifier: "Modifier",
  import: "Import",
  stock: "Stock",
  articles: "Articles",
  receptions: "Réceptions",
  mouvements: "Mouvements",
  sorties: "Sorties",
  reappro: "Réapprovisionnement",
  "non-conformites": "Non-conformités",
  fournisseurs: "Fournisseurs",
  rapports: "Rapports",
  parametres: "Paramètres",
  utilisateurs: "Utilisateurs",
  journal: "Journal d'activité",
  licence: "Licence",
  reglages: "Réglages",
  depots: "Dépôts",
  devises: "Devises et taux",
  services: "Services",
  "mon-compte": "Mon compte",
  notifications: "Notifications",
  "acces-refuse": "Accès refusé",
};

/** Fil d'Ariane déduit de l'adresse : « Achats / Demandes d'achat / Fiche ». Un identifiant devient « Fiche ». */
export function Breadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);
  const crumbs = segments.map((seg, i) => ({
    label: LABELS[seg] ?? "Fiche",
    href: "/" + segments.slice(0, i + 1).join("/"),
    // Les segments qui n'ont pas de page propre (ex. « /achats/commandes/nouvelle ») restent des libellés simples.
  }));
  if (crumbs.length === 0) return null;
  return (
    <nav aria-label="Fil d'Ariane" className="min-w-0" data-testid="breadcrumb">
      <ol className="flex items-center gap-1 text-[13px] text-muted-foreground">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li key={c.href} className={last ? "min-w-0" : "hidden items-center gap-1 sm:flex"}>
              {last ? (
                <span aria-current="page" className="block truncate font-medium text-foreground">
                  {c.label}
                </span>
              ) : (
                <>
                  <Link href={c.href} className="rounded px-0.5 transition-colors hover:text-foreground">
                    {c.label}
                  </Link>
                  <ChevronRight className="size-3.5 shrink-0 opacity-60" aria-hidden />
                </>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

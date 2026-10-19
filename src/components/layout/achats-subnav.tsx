"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export interface SubnavItem {
  label: string;
  href: string;
  /** Identifiant de test. */
  id: string;
}

/** Sous-navigation de la rubrique Achats : Demandes · À commander · Commandes (cibles tactiles de 44 px). */
export function AchatsSubnav({ items }: { items: SubnavItem[] }) {
  const pathname = usePathname();
  const active = (item: SubnavItem) => {
    if (item.id === "commandes") return pathname.startsWith("/achats/commandes") && !pathname.startsWith("/achats/commandes/a-commander");
    return pathname === item.href || pathname.startsWith(item.href + "/");
  };
  return (
    <nav aria-label="Rubriques des achats" className="mb-4 flex gap-1 overflow-x-auto border-b" data-testid="achats-subnav">
      {items.map((item) => (
        <Link
          key={item.id}
          href={item.href}
          aria-current={active(item) ? "page" : undefined}
          data-testid={`achats-subnav-${item.id}`}
          className={cn(
            "inline-flex min-h-11 items-center border-b-2 px-4 text-sm font-medium whitespace-nowrap",
            active(item) ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

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

/** Sous-navigation de la rubrique Achats : Demandes · À commander · Commandes (contrôle segmenté, cibles tactiles de 44 px sur tablette). */
export function AchatsSubnav({ items }: { items: SubnavItem[] }) {
  const pathname = usePathname();
  const active = (item: SubnavItem) => {
    if (item.id === "commandes") return pathname.startsWith("/achats/commandes") && !pathname.startsWith("/achats/commandes/a-commander");
    return pathname === item.href || pathname.startsWith(item.href + "/");
  };
  return (
    <nav aria-label="Rubriques des achats" className="mb-5 inline-flex max-w-full gap-0.5 overflow-x-auto rounded-lg bg-muted p-1" data-testid="achats-subnav">
      {items.map((item) => (
        <Link
          key={item.id}
          href={item.href}
          aria-current={active(item) ? "page" : undefined}
          data-testid={`achats-subnav-${item.id}`}
          className={cn(
            "inline-flex min-h-9 items-center rounded-md px-3.5 text-[13px] font-medium whitespace-nowrap transition-colors max-lg:min-h-11",
            active(item) ? "bg-card text-foreground ring-1 ring-border" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

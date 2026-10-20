import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Conteneur d'onglets soulignés (2 px --primary). Les onglets sont des liens : l'état vit dans l'URL. */
export function TabsNav({ children, label, testId, className }: { children: ReactNode; label: string; testId?: string; className?: string }) {
  return (
    <div role="tablist" aria-label={label} className={cn("mb-4 flex gap-1 overflow-x-auto border-b", className)} data-testid={testId}>
      {children}
    </div>
  );
}

/** Onglet souligné avec compteur en pastille neutre (`alert` : pastille ambre quand il y a quelque chose à traiter). */
export function TabLink({
  href,
  active,
  label,
  count,
  alert = false,
  testId,
}: {
  href: string;
  active: boolean;
  label: string;
  count?: number;
  alert?: boolean;
  testId?: string;
}) {
  return (
    <Link
      href={href}
      role="tab"
      aria-selected={active}
      data-testid={testId}
      className={cn(
        "-mb-px inline-flex min-h-11 items-center gap-2 border-b-2 px-3.5 text-sm font-medium whitespace-nowrap transition-colors",
        active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
      {count !== undefined && count > 0 ? (
        <span
          data-testid={testId ? `${testId}-count` : undefined}
          className={cn(
            "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-medium tabular-nums",
            alert ? "bg-amber-100 text-amber-900" : "bg-muted text-muted-foreground",
          )}
        >
          {count}
        </span>
      ) : null}
    </Link>
  );
}

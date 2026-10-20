import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * En-tête de page : un seul titre fort (24 px / 600), description courte atténuée, action principale à droite.
 * `meta` : ligne de badges (statut, urgence) affichée sous le titre.
 */
export function PageHeader({
  title,
  description,
  actions,
  meta,
  titleClassName,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  meta?: ReactNode;
  titleClassName?: string;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-x-4 gap-y-3" data-testid="page-header">
      <div className="min-w-0">
        <h1 className={titleClassName ?? "page-title"} data-testid="page-title">
          {title}
        </h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
        {meta ? <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** Squelette d'une page de liste : en-tête, barre de filtres et lignes de tableau. */
export function PageSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-4" aria-hidden data-testid="page-skeleton">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-80" />
        </div>
        <Skeleton className="h-9 w-32" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-8 w-32 rounded-full" />
        <Skeleton className="h-8 w-32 rounded-full" />
      </div>
      <div className="overflow-hidden rounded-xl border bg-card">
        <Skeleton className="h-10 rounded-none" />
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex h-11 items-center gap-4 border-t px-3">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}

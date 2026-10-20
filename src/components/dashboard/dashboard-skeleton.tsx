import { Skeleton } from "@/components/ui/skeleton";

/** Squelette de l'accueil : cartes « à traiter », cartes KPI et deux panneaux, pour ne jamais afficher de page blanche. */
export function DashboardSkeleton({ kpis = true }: { kpis?: boolean }) {
  return (
    <div className="space-y-5" aria-hidden data-testid="dash-skeleton">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="space-y-2 rounded-xl border bg-card p-4">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-8 w-14" />
          </div>
        ))}
      </div>
      {kpis ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="space-y-2 rounded-xl border bg-card p-4">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-28" />
              <Skeleton className="h-3 w-32" />
            </div>
          ))}
        </div>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-3 rounded-xl border bg-card p-4 lg:col-span-3">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-[260px] w-full" />
        </div>
        <div className="space-y-3 rounded-xl border bg-card p-4 lg:col-span-2">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-[260px] w-full" />
        </div>
      </div>
    </div>
  );
}

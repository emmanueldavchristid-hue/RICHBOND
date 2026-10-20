import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { PageHeader } from "@/components/page-header";

/** Squelette de l'accueil pendant le chargement : jamais de page blanche. */
export default function Loading() {
  return (
    <>
      <PageHeader title="Accueil" description="Ce qui demande votre attention aujourd'hui." />
      <DashboardSkeleton />
    </>
  );
}

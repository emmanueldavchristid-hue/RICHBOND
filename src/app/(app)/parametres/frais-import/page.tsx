import { Suspense } from "react";
import type { Metadata } from "next";
import { PageHeader, PageSkeleton } from "@/components/page-header";
import { requirePageAction } from "@/modules/auth/session";
import { listCostTypes } from "@/modules/import-files";
import { CostTypesManager } from "./cost-types-manager";

export const metadata: Metadata = { title: "Frais d'approche import – RICHBOND" };

async function CostTypesContent() {
  // Réservé au Responsable Achats.
  const user = await requirePageAction("importCost.configure");
  const { types, defaultCoefficients } = await listCostTypes(user);
  return <CostTypesManager types={types} defaultCoefficients={defaultCoefficients} />;
}

export default function CostTypesPage() {
  return (
    <>
      <PageHeader
        title="Frais d'approche import"
        description="Types de frais et pourcentages de la valeur des marchandises utilisés pour estimer le coût de revient d'un dossier, par mode de transport. Ils sont remplacés par les montants réels au fil des factures."
      />
      <Suspense fallback={<PageSkeleton />}>
        <CostTypesContent />
      </Suspense>
    </>
  );
}

import { Suspense } from "react";
import type { Metadata } from "next";
import { PageHeader, PageSkeleton } from "@/components/page-header";
import { ReorderBoard } from "@/components/stock/reorder-board";
import { can } from "@/lib/permissions";
import { requirePageAction } from "@/modules/auth/session";
import { listReorder } from "@/modules/stock";

export const metadata: Metadata = { title: "Réapprovisionnement – RICHBOND" };

async function ReorderContent() {
  const user = await requirePageAction("stock.reorder");
  const rows = await listReorder(user);
  // La clé force un état neuf (cases, quantités) quand la liste change après une création de DA.
  const key = rows.map((r) => `${r.itemId}:${r.existingRequest?.id ?? ""}`).join("|");
  return <ReorderBoard key={key} rows={rows} canCreate canApplyThresholds={can(user, "stock.thresholds")} />;
}

export default function ReorderPage() {
  return (
    <>
      <PageHeader
        title="Réapprovisionnement"
        description="Articles sous leur point de commande, commandes en cours comprises. Cochez, ajustez les quantités puis créez les demandes d'achat."
      />
      <Suspense fallback={<PageSkeleton rows={6} />}>
        <ReorderContent />
      </Suspense>
    </>
  );
}

import { Suspense } from "react";
import type { Metadata } from "next";
import { PageHeader, PageSkeleton } from "@/components/page-header";
import { SimpleRefManager } from "@/components/referentials/simple-ref-manager";
import { requirePageAction } from "@/modules/auth/session";
import { listWarehouses } from "@/modules/warehouses";
import { createWarehouseAction, setWarehouseActiveAction, updateWarehouseAction } from "./actions";

export const metadata: Metadata = { title: "Dépôts – RICHBOND" };

async function WarehousesContent() {
  await requirePageAction("settings.manage");
  const rows = await listWarehouses();
  return (
    <SimpleRefManager
      rows={rows}
      labels={{ singular: "dépôt", plural: "Dépôts", newButton: "Nouveau dépôt", nameLabel: "Nom du dépôt", created: "créé", testId: "warehouse" }}
      createAction={createWarehouseAction}
      updateAction={updateWarehouseAction}
      setActiveAction={setWarehouseActiveAction}
    />
  );
}

export default function DepotsPage() {
  return (
    <>
      <PageHeader title="Dépôts" description="Lieux de stockage. Un dépôt par défaut d'un article actif ne peut pas être désactivé." />
      <Suspense fallback={<PageSkeleton />}>
        <WarehousesContent />
      </Suspense>
    </>
  );
}

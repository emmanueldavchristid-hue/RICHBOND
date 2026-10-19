import { Suspense } from "react";
import type { Metadata } from "next";
import { PageHeader, PageSkeleton } from "@/components/page-header";
import { requirePageAction } from "@/modules/auth/session";
import { listOrderableLines, orderFormOptions } from "@/modules/purchase-orders";
import { ToOrderList } from "./to-order-list";

export const metadata: Metadata = { title: "À commander – RICHBOND" };

async function ToOrderContent() {
  const user = await requirePageAction("purchaseOrder.create");
  const [{ groups }, options] = await Promise.all([listOrderableLines(user), orderFormOptions(user)]);
  return (
    <ToOrderList
      groups={groups}
      suppliers={options.suppliers.map((s) => ({ id: s.id, label: `${s.code} – ${s.name}`, allowed: s.allowed }))}
      preselect={false}
    />
  );
}

export default function ToOrderPage() {
  return (
    <>
      <PageHeader
        title="À commander"
        description="Lignes de demandes d'achat validées qui ne sont pas encore commandées, regroupées par fournisseur. Cochez, puis créez le bon de commande."
      />
      <Suspense fallback={<PageSkeleton />}>
        <ToOrderContent />
      </Suspense>
    </>
  );
}

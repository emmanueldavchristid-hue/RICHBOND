import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader, PageSkeleton } from "@/components/page-header";
import { getNow } from "@/lib/clock";
import { todayAbidjan } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { requirePageAction } from "@/modules/auth/session";
import { listOrderableLinesOfRequest, orderFormOptions } from "@/modules/purchase-orders";
import { getSettings } from "@/modules/settings";
import { ToOrderList } from "../a-commander/to-order-list";
import { OrderForm, type OrderFormValues } from "../order-form";

export const metadata: Metadata = { title: "Nouveau bon de commande – RICHBOND" };

async function NewOrderContent({ searchParams }: { searchParams: PageProps<"/achats/commandes/nouvelle">["searchParams"] }) {
  const user = await requirePageAction("purchaseOrder.create");
  const sp = await searchParams;
  const da = typeof sp.da === "string" && sp.da ? sp.da : null;
  const options = await orderFormOptions(user);

  // Depuis la fiche d'une DA : lignes de cette DA pré-cochées, fournisseur principal proposé.
  if (da) {
    const { groups } = await listOrderableLinesOfRequest(user, da);
    return (
      <ToOrderList
        groups={groups}
        suppliers={options.suppliers.map((s) => ({ id: s.id, label: `${s.code} – ${s.name}`, allowed: s.allowed }))}
        preselect
        requestLabel="cette demande"
      />
    );
  }

  const [settings, { now }] = await Promise.all([getSettings(), getNow()]);
  const initial: OrderFormValues = {
    supplierId: "",
    origin: "DA",
    directReason: "",
    currencyCode: "XOF",
    paymentTerm: "J30",
    paymentTermNote: "",
    incoterm: "",
    incotermPlace: "",
    warehouseId: options.warehouses[0]?.id ?? "",
    deliveryAddress: options.warehouses[0]?.address ?? "",
    requestedDate: todayAbidjan(now),
    supplierRef: "",
    notes: "",
    internalNote: "",
    lines: [],
    charges: [],
  };
  return (
    <OrderForm
      mode="create"
      initial={initial}
      options={options}
      defaultVatRate={settings.purchaseOrderDefaultVatRate}
      today={todayAbidjan(now)}
      canDirect={can(user, "purchaseOrder.approve")}
    />
  );
}

export default function NewOrderPage({ searchParams }: PageProps<"/achats/commandes/nouvelle">) {
  return (
    <>
      <Link href="/achats/commandes" className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Retour aux bons de commande
      </Link>
      <PageHeader
        title="Nouveau bon de commande"
        description="Un bon = un fournisseur. Rattachez les lignes à des demandes d'achat validées (ou, pour le Responsable, commande directe avec motif)."
      />
      <Suspense fallback={<PageSkeleton />}>
        <NewOrderContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

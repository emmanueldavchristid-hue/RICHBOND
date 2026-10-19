import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader, PageSkeleton } from "@/components/page-header";
import { getNow } from "@/lib/clock";
import { todayAbidjan } from "@/lib/dates";
import { isBusinessError } from "@/lib/errors";
import { can } from "@/lib/permissions";
import { requirePageAction } from "@/modules/auth/session";
import { getOrder, orderFormOptions } from "@/modules/purchase-orders";
import { getSettings } from "@/modules/settings";
import { OrderForm, type FormLine, type OrderFormValues } from "../../order-form";

export const metadata: Metadata = { title: "Modifier le bon de commande – RICHBOND" };

const day = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : "");

async function EditContent({ params }: { params: PageProps<"/achats/commandes/[id]/modifier">["params"] }) {
  const { id } = await params;
  const user = await requirePageAction("purchaseOrder.create");
  const { now } = await getNow();
  let po;
  try {
    po = await getOrder(user, id, now);
  } catch (e) {
    if (isBusinessError(e) && e.code === "NOT_FOUND") notFound();
    if (isBusinessError(e) && e.code === "FORBIDDEN") redirect("/acces-refuse");
    throw e;
  }
  // Seul un brouillon modifiable par cet utilisateur porte le bouton « Modifier » : sinon retour à la fiche.
  if (!po.canEdit) redirect(`/achats/commandes/${id}`);

  const [options, settings] = await Promise.all([orderFormOptions(user), getSettings()]);
  const lines: FormLine[] = po.lines.map((l) => ({
    key: l.id,
    itemId: l.itemId,
    code: l.item?.code ?? "",
    name: l.item?.name ?? "",
    freeDesignation: l.freeDesignation ?? "",
    unit: l.unit,
    quantity: String(l.quantity),
    unitPrice: String(l.unitPrice),
    discountPct: String(l.discountPct),
    vatRate: String(Number(l.vatRate)),
    supplierRef: l.supplierRef ?? "",
    note: l.note ?? "",
    allocations: l.allocations.map((a) => ({
      requestLineId: a.requestLineId,
      qty: String(a.qty),
      label: `${a.requestNumber ?? "DA"} ligne ${a.requestLineNo}`,
      unit: a.unit,
    })),
  }));
  const initial: OrderFormValues = {
    supplierId: po.supplierId,
    origin: po.origin === "DIRECT" ? "DIRECT" : "DA",
    directReason: po.directReason ?? "",
    currencyCode: po.currencyCode,
    paymentTerm: po.paymentTerm,
    paymentTermNote: po.paymentTermNote ?? "",
    incoterm: po.incoterm ?? "",
    incotermPlace: po.incotermPlace ?? "",
    warehouseId: po.warehouseId,
    deliveryAddress: po.deliveryAddress,
    requestedDate: day(po.requestedDate),
    supplierRef: po.supplierRef ?? "",
    notes: po.notes ?? "",
    internalNote: po.internalNote ?? "",
    lines,
    charges: po.charges.map((c) => ({ key: c.id, label: c.label, amount: String(c.amount), vatRate: String(Number(c.vatRate)) })),
  };
  return (
    <>
      <PageHeader
        title={`Modifier ${po.displayNumber}`}
        description={po.version > 1 ? `Avenant (version ${po.version}) : corrigez puis soumettez-le à nouveau.` : "Corrigez le brouillon puis enregistrez-le ou soumettez-le."}
      />
      {po.version > 1 ? (
        <p className="mb-4 rounded-lg border border-violet-300 bg-violet-50 p-3 text-sm text-violet-950" data-testid="po-form-amendment">
          Avenant en cours : la version précédente reste valable tant que celle-ci n&apos;est pas validée. Vous pouvez l&apos;abandonner depuis la fiche.
        </p>
      ) : null}
      <OrderForm
        key={new Date(po.updatedAt).toISOString()}
        mode="edit"
        orderId={po.id}
        updatedAt={new Date(po.updatedAt).toISOString()}
        displayNumber={po.displayNumber}
        initial={initial}
        options={options}
        defaultVatRate={settings.purchaseOrderDefaultVatRate}
        today={todayAbidjan(now)}
        canDirect={can(user, "purchaseOrder.approve")}
        lockSupplier={po.version > 1}
      />
    </>
  );
}

export default function EditOrderPage({ params }: PageProps<"/achats/commandes/[id]/modifier">) {
  return (
    <>
      <Link href="/achats/commandes" className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Retour aux bons de commande
      </Link>
      <Suspense fallback={<PageSkeleton />}>
        <EditContent params={params} />
      </Suspense>
    </>
  );
}

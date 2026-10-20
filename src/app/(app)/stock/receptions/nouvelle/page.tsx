import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { DateCell } from "@/components/date-cell";
import { DocNumber } from "@/components/doc-number";
import { EmptyState } from "@/components/empty-state";
import { PageHeader, PageSkeleton } from "@/components/page-header";
import { ReceiptEntryForm } from "@/components/receiving/receipt-entry-form";
import { StatusBadge } from "@/components/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { getNow } from "@/lib/clock";
import { todayAbidjan } from "@/lib/dates";
import { isBusinessError } from "@/lib/errors";
import { pickParams, type SearchParams } from "@/lib/search-params";
import { cn } from "@/lib/utils";
import { requirePageAction } from "@/modules/auth/session";
import { getOrderForReceipt } from "@/modules/receiving";
import { listWarehouses } from "@/modules/warehouses";

export const metadata: Metadata = { title: "Nouvelle réception – RICHBOND" };

const BackLink = () => (
  <Link href="/stock/receptions" className={cn(buttonVariants({ variant: "outline" }), "h-11 px-4")} data-testid="rec-back">
    Retour aux livraisons attendues
  </Link>
);

async function NewReceiptContent({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requirePageAction("receipt.create");
  const { bc } = pickParams(await searchParams, ["bc"]);
  if (!bc) {
    return (
      <>
        <PageHeader title="Nouvelle réception" description="Une réception se fait toujours à partir d'un bon de commande." />
        <EmptyState title="Aucun bon de commande choisi" description="Choisissez la livraison reçue dans la liste des livraisons attendues.">
          <BackLink />
        </EmptyState>
      </>
    );
  }
  let order;
  try {
    order = await getOrderForReceipt(user, { orderId: bc });
  } catch (e) {
    if (isBusinessError(e) && e.code === "NOT_FOUND") notFound();
    if (isBusinessError(e) && e.code === "FORBIDDEN") redirect("/acces-refuse");
    throw e;
  }
  const [warehouses, { now }] = await Promise.all([listWarehouses({ activeOnly: true }), getNow()]);

  return (
    <>
      <PageHeader
        title={`Réception du ${order.number}`}
        description={`${order.supplierName} · dépôt prévu : ${order.warehouseName}`}
        meta={
          <>
            <StatusBadge status={order.status} />
            <span className="text-sm text-muted-foreground">
              Attendue le <DateCell value={order.expectedDate} />
            </span>
          </>
        }
        actions={<BackLink />}
      />
      {!order.receivable ? (
        <div
          role="alert"
          className="mb-4 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
          data-testid="rec-not-receivable"
        >
          <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden />
          <p>
            <span className="font-medium">
              Ce bon <DocNumber value={order.number} /> ne peut pas être réceptionné.
            </span>{" "}
            {order.notReceivableReason}
          </p>
        </div>
      ) : (
        <ReceiptEntryForm order={order} warehouses={warehouses.map((w) => ({ id: w.id, label: `${w.code} – ${w.name}` }))} today={todayAbidjan(now)} />
      )}
    </>
  );
}

export default function NewReceiptPage({ searchParams }: PageProps<"/stock/receptions/nouvelle">) {
  return (
    <Suspense fallback={<PageSkeleton rows={4} />}>
      <NewReceiptContent searchParams={searchParams} />
    </Suspense>
  );
}

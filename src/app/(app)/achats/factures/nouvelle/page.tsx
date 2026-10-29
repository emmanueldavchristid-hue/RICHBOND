import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader, PageSkeleton } from "@/components/page-header";
import { getNow } from "@/lib/clock";
import { todayAbidjan } from "@/lib/dates";
import { requirePageAction } from "@/modules/auth/session";
import { listSupplierOptions } from "@/modules/suppliers";
import { InvoiceForm } from "../invoice-form";

export const metadata: Metadata = { title: "Nouvelle facture – RICHBOND" };

async function NewInvoiceContent() {
  await requirePageAction("invoice.manage");
  const [suppliers, { now }] = await Promise.all([listSupplierOptions(), getNow()]);
  return <InvoiceForm suppliers={suppliers.map((s) => ({ id: s.id, label: `${s.code} – ${s.name}` }))} today={todayAbidjan(now)} />;
}

export default function NewInvoicePage() {
  return (
    <>
      <Link href="/achats/factures" className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Retour aux factures
      </Link>
      <PageHeader title="Nouvelle facture" description="Recopiez la facture du fournisseur : le rapprochement avec le bon de commande et la réception se fait à l'enregistrement." />
      <Suspense fallback={<PageSkeleton />}>
        <NewInvoiceContent />
      </Suspense>
    </>
  );
}

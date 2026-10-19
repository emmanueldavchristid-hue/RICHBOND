import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader, PageSkeleton } from "@/components/page-header";
import { requirePageAction } from "@/modules/auth/session";
import { listCurrencies } from "@/modules/currencies";
import { EMPTY_SUPPLIER, SupplierForm } from "../supplier-form";

export const metadata: Metadata = { title: "Nouveau fournisseur – RICHBOND" };

async function NewSupplierContent() {
  await requirePageAction("supplier.manage");
  const currencies = await listCurrencies({ activeOnly: true });
  return <SupplierForm mode="create" initial={EMPTY_SUPPLIER} currencies={currencies.map((c) => ({ code: c.code, name: c.name }))} />;
}

export default function NewSupplierPage() {
  return (
    <>
      <Link href="/fournisseurs" className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Retour aux fournisseurs
      </Link>
      <PageHeader title="Nouveau fournisseur" description="Un fournisseur créé peut être placé « en évaluation » avant sa première commande." />
      <Suspense fallback={<PageSkeleton />}>
        <NewSupplierContent />
      </Suspense>
    </>
  );
}

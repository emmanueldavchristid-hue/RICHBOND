import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader, PageSkeleton } from "@/components/page-header";
import { requirePageAction } from "@/modules/auth/session";
import { listSupplierOptions } from "@/modules/suppliers";
import { ImportFileForm } from "./import-file-form";

export const metadata: Metadata = { title: "Nouveau dossier import – RICHBOND" };

async function NewImportContent() {
  await requirePageAction("importFile.manage", { scope: "IMPORT" });
  const suppliers = await listSupplierOptions();
  return <ImportFileForm suppliers={suppliers.filter((s) => s.type === "IMPORT").map((s) => ({ id: s.id, label: `${s.code} – ${s.name}`, currencyCode: s.currencyCode }))} />;
}

export default function NewImportFilePage() {
  return (
    <>
      <Link href="/import" className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Retour aux dossiers import
      </Link>
      <PageHeader
        title="Nouveau dossier import"
        description="Un dossier regroupe les bons de commande d'une même expédition : jalons, frais d'approche et coût de revient. Les 10 jalons et les frais estimés sont créés automatiquement."
      />
      <Suspense fallback={<PageSkeleton />}>
        <NewImportContent />
      </Suspense>
    </>
  );
}

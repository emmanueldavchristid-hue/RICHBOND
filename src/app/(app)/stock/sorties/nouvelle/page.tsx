import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader, PageSkeleton } from "@/components/page-header";
import { IssueForm } from "@/components/stock/issue-form";
import { requirePageAction } from "@/modules/auth/session";
import { listDepartments } from "@/modules/departments";
import { listWarehouses } from "@/modules/warehouses";

export const metadata: Metadata = { title: "Nouvelle sortie – RICHBOND" };

async function NewIssueContent() {
  await requirePageAction("stock.issue");
  const [warehouses, departments] = await Promise.all([listWarehouses({ activeOnly: true }), listDepartments({ activeOnly: true })]);
  return (
    <IssueForm
      warehouses={warehouses.map((w) => ({ id: w.id, name: w.name }))}
      departments={departments.map((d) => ({ id: d.id, name: d.name }))}
    />
  );
}

export default function NewIssuePage() {
  return (
    <>
      <Link href="/stock/sorties" className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground" data-testid="sor-back">
        <ArrowLeft className="size-4" /> Retour aux sorties
      </Link>
      <PageHeader title="Nouvelle sortie" description="Indiquez qui demande, pourquoi, puis les articles remis. Le stock diminue à la validation." />
      <Suspense fallback={<PageSkeleton rows={4} />}>
        <NewIssueContent />
      </Suspense>
    </>
  );
}

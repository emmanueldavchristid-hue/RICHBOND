import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader, PageSkeleton } from "@/components/page-header";
import { PrepareInventoryForm } from "@/components/inventory/prepare-form";
import { requirePageAction } from "@/modules/auth/session";
import { listWarehouses } from "@/modules/warehouses";

export const metadata: Metadata = { title: "Préparer un inventaire – RICHBOND" };

async function NewInventoryContent() {
  await requirePageAction("inventory.prepare");
  const warehouses = await listWarehouses({ activeOnly: true });
  return <PrepareInventoryForm warehouses={warehouses.map((w) => ({ id: w.id, name: w.name }))} />;
}

export default function NewInventoryPage() {
  return (
    <>
      <Link href="/stock/inventaires" className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground" data-testid="inv-back">
        <ArrowLeft className="size-4" /> Retour aux inventaires
      </Link>
      <PageHeader title="Préparer un inventaire" description="Choisissez le dépôt et les articles. Le magasin les comptera sans voir les quantités attendues." />
      <Suspense fallback={<PageSkeleton rows={4} />}>
        <NewInventoryContent />
      </Suspense>
    </>
  );
}

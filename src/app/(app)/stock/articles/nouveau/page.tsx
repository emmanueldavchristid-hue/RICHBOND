import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader, PageSkeleton } from "@/components/page-header";
import { requirePageAction } from "@/modules/auth/session";
import { listFamilies } from "@/modules/items";
import { listSupplierOptions } from "@/modules/suppliers";
import { listWarehouses } from "@/modules/warehouses";
import { EMPTY_ITEM, ItemForm } from "../item-form";

export const metadata: Metadata = { title: "Nouvel article – RICHBOND" };

async function NewItemContent() {
  await requirePageAction("item.manage");
  const [warehouses, suppliers, families] = await Promise.all([
    listWarehouses({ activeOnly: true }),
    listSupplierOptions(),
    listFamilies(),
  ]);
  return (
    <ItemForm
      mode="create"
      initial={EMPTY_ITEM}
      warehouses={warehouses.map(({ id, code, name }) => ({ id, code, name }))}
      suppliers={suppliers.map(({ id, code, name, status }) => ({ id, code, name, status }))}
      families={families}
    />
  );
}

export default function NewItemPage() {
  return (
    <>
      <Link href="/stock/articles" className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Retour aux articles
      </Link>
      <PageHeader title="Nouvel article" description="Renseignez l'essentiel : vous pourrez ajouter les fournisseurs et la photo ensuite." />
      <Suspense fallback={<PageSkeleton />}>
        <NewItemContent />
      </Suspense>
    </>
  );
}

import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { BlindCountScreen } from "@/components/inventory/blind-count-screen";
import { PageHeader, PageSkeleton } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { isBusinessError } from "@/lib/errors";
import { requirePageAction } from "@/modules/auth/session";
import { getBlindSheet } from "@/modules/inventory";

export const metadata: Metadata = { title: "Comptage – RICHBOND" };

async function CountContent({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageAction("inventory.count");
  const { id } = await params;
  // Feuille aveugle : le DTO ne contient ni quantité théorique, ni PMP, ni valeur.
  const sheet = await getBlindSheet(user, { countId: id }).catch((e: unknown) => {
    if (isBusinessError(e) && e.code === "INVENTAIRE_INTROUVABLE") notFound();
    throw e;
  });
  if (sheet.status !== "EN_COMPTAGE") redirect(`/stock/inventaires/${id}`);
  return (
    <>
      <PageHeader
        title={`Comptage ${sheet.number}`}
        titleClassName="page-title"
        description={sheet.warehouse.name}
        meta={<StatusBadge status={sheet.status} />}
      />
      <BlindCountScreen sheet={sheet} />
    </>
  );
}

export default function CountPage({ params }: PageProps<"/stock/inventaires/[id]/comptage">) {
  return (
    <>
      <Link href="/stock/inventaires" className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground" data-testid="inv-back">
        <ArrowLeft className="size-4" /> Retour aux inventaires
      </Link>
      <Suspense fallback={<PageSkeleton rows={6} />}>
        <CountContent params={params} />
      </Suspense>
    </>
  );
}

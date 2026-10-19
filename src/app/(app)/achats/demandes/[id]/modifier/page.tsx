import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader, PageSkeleton } from "@/components/page-header";
import { getNow } from "@/lib/clock";
import { todayAbidjan } from "@/lib/dates";
import { isBusinessError } from "@/lib/errors";
import { requirePageAction } from "@/modules/auth/session";
import { listDepartments } from "@/modules/departments";
import { getRequest } from "@/modules/purchase-requests";
import { viewerCanSeePrices } from "@/modules/settings";
import { RequestForm, type LineDraft, type RequestFormValues } from "../../request-form";

export const metadata: Metadata = { title: "Modifier la demande d'achat – RICHBOND" };

async function EditContent({ params }: { params: PageProps<"/achats/demandes/[id]/modifier">["params"] }) {
  const { id } = await params;
  const user = await requirePageAction("purchaseRequest.view");
  const showPrices = await viewerCanSeePrices(user);
  let pr;
  try {
    pr = await getRequest(user, id, { showPrices });
  } catch (e) {
    if (isBusinessError(e) && e.code === "NOT_FOUND") notFound();
    if (isBusinessError(e) && e.code === "FORBIDDEN") redirect("/acces-refuse");
    throw e;
  }
  // Seules les DA modifiables ont un bouton « edit » : sinon retour à la fiche.
  if (!pr.actions.includes("edit")) redirect(`/achats/demandes/${id}`);

  const [departments, { now }] = await Promise.all([listDepartments({ activeOnly: true }), getNow()]);
  const deptChoices = departments.map((d) => ({ id: d.id, name: d.name }));
  if (!deptChoices.some((d) => d.id === pr.department.id)) deptChoices.push({ id: pr.department.id, name: pr.department.name });

  const lines: LineDraft[] = pr.lines.map((l) => ({
    key: l.id,
    itemId: l.itemId,
    code: l.item?.code ?? "",
    name: l.item?.name ?? "",
    freeDesignation: l.freeDesignation ?? "",
    quantity: String(l.quantity),
    unit: l.unit,
    purchaseUnit: l.item?.purchaseUnit ?? l.unit,
    stockUnit: l.item?.stockUnit ?? l.unit,
    price: l.estimatedUnitPrice != null ? String(l.estimatedUnitPrice) : "",
  }));
  const initial: RequestFormValues = {
    departmentId: pr.departmentId,
    requesterName: pr.requesterName,
    reason: pr.reason,
    urgency: pr.urgency,
    neededBy: new Date(pr.neededBy).toISOString().slice(0, 10),
    type: pr.type,
    lines,
  };
  return (
    <>
      <PageHeader title={`Modifier ${pr.displayNumber}`} description="Corrigez la demande puis enregistrez ou soumettez-la à nouveau." />
      {pr.status === "A_COMPLETER" ? (
        <p className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950" data-testid="pr-return-hint">
          Le Responsable Achats a demandé des compléments : consultez le commentaire dans la chronologie de la fiche, corrigez puis soumettez à nouveau (le numéro est conservé).
        </p>
      ) : null}
      <RequestForm
        key={new Date(pr.updatedAt).toISOString()}
        mode="edit"
        requestId={pr.id}
        updatedAt={new Date(pr.updatedAt).toISOString()}
        displayNumber={pr.displayNumber}
        initial={initial}
        departments={deptChoices}
        attachments={pr.attachments}
        isWarehouse={pr.kind === "REAPPRO"}
        showPrices={showPrices}
        today={todayAbidjan(now)}
      />
    </>
  );
}

export default function EditRequestPage({ params }: PageProps<"/achats/demandes/[id]/modifier">) {
  return (
    <>
      <Link href="/achats/demandes" className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Retour aux demandes d&apos;achat
      </Link>
      <Suspense fallback={<PageSkeleton />}>
        <EditContent params={params} />
      </Suspense>
    </>
  );
}

import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader, PageSkeleton } from "@/components/page-header";
import { getNow } from "@/lib/clock";
import { todayAbidjan } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { requirePageAction } from "@/modules/auth/session";
import { listDepartments } from "@/modules/departments";
import { viewerCanSeePrices } from "@/modules/settings";
import { RequestForm, type RequestFormValues } from "../request-form";

export const metadata: Metadata = { title: "Nouvelle demande d'achat – RICHBOND" };

async function NewRequestContent() {
  const user = await requirePageAction("purchaseRequest.view");
  if (!can(user, "purchaseRequest.create") && !can(user, "purchaseRequest.createReplenishment")) redirect("/acces-refuse");
  const [departments, showPrices, { now }] = await Promise.all([listDepartments({ activeOnly: true }), viewerCanSeePrices(user), getNow()]);
  const initial: RequestFormValues = {
    departmentId: "",
    requesterName: user.name,
    reason: "",
    urgency: "NORMALE",
    neededBy: "",
    type: "A_DEFINIR",
    lines: [],
  };
  return (
    <RequestForm
      mode="create"
      initial={initial}
      departments={departments.map((d) => ({ id: d.id, name: d.name }))}
      isWarehouse={user.role === "MAGASINIER"}
      showPrices={showPrices}
      today={todayAbidjan(now)}
    />
  );
}

export default function NewRequestPage() {
  return (
    <>
      <Link href="/achats/demandes" className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Retour aux demandes d&apos;achat
      </Link>
      <PageHeader title="Nouvelle demande d'achat" description="Renseignez le besoin, ajoutez les articles, puis enregistrez un brouillon ou soumettez la demande." />
      <Suspense fallback={<PageSkeleton />}>
        <NewRequestContent />
      </Suspense>
    </>
  );
}

import { Suspense } from "react";
import type { Metadata } from "next";
import { PageHeader, PageSkeleton } from "@/components/page-header";
import { SimpleRefManager } from "@/components/referentials/simple-ref-manager";
import { requirePageAction } from "@/modules/auth/session";
import { listDepartments } from "@/modules/departments";
import { createDepartmentAction, setDepartmentActiveAction, updateDepartmentAction } from "./actions";

export const metadata: Metadata = { title: "Services demandeurs – RICHBOND" };

async function DepartmentsContent() {
  await requirePageAction("settings.manage");
  const rows = await listDepartments();
  return (
    <SimpleRefManager
      rows={rows}
      labels={{ singular: "service", plural: "Services", newButton: "Nouveau service", nameLabel: "Nom du service", created: "créé", testId: "department" }}
      createAction={createDepartmentAction}
      updateAction={updateDepartmentAction}
      setActiveAction={setDepartmentActiveAction}
    />
  );
}

export default function ServicesPage() {
  return (
    <>
      <PageHeader title="Services demandeurs" description="Services qui émettent des demandes d'achat (Production, Maintenance, Qualité…)." />
      <Suspense fallback={<PageSkeleton />}>
        <DepartmentsContent />
      </Suspense>
    </>
  );
}

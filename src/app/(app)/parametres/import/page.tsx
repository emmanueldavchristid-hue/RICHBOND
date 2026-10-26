import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader, PageSkeleton } from "@/components/page-header";
import { can } from "@/lib/permissions";
import { requirePageAction } from "@/modules/auth/session";
import { ImportWizard } from "./import-wizard";

export const metadata: Metadata = { title: "Import de données – RICHBOND" };

async function ImportContent() {
  const user = await requirePageAction(null);
  // Réservé au Responsable des achats et au Super-admin.
  if (!can(user, "import.manage")) redirect("/acces-refuse");
  return <ImportWizard />;
}

export default function ImportPage() {
  return (
    <>
      <PageHeader
        title="Import de données"
        description="Chargez vos articles, fournisseurs et stocks de départ depuis un fichier Excel ou CSV. Rien n'est enregistré avant votre accord."
      />
      <Suspense fallback={<PageSkeleton />}>
        <ImportContent />
      </Suspense>
    </>
  );
}

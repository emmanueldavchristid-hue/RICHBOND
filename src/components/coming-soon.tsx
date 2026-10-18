import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Hammer } from "lucide-react";
import { can, type Action } from "@/lib/permissions";
import { requirePageAction } from "@/modules/auth/session";
import { EmptyState } from "@/components/empty-state";
import { PageHeader, PageSkeleton } from "@/components/page-header";

async function ComingSoonContent({ title, anyOf }: { title: string; anyOf: Action[] }) {
  const user = await requirePageAction(null);
  if (!anyOf.some((a) => can(user, a))) redirect("/acces-refuse");
  return (
    <>
      <PageHeader title={title} />
      <EmptyState
        icon={<Hammer className="size-8" />}
        title="Bientôt disponible"
        description="Cette rubrique sera ouverte dans une prochaine version de l'application."
      />
    </>
  );
}

/** Rubrique prévue dans un lot ultérieur. Au moins un des droits `anyOf` est requis. */
export function ComingSoon({ title, anyOf }: { title: string; anyOf: Action[] }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ComingSoonContent title={title} anyOf={anyOf} />
    </Suspense>
  );
}

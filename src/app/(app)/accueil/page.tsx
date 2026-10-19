import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader, PageSkeleton } from "@/components/page-header";
import { roleLabel, visibleNav } from "@/lib/permissions";
import { requirePageAction } from "@/modules/auth/session";

export const metadata: Metadata = { title: "Accueil – RICHBOND" };

async function AccueilContent() {
  const user = await requirePageAction(null);
  const links = visibleNav(user).filter((n) => n.href !== "/accueil");
  return (
    <>
      <p className="mb-4 text-sm text-muted-foreground" data-testid="accueil-bonjour">
        Bonjour {user.name}. Connecté en tant que {roleLabel(user)}.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="accueil-liens">
        {links.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className="rounded-lg border bg-card p-5 text-base font-medium shadow-sm transition-colors hover:bg-muted"
          >
            {n.label}
          </Link>
        ))}
      </div>
    </>
  );
}

export default function AccueilPage() {
  return (
    <>
      <PageHeader title="Accueil" description="Choisissez une rubrique pour commencer." />
      <Suspense fallback={<PageSkeleton />}>
        <AccueilContent />
      </Suspense>
    </>
  );
}

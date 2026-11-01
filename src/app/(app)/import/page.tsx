import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Plus } from "lucide-react";
import { PageHeader, PageSkeleton } from "@/components/page-header";
import { getNow } from "@/lib/clock";
import { can } from "@/lib/permissions";
import { pickParams, type SearchParams } from "@/lib/search-params";
import { requirePageAction } from "@/modules/auth/session";
import { listImportFiles, listImportFilesSchema } from "@/modules/import-files";
import { serialize } from "@/modules/referentials/serialize";
import { listSupplierOptions } from "@/modules/suppliers";
import { ImportFilesTable } from "./import-files-table";

export const metadata: Metadata = { title: "Dossiers import – RICHBOND" };

const KEYS = ["q", "statut", "jalon", "fournisseur", "retard", "page", "taille"] as const;

async function ImportContent({ searchParams }: { searchParams: Promise<SearchParams> }) {
  // Un Acheteur « local » est renvoyé vers « Accès refusé » (le service le refuse aussi).
  const user = await requirePageAction("importFile.view", { scope: "IMPORT" });
  const raw = pickParams(await searchParams, KEYS);
  const { now } = await getNow();
  const candidate = {
    status: raw.statut,
    milestone: raw.jalon,
    supplierId: raw.fournisseur,
    lateOnly: raw.retard === "1" ? true : undefined,
    search: raw.q,
    page: raw.page ? Number(raw.page) : 1,
    pageSize: raw.taille ? Number(raw.taille) : 25,
  };
  const parsed = listImportFilesSchema.safeParse(candidate);
  const [list, suppliers] = await Promise.all([listImportFiles(user, parsed.success ? parsed.data : {}, now), listSupplierOptions()]);
  const pageCount = Math.max(1, Math.ceil(list.total / list.pageSize));

  return (
    <>
      {!parsed.success ? (
        <p role="alert" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" data-testid="imp-bad-filters">
          Certains filtres de l&apos;adresse sont invalides : ils ont été ignorés.
        </p>
      ) : null}
      {list.lateCount > 0 ? (
        <Link
          href="/import?retard=1"
          className="mb-4 flex min-h-11 items-center gap-2 rounded-lg border-l-4 border-red-600 bg-red-50 px-3 py-2 text-sm text-red-900 hover:bg-red-100/70"
          data-testid="imp-late-counter"
        >
          <AlertTriangle className="size-4 shrink-0" aria-hidden />
          <span>
            <strong>{list.lateCount}</strong> {list.lateCount > 1 ? "dossiers ont" : "dossier a"} un jalon en retard. Afficher uniquement {list.lateCount > 1 ? "ces dossiers" : "ce dossier"}.
          </span>
        </Link>
      ) : null}
      <ImportFilesTable
        rows={serialize(list.rows)}
        pageInfo={{ total: list.total, page: list.page, taille: list.pageSize, pageCount }}
        suppliers={suppliers.filter((s) => s.type === "IMPORT").map((s) => ({ id: s.id, label: `${s.code} – ${s.name}` }))}
      />
      {can(user, "importFile.manage", { scope: "IMPORT" }) ? null : (
        <p className="mt-3 text-xs text-muted-foreground">Vous consultez les dossiers import en lecture seule.</p>
      )}
    </>
  );
}

async function CreateButton() {
  const user = await requirePageAction("importFile.view", { scope: "IMPORT" });
  if (!can(user, "importFile.manage", { scope: "IMPORT" })) return null;
  return (
    <Link
      href="/import/nouveau"
      data-testid="imp-create"
      className="inline-flex h-11 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/80"
    >
      <Plus className="size-4" aria-hidden /> Nouveau dossier import
    </Link>
  );
}

export default function ImportPage({ searchParams }: PageProps<"/import">) {
  return (
    <>
      <PageHeader
        title="Dossiers import"
        description="Suivi des achats à l'étranger, du proforma à la réception au magasin, avec le coût de revient réel."
        actions={
          <Suspense fallback={null}>
            <CreateButton />
          </Suspense>
        }
      />
      <Suspense fallback={<PageSkeleton />}>
        <ImportContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

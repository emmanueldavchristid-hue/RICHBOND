import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { DateCell } from "@/components/date-cell";
import { InventoryActionsBar } from "@/components/inventory/actions-bar";
import { INVENTORY_STATUS_HINTS, KIND_LABELS } from "@/components/inventory/labels";
import { OpenCountButton } from "@/components/inventory/inventory-actions";
import { PrepareLines } from "@/components/inventory/prepare-lines";
import { InventoryReviewPanel } from "@/components/inventory/review-panel";
import { PageHeader, PageSkeleton } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { isBusinessError } from "@/lib/errors";
import { formatQty } from "@/lib/money";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { requirePageAction } from "@/modules/auth/session";
import { getBlindSheet, getInventoryReview } from "@/modules/inventory";

export const metadata: Metadata = { title: "Inventaire – RICHBOND" };

const Info = ({ label, children, testId }: { label: string; children: React.ReactNode; testId?: string }) => (
  <div>
    <dt className="text-xs text-muted-foreground">{label}</dt>
    <dd className="mt-0.5 text-sm" data-testid={testId}>
      {children}
    </dd>
  </div>
);

const notFoundOn = (e: unknown): never => {
  if (isBusinessError(e) && e.code === "INVENTAIRE_INTROUVABLE") notFound();
  throw e;
};

async function InventoryContent({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageAction(null);
  const canView = can(user, "inventory.view");
  const canCount = can(user, "inventory.count");
  if (!canView && !canCount) redirect("/acces-refuse");
  const { id } = await params;

  // ------------------------------------------------------------ Magasinier : jamais de théorique, de PMP ni de valeur.
  if (!canView) {
    const sheet = await getBlindSheet(user, { countId: id }).catch(notFoundOn);
    if (sheet.status === "EN_COMPTAGE") redirect(`/stock/inventaires/${id}/comptage`);
    return (
      <>
        <PageHeader title={sheet.number} titleClassName="page-title doc-number" description={sheet.warehouse.name} meta={<StatusBadge status={sheet.status} />} />
        <section className="space-y-4 rounded-xl border bg-card p-5" data-testid="inv-store-card">
          <p className="text-sm" data-testid="inv-status-hint">
            {INVENTORY_STATUS_HINTS[sheet.status]}
          </p>
          {sheet.status === "PREPARE" ? (
            <>
              <p className="text-sm text-muted-foreground">{sheet.total} article{sheet.total > 1 ? "s" : ""} à compter. Vous ne verrez pas les quantités attendues.</p>
              <OpenCountButton countId={sheet.id} number={sheet.number} blind />
            </>
          ) : null}
        </section>
      </>
    );
  }

  // ------------------------------------------------------------ Responsable, Acheteur, Super-admin
  const review = await getInventoryReview(user, { countId: id }).catch(notFoundOn);
  const canPrepare = can(user, "inventory.prepare");
  const canValidate = can(user, "inventory.validate");
  const canCancel = can(user, "inventory.cancel");

  return (
    <>
      <PageHeader
        title={review.number}
        titleClassName="page-title doc-number"
        description={`${review.warehouse.name} · ${KIND_LABELS[review.kind]}`}
        meta={<StatusBadge status={review.status} />}
        actions={
          <InventoryActionsBar
            countId={review.id}
            number={review.number}
            status={review.status}
            canCount={canCount}
            canCancel={canCancel}
          />
        }
      />
      <div className="space-y-5">
        <section className="rounded-xl border bg-card p-4 sm:p-5" aria-label="Informations de l'inventaire">
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Info label="Dépôt">{review.warehouse.name}</Info>
            <Info label="Ouvert le">
              <DateCell value={review.openedAt} withTime />
            </Info>
            <Info label="Envoyé à valider le">
              <DateCell value={review.submittedAt} withTime />
            </Info>
            <Info label="Validé le">
              <DateCell value={review.validatedAt} withTime />
            </Info>
            <Info label="Seuil d'écart important">
              {formatQty(review.thresholdPct)} % ou {new Intl.NumberFormat("fr-FR").format(review.thresholdValue)} FCFA
            </Info>
            <Info label="Commentaire">{review.comment ?? <span className="text-muted-foreground/70">—</span>}</Info>
          </dl>
          <p className="mt-4 text-sm text-muted-foreground" data-testid="inv-status-hint">
            {INVENTORY_STATUS_HINTS[review.status]}
          </p>
        </section>

        {review.status === "PREPARE" ? (
          <PrepareLines
            countId={review.id}
            warehouseId={review.warehouse.id}
            canEdit={canPrepare}
            lines={review.lines.map((l) => ({ id: l.id, itemId: l.itemId, code: l.code, name: l.name, reason: l.selectionReason }))}
          />
        ) : null}

        {review.status === "EN_COMPTAGE" ? (
          <section className="space-y-3 rounded-xl border bg-card p-5" data-testid="inv-counting-card">
            <p className="text-base font-semibold" data-testid="inv-counting-progress">
              {review.totals.counted} / {review.totals.lines} articles comptés
            </p>
            <p className="text-sm text-muted-foreground">
              Les quantités attendues restent masquées pendant le comptage. Les écarts apparaîtront quand le magasin aura envoyé son comptage.
            </p>
            {review.totals.movedDuringCount > 0 ? (
              <p role="alert" className="flex items-start gap-2 text-sm font-medium text-amber-900" data-testid="inv-moved-warning">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                Du stock a bougé pendant le comptage pour {review.totals.movedDuringCount} article{review.totals.movedDuringCount > 1 ? "s" : ""}.
              </p>
            ) : null}
            {canCount ? (
              <Link href={`/stock/inventaires/${review.id}/comptage`} className={cn(buttonVariants(), "h-14 px-8 text-base")} data-testid="inv-resume">
                Reprendre le comptage
              </Link>
            ) : null}
          </section>
        ) : null}

        {review.status === "A_VALIDER" || review.status === "VALIDE" ? (
          <InventoryReviewPanel review={review} canValidate={canValidate} canCancel={canCancel} />
        ) : null}
      </div>
    </>
  );
}

export default function InventoryPage({ params }: PageProps<"/stock/inventaires/[id]">) {
  return (
    <>
      <Link href="/stock/inventaires" className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground" data-testid="inv-back">
        <ArrowLeft className="size-4" /> Retour aux inventaires
      </Link>
      <Suspense fallback={<PageSkeleton rows={6} />}>
        <InventoryContent params={params} />
      </Suspense>
    </>
  );
}

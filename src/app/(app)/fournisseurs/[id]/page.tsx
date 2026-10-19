import { Suspense, type ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { DateCell } from "@/components/date-cell";
import { EmptyState } from "@/components/empty-state";
import { KpiCard } from "@/components/kpi-card";
import { MoneyCell } from "@/components/money-cell";
import { PageHeader, PageSkeleton } from "@/components/page-header";
import { QtyCell } from "@/components/qty-cell";
import { ChangeCodeDialog } from "@/components/referentials/change-code-dialog";
import { countryName } from "@/components/referentials/countries";
import { EntityJournal } from "@/components/referentials/entity-journal";
import { RecordTabs } from "@/components/referentials/record-tabs";
import { StatusBadge } from "@/components/status-badge";
import { isBusinessError } from "@/lib/errors";
import { formatFcfa } from "@/lib/money";
import { can } from "@/lib/permissions";
import { requirePageAction } from "@/modules/auth/session";
import { listCurrencies } from "@/modules/currencies";
import { validateNcc } from "@/modules/referentials/codes";
import { SUPPLIER_STATUS_LABELS, SUPPLIER_TYPE_LABELS } from "@/modules/referentials/labels";
import { viewerCanSeePrices } from "@/modules/settings";
import { getSupplier } from "@/modules/suppliers";
import { changeSupplierCodeAction } from "../actions";
import { SupplierForm, type SupplierFormValues } from "../supplier-form";
import { SupplierBlockActions } from "./supplier-actions";
import { SupplierContacts } from "./supplier-contacts";

export const metadata: Metadata = { title: "Fiche fournisseur – RICHBOND" };

async function SupplierContent({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageAction("supplier.view");
  const { id } = await params;
  const showPrices = await viewerCanSeePrices(user);
  const canWrite = can(user, "supplier.manage");

  const s = await getSupplier(id, { showPrices }).catch((e: unknown) => {
    if (isBusinessError(e) && e.code === "NOT_FOUND") notFound();
    throw e;
  });
  const currencies = await listCurrencies({ activeOnly: true });

  const updatedAt = s.updatedAt.toISOString();
  const blocked = s.status === "BLOQUE";
  const initial: SupplierFormValues = {
    code: s.code,
    name: s.name,
    type: s.type,
    country: s.country,
    city: s.city ?? "",
    currencyCode: s.currencyCode,
    ncc: s.ncc ?? "",
    rccm: s.rccm ?? "",
    paymentTerm: s.paymentTerm,
    paymentTermNote: s.paymentTermNote ?? "",
    incoterm: s.incoterm ?? "",
    leadTimeDays: s.leadTimeDays != null ? String(s.leadTimeDays) : "",
    categories: s.categories,
    status: s.status === "BLOQUE" ? "ACTIF" : s.status,
    notes: s.notes ?? "",
    contacts: [],
  };
  const nccIssue = s.ncc ? validateNcc(s.ncc) : null;
  // Indicateurs alimentés aux lots 5, 10 et 14 : « – » tant qu'ils ne sont pas calculés.
  const ind = s.indicators as { poCount?: number; amount12m?: number; serviceRate?: number; rating?: number } | null;

  const codeSlot = can(user, "settings.manage") ? (
    <ChangeCodeDialog
      entityLabel="fournisseur"
      id={s.id}
      currentCode={s.code}
      updatedAt={updatedAt}
      action={changeSupplierCodeAction}
      testId="supplier-code-change"
    />
  ) : null;

  const tabs: { value: string; label: string; content: ReactNode }[] = [
    {
      value: "fiche",
      label: "Fiche",
      content: (
        <SupplierForm
          key={updatedAt}
          mode="edit"
          supplierId={s.id}
          updatedAt={updatedAt}
          initial={initial}
          currencies={currencies.map((c) => ({ code: c.code, name: c.name }))}
          readOnly={!canWrite}
          blocked={blocked}
          codeSlot={codeSlot}
        />
      ),
    },
    {
      value: "contacts",
      label: `Contacts (${s.contacts.filter((c) => c.active).length})`,
      content: (
        <SupplierContacts
          supplierId={s.id}
          canEdit={canWrite}
          contacts={s.contacts.map((c) => ({
            id: c.id,
            name: c.name,
            role: c.role,
            phone: c.phone,
            email: c.email,
            isPrimary: c.isPrimary,
            active: c.active,
            updatedAt: c.updatedAt,
          }))}
        />
      ),
    },
    {
      value: "articles",
      label: `Articles fournis (${s.items.length})`,
      content:
        s.items.length === 0 ? (
          <EmptyState title="Aucun article lié" description="Les articles se lient depuis l'onglet « Fournisseurs » de la fiche article." />
        ) : (
          <div className="overflow-x-auto rounded-lg border bg-card" data-testid="supplier-items">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground uppercase">
                <tr>
                  <th className="p-3">Article</th>
                  <th className="p-3">Référence fournisseur</th>
                  {showPrices ? <th className="p-3 text-right">Dernier prix</th> : null}
                  {showPrices ? <th className="p-3">Date du prix</th> : null}
                  <th className="p-3 text-right">Délai (jours)</th>
                  <th className="p-3 text-right">Minimum</th>
                </tr>
              </thead>
              <tbody>
                {s.items.map((l) => (
                  <tr key={l.id} className="border-t" data-testid={`supplier-item-${l.item.code}`}>
                    <td className="p-3">
                      <Link href={`/stock/articles/${l.item.id}`} className="font-medium text-primary underline-offset-4 hover:underline">
                        {l.item.name}
                      </Link>
                      <div className="font-mono text-xs text-muted-foreground">{l.item.code}</div>
                    </td>
                    <td className="p-3">{l.supplierRef ?? "–"}</td>
                    {showPrices ? (
                      <td className="p-3 text-right tabular-nums">
                        <MoneyCell value={l.lastPrice} currency={l.currencyCode} />
                      </td>
                    ) : null}
                    {showPrices ? (
                      <td className="p-3">
                        <DateCell value={l.lastPriceDate} />
                      </td>
                    ) : null}
                    <td className="p-3 text-right tabular-nums">{l.leadTimeDays ?? "–"}</td>
                    <td className="p-3 text-right tabular-nums">
                      <QtyCell value={l.minOrderQty} unit={l.minOrderQty ? l.item.purchaseUnit : null} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ),
    },
  ];
  if (can(user, "audit.view")) {
    tabs.push({
      value: "journal",
      label: "Journal",
      content: (
        <Suspense fallback={<PageSkeleton />}>
          <EntityJournal entity="Supplier" entityId={s.id} />
        </Suspense>
      ),
    });
  }

  return (
    <>
      <PageHeader
        title={s.name}
        description={`Code ${s.code} · ${countryName(s.country)}${s.city ? ` – ${s.city}` : ""} · Devise ${s.currencyCode}`}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status={s.type} label={SUPPLIER_TYPE_LABELS[s.type]} />
            <StatusBadge status={s.status} label={SUPPLIER_STATUS_LABELS[s.status]} />
            <SupplierBlockActions
              id={s.id}
              name={s.name}
              updatedAt={updatedAt}
              blocked={blocked}
              canBlock={canWrite}
              canUnblock={can(user, "supplier.evaluate")}
              mainItems={s.mainItems.map((i) => ({ id: i.id, code: i.code, name: i.name, status: i.status }))}
            />
          </div>
        }
      />

      {blocked ? (
        <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900" data-testid="supplier-blocked-banner">
          <p className="flex items-center gap-2 font-medium">
            <AlertTriangle className="size-4" /> Fournisseur bloqué : aucun bon de commande possible.
          </p>
          <p className="mt-1">
            Motif : <span data-testid="supplier-blocked-reason">{s.blockedReason ?? "non précisé"}</span>
            {s.blockedAt ? (
              <>
                {" "}
                (depuis le <DateCell value={s.blockedAt} />)
              </>
            ) : null}
          </p>
        </div>
      ) : null}
      {nccIssue && !nccIssue.ok ? (
        <p role="status" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" data-testid="supplier-ncc-banner">
          {nccIssue.warning}
        </p>
      ) : null}

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="supplier-kpis">
        <KpiCard
          testId="kpi-po-count"
          label="Bons de commande"
          value={ind?.poCount != null ? String(ind.poCount) : "–"}
          help="Nombre de bons de commande passés à ce fournisseur. Disponible avec le module Commandes."
        />
        <KpiCard
          testId="kpi-amount-12m"
          label="Montant acheté (12 mois)"
          value={ind?.amount12m != null ? formatFcfa(ind.amount12m) : "–"}
          help="Total des commandes des 12 derniers mois, converti en FCFA au taux figé à la date de commande. Disponible avec le module Commandes."
        />
        <KpiCard
          testId="kpi-service-rate"
          label="Taux de service"
          value={ind?.serviceRate != null ? `${ind.serviceRate} %` : "–"}
          help="Part des lignes livrées complètes et dans les délais annoncés. Disponible avec les réceptions."
        />
        <KpiCard
          testId="kpi-rating"
          label="Note fournisseur"
          value={ind?.rating != null ? `${ind.rating} / 5` : "–"}
          help="Note d'évaluation (délais, qualité, prix) calculée à partir des réceptions et des évaluations. Disponible avec l'évaluation fournisseurs."
        />
      </div>

      <RecordTabs tabs={tabs} testId="supplier-tabs" />
    </>
  );
}

export default function SupplierPage({ params }: PageProps<"/fournisseurs/[id]">) {
  return (
    <>
      <Link href="/fournisseurs" className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Retour aux fournisseurs
      </Link>
      <Suspense fallback={<PageSkeleton />}>
        <SupplierContent params={params} />
      </Suspense>
    </>
  );
}

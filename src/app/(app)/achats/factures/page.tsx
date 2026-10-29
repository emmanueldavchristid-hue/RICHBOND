import { Suspense } from "react";
import type { Metadata } from "next";
import { TabLink, TabsNav } from "@/components/tabs-nav";
import { PageHeader, PageSkeleton } from "@/components/page-header";
import { getNow } from "@/lib/clock";
import { can } from "@/lib/permissions";
import { pickParams, type SearchParams } from "@/lib/search-params";
import { requirePageAction } from "@/modules/auth/session";
import { dueSchedule, invoiceCounters, listInvoices, listInvoicesSchema } from "@/modules/invoices";
import { INVOICE_TABS, INVOICE_TAB_LABELS, type InvoiceTab } from "@/modules/invoices/labels";
import { serialize } from "@/modules/referentials/serialize";
import { listSupplierOptions } from "@/modules/suppliers";
import { DueSchedulePanel } from "./due-schedule";
import { InvoicesTable } from "./invoices-table";

export const metadata: Metadata = { title: "Factures fournisseurs – RICHBOND" };

const KEYS = ["onglet", "statut", "fournisseur", "echeance", "q", "tri", "ordre", "page", "taille"] as const;

async function InvoicesContent({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requirePageAction("invoice.view");
  const raw = pickParams(await searchParams, KEYS);
  const { now } = await getNow();
  const parsed = listInvoicesSchema.safeParse(raw);
  const [page, schedule, counters, suppliers] = await Promise.all([
    listInvoices(user, parsed.success ? raw : {}, now),
    dueSchedule(user, now),
    invoiceCounters(now),
    listSupplierOptions(),
  ]);
  const tab: InvoiceTab = parsed.success ? parsed.data.onglet : "tous";

  return (
    <>
      {!parsed.success ? (
        <p role="alert" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" data-testid="inv-bad-filters">
          Certains filtres de l&apos;adresse sont invalides : ils ont été ignorés.
        </p>
      ) : null}
      <DueSchedulePanel schedule={serialize(schedule)} activeFilter={parsed.success ? (parsed.data.echeance ?? null) : null} />
      <TabsNav label="Vues des factures" testId="inv-tabs">
        {INVOICE_TABS.map((t) => (
          <TabLink
            key={t}
            href={`/achats/factures?onglet=${t}`}
            active={tab === t}
            label={INVOICE_TAB_LABELS[t]}
            count={page.counts[t]}
            alert={(t === "ecarts" && counters.ecart > 0) || (t === "a-traiter" && counters.conforme > 0)}
            testId={`inv-tab-${t}`}
          />
        ))}
      </TabsNav>
      <InvoicesTable
        rows={serialize(page.rows)}
        pageInfo={{ total: page.total, page: page.page, taille: page.taille, pageCount: page.pageCount }}
        tab={tab}
        canCreate={can(user, "invoice.manage")}
        suppliers={suppliers.map((s) => ({ id: s.id, label: `${s.code} – ${s.name}` }))}
      />
    </>
  );
}

export default function FacturesPage({ searchParams }: PageProps<"/achats/factures">) {
  return (
    <>
      <PageHeader
        title="Factures fournisseurs"
        description="Rapprochement entre le bon de commande, la réception et la facture : on ne paie que ce qui a été commandé, reçu et au bon prix."
      />
      <Suspense fallback={<PageSkeleton />}>
        <InvoicesContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

import { Suspense, type ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { CriticalityBadge } from "@/components/criticality-badge";
import { DateCell } from "@/components/date-cell";
import { EmptyState } from "@/components/empty-state";
import { StockSheet } from "@/components/stock/stock-sheet";
import { MoneyCell } from "@/components/money-cell";
import { PageHeader, PageSkeleton } from "@/components/page-header";
import { RecordTabs } from "@/components/referentials/record-tabs";
import { ChangeCodeDialog } from "@/components/referentials/change-code-dialog";
import { EntityJournal } from "@/components/referentials/entity-journal";
import { unitShort } from "@/components/unit-select";
import { StatusBadge } from "@/components/status-badge";
import { isBusinessError } from "@/lib/errors";
import { formatNumber, toFcfa } from "@/lib/money";
import { can } from "@/lib/permissions";
import { pickParams, type SearchParams } from "@/lib/search-params";
import { requirePageAction } from "@/modules/auth/session";
import { listCurrencies } from "@/modules/currencies";
import { getItem, listFamilies, listPriceHistory } from "@/modules/items";
import { PRICE_SOURCE_LABELS, ITEM_STATUS_LABELS } from "@/modules/referentials/labels";
import { viewerCanSeePrices } from "@/modules/settings";
import { listSupplierOptions } from "@/modules/suppliers";
import { listWarehouses } from "@/modules/warehouses";
import { changeItemCodeAction } from "../actions";
import { ItemForm, type ItemFormValues } from "../item-form";
import { ItemPhoto, ItemStatusActions } from "./item-actions";
import { ItemSuppliersTab } from "./item-suppliers";

export const metadata: Metadata = { title: "Fiche article – RICHBOND" };

type PriceRow = Awaited<ReturnType<typeof listPriceHistory>>[number];

function PriceHistory({ rows }: { rows: PriceRow[] }) {
  if (rows.length === 0) {
    return <EmptyState title="Aucun historique de prix" description="Chaque modification du prix d'un fournisseur est conservée ici." />;
  }
  const fcfa = (r: PriceRow): number | null => {
    if (r.currencyCode === "XOF") return Number(r.price);
    if (!r.rateToXof) return null;
    try {
      return toFcfa(r.price, r.rateToXof);
    } catch {
      return null;
    }
  };
  return (
    <div className="overflow-x-auto rounded-lg border bg-card" data-testid="item-price-history">
      <table className="w-full text-sm">
        <thead className="text-left text-xs font-medium text-muted-foreground border-b">
          <tr>
            <th className="p-3">Date</th>
            <th className="p-3">Fournisseur</th>
            <th className="p-3 text-right">Prix (par unité d&apos;achat)</th>
            <th className="p-3 text-right">Taux</th>
            <th className="p-3 text-right">Équivalent FCFA</th>
            <th className="p-3">Source</th>
            <th className="p-3">Référence</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t" data-testid="price-history-row">
              <td className="p-3 whitespace-nowrap">
                <DateCell value={r.date} />
              </td>
              <td className="p-3">{r.supplier?.name ?? "—"}</td>
              <td className="p-3 text-right tabular-nums">
                <MoneyCell value={r.price} currency={r.currencyCode} />
                {r.priceUnit ? <span className="text-muted-foreground"> / {unitShort(r.priceUnit)}</span> : null}
              </td>
              <td className="p-3 text-right tabular-nums">{r.currencyCode === "XOF" || !r.rateToXof ? "—" : formatNumber(r.rateToXof, 6)}</td>
              <td className="p-3 text-right tabular-nums">
                <MoneyCell value={fcfa(r)} currency="XOF" />
              </td>
              <td className="p-3">{PRICE_SOURCE_LABELS[r.source as keyof typeof PRICE_SOURCE_LABELS] ?? r.source}</td>
              <td className="p-3">{r.sourceRef ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function ItemContent({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const { onglet } = pickParams(await searchParams, ["onglet"]);
  const user = await requirePageAction("item.view");
  const { id } = await params;
  const showPrices = await viewerCanSeePrices(user);
  const canWrite = can(user, "item.manage");

  const item = await getItem(id, { showPrices }).catch((e: unknown) => {
    if (isBusinessError(e) && e.code === "NOT_FOUND") notFound();
    throw e;
  });

  const [warehouses, suppliers, families, currencies, prices] = await Promise.all([
    listWarehouses({ activeOnly: true }),
    canWrite ? listSupplierOptions() : Promise.resolve([]),
    listFamilies(),
    canWrite ? listCurrencies({ activeOnly: true }) : Promise.resolve([]),
    showPrices ? listPriceHistory(id, { showPrices }) : Promise.resolve([]),
  ]);

  const updatedAt = item.updatedAt.toISOString();
  const initial: ItemFormValues = {
    code: item.code,
    name: item.name,
    category: item.category,
    family: item.family ?? "",
    stockUnit: item.stockUnit,
    purchaseUnit: item.purchaseUnit,
    conversionFactor: item.conversionFactor,
    stocked: item.stocked,
    criticality: item.criticality,
    defaultWarehouseId: item.defaultWarehouseId ?? "",
    safetyStock: item.safetyStock ?? "",
    reorderPoint: item.reorderPoint ?? "",
    economicOrderQty: item.economicOrderQty ?? "",
    leadTimeDays: item.leadTimeDays != null ? String(item.leadTimeDays) : "",
    mainSupplierId: item.mainSupplierId ?? "",
    barcode: item.barcode ?? "",
    equipment: item.equipment ?? "",
    notes: item.notes ?? "",
  };

  // Un fournisseur principal bloqué ou absent des options reste visible dans la liste du formulaire.
  const supplierChoices = suppliers.map(({ id: sid, code, name, status }) => ({ id: sid, code, name, status }));
  if (item.mainSupplier && !supplierChoices.some((s) => s.id === item.mainSupplier!.id)) {
    supplierChoices.push({ id: item.mainSupplier.id, code: item.mainSupplier.code, name: item.mainSupplier.name, status: item.mainSupplier.status });
  }
  // Un dépôt désactivé reste visible s'il est déjà celui de l'article.
  const warehouseChoices = warehouses.map(({ id: wid, code, name }) => ({ id: wid, code, name }));
  if (item.defaultWarehouse && !warehouseChoices.some((w) => w.id === item.defaultWarehouse!.id)) {
    warehouseChoices.push(item.defaultWarehouse);
  }

  const codeSlot = can(user, "settings.manage") ? (
    <ChangeCodeDialog
      entityLabel="article"
      id={item.id}
      currentCode={item.code}
      updatedAt={updatedAt}
      action={changeItemCodeAction}
      testId="item-code-change"
    />
  ) : null;

  const tabs: { value: string; label: string; content: ReactNode }[] = [
    {
      value: "fiche",
      label: "Fiche",
      content: (
        <div className="grid gap-6 lg:grid-cols-[1fr_16rem]">
          <ItemForm
            key={updatedAt}
            mode="edit"
            itemId={item.id}
            updatedAt={updatedAt}
            initial={initial}
            warehouses={warehouseChoices}
            suppliers={supplierChoices}
            families={families}
            readOnly={!canWrite}
            codeSlot={codeSlot}
          />
          <aside className="space-y-4">
            <h2 className="font-medium">Photo</h2>
            <ItemPhoto id={item.id} updatedAt={updatedAt} hasPhoto={item.hasPhoto} canEdit={canWrite} />
          </aside>
        </div>
      ),
    },
    {
      value: "fournisseurs",
      label: "Fournisseurs",
      content: (
        <ItemSuppliersTab
          itemId={item.id}
          purchaseUnit={item.purchaseUnit}
          links={item.suppliers}
          mainSupplierId={item.mainSupplierId}
          supplierOptions={suppliers.map(({ id: sid, code, name, currencyCode }) => ({ id: sid, code, name, currencyCode }))}
          currencies={currencies.map((c) => ({ code: c.code }))}
          showPrices={showPrices}
          canEdit={canWrite}
        />
      ),
    },
    {
      value: "fiche-de-stock",
      label: "Fiche de stock",
      content: (
        <StockSheet
          user={user}
          itemId={item.id}
          code={item.code}
          name={item.name}
          stockUnit={item.stockUnit}
          warehouses={warehouses.map((w) => ({ id: w.id, name: w.name }))}
        />
      ),
    },
  ];
  if (showPrices) tabs.push({ value: "prix", label: "Historique des prix", content: <PriceHistory rows={prices} /> });
  if (can(user, "audit.view")) {
    tabs.push({
      value: "journal",
      label: "Journal",
      content: (
        <Suspense fallback={<PageSkeleton />}>
          <EntityJournal entity="Item" entityId={item.id} related={[{ entity: "ItemSupplier", ids: item.suppliers.map((l) => l.id) }]} />
        </Suspense>
      ),
    });
  }

  return (
    <>
      <PageHeader
        title={item.name}
        description={`Code ${item.code}`}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <CriticalityBadge value={item.criticality} />
            <StatusBadge status={item.status} label={ITEM_STATUS_LABELS[item.status]} />
            {canWrite ? <ItemStatusActions id={item.id} updatedAt={updatedAt} status={item.status} itemLabel={item.code} /> : null}
          </div>
        }
      />
      <RecordTabs tabs={tabs} testId="item-tabs" defaultValue={tabs.some((t) => t.value === onglet) ? onglet : undefined} />
    </>
  );
}

export default function ItemPage({ params, searchParams }: PageProps<"/stock/articles/[id]">) {
  return (
    <>
      <Link href="/stock/articles" className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Retour aux articles
      </Link>
      <Suspense fallback={<PageSkeleton />}>
        <ItemContent params={params} searchParams={searchParams} />
      </Suspense>
    </>
  );
}

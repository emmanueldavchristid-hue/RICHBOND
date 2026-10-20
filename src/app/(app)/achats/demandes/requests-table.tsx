"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCheck, Plus } from "lucide-react";
import { toast } from "sonner";
import { DataTable, type DataColumn, type DataTablePageInfo, type FilterDef } from "@/components/data-table";
import { DateCell } from "@/components/date-cell";
import { WriteButton } from "@/components/license/write-button";
import { MoneyCell } from "@/components/money-cell";
import { AgeBadge } from "@/components/purchase-orders/age-badge";
import { ageInDays, ageSeverity } from "@/lib/dates";
import { UrgencyBadge } from "@/components/purchase-requests/urgency-badge";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useActionRunner } from "@/components/use-action-runner";
import { PR_STATUS_LABELS, PR_TYPE_LABELS, PR_URGENCY_LABELS, type PrUrgency } from "@/modules/purchase-requests/labels";
import type { RequestRow } from "@/modules/purchase-requests/queries";
import { approveManyAction } from "./actions";

const optionsOf = (labels: Record<string, string>) => Object.entries(labels).map(([value, label]) => ({ value, label }));

interface BulkResult {
  approved: number;
  failed: number;
  results: { id: string; number: string | null; ok: boolean; message?: string }[];
}

export function RequestsTable({
  rows,
  pageInfo,
  tab,
  canCreate,
  canApprove,
  showPrices,
  nowIso,
  departments,
  buyers,
}: {
  rows: RequestRow[];
  pageInfo: DataTablePageInfo;
  tab: "a-valider" | "mes-demandes" | "assignees" | "toutes";
  canCreate: boolean;
  canApprove: boolean;
  showPrices: boolean;
  /** Heure serveur (ancienneté de la validation). */
  nowIso: string;
  departments: { id: string; name: string }[];
  buyers: { id: string; name: string }[];
}) {
  const router = useRouter();
  const { run, pending } = useActionRunner();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [types, setTypes] = useState<Record<string, "LOCAL" | "IMPORT" | "">>({});
  const [report, setReport] = useState<BulkResult | null>(null);

  const selectable = useMemo(() => (canApprove ? rows.filter((r) => r.status === "SOUMISE") : []), [rows, canApprove]);
  const chosen = selectable.filter((r) => selected.has(r.id));
  // I3 : les DA « À définir » reçoivent le type choisi dans la fenêtre ; sans choix, elles sont écartées.
  const skipped = chosen.filter((r) => r.type === "A_DEFINIR" && !types[r.id]);
  const allChecked = selectable.length > 0 && chosen.length === selectable.length;

  const toggle = useCallback((id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    }),
  []);

  async function approveSelection() {
    const res = await run(
      () => approveManyAction({ items: chosen.map((r) => ({ id: r.id, expectedUpdatedAt: new Date(r.updatedAt).toISOString(), type: r.type === "A_DEFINIR" ? types[r.id] || null : null })) }),
      {
        onSuccess: (data) => {
          const d = data as BulkResult;
          setConfirmOpen(false);
          setSelected(new Set());
          setTypes({});
          setReport(d);
          if (d.approved > 0) toast.success(d.approved === 1 ? "1 demande validée." : `${d.approved} demandes validées.`);
          if (d.failed > 0) toast.warning(d.failed === 1 ? "1 demande écartée : voir le détail." : `${d.failed} demandes écartées : voir le détail.`);
        },
        onError: () => setConfirmOpen(false),
      },
    );
    return res;
  }

  const columns = useMemo<DataColumn<RequestRow>[]>(() => {
    const cols: DataColumn<RequestRow>[] = [];
    if (canApprove) {
      cols.push({
        id: "select",
        header: "Sélection",
        headerContent: (
          <input
            type="checkbox"
            className="size-[18px]"
            aria-label="Tout sélectionner (demandes à valider de cette page)"
            checked={allChecked}
            disabled={selectable.length === 0}
            onChange={() => setSelected(allChecked ? new Set() : new Set(selectable.map((r) => r.id)))}
            data-testid="pr-select-all"
          />
        ),
        mobile: "hide",
        cell: (r) =>
          r.status === "SOUMISE" ? (
            <input
              type="checkbox"
              className="size-[18px]"
              aria-label={`Sélectionner ${r.displayNumber}`}
              checked={selected.has(r.id)}
              onChange={() => toggle(r.id)}
              data-testid={`pr-select-${r.displayNumber}`}
            />
          ) : null,
      });
    }
    cols.push(
      {
        id: "number",
        header: "N°",
        sortable: true,
        mobile: "title",
        cell: (r) => (
          <Link
            href={`/achats/demandes/${r.id}`}
            className="doc-number text-primary hover:underline"
            data-testid="pr-link"
          >
            {r.displayNumber}
          </Link>
        ),
      },
      { id: "urgency", header: "Urgence", cell: (r) => <UrgencyBadge urgency={r.urgency} /> },
      { id: "status", header: "Statut", sortable: true, cell: (r) => <StatusBadge status={r.status} /> },
      { id: "department", header: "Service", mobile: "subtitle", cell: (r) => r.department.name },
      { id: "requester", header: "Demandeur", cell: (r) => <span className="whitespace-nowrap">{r.requesterName}</span> },
      {
        id: "reason",
        header: "Motif",
        className: "max-w-44",
        cell: (r) => (
          <span className="line-clamp-2" title={r.reason}>
            {r.reason}
          </span>
        ),
      },
      { id: "neededBy", header: "Besoin", sortable: true, cell: (r) => <DateCell value={r.neededBy} /> },
      { id: "type", header: "Type", cell: (r) => <span className="whitespace-nowrap">{PR_TYPE_LABELS[r.type]}</span> },
    );
    if (showPrices) {
      cols.push({
        id: "estimatedTotal",
        header: "Montant estimé",
        sortable: true,
        align: "right",
        cell: (r) => <MoneyCell value={r.estimatedTotal} decimals={0} />,
      });
    }
    cols.push({
      id: "buyer",
      header: "Acheteur",
      cell: (r) => r.assignedBuyer?.name ?? <span className="text-muted-foreground">—</span>,
    });
    // LOT-05 (D21) : « Assignées à moi » montre ce qui traîne : ancienneté de la validation et reste à commander.
    if (tab === "assignees") {
      const now = new Date(nowIso);
      cols.push(
        {
          id: "approvedAge",
          header: "Validée",
          cell: (r) => (r.approvedAt && r.linesToOrder > 0 ? <AgeBadge days={ageInDays(r.approvedAt, now)} severity={ageSeverity(r.approvedAt, now)} prefix="depuis" /> : <span className="text-muted-foreground">—</span>),
        },
        {
          id: "linesToOrder",
          header: "À commander",
          cell: (r) =>
            r.linesToOrder > 0 ? (
              <span className="font-medium text-amber-800" data-testid="pr-lines-to-order">
                {r.linesToOrder} ligne{r.linesToOrder > 1 ? "s" : ""}
              </span>
            ) : (
              <span className="text-muted-foreground">—</span>
            ),
        },
      );
    }
    return cols;
  }, [canApprove, showPrices, selectable, selected, allChecked, toggle, tab, nowIso]);

  const filters = useMemo<FilterDef[]>(() => {
    const f: FilterDef[] = [];
    if (tab !== "a-valider") f.push({ param: "statut", label: "Statut", options: [{ value: "", label: "Tous les statuts" }, ...optionsOf(PR_STATUS_LABELS)] });
    f.push(
      { param: "urgence", label: "Urgence", options: [{ value: "", label: "Toutes les urgences" }, ...optionsOf(PR_URGENCY_LABELS)] },
      { param: "service", label: "Service", options: [{ value: "", label: "Tous les services" }, ...departments.map((d) => ({ value: d.id, label: d.name }))] },
      { param: "type", label: "Type", options: [{ value: "", label: "Local, import, à définir" }, ...optionsOf(PR_TYPE_LABELS)] },
    );
    if (tab !== "assignees") {
      f.push({ param: "acheteur", label: "Acheteur", options: [{ value: "", label: "Tous les acheteurs" }, ...buyers.map((b) => ({ value: b.id, label: b.name }))] });
    }
    return f;
  }, [tab, departments, buyers]);

  const emptyByTab: Record<typeof tab, { title: string; description: string }> = {
    "a-valider": { title: "Aucune demande à valider", description: "Toutes les demandes soumises ont été traitées." },
    "mes-demandes": { title: "Vous n'avez créé aucune demande", description: "Utilisez « Nouvelle DA » pour en créer une." },
    assignees: { title: "Aucune demande ne vous est assignée", description: "Les demandes validées pour votre périmètre apparaîtront ici." },
    toutes: { title: "Aucune demande trouvée", description: "Modifiez la recherche ou les filtres, ou créez une nouvelle demande." },
  };

  return (
    <>
      <DataTable
        testId="pr-list"
        columns={columns}
        rows={rows}
        pageInfo={pageInfo}
        defaultSort={{ id: "neededBy", dir: "asc" }}
        filters={filters}
        searchPlaceholder="Rechercher un numéro, un motif, un demandeur, un article…"
        exportHref="/api/export/demandes"
        rowHref={(r) => `/achats/demandes/${r.id}`}
        rowTestId={(r) => `pr-row-${r.displayNumber}`}
        rowClassName={(r) => (r.priority === 0 ? "bg-red-50 hover:bg-red-100/70" : undefined)}
        emptyTitle={emptyByTab[tab].title}
        emptyDescription={emptyByTab[tab].description}
        toolbarExtra={
          <>
            {canApprove && chosen.length > 0 ? (
              <WriteButton className="h-11 px-4" onClick={() => setConfirmOpen(true)} data-testid="pr-bulk-approve">
                <CheckCheck /> Valider la sélection ({chosen.length})
              </WriteButton>
            ) : null}
            {canCreate ? (
              <WriteButton className="h-11 px-4" onClick={() => router.push("/achats/demandes/nouvelle")} data-testid="pr-create">
                <Plus /> Nouvelle DA
              </WriteButton>
            ) : null}
          </>
        }
      />

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-xl" data-testid="pr-bulk-dialog">
          <DialogHeader>
            <DialogTitle>
              Valider {chosen.length} demande{chosen.length > 1 ? "s" : ""} d&apos;achat ?
            </DialogTitle>
            <DialogDescription>
              Les quantités demandées sont validées telles quelles et chaque demande est assignée à l&apos;acheteur du bon périmètre. Pour modifier une quantité, ouvrez la demande.
            </DialogDescription>
          </DialogHeader>
          <ul className="max-h-64 divide-y overflow-auto rounded-lg border text-sm" data-testid="pr-bulk-list">
            {chosen.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span>
                  <span className="font-mono font-medium">{r.displayNumber}</span> · {r.department.name}
                </span>
                <span className="flex items-center gap-2">
                  {r.type === "A_DEFINIR" ? (
                    <select
                      className="h-11 rounded-md border bg-background px-2 text-sm"
                      aria-label={`Type de ${r.displayNumber}`}
                      value={types[r.id] ?? ""}
                      onChange={(e) => setTypes((p) => ({ ...p, [r.id]: e.target.value as "LOCAL" | "IMPORT" | "" }))}
                      data-testid={`pr-bulk-type-${r.displayNumber}`}
                    >
                      <option value="">Type à définir</option>
                      <option value="LOCAL">Local</option>
                      <option value="IMPORT">Import</option>
                    </select>
                  ) : null}
                  <UrgencyBadge urgency={r.urgency as PrUrgency} />
                  {showPrices && r.estimatedTotal != null ? <MoneyCell value={r.estimatedTotal} decimals={0} /> : null}
                </span>
              </li>
            ))}
          </ul>
          {skipped.length > 0 ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" data-testid="pr-bulk-skipped">
              {skipped.length === 1 ? "1 demande sera écartée" : `${skipped.length} demandes seront écartées`} : le type (local ou import) n&apos;est pas défini ({skipped.map((r) => r.displayNumber).join(", ")}). Choisissez le type ci-dessus, ou ouvrez-les.
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" className="h-11 px-4" onClick={() => setConfirmOpen(false)} data-testid="pr-bulk-cancel">
              Annuler
            </Button>
            <WriteButton type="button" className="h-11 px-4" disabled={pending} onClick={() => void approveSelection()} data-testid="pr-bulk-confirm">
              {pending ? "Validation…" : `Valider ${chosen.length} demande${chosen.length > 1 ? "s" : ""}`}
            </WriteButton>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={report !== null} onOpenChange={(o) => (!o ? setReport(null) : undefined)}>
        <DialogContent className="sm:max-w-xl" data-testid="pr-bulk-report">
          <DialogHeader>
            <DialogTitle>Résultat de la validation groupée</DialogTitle>
            <DialogDescription data-testid="pr-bulk-summary">
              {report ? `${report.approved} validée${report.approved > 1 ? "s" : ""}, ${report.failed} écartée${report.failed > 1 ? "s" : ""} par le contrôle.` : ""}
            </DialogDescription>
          </DialogHeader>
          <ul className="max-h-64 divide-y overflow-auto rounded-lg border text-sm">
            {report?.results.map((r) => (
              <li key={r.id} className="px-3 py-2" data-testid={`pr-bulk-result-${r.number ?? r.id}`}>
                <span className="font-mono font-medium">{r.number ?? r.id}</span> ·{" "}
                {r.ok ? <span className="text-emerald-700">Validée</span> : <span className="text-red-700">{r.message ?? "Écartée"}</span>}
              </li>
            ))}
          </ul>
          <div className="flex justify-end">
            <Button type="button" className="h-11 px-4" onClick={() => setReport(null)} data-testid="pr-bulk-report-close">
              Fermer
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

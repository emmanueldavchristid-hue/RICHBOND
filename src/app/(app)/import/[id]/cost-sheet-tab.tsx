import { AlertTriangle, Info } from "lucide-react";
import { KpiCard } from "@/components/kpi-card";
import { MoneyCell } from "@/components/money-cell";
import { formatNumber, formatQty } from "@/lib/money";
import type { ImportFileDetail } from "@/modules/import-files";
import { ALLOCATION_KEY_LABELS } from "@/modules/import-files/labels";

const BASIS: Record<string, string> = {
  FOURNISSEUR: "d'après les dossiers clôturés de ce fournisseur",
  ORIGINE: "d'après les dossiers clôturés de la même origine",
  DEFAUT: "d'après les coefficients par défaut (aucun historique)",
};

const fcfa2 = (v: string) => `${formatNumber(v, 2)} FCFA`;
const pct = (coef: string | null) => (coef ? `+${formatNumber((Number(coef) - 1) * 100, 1)} %` : undefined);

/** Fiche de calcul du coût de revient : valeur des marchandises + frais répartis = coût dédouané, coefficient d'approche, impact sur le PMP. */
export function CostSheetTab({ detail }: { detail: ImportFileDetail }) {
  const { sheet, suggestion } = detail;
  const t = sheet.totals;
  const costs = sheet.costs;

  return (
    <div className="space-y-5" data-testid="imp-sheet">
      {sheet.final ? (
        <p className="flex items-center gap-2 rounded-lg border bg-muted p-3 text-sm" data-testid="imp-sheet-final">
          <Info className="size-4 shrink-0" aria-hidden /> Fiche définitive, figée à la clôture du dossier.
        </p>
      ) : (
        <p className="flex items-center gap-2 rounded-lg border bg-muted p-3 text-sm" data-testid="imp-sheet-live">
          <Info className="size-4 shrink-0" aria-hidden /> Aperçu en direct : les chiffres changent tant que le dossier n&apos;est pas clôturé.
        </p>
      )}
      {sheet.warnings.length > 0 ? (
        <ul className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" data-testid="imp-sheet-warnings">
          {sheet.warnings.map((w) => (
            <li key={w} className="flex gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> {w}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard testId="imp-kpi-goods" label="Valeur des marchandises" value={`${formatNumber(t.goodsValueXof, 0)} FCFA`} help="Valeur des articles en FCFA : montants reçus et acceptés, ou montants des bons de commande pour ce qui n'est pas encore reçu." />
        <KpiCard testId="imp-kpi-costs" label="Frais d'approche" value={`${formatNumber(t.costsXof, 0)} FCFA`} help="Total des frais répartis sur les marchandises (fret, assurance, douane, transitaire…). La TVA récupérable en est exclue." hint={t.excludedXof > 0 ? `hors ${formatNumber(t.excludedXof, 0)} FCFA de TVA récupérable` : undefined} />
        <KpiCard testId="imp-kpi-landed" label="Coût dédouané" value={`${formatNumber(t.landedXof, 0)} FCFA`} help="Valeur des marchandises + frais d'approche : ce que coûte réellement la marchandise rendue au magasin." />
        <KpiCard testId="imp-kpi-coefficient" label="Coefficient d'approche" value={t.coefficient ? formatNumber(t.coefficient, 4) : "—"} help="Coût dédouané ÷ valeur des marchandises. Un coefficient de 1,25 signifie que chaque 100 FCFA de marchandise en coûtent 125 une fois rendus au magasin." hint={pct(t.coefficient)} />
      </div>

      <section className="rounded-xl border bg-card p-4" data-testid="imp-suggestion">
        <h2 className="text-[15px] font-semibold">Coefficient suggéré pour le prochain achat</h2>
        <p className="mt-1 text-sm">
          <strong className="tabular-nums" data-testid="imp-suggestion-value">
            {formatNumber(suggestion.coefficient, 4)}
          </strong>{" "}
          <span className="text-muted-foreground">
            {BASIS[suggestion.basis] ?? ""}
            {suggestion.samples > 0 ? ` (${suggestion.samples} dossier${suggestion.samples > 1 ? "s" : ""})` : ""}.
          </span>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">Sert à estimer le coût de revient d&apos;une commande import avant d&apos;avoir les factures de frais.</p>
      </section>

      <section className="rounded-xl border bg-card p-4">
        <h2 className="mb-1 text-[15px] font-semibold">Coût dédouané par article</h2>
        <p className="mb-3 text-xs text-muted-foreground">Chaque frais est réparti sur les lignes selon sa clé. Le coût unitaire dédouané est celui qui alimente le coût moyen pondéré (PMP).</p>
        {sheet.lines.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune marchandise : rattachez un bon de commande import au dossier.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm" data-testid="imp-sheet-table">
              <thead>
                <tr className="border-b text-left text-xs font-medium text-muted-foreground">
                  <th className="py-2 pr-3">Article</th>
                  <th className="py-2 pr-3 text-right">Quantité</th>
                  <th className="py-2 pr-3 text-right">Valeur marchandise</th>
                  {costs.map((c) => (
                    <th key={c.id} className="py-2 pr-3 text-right">
                      {c.typeLabel}
                      <span className="block font-normal">
                        {c.excluded ? "exclu" : ALLOCATION_KEY_LABELS[c.keyUsed].toLowerCase()}
                        {c.status === "ESTIME" ? " · estimé" : ""}
                      </span>
                    </th>
                  ))}
                  <th className="py-2 pr-3 text-right">Coût dédouané</th>
                  <th className="py-2 pr-3 text-right">Coût unitaire marchandise</th>
                  <th className="py-2 pr-3 text-right">Coût unitaire dédouané</th>
                  <th className="py-2 text-right">Coef.</th>
                </tr>
              </thead>
              <tbody>
                {sheet.lines.map((l, i) => (
                  <tr key={l.orderLineId} className="border-b last:border-0" data-testid={`imp-sheet-line-${l.orderNumber}-${l.lineNo}`}>
                    <td className="py-2.5 pr-3">
                      {l.designation}
                      <span className="block text-xs text-muted-foreground">
                        <span className="doc-number">{l.orderNumber}</span> / {l.lineNo} · {l.source === "RECU" ? "reçu" : "à recevoir"}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums whitespace-nowrap">
                      {formatQty(l.qty)} {l.stockUnit ?? ""}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums whitespace-nowrap">
                      <MoneyCell value={l.goodsValueXof} decimals={0} />
                    </td>
                    {costs.map((c) => (
                      <td key={c.id} className={`py-2.5 pr-3 text-right tabular-nums whitespace-nowrap ${c.excluded ? "text-muted-foreground/70" : ""}`}>
                        {formatNumber(c.allocations[i] ?? 0, 0)}
                      </td>
                    ))}
                    <td className="py-2.5 pr-3 text-right font-medium tabular-nums whitespace-nowrap" data-testid="imp-sheet-landed">
                      <MoneyCell value={l.landedValueXof} decimals={0} />
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums whitespace-nowrap">
                      {fcfa2(l.unitGoodsCost)}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-semibold tabular-nums whitespace-nowrap" data-testid="imp-sheet-unit-landed">
                      {fcfa2(l.unitLandedCost)}
                    </td>
                    <td className="py-2.5 text-right tabular-nums">{l.coefficient ? formatNumber(l.coefficient, 4) : "—"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t font-semibold">
                  <td className="py-2.5 pr-3">Total</td>
                  <td />
                  <td className="py-2.5 pr-3 text-right tabular-nums whitespace-nowrap">
                    <MoneyCell value={t.goodsValueXof} decimals={0} />
                  </td>
                  {costs.map((c) => (
                    <td key={c.id} className="py-2.5 pr-3 text-right tabular-nums whitespace-nowrap">
                      {formatNumber(c.excluded ? c.amountXof : c.allocations.reduce((a, b) => a + b, 0), 0)}
                    </td>
                  ))}
                  <td className="py-2.5 pr-3 text-right tabular-nums whitespace-nowrap">
                    <MoneyCell value={t.landedXof} decimals={0} />
                  </td>
                  <td />
                  <td />
                  <td className="py-2.5 text-right tabular-nums">{t.coefficient ? formatNumber(t.coefficient, 4) : "—"}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {sheet.reappraisal.length > 0 ? (
        <section className="rounded-xl border bg-card p-4" data-testid="imp-reappraisal">
          <h2 className="mb-1 text-[15px] font-semibold">Effet sur le stock et le PMP</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            À la clôture, le surcoût des quantités encore en stock est ajouté au coût moyen pondéré (PMP). Le surcoût des quantités déjà sorties est signalé « écart sur sorties » : les sorties passées ne sont jamais réécrites.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs font-medium text-muted-foreground">
                  <th className="py-2 pr-3">Article</th>
                  <th className="py-2 pr-3">Dépôt</th>
                  <th className="py-2 pr-3 text-right">Reçu</th>
                  <th className="py-2 pr-3 text-right">En stock</th>
                  <th className="py-2 pr-3 text-right">PMP avant</th>
                  <th className="py-2 pr-3 text-right">PMP après</th>
                  <th className="py-2 pr-3 text-right">Surcoût appliqué au stock</th>
                  <th className="py-2 text-right">Écart sur sorties</th>
                </tr>
              </thead>
              <tbody>
                {sheet.reappraisal.map((r) => (
                  <tr key={`${r.itemId}-${r.warehouseId}`} className="border-b last:border-0" data-testid={`imp-reappraisal-${r.itemCode}`}>
                    <td className="py-2.5 pr-3">
                      <span className="doc-number">{r.itemCode}</span>
                      <span className="block text-xs text-muted-foreground">{r.designation}</span>
                    </td>
                    <td className="py-2.5 pr-3">{r.warehouseName}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">{formatQty(r.receivedQty)}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">{formatQty(r.stockQty)}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums whitespace-nowrap">
                      {fcfa2(r.pmpBefore)}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-medium tabular-nums whitespace-nowrap">
                      {fcfa2(r.pmpAfter)}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums whitespace-nowrap">
                      <MoneyCell value={r.appliedXof} decimals={0} />
                    </td>
                    <td className={`py-2.5 text-right tabular-nums whitespace-nowrap ${r.exposedXof > 0 ? "font-medium text-amber-700" : ""}`} data-testid="imp-exposed">
                      <MoneyCell value={r.exposedXof} decimals={0} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}

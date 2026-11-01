"use client";

import { useState } from "react";
import Link from "next/link";
import { Link2, Save, Unlink } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { WriteButton } from "@/components/license/write-button";
import { MoneyCell } from "@/components/money-cell";
import { NativeSelect } from "@/components/native-select";
import { StatusBadge } from "@/components/status-badge";
import { Input } from "@/components/ui/input";
import { useActionRunner } from "@/components/use-action-runner";
import { formatQty } from "@/lib/money";
import { linkImportOrderAction, listEligibleOrdersAction, setLineLogisticsAction, unlinkImportOrderAction } from "../actions";

export interface OrderView {
  id: string;
  number: string | null;
  status: string;
  currencyCode: string;
  totalHt: string;
  totalHtXof: number | null;
  lines: { id: string; lineNo: number; designation: string; quantity: string; unit: string; unitWeightKg: string | null; unitVolumeM3: string | null }[];
}

const num = (s: string): number | null | "bad" => {
  const v = s.trim().replace(/\s/g, "").replace(",", ".");
  if (v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : "bad";
};

/** Bons de commande du dossier : consultation, rattachement d'un BC éligible, retrait. */
export function OrdersPanel({ fileId, supplierId, orders, canWrite, canViewOrders }: { fileId: string; supplierId: string; orders: OrderView[]; canWrite: boolean; canViewOrders: boolean }) {
  const { run, pending } = useActionRunner();
  const [options, setOptions] = useState<{ id: string; number: string | null }[] | null>(null);
  const [choice, setChoice] = useState("");
  const [removing, setRemoving] = useState<OrderView | null>(null);

  return (
    <section className="rounded-xl border bg-card p-4" data-testid="imp-orders-panel">
      <h2 className="text-[15px] font-semibold">Bons de commande rattachés</h2>
      <p className="mb-3 mt-1 text-xs text-muted-foreground">La valeur des marchandises vient de ces bons (puis des réceptions validées).</p>
      {orders.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="imp-orders-none">
          Aucun bon de commande rattaché : le coût de revient ne peut pas être calculé.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs font-medium text-muted-foreground">
                <th className="py-2 pr-3">N° du bon</th>
                <th className="py-2 pr-3">Statut</th>
                <th className="py-2 pr-3 text-right">Montant HT</th>
                <th className="py-2 pr-3 text-right">Équivalent FCFA</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-b last:border-0" data-testid={`imp-order-row-${o.number}`}>
                  <td className="py-2.5 pr-3">
                    {canViewOrders ? (
                      <Link href={`/achats/commandes/${o.id}`} className="doc-number text-primary hover:underline">
                        {o.number}
                      </Link>
                    ) : (
                      <span className="doc-number">{o.number}</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3">
                    <StatusBadge status={o.status} />
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">
                    <MoneyCell value={o.totalHt} currency={o.currencyCode} decimals={o.currencyCode === "XOF" ? 0 : 2} />
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">
                    <MoneyCell value={o.totalHtXof} currency="XOF" decimals={0} />
                  </td>
                  <td className="py-2.5 text-right">
                    {canWrite ? (
                      <WriteButton variant="ghost" className="h-11 px-3" onClick={() => setRemoving(o)} data-testid={`imp-unlink-${o.number}`}>
                        <Unlink /> Retirer
                      </WriteButton>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {canWrite ? <LinkOrder fileId={fileId} supplierId={supplierId} options={options} setOptions={setOptions} choice={choice} setChoice={setChoice} /> : null}

      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Retirer le bon ${removing?.number ?? ""} du dossier ?`}
        description="Les frais estimés sont recalculés. Les frais réels déjà saisis ne changent pas."
        confirmLabel="Retirer le bon"
        pending={pending}
        testId="imp-unlink-dialog"
        onConfirm={async () => {
          if (!removing) return;
          await run(() => unlinkImportOrderAction({ fileId, orderId: removing.id }), { success: "Bon de commande retiré.", onSuccess: () => setRemoving(null) });
        }}
      />
    </section>
  );
}

function LinkOrder({
  fileId,
  supplierId,
  options,
  setOptions,
  choice,
  setChoice,
}: {
  fileId: string;
  supplierId: string;
  options: { id: string; number: string | null }[] | null;
  setOptions: (o: { id: string; number: string | null }[]) => void;
  choice: string;
  setChoice: (v: string) => void;
}) {
  const { run, pending } = useActionRunner();
  return (
    <div className="mt-4 flex flex-wrap items-end gap-2 border-t pt-4" data-testid="imp-link-order">
      {options === null ? (
        <WriteButton
          variant="outline"
          className="h-11 px-4"
          disabled={pending}
          data-testid="imp-link-load"
          onClick={() =>
            void run(() => listEligibleOrdersAction({ supplierId }), {
              refresh: false,
              onSuccess: (d) => setOptions(d),
            })
          }
        >
          <Link2 /> Rattacher un bon de commande
        </WriteButton>
      ) : options.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun autre bon de commande import disponible pour ce fournisseur.</p>
      ) : (
        <>
          <NativeSelect className="max-w-xs" value={choice} onChange={(e) => setChoice(e.target.value)} aria-label="Bon de commande à rattacher" data-testid="imp-link-select">
            <option value="">Choisir un bon de commande</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.number}
              </option>
            ))}
          </NativeSelect>
          <WriteButton
            className="h-11 px-4"
            disabled={!choice || pending}
            data-testid="imp-link-confirm"
            onClick={() => void run(() => linkImportOrderAction({ fileId, orderId: choice }), { success: "Bon de commande rattaché.", onSuccess: () => (setChoice(""), setOptions([])) })}
          >
            Rattacher
          </WriteButton>
        </>
      )}
    </div>
  );
}

/** Poids et volume unitaires par ligne : clés de répartition « Poids » et « Volume » des frais d'approche. */
export function LogisticsEditor({ fileId, orders, canWrite }: { fileId: string; orders: OrderView[]; canWrite: boolean }) {
  const { run, pending } = useActionRunner();
  const lines = orders.flatMap((o) => o.lines.map((l) => ({ ...l, orderNumber: o.number ?? "" })));
  const [vals, setVals] = useState<Record<string, { w: string; v: string }>>(() =>
    Object.fromEntries(lines.map((l) => [l.id, { w: l.unitWeightKg ?? "", v: l.unitVolumeM3 ?? "" }])),
  );
  const [error, setError] = useState<string | null>(null);
  if (lines.length === 0) return null;

  function save() {
    setError(null);
    const payload: { orderLineId: string; unitWeightKg: number | null; unitVolumeM3: number | null }[] = [];
    for (const l of lines) {
      const w = num(vals[l.id].w);
      const v = num(vals[l.id].v);
      if (w === "bad" || v === "bad") return setError(`Ligne ${l.orderNumber} / ${l.lineNo} : le poids et le volume doivent être des nombres positifs.`);
      payload.push({ orderLineId: l.id, unitWeightKg: w, unitVolumeM3: v });
    }
    void run(() => setLineLogisticsAction({ fileId, lines: payload }), { success: "Poids et volumes enregistrés.", onError: (e) => setError(e.message) });
  }

  return (
    <section className="rounded-xl border bg-card p-4" data-testid="imp-logistics">
      <h2 className="text-[15px] font-semibold">Poids et volume des marchandises</h2>
      <p className="mb-3 mt-1 text-xs text-muted-foreground">
        Poids (kg) et volume (m³) pour une unité d&apos;achat. Ils servent à répartir les frais (fret, acconage…) quand la clé « Poids » ou « Volume » est choisie. Sans valeur, la répartition se fait sur la valeur.
      </p>
      {error ? (
        <p role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" data-testid="imp-logistics-error">
          {error}
        </p>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b text-left text-xs font-medium text-muted-foreground">
              <th className="py-2 pr-3">Bon / ligne</th>
              <th className="py-2 pr-3">Désignation</th>
              <th className="py-2 pr-3 text-right">Quantité</th>
              <th className="w-36 py-2 pr-3">Poids unitaire (kg)</th>
              <th className="w-36 py-2">Volume unitaire (m³)</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} className="border-b last:border-0" data-testid={`imp-logistics-row-${l.orderNumber}-${l.lineNo}`}>
                <td className="py-2 pr-3 whitespace-nowrap">
                  <span className="doc-number">{l.orderNumber}</span> / {l.lineNo}
                </td>
                <td className="py-2 pr-3">{l.designation}</td>
                <td className="py-2 pr-3 text-right tabular-nums whitespace-nowrap">
                  {formatQty(l.quantity)} {l.unit}
                </td>
                <td className="py-1.5 pr-3">
                  <Input
                    inputMode="decimal"
                    className="h-11 text-right tabular-nums"
                    disabled={!canWrite}
                    value={vals[l.id].w}
                    onChange={(e) => setVals((p) => ({ ...p, [l.id]: { ...p[l.id], w: e.target.value } }))}
                    aria-label={`Poids unitaire en kg, ligne ${l.lineNo}`}
                    data-testid="imp-weight"
                  />
                </td>
                <td className="py-1.5">
                  <Input
                    inputMode="decimal"
                    className="h-11 text-right tabular-nums"
                    disabled={!canWrite}
                    value={vals[l.id].v}
                    onChange={(e) => setVals((p) => ({ ...p, [l.id]: { ...p[l.id], v: e.target.value } }))}
                    aria-label={`Volume unitaire en m³, ligne ${l.lineNo}`}
                    data-testid="imp-volume"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canWrite ? (
        <div className="mt-3 flex justify-end">
          <WriteButton className="h-11 px-4" disabled={pending} onClick={save} data-testid="imp-logistics-save">
            <Save /> Enregistrer
          </WriteButton>
        </div>
      ) : null}
    </section>
  );
}

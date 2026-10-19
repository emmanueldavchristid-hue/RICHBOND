"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FilePlus2 } from "lucide-react";
import { toast } from "sonner";
import { DateCell } from "@/components/date-cell";
import { EmptyState } from "@/components/empty-state";
import { WriteButton } from "@/components/license/write-button";
import { NativeSelect } from "@/components/native-select";
import { UrgencyBadge } from "@/components/purchase-requests/urgency-badge";
import { StatusBadge } from "@/components/status-badge";
import { Input } from "@/components/ui/input";
import { unitShort } from "@/components/unit-select";
import { useActionRunner } from "@/components/use-action-runner";
import { formatQty } from "@/lib/money";
import type { OrderableGroup } from "@/modules/purchase-orders/queries";
import type { Serialized } from "@/modules/referentials/serialize";
import { createOrderFromRequestLinesAction } from "../actions";

type Group = Serialized<OrderableGroup>;

export interface SupplierPick {
  id: string;
  label: string;
  allowed: boolean;
}

const NONE = "__none__";

/**
 * « À commander » (D6) : lignes de DA restant à commander, groupées par fournisseur principal de l'article.
 * Cocher des lignes puis « Créer le BC » crée un brouillon (un fournisseur par bon) qu'on complète ensuite.
 */
export function ToOrderList({
  groups,
  suppliers,
  preselect,
  requestLabel,
}: {
  groups: Group[];
  suppliers: SupplierPick[];
  /** Cocher toutes les lignes d'emblée (arrivée depuis la fiche d'une DA). */
  preselect: boolean;
  requestLabel?: string;
}) {
  const router = useRouter();
  const { run, pending } = useActionRunner();
  const [selected, setSelected] = useState<Set<string>>(() => new Set(preselect ? groups.flatMap((g) => g.lines.map((l) => l.requestLineId)) : []));
  const [qty, setQty] = useState<Record<string, string>>({});
  const [supplierFor, setSupplierFor] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const toggle = (id: string) =>
    setSelected((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const total = useMemo(() => groups.reduce((a, g) => a + g.lines.length, 0), [groups]);

  async function create(g: Group) {
    const key = g.supplier?.id ?? NONE;
    const supplierId = g.supplier?.id ?? supplierFor[key];
    const chosen = g.lines.filter((l) => selected.has(l.requestLineId));
    if (!supplierId) return setErrors((e) => ({ ...e, [key]: "Choisissez le fournisseur de ce bon de commande." }));
    if (chosen.length === 0) return setErrors((e) => ({ ...e, [key]: "Cochez au moins une ligne." }));
    const lines: { requestLineId: string; qty: string | null }[] = [];
    for (const l of chosen) {
      const raw = (qty[l.requestLineId] ?? "").trim().replace(",", ".");
      if (raw !== "") {
        const n = Number(raw);
        if (!Number.isFinite(n) || n <= 0) return setErrors((e) => ({ ...e, [key]: `Quantité invalide pour ${l.requestNumber} : ${l.designation}.` }));
        if (n > Number(l.remaining)) return setErrors((e) => ({ ...e, [key]: `${l.requestNumber} : il ne reste que ${formatQty(l.remaining)} ${unitShort(l.unit)} à commander.` }));
      }
      lines.push({ requestLineId: l.requestLineId, qty: raw === "" ? null : raw });
    }
    setErrors((e) => ({ ...e, [key]: "" }));
    await run(() => createOrderFromRequestLinesAction({ supplierId, lines }), {
      refresh: false,
      success: "Brouillon créé : vérifiez les prix, puis soumettez-le.",
      onSuccess: (d) => {
        router.push(`/achats/commandes/${d.id}/modifier`);
        toast.info("Complétez les prix et les conditions du bon.");
      },
    });
  }

  if (total === 0) {
    return (
      <EmptyState
        title="Rien à commander"
        description={requestLabel ? `Toutes les quantités de ${requestLabel} sont déjà rattachées à un bon de commande.` : "Toutes les demandes validées sont déjà rattachées à un bon de commande."}
      />
    );
  }

  return (
    <div className="space-y-6" data-testid="to-order">
      {groups.map((g) => {
        const key = g.supplier?.id ?? NONE;
        const blocked = g.supplier?.status === "BLOQUE";
        const count = g.lines.filter((l) => selected.has(l.requestLineId)).length;
        return (
          <section key={key} className="rounded-lg border bg-card" data-testid={`to-order-group-${g.supplier?.code ?? "sans-fournisseur"}`}>
            <header className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
              <div>
                <h2 className="font-medium">
                  {g.supplier ? (
                    <>
                      <span className="font-mono text-sm text-muted-foreground">{g.supplier.code}</span> {g.supplier.name}
                    </>
                  ) : (
                    "Sans fournisseur principal"
                  )}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {g.lines.length} ligne{g.lines.length > 1 ? "s" : ""} à commander
                  {g.supplier ? ` · ${g.supplier.type === "IMPORT" ? "Import" : "Local"}` : " · choisissez le fournisseur avant de créer le bon"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {!g.supplier ? (
                  <NativeSelect
                    aria-label="Fournisseur du bon de commande"
                    className="w-64"
                    value={supplierFor[key] ?? ""}
                    onChange={(e) => setSupplierFor((p) => ({ ...p, [key]: e.target.value }))}
                    data-testid="to-order-supplier"
                  >
                    <option value="">Choisir un fournisseur…</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id} disabled={!s.allowed}>
                        {s.label}
                        {s.allowed ? "" : " (hors de votre périmètre)"}
                      </option>
                    ))}
                  </NativeSelect>
                ) : null}
                <WriteButton className="h-11 px-4" disabled={pending || blocked} onClick={() => void create(g)} data-testid="to-order-create">
                  <FilePlus2 /> Créer le BC{count > 0 ? ` (${count})` : ""}
                </WriteButton>
              </div>
            </header>
            {blocked ? (
              <p role="alert" className="border-b bg-red-50 p-3 text-sm text-red-900" data-testid="to-order-blocked">
                Ce fournisseur est bloqué : aucun bon de commande possible. Choisissez un autre fournisseur depuis la fiche de l&apos;article.
              </p>
            ) : null}
            {errors[key] ? (
              <p role="alert" className="border-b bg-red-50 p-3 text-sm text-red-900" data-testid="to-order-error">
                {errors[key]}
              </p>
            ) : null}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[48rem] text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground uppercase">
                  <tr>
                    <th className="w-14 p-3">
                      <span className="sr-only">Sélection</span>
                    </th>
                    <th className="p-3">DA</th>
                    <th className="p-3">Article</th>
                    <th className="p-3 text-right">Besoin</th>
                    <th className="p-3 text-right">Déjà réservé</th>
                    <th className="p-3 text-right">Reste</th>
                    <th className="p-3">À commander</th>
                    <th className="p-3">Besoin pour le</th>
                  </tr>
                </thead>
                <tbody>
                  {g.lines.map((l) => (
                    <tr key={l.requestLineId} className="border-t" data-testid={`to-order-line-${l.requestNumber}-${l.itemCode ?? "libre"}`}>
                      <td className="p-3">
                        <input
                          type="checkbox"
                          className="size-6"
                          aria-label={`Sélectionner ${l.requestNumber} : ${l.designation}`}
                          checked={selected.has(l.requestLineId)}
                          onChange={() => toggle(l.requestLineId)}
                          data-testid="to-order-check"
                        />
                      </td>
                      <td className="p-3">
                        <Link href={`/achats/demandes/${l.requestId}`} className="font-mono text-primary underline-offset-4 hover:underline">
                          {l.requestNumber}
                        </Link>
                        <span className="mt-1 block">
                          <UrgencyBadge urgency={l.urgency} />
                        </span>
                      </td>
                      <td className="p-3">
                        {l.itemCode ? <span className="font-mono text-xs text-muted-foreground">{l.itemCode}</span> : <StatusBadge label="Hors catalogue" tone="neutral" />}
                        <span className="block font-medium">{l.designation}</span>
                      </td>
                      <td className="p-3 text-right whitespace-nowrap tabular-nums">
                        {formatQty(l.need)} {unitShort(l.unit)}
                      </td>
                      <td className="p-3 text-right whitespace-nowrap tabular-nums">{formatQty(l.reserved)}</td>
                      <td className="p-3 text-right font-semibold whitespace-nowrap text-amber-800 tabular-nums">
                        {formatQty(l.remaining)} {unitShort(l.unit)}
                      </td>
                      <td className="p-3">
                        <Input
                          inputMode="decimal"
                          className="h-12 w-28 text-right text-base"
                          aria-label={`Quantité à commander pour ${l.requestNumber} : ${l.designation}`}
                          placeholder={formatQty(l.remaining)}
                          value={qty[l.requestLineId] ?? ""}
                          onChange={(e) => setQty((p) => ({ ...p, [l.requestLineId]: e.target.value.replace(/[^\d.,]/g, "") }))}
                          data-testid="to-order-qty"
                        />
                        <span className="mt-0.5 block text-xs text-muted-foreground">vide = tout le reste</span>
                      </td>
                      <td className="p-3">
                        <DateCell value={l.neededBy} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}

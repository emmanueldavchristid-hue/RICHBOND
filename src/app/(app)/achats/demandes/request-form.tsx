"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PackagePlus, Save, Send, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FormError, FormField, TextArea } from "@/components/form-field";
import { WriteButton } from "@/components/license/write-button";
import { MoneyCell } from "@/components/money-cell";
import { NativeSelect } from "@/components/native-select";
import { AttachmentsPanel, type AttachmentView } from "@/components/purchase-requests/attachments-panel";
import { DuplicateWarning } from "@/components/purchase-requests/duplicate-warning";
import { ItemSearchCombobox, type ItemHit } from "@/components/purchase-requests/item-search-combobox";
import { StockCoverageCell, type StockSnapshotView } from "@/components/purchase-requests/stock-coverage-cell";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UnitSelect, unitName, unitShort } from "@/components/unit-select";
import { useActionRunner } from "@/components/use-action-runner";
import { cn } from "@/lib/utils";
import { PR_TYPE_LABELS, PR_URGENCY_LABELS, type PrType, type PrUrgency } from "@/modules/purchase-requests/labels";
import { STOP_REASON_MIN } from "@/modules/purchase-requests/priority";
import { createReplenishmentSchema, createRequestSchema, MAX_LINES } from "@/modules/purchase-requests/schemas";
import { estimatedTotal } from "@/modules/purchase-requests/totals";
import {
  addAttachmentAction,
  checkDuplicatesAction,
  createRequestAction,
  getStockSnapshotAction,
  submitRequestAction,
  updateRequestAction,
} from "./actions";

export interface LineDraft {
  key: string;
  itemId: string | null;
  code: string;
  name: string;
  freeDesignation: string;
  quantity: string;
  unit: string;
  purchaseUnit: string;
  stockUnit: string;
  price: string;
}

export interface RequestFormValues {
  departmentId: string;
  requesterName: string;
  reason: string;
  urgency: PrUrgency;
  neededBy: string;
  type: PrType;
  lines: LineDraft[];
}

let counter = 0;
export const newLineKey = () => `l${Date.now().toString(36)}${(counter++).toString(36)}`;

const URGENCY_HELP: Record<PrUrgency, string> = {
  NORMALE: "Besoin courant, traité dans l'ordre de la date de besoin.",
  URGENTE: "À traiter avant les demandes normales.",
  ARRET_PRODUCTION: "Une machine ou une ligne est arrêtée : le Responsable est alerté tout de suite.",
};

function Choice<T extends string>({
  name,
  value,
  options,
  onChange,
  testId,
}: {
  name: string;
  value: T;
  options: { value: T; label: string; help?: string; danger?: boolean }[];
  onChange: (v: T) => void;
  testId: string;
}) {
  return (
    <div role="radiogroup" className="grid gap-2 sm:grid-cols-3" data-testid={testId}>
      {options.map((o) => (
        <label
          key={o.value}
          className={cn(
            "flex min-h-14 cursor-pointer flex-col justify-center rounded-lg border px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-muted",
            o.danger && "has-[:checked]:border-red-700 has-[:checked]:bg-red-50",
          )}
        >
          <span className="flex items-center gap-2 font-medium">
            <input type="radio" className="size-5" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} data-testid={`${testId}-${o.value}`} />
            {o.label}
          </span>
          {o.help ? <span className="mt-0.5 pl-7 text-xs text-muted-foreground">{o.help}</span> : null}
        </label>
      ))}
    </div>
  );
}

type FieldErrors = Record<string, string>;

export function RequestForm({
  mode,
  requestId,
  updatedAt,
  initial,
  departments,
  attachments = [],
  isWarehouse,
  showPrices,
  today,
  displayNumber,
}: {
  mode: "create" | "edit";
  requestId?: string;
  updatedAt?: string;
  initial: RequestFormValues;
  departments: { id: string; name: string }[];
  attachments?: AttachmentView[];
  /** Magasinier : DA de réapprovisionnement, articles du catalogue seulement, sans prix. */
  isWarehouse: boolean;
  showPrices: boolean;
  /** Jour courant à Abidjan (yyyy-MM-dd). */
  today: string;
  displayNumber?: string;
}) {
  const router = useRouter();
  const { run, pending } = useActionRunner();
  const [v, setV] = useState<RequestFormValues>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [dups, setDups] = useState<Record<string, string[]>>({});
  const [stock, setStock] = useState<Record<string, StockSnapshotView> | null>(null);
  const [busy, setBusy] = useState(false);

  const qtyRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const designationRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const searchRef = useRef<HTMLInputElement>(null);
  const focusKey = useRef<{ key: string; field: "qty" | "designation" } | null>(null);

  const withPrices = showPrices && !isWarehouse;
  const busyAll = pending || busy;

  const set = <K extends keyof RequestFormValues>(k: K, val: RequestFormValues[K]) => {
    setV((p) => ({ ...p, [k]: val }));
    setErrors((e) => {
      if (!(k in e)) return e;
      const { [k]: _drop, ...rest } = e;
      void _drop;
      return rest;
    });
  };
  const setLine = (key: string, patch: Partial<LineDraft>) => {
    setV((p) => ({ ...p, lines: p.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) }));
    setErrors((e) => {
      const next = { ...e };
      for (const k of Object.keys(next)) if (k.startsWith(`line:${key}:`)) delete next[k];
      return next;
    });
  };

  // Focus après ajout d'une ligne.
  useEffect(() => {
    const f = focusKey.current;
    if (!f) return;
    focusKey.current = null;
    (f.field === "qty" ? qtyRefs.current[f.key] : designationRefs.current[f.key])?.focus();
  }, [v.lines]);

  // Doublons (D13) et stock/couverture (D14) pour les articles du catalogue de la DA.
  const itemIds = useMemo(() => v.lines.map((l) => l.itemId).filter((x): x is string => !!x), [v.lines]);
  const itemKey = itemIds.join("|");
  useEffect(() => {
    if (itemIds.length === 0) return;
    let cancelled = false;
    const t = window.setTimeout(async () => {
      const [d, s] = await Promise.all([
        checkDuplicatesAction({ itemIds, excludeId: requestId ?? null }),
        getStockSnapshotAction({ itemIds }),
      ]);
      if (cancelled) return;
      if (d.ok) {
        const m: Record<string, string[]> = {};
        for (const w of d.data) m[w.itemId] = w.messages;
        setDups(m);
      }
      if (s.ok) setStock(s.data);
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
    // itemKey résume itemIds
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemKey, requestId]);

  function addItem(h: ItemHit) {
    if (v.lines.length >= MAX_LINES) {
      setFormError(`Une demande ne peut pas dépasser ${MAX_LINES} lignes.`);
      return;
    }
    const key = newLineKey();
    focusKey.current = { key, field: "qty" };
    setV((p) => ({
      ...p,
      lines: [
        ...p.lines,
        { key, itemId: h.id, code: h.code, name: h.name, freeDesignation: "", quantity: "", unit: h.purchaseUnit, purchaseUnit: h.purchaseUnit, stockUnit: h.stockUnit, price: "" },
      ],
    }));
  }

  function addFree() {
    if (v.lines.length >= MAX_LINES) {
      setFormError(`Une demande ne peut pas dépasser ${MAX_LINES} lignes.`);
      return;
    }
    const key = newLineKey();
    focusKey.current = { key, field: "designation" };
    setV((p) => ({
      ...p,
      lines: [...p.lines, { key, itemId: null, code: "", name: "", freeDesignation: "", quantity: "", unit: "U", purchaseUnit: "U", stockUnit: "U", price: "" }],
    }));
  }

  function removeLine(key: string) {
    setV((p) => ({ ...p, lines: p.lines.filter((l) => l.key !== key) }));
  }

  /** Entrée = ligne suivante ; sur la dernière ligne, retour à la recherche d'article. */
  function nextFrom(key: string) {
    const i = v.lines.findIndex((l) => l.key === key);
    const next = v.lines[i + 1];
    if (next) (next.itemId ? qtyRefs.current[next.key] : designationRefs.current[next.key])?.focus();
    else searchRef.current?.focus();
  }

  const payload = useCallback(
    () => ({
      departmentId: v.departmentId,
      requesterName: v.requesterName,
      reason: v.reason,
      urgency: v.urgency,
      neededBy: v.neededBy,
      type: isWarehouse ? "A_DEFINIR" : v.type,
      lines: v.lines.map((l) => ({
        itemId: l.itemId ?? "",
        freeDesignation: l.itemId ? "" : l.freeDesignation,
        quantity: l.quantity,
        unit: l.unit,
        estimatedUnitPrice: withPrices ? l.price : "",
        note: "",
      })),
    }),
    [v, isWarehouse, withPrices],
  );

  const total = useMemo(() => {
    if (!withPrices) return null;
    try {
      return estimatedTotal(
        v.lines.map((l) => ({
          quantity: l.quantity.trim() === "" ? 0 : l.quantity,
          estimatedUnitPrice: l.price.trim() === "" || !/^\d+$/.test(l.price.trim()) ? null : Number(l.price),
        })),
      );
    } catch {
      return null;
    }
  }, [v.lines, withPrices]);

  function validate(forSubmit: boolean): boolean {
    const parsed = (isWarehouse ? createReplenishmentSchema : createRequestSchema).safeParse(payload());
    const errs: FieldErrors = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const [head, idx, sub] = issue.path;
        if (head === "lines" && typeof idx === "number") {
          const key = v.lines[idx]?.key;
          if (key) errs[`line:${key}:${String(sub ?? "line")}`] ??= issue.message;
        } else if (typeof head === "string") {
          errs[head] ??= issue.message;
        } else {
          errs.form ??= issue.message;
        }
      }
    }
    if (forSubmit && v.lines.length === 0) errs.lines = "Ajoutez au moins une ligne avant de soumettre la demande.";
    if (forSubmit && v.urgency !== "ARRET_PRODUCTION" && v.neededBy && v.neededBy < today) errs.neededBy = "La date de besoin ne peut pas être dans le passé.";
    setErrors(errs);
    setFormError(Object.keys(errs).length > 0 ? "Corrigez les champs signalés en rouge avant de continuer." : null);
    return Object.keys(errs).length === 0;
  }

  async function save(thenSubmit: boolean) {
    setConfirmSubmit(false);
    if (!validate(thenSubmit)) return;
    setBusy(true);
    try {
      let id = requestId ?? "";
      let version = updatedAt ?? "";
      const saved =
        mode === "create"
          ? await run(() => createRequestAction(payload()), { refresh: false })
          : await run(() => updateRequestAction({ ...payload(), id, expectedUpdatedAt: version }), { refresh: false });
      if (!saved?.ok) return;
      id = saved.data.id;
      version = new Date(saved.data.updatedAt).toISOString();

      let attachmentsFailed = false;
      for (const f of files) {
        const fd = new FormData();
        fd.set("requestId", id);
        fd.set("file", f);
        const r = await run(() => addAttachmentAction(fd), { refresh: false });
        if (!r?.ok) {
          attachmentsFailed = true;
          break;
        }
      }
      if (attachmentsFailed) {
        // Le brouillon existe : on le rouvre pour que l'utilisateur corrige la pièce jointe.
        router.push(`/achats/demandes/${id}/modifier`);
        return;
      }

      if (thenSubmit) {
        const sub = await run(() => submitRequestAction({ id, expectedUpdatedAt: version }), {
          refresh: false,
          success: (d) => `Demande ${d.displayNumber} soumise au Responsable Achats.`,
        });
        if (!sub?.ok) {
          router.push(`/achats/demandes/${id}`);
          return;
        }
      } else {
        const { toast } = await import("sonner");
        toast.success(mode === "create" ? "Brouillon enregistré." : "Modifications enregistrées.");
      }
      router.push(`/achats/demandes/${id}`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const stopSelected = v.urgency === "ARRET_PRODUCTION";
  const lineErr = (key: string, f: string) => errors[`line:${key}:${f}`];

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        void save(false);
      }}
      noValidate
      data-testid="pr-form"
    >
      <FormError message={formError} testId="pr-form-error" />

      <section className="space-y-4 rounded-lg border bg-card p-5" aria-labelledby="pr-head">
        <h2 id="pr-head" className="font-medium">
          1. Informations générales {displayNumber ? <span className="font-mono text-sm text-muted-foreground">({displayNumber})</span> : null}
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <FormField id="pr-department" label="Service demandeur" required error={errors.departmentId}>
            <NativeSelect id="pr-department" value={v.departmentId} onChange={(e) => set("departmentId", e.target.value)} data-testid="pr-department">
              <option value="">Choisir un service…</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField id="pr-requester" label="Demandeur" required hint="La personne qui exprime le besoin." error={errors.requesterName}>
            <Input id="pr-requester" className="h-11" value={v.requesterName} onChange={(e) => set("requesterName", e.target.value)} data-testid="pr-requester" />
          </FormField>
        </div>

        <div className="space-y-1.5">
          <p className="text-sm font-medium">Urgence</p>
          <Choice
            name="pr-urgency"
            testId="pr-urgency"
            value={v.urgency}
            onChange={(u) => {
              set("urgency", u);
              if (u === "ARRET_PRODUCTION" && !v.neededBy) set("neededBy", today);
            }}
            options={(Object.keys(PR_URGENCY_LABELS) as PrUrgency[]).map((u) => ({ value: u, label: PR_URGENCY_LABELS[u], help: URGENCY_HELP[u], danger: u === "ARRET_PRODUCTION" }))}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <FormField
            id="pr-needed-by"
            label="Date de besoin"
            required={!stopSelected}
            hint={stopSelected ? "Arrêt de production : aujourd'hui par défaut." : "Date à laquelle les articles doivent être disponibles."}
            error={errors.neededBy}
          >
            <Input id="pr-needed-by" type="date" min={today} className="h-11" value={v.neededBy} onChange={(e) => set("neededBy", e.target.value)} data-testid="pr-needed-by" />
          </FormField>
          {!isWarehouse ? (
            <FormField id="pr-type" label="Type d'achat" hint="« À définir » : le Responsable choisira Local ou Import à la validation." error={errors.type}>
              <NativeSelect id="pr-type" value={v.type} onChange={(e) => set("type", e.target.value as PrType)} data-testid="pr-type">
                {(Object.keys(PR_TYPE_LABELS) as PrType[]).map((t) => (
                  <option key={t} value={t}>
                    {PR_TYPE_LABELS[t]}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
          ) : null}
        </div>

        <FormField
          id="pr-reason"
          label={stopSelected ? "Motif (machine ou ligne arrêtée)" : "Motif de la demande"}
          required
          hint={stopSelected ? `Précisez la machine ou la ligne arrêtée (${STOP_REASON_MIN} caractères minimum).` : "Pourquoi cet achat est nécessaire."}
          error={errors.reason}
        >
          <TextArea id="pr-reason" value={v.reason} maxLength={1000} onChange={(e) => set("reason", e.target.value)} data-testid="pr-reason" />
        </FormField>
      </section>

      <section className="space-y-4 rounded-lg border bg-card p-5" aria-labelledby="pr-lines">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="pr-lines" className="font-medium">
            2. Articles demandés <span className="text-sm font-normal text-muted-foreground">({v.lines.length} / {MAX_LINES})</span>
          </h2>
        </div>

        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-64 flex-1">
            <ItemSearchCombobox onSelect={addItem} inputRef={searchRef} excludeIds={itemIds} testId="pr-item-search" />
          </div>
          {!isWarehouse ? (
            <Button type="button" variant="outline" className="h-12 px-4" onClick={addFree} data-testid="pr-add-free">
              <PackagePlus /> Article absent du catalogue
            </Button>
          ) : null}
        </div>
        {errors.lines ? (
          <p role="alert" className="text-sm text-red-700" data-testid="pr-lines-error">
            {errors.lines}
          </p>
        ) : null}

        {v.lines.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground" data-testid="pr-lines-empty">
            Aucun article pour le moment. Recherchez un article ci-dessus (code ou désignation) puis saisissez la quantité.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[44rem] text-sm" data-testid="pr-lines-table">
              <thead className="text-left text-xs font-medium text-muted-foreground border-b">
                <tr>
                  <th className="p-2">N°</th>
                  <th className="p-2">Article</th>
                  <th className="p-2">Quantité</th>
                  <th className="p-2">Unité</th>
                  {withPrices ? <th className="p-2 text-right">Prix estimé (FCFA / unité)</th> : null}
                  <th className="p-2">Stock</th>
                  <th className="p-2">
                    <span className="sr-only">Retirer</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {v.lines.map((l, i) => {
                  const warn = l.itemId ? dups[l.itemId] : undefined;
                  const units = l.itemId ? [...new Set([l.purchaseUnit, l.stockUnit])] : [];
                  return (
                    <LineRows
                      key={l.key}
                      cols={4 + (withPrices ? 1 : 0) + 1 + 1}
                      testId={`pr-line-${i + 1}`}
                      warn={warn}
                      errors={[lineErr(l.key, "itemId"), lineErr(l.key, "freeDesignation"), lineErr(l.key, "quantity"), lineErr(l.key, "unit"), lineErr(l.key, "estimatedUnitPrice")].filter((x): x is string => !!x)}
                    >
                      <td className="p-2 align-top tabular-nums">{i + 1}</td>
                      <td className="min-w-56 p-2 align-top">
                        {l.itemId ? (
                          <>
                            <span className="font-mono text-xs text-muted-foreground">{l.code}</span>
                            <span className="block font-medium">{l.name}</span>
                          </>
                        ) : (
                          <Input
                            ref={(el) => {
                              designationRefs.current[l.key] = el;
                            }}
                            className="h-12 text-base"
                            aria-label={`Désignation de la ligne ${i + 1}`}
                            placeholder="Désignation de l'article nouveau"
                            value={l.freeDesignation}
                            onChange={(e) => setLine(l.key, { freeDesignation: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                qtyRefs.current[l.key]?.focus();
                              }
                            }}
                            data-testid={`pr-line-${i + 1}-designation`}
                          />
                        )}
                      </td>
                      <td className="p-2 align-top">
                        <Input
                          ref={(el) => {
                            qtyRefs.current[l.key] = el;
                          }}
                          inputMode="decimal"
                          className="h-12 w-28 text-right text-base"
                          aria-label={`Quantité de la ligne ${i + 1}`}
                          value={l.quantity}
                          onChange={(e) => setLine(l.key, { quantity: e.target.value.replace(/[^\d.,]/g, "") })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              nextFrom(l.key);
                            }
                          }}
                          data-testid={`pr-line-${i + 1}-qty`}
                        />
                      </td>
                      <td className="p-2 align-top">
                        {l.itemId ? (
                          units.length > 1 ? (
                            <NativeSelect
                              className="h-12 w-36"
                              aria-label={`Unité de la ligne ${i + 1}`}
                              value={l.unit}
                              onChange={(e) => setLine(l.key, { unit: e.target.value })}
                              data-testid={`pr-line-${i + 1}-unit`}
                            >
                              {units.map((u) => (
                                <option key={u} value={u}>
                                  {unitName(u)} ({unitShort(u)}){u === l.purchaseUnit ? " – achat" : " – stock"}
                                </option>
                              ))}
                            </NativeSelect>
                          ) : (
                            <span className="inline-flex min-h-12 items-center">{unitShort(l.unit)}</span>
                          )
                        ) : (
                          <UnitSelect className="h-12 w-36" aria-label={`Unité de la ligne ${i + 1}`} value={l.unit} onChange={(e) => setLine(l.key, { unit: e.target.value })} data-testid={`pr-line-${i + 1}-unit`} />
                        )}
                      </td>
                      {withPrices ? (
                        <td className="p-2 align-top text-right">
                          <Input
                            inputMode="numeric"
                            className="ml-auto h-12 w-36 text-right text-base"
                            aria-label={`Prix estimé de la ligne ${i + 1}`}
                            placeholder="Facultatif"
                            value={l.price}
                            onChange={(e) => setLine(l.key, { price: e.target.value.replace(/\D/g, "") })}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                nextFrom(l.key);
                              }
                            }}
                            data-testid={`pr-line-${i + 1}-price`}
                          />
                        </td>
                      ) : null}
                      <td className="p-2 align-top">
                        {l.itemId ? <StockCoverageCell snapshot={stock?.[l.itemId] ?? null} unit={l.stockUnit} /> : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="p-2 align-top">
                        <Button type="button" variant="ghost" className="size-12 p-0" aria-label={`Retirer la ligne ${i + 1}`} onClick={() => removeLine(l.key)} data-testid={`pr-line-${i + 1}-remove`}>
                          <Trash2 />
                        </Button>
                      </td>
                    </LineRows>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {withPrices ? (
          <p className="flex justify-end gap-2 text-sm" data-testid="pr-total">
            <span className="text-muted-foreground">Total estimé :</span>
            <span className="font-semibold">
              <MoneyCell value={total} decimals={0} empty="non chiffré" />
            </span>
          </p>
        ) : null}
      </section>

      <section className="space-y-3 rounded-lg border bg-card p-5" aria-labelledby="pr-att">
        <h2 id="pr-att" className="font-medium">
          3. Pièces jointes <span className="text-sm font-normal text-muted-foreground">(facultatif)</span>
        </h2>
        {mode === "create" ? (
          <AttachmentsPanel requestId={null} items={[]} canEdit pendingFiles={files} onPendingChange={setFiles} />
        ) : (
          <AttachmentsPanel requestId={requestId ?? null} items={attachments} canEdit />
        )}
      </section>

      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-end gap-3 border-t bg-card/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
        <Link
          href={mode === "edit" && requestId ? `/achats/demandes/${requestId}` : "/achats/demandes"}
          className={cn(buttonVariants({ variant: "ghost" }), "h-12 px-4")}
          data-testid="pr-cancel"
        >
          Quitter sans enregistrer
        </Link>
        <WriteButton type="submit" variant="outline" className="h-12 px-5 text-base" disabled={busyAll} data-testid="pr-save-draft">
          <Save /> Enregistrer le brouillon
        </WriteButton>
        <WriteButton
          type="button"
          className="h-12 px-5 text-base"
          disabled={busyAll}
          onClick={() => {
            if (validate(true)) setConfirmSubmit(true);
          }}
          data-testid="pr-submit"
        >
          <Send /> Soumettre
        </WriteButton>
      </div>

      <ConfirmDialog
        open={confirmSubmit}
        onOpenChange={setConfirmSubmit}
        title="Soumettre cette demande d'achat ?"
        description={
          stopSelected
            ? "Un numéro DA sera attribué et le Responsable Achats sera alerté immédiatement (arrêt de production). Vous ne pourrez plus la modifier sauf si elle vous est renvoyée à compléter."
            : "Un numéro DA sera attribué et la demande partira chez le Responsable Achats. Vous ne pourrez plus la modifier sauf si elle vous est renvoyée à compléter."
        }
        confirmLabel="Soumettre la demande"
        pending={busyAll}
        testId="pr-submit-dialog"
        onConfirm={() => save(true)}
      />
    </form>
  );
}

/** Une ligne de saisie + (si besoin) sa ligne d'avertissements (doublons) et d'erreurs. */
function LineRows({
  children,
  cols,
  testId,
  warn,
  errors,
}: {
  children: React.ReactNode;
  cols: number;
  testId: string;
  warn?: string[];
  errors: string[];
}) {
  return (
    <>
      <tr className="border-t" data-testid={testId}>
        {children}
      </tr>
      {errors.length > 0 || (warn && warn.length > 0) ? (
        <tr>
          <td colSpan={cols} className="space-y-2 px-2 pb-2">
            {errors.map((m, i) => (
              <p key={i} role="alert" className="text-sm text-red-700" data-testid={`${testId}-error`}>
                {m}
              </p>
            ))}
            {warn && warn.length > 0 ? <DuplicateWarning messages={warn} testId={`${testId}-duplicate`} /> : null}
          </td>
        </tr>
      ) : null}
    </>
  );
}

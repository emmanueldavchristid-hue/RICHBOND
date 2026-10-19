"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, PackagePlus, Plus, Save, Search, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FormError, FormField, TextArea } from "@/components/form-field";
import { WriteButton } from "@/components/license/write-button";
import { NativeSelect } from "@/components/native-select";
import { OrderTotals } from "@/components/purchase-orders/order-totals";
import { PriceAlertBadge } from "@/components/purchase-orders/price-alert-badge";
import { calcTotals } from "@/components/purchase-orders/totals-calc";
import { DuplicateWarning } from "@/components/purchase-requests/duplicate-warning";
import { ItemSearchCombobox, type ItemHit } from "@/components/purchase-requests/item-search-combobox";
import { UrgencyBadge } from "@/components/purchase-requests/urgency-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UnitSelect, unitShort } from "@/components/unit-select";
import { useActionRunner } from "@/components/use-action-runner";
import { formatDateOnly } from "@/lib/dates";
import { formatAmount, formatQty } from "@/lib/money";
import { cn } from "@/lib/utils";
import { VAT_RATES } from "@/modules/purchase-orders/labels";
import type { orderFormOptions } from "@/modules/purchase-orders/form-data";
import type { OrderableLine } from "@/modules/purchase-orders/queries";
import type { Serialized } from "@/modules/referentials/serialize";
import { INCOTERM_LABELS, PAYMENT_TERM_LABELS } from "@/modules/referentials/labels";
import { checkOrderDuplicatesAction, createOrderAction, priceCheckAction, searchOrderableLinesAction, submitOrderAction, updateOrderAction } from "./actions";

type FormOptions = Awaited<ReturnType<typeof orderFormOptions>>;
type Orderable = Serialized<OrderableLine>;

export interface FormAllocation {
  requestLineId: string;
  /** Dans l'unité de la ligne de DA. */
  qty: string;
  label: string;
  unit: string;
}

export interface FormLine {
  key: string;
  itemId: string | null;
  code: string;
  name: string;
  freeDesignation: string;
  /** Unité d'achat (unité de la quantité commandée). */
  unit: string;
  quantity: string;
  unitPrice: string;
  discountPct: string;
  vatRate: string;
  supplierRef: string;
  note: string;
  allocations: FormAllocation[];
}

export interface FormCharge {
  key: string;
  label: string;
  amount: string;
  vatRate: string;
}

export interface OrderFormValues {
  supplierId: string;
  origin: "DA" | "DIRECT";
  directReason: string;
  currencyCode: string;
  paymentTerm: string;
  paymentTermNote: string;
  incoterm: string;
  incotermPlace: string;
  warehouseId: string;
  deliveryAddress: string;
  requestedDate: string;
  supplierRef: string;
  notes: string;
  internalNote: string;
  lines: FormLine[];
  charges: FormCharge[];
}

const MAX_LINES = 50;
const MAX_CHARGES = 10;
let counter = 0;
const newKey = () => `o${Date.now().toString(36)}${(counter++).toString(36)}`;
const dec = (s: string) => Number(s.trim().replace(",", "."));
const cleanDecimal = (s: string) => s.replace(/[^\d.,]/g, "");

interface PriceInfo {
  itemId: string;
  lastPriceXof: number | null;
  lastPriceDate: Date | string | null;
  lastSupplierCode: string | null;
  message: string | null;
  alert: boolean;
}

/** Recherche d'une ligne de DA restant à commander (par article, désignation ou numéro de DA). */
function OrderableLinePicker({ supplierId, onPick, disabled }: { supplierId: string; onPick: (l: Orderable) => void; disabled: boolean }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<Orderable[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    if (!open) return;
    const my = ++seq.current;
    const t = window.setTimeout(
      async () => {
        setLoading(true);
        try {
          const res = await searchOrderableLinesAction({ q, supplierId: null, limit: 30 });
          if (my !== seq.current) return;
          if (res.ok) {
            setHits(res.data as Orderable[]);
            setFailed(false);
          } else setFailed(true);
        } catch {
          if (my === seq.current) setFailed(true);
        } finally {
          if (my === seq.current) setLoading(false);
        }
      },
      q === "" ? 0 : 250,
    );
    return () => window.clearTimeout(t);
  }, [q, open, supplierId]);

  return (
    <div className="space-y-2" data-testid="po-picker">
      <div className="relative">
        <Search className="pointer-events-none absolute top-3.5 left-3 size-4 text-muted-foreground" aria-hidden />
        <Input
          aria-label="Rechercher une ligne de demande d'achat à commander"
          placeholder="Rechercher une DA ou un article à commander (n° de DA, code, désignation)"
          className="h-12 pl-9 text-base"
          value={q}
          disabled={disabled}
          autoComplete="off"
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          data-testid="po-picker-input"
        />
      </div>
      {open ? (
        <div className="rounded-lg border bg-card" data-testid="po-picker-results">
          <div className="flex items-center justify-between border-b px-3 py-1.5 text-xs text-muted-foreground">
            <span>{loading ? "Recherche…" : `${hits.length} ligne${hits.length > 1 ? "s" : ""} à commander`}</span>
            <button type="button" className="min-h-11 px-2 underline" onClick={() => setOpen(false)} data-testid="po-picker-close">
              Fermer la liste
            </button>
          </div>
          {failed ? <p className="p-3 text-sm text-red-700">La recherche a échoué. Réessayez.</p> : null}
          {!loading && !failed && hits.length === 0 ? <p className="p-3 text-sm text-muted-foreground">Aucune ligne à commander ne correspond.</p> : null}
          <ul className="max-h-80 divide-y overflow-auto">
            {hits.map((h) => (
              <li key={h.requestLineId}>
                <button
                  type="button"
                  className="flex min-h-14 w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted"
                  onClick={() => onPick(h)}
                  data-testid={`po-picker-option-${h.requestNumber}-${h.itemCode ?? "libre"}`}
                >
                  <span className="min-w-0">
                    <span className="font-mono text-xs text-muted-foreground">
                      {h.requestNumber} {h.itemCode ? `· ${h.itemCode}` : ""}
                    </span>
                    <span className="block truncate font-medium">{h.designation}</span>
                    <span className="block text-xs text-muted-foreground">
                      {h.mainSupplier ? `Fournisseur principal : ${h.mainSupplier.name}` : "Sans fournisseur principal"} · besoin le {formatDateOnly(new Date(h.neededBy))}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className="font-semibold text-amber-800 tabular-nums">
                      Reste {formatQty(h.remaining)} {unitShort(h.unit)}
                    </span>
                    <UrgencyBadge urgency={h.urgency} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function OrderForm({
  mode,
  orderId,
  updatedAt,
  displayNumber,
  initial,
  options,
  defaultVatRate,
  today,
  canDirect,
  lockSupplier = false,
}: {
  mode: "create" | "edit";
  orderId?: string;
  updatedAt?: string;
  displayNumber?: string;
  initial: OrderFormValues;
  options: FormOptions;
  defaultVatRate: number;
  today: string;
  /** Responsable : commande directe sans DA, avec motif. */
  canDirect: boolean;
  /** Avenant : le fournisseur ne change pas. */
  lockSupplier?: boolean;
}) {
  const router = useRouter();
  const { run, pending } = useActionRunner();
  const [v, setV] = useState<OrderFormValues>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [addressTouched, setAddressTouched] = useState(mode === "edit");
  const [prices, setPrices] = useState<Record<string, PriceInfo>>({});
  const [dups, setDups] = useState<Record<string, string[]>>({});
  const [freeDraft, setFreeDraft] = useState<{ name: string; unit: string } | null>(null);
  const qtyRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const focusKey = useRef<string | null>(null);

  const supplier = options.suppliers.find((s) => s.id === v.supplierId) ?? null;
  const isImport = supplier?.type === "IMPORT";
  const currency = options.currencies.find((c) => c.code === v.currencyCode) ?? null;
  const decimals = v.currencyCode === "XOF" ? 0 : (currency?.decimals ?? 2);
  const busyAll = pending || busy;
  const direct = v.origin === "DIRECT";
  const newVat = () => String(isImport ? 0 : defaultVatRate);

  const set = <K extends keyof OrderFormValues>(k: K, val: OrderFormValues[K]) => {
    setV((p) => ({ ...p, [k]: val }));
    setErrors((e) => {
      if (!(k in e)) return e;
      const { [k]: _drop, ...rest } = e;
      void _drop;
      return rest;
    });
  };
  const setLine = (key: string, patch: Partial<FormLine>) => {
    setV((p) => ({ ...p, lines: p.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) }));
    setErrors((e) => {
      const next = { ...e };
      for (const k of Object.keys(next)) if (k.startsWith(`line:${key}:`)) delete next[k];
      return next;
    });
  };

  useEffect(() => {
    const k = focusKey.current;
    if (!k) return;
    focusKey.current = null;
    qtyRefs.current[k]?.focus();
  }, [v.lines]);

  // Fournisseur choisi : devise, conditions de paiement et incoterm proposés depuis sa fiche (modifiables).
  function pickSupplier(id: string) {
    const s = options.suppliers.find((x) => x.id === id);
    setV((p) => ({
      ...p,
      supplierId: id,
      ...(s
        ? {
            currencyCode: s.currencyCode,
            paymentTerm: s.paymentTerm,
            paymentTermNote: s.paymentTermNote ?? "",
            incoterm: s.type === "IMPORT" ? (s.incoterm ?? "") : "",
            incotermPlace: s.type === "IMPORT" ? p.incotermPlace : "",
          }
        : {}),
    }));
    setErrors((e) => {
      const { supplierId: _a, ...rest } = e;
      void _a;
      return rest;
    });
  }

  function pickWarehouse(id: string) {
    const w = options.warehouses.find((x) => x.id === id);
    setV((p) => ({ ...p, warehouseId: id, deliveryAddress: addressTouched ? p.deliveryAddress : (w?.address ?? "") }));
  }

  function addOrderable(h: Orderable) {
    if (v.lines.some((l) => l.allocations.some((a) => a.requestLineId === h.requestLineId))) {
      toast.info("Cette ligne de demande est déjà dans le bon.");
      return;
    }
    if (!v.supplierId && h.mainSupplier) {
      const s = options.suppliers.find((x) => x.id === h.mainSupplier!.id);
      if (s?.allowed) pickSupplier(s.id);
    }
    const alloc: FormAllocation = { requestLineId: h.requestLineId, qty: String(h.remaining), label: h.requestNumber, unit: h.unit };
    const purchaseQty = String(h.remainingPurchaseQty ?? h.remaining);
    const existing = h.itemId ? v.lines.find((l) => l.itemId === h.itemId) : null;
    if (existing) {
      const sum = Math.round((dec(existing.quantity || "0") + Number(purchaseQty)) * 1000) / 1000;
      setLine(existing.key, { quantity: String(sum), allocations: [...existing.allocations, alloc] });
      toast.success("Même article : quantité regroupée sur la ligne existante.");
      return;
    }
    if (v.lines.length >= MAX_LINES) return setFormError(`Un bon de commande ne peut pas dépasser ${MAX_LINES} lignes.`);
    const key = newKey();
    focusKey.current = key;
    setV((p) => ({
      ...p,
      lines: [
        ...p.lines,
        {
          key,
          itemId: h.itemId,
          code: h.itemCode ?? "",
          name: h.itemId ? h.designation : "",
          freeDesignation: h.itemId ? "" : h.designation,
          unit: h.purchaseUnit ?? h.unit,
          quantity: purchaseQty,
          unitPrice: "",
          discountPct: "0",
          vatRate: newVat(),
          supplierRef: "",
          note: "",
          allocations: [alloc],
        },
      ],
    }));
  }

  function addItem(h: ItemHit) {
    if (v.lines.length >= MAX_LINES) return setFormError(`Un bon de commande ne peut pas dépasser ${MAX_LINES} lignes.`);
    const key = newKey();
    focusKey.current = key;
    setV((p) => ({
      ...p,
      lines: [
        ...p.lines,
        { key, itemId: h.id, code: h.code, name: h.name, freeDesignation: "", unit: h.purchaseUnit, quantity: "", unitPrice: "", discountPct: "0", vatRate: newVat(), supplierRef: "", note: "", allocations: [] },
      ],
    }));
  }

  function addFree() {
    if (!freeDraft) return;
    if (freeDraft.name.trim().length < 5) return setFormError("La désignation d'une ligne libre doit comporter au moins 5 caractères.");
    if (v.lines.length >= MAX_LINES) return setFormError(`Un bon de commande ne peut pas dépasser ${MAX_LINES} lignes.`);
    const key = newKey();
    focusKey.current = key;
    setFormError(null);
    setV((p) => ({
      ...p,
      lines: [
        ...p.lines,
        { key, itemId: null, code: "", name: "", freeDesignation: freeDraft.name.trim(), unit: freeDraft.unit, quantity: "", unitPrice: "", discountPct: "0", vatRate: newVat(), supplierRef: "", note: "", allocations: [] },
      ],
    }));
    setFreeDraft(null);
  }

  const removeLine = (key: string) => setV((p) => ({ ...p, lines: p.lines.filter((l) => l.key !== key) }));

  // Contrôle de prix en direct (dernier prix d'achat, écart) et doublons de commande.
  const priceKey = v.lines.map((l) => `${l.itemId}:${l.unitPrice}:${l.discountPct}`).join("|") + v.currencyCode;
  useEffect(() => {
    const lines = v.lines.filter((l) => l.itemId && dec(l.unitPrice || "0") > 0).map((l) => ({ itemId: l.itemId!, unitPrice: l.unitPrice, discountPct: l.discountPct || "0" }));
    if (lines.length === 0) return;
    let cancelled = false;
    const t = window.setTimeout(async () => {
      const r = await priceCheckAction({ currencyCode: v.currencyCode, lines });
      if (cancelled || !r.ok) return;
      setPrices(Object.fromEntries((r.data as PriceInfo[]).map((p) => [p.itemId, p])));
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
    // priceKey résume les lignes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceKey]);

  const itemKey = v.lines.map((l) => l.itemId).filter(Boolean).join("|");
  useEffect(() => {
    const itemIds = v.lines.map((l) => l.itemId).filter((x): x is string => !!x);
    if (itemIds.length === 0) return;
    let cancelled = false;
    const t = window.setTimeout(async () => {
      const r = await checkOrderDuplicatesAction({ itemIds, excludeId: orderId ?? null });
      if (cancelled || !r.ok) return;
      const m: Record<string, string[]> = {};
      for (const w of r.data as { itemId?: string; message: string }[]) if (w.itemId) (m[w.itemId] ??= []).push(w.message);
      setDups(m);
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
    // itemKey résume les articles
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemKey, orderId]);

  const totals = useMemo(
    () => calcTotals(v.lines, v.charges, v.currencyCode, decimals, currency?.rate ?? null),
    [v.lines, v.charges, v.currencyCode, decimals, currency?.rate],
  );

  function payload() {
    return {
      supplierId: v.supplierId,
      origin: v.origin,
      directReason: direct ? v.directReason : null,
      currencyCode: v.currencyCode,
      paymentTerm: v.paymentTerm || null,
      paymentTermNote: v.paymentTermNote || null,
      incoterm: isImport ? v.incoterm || null : null,
      incotermPlace: isImport ? v.incotermPlace || null : null,
      warehouseId: v.warehouseId,
      deliveryAddress: v.deliveryAddress || null,
      requestedDate: v.requestedDate,
      supplierRef: v.supplierRef || null,
      notes: v.notes || null,
      internalNote: v.internalNote || null,
      lines: v.lines.map((l) => ({
        itemId: l.itemId,
        freeDesignation: l.itemId ? null : l.freeDesignation,
        supplierRef: l.supplierRef || null,
        quantity: l.quantity,
        unit: l.unit,
        unitPrice: l.unitPrice.trim() === "" ? "0" : l.unitPrice,
        discountPct: l.discountPct.trim() === "" ? "0" : l.discountPct,
        vatRate: l.vatRate,
        note: l.note || null,
        allocations: l.allocations.map((a) => ({ requestLineId: a.requestLineId, qty: a.qty })),
      })),
      charges: v.charges.filter((c) => c.label.trim() !== "" || c.amount.trim() !== "").map((c) => ({ label: c.label, amount: c.amount, vatRate: c.vatRate })),
    };
  }

  /** Contrôles simples avant l'envoi ; le serveur revalide tout (règles de gestion, périmètre, fournisseur bloqué). */
  function validate(forSubmit: boolean): boolean {
    const errs: Record<string, string> = {};
    if (!v.supplierId) errs.supplierId = "Choisissez le fournisseur.";
    if (!v.warehouseId) errs.warehouseId = "Choisissez le dépôt de livraison.";
    if (!v.requestedDate) errs.requestedDate = "Saisissez la date de livraison demandée.";
    else if (v.requestedDate < today && mode === "create") errs.requestedDate = "La date de livraison demandée ne peut pas être dans le passé.";
    if (direct && v.directReason.trim().length < 10) errs.directReason = "Le motif d'une commande directe est obligatoire (10 caractères minimum).";
    if (isImport && forSubmit && (!v.incoterm || v.incotermPlace.trim().length < 2)) errs.incoterm = "Un bon import exige l'incoterm et son lieu (ex. FOB Shanghai).";
    if (forSubmit && v.lines.length === 0) errs.lines = "Ajoutez au moins une ligne avant de soumettre le bon.";
    for (const l of v.lines) {
      if (!(dec(l.quantity || "0") > 0)) errs[`line:${l.key}:quantity`] = "Saisissez la quantité.";
      if (forSubmit && !(dec(l.unitPrice || "0") > 0)) errs[`line:${l.key}:unitPrice`] = "Saisissez le prix unitaire.";
      if (v.currencyCode === "XOF" && l.unitPrice.trim() !== "" && !/^\d+$/.test(l.unitPrice.trim())) errs[`line:${l.key}:unitPrice`] = "En FCFA, le prix est un nombre entier.";
      if (l.discountPct.trim() !== "" && (dec(l.discountPct) < 0 || dec(l.discountPct) > 100)) errs[`line:${l.key}:discountPct`] = "Remise entre 0 et 100 %.";
    }
    setErrors(errs);
    setFormError(Object.keys(errs).length > 0 ? "Corrigez les champs signalés en rouge avant de continuer." : null);
    return Object.keys(errs).length === 0;
  }

  async function save(thenSubmit: boolean) {
    setConfirmSubmit(false);
    if (!validate(thenSubmit)) return;
    setBusy(true);
    try {
      const body = payload();
      const saved =
        mode === "create"
          ? await run(() => createOrderAction(body), { refresh: false, onError: (f) => setFormError(f.message) })
          : await run(() => updateOrderAction({ ...body, id: orderId!, expectedUpdatedAt: updatedAt! }), { refresh: false, onError: (f) => setFormError(f.message) });
      if (!saved?.ok) return;
      const id = saved.data.id as string;
      const version = new Date(saved.data.updatedAt as Date | string).toISOString();
      const warnings = (saved.data as { warnings?: { message: string }[] }).warnings ?? [];
      for (const w of warnings.slice(0, 3)) toast.warning(w.message);

      if (thenSubmit) {
        const sub = await run(() => submitOrderAction({ id, expectedUpdatedAt: version }), {
          refresh: false,
          success: (d) => (d.status === "VALIDE" ? `${d.displayNumber} validé automatiquement (montant sous le seuil).` : "Bon de commande soumis au Responsable Achats."),
        });
        if (!sub?.ok) {
          router.push(`/achats/commandes/${id}`);
          return;
        }
      } else {
        toast.success(mode === "create" ? "Brouillon enregistré." : "Modifications enregistrées.");
      }
      router.push(`/achats/commandes/${id}`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const lineErr = (key: string, f: string) => errors[`line:${key}:${f}`];
  const usedItems = v.lines.map((l) => l.itemId).filter((x): x is string => !!x);
  const allowedSuppliers = options.suppliers.filter((s) => s.allowed || s.id === v.supplierId);

  return (
    <form
      className="space-y-6"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void save(false);
      }}
      data-testid="po-form"
    >
      <FormError message={formError} testId="po-form-error" />

      <section className="space-y-4 rounded-lg border bg-card p-5" aria-labelledby="po-head">
        <h2 id="po-head" className="font-medium">
          1. Fournisseur et conditions {displayNumber ? <span className="font-mono text-sm text-muted-foreground">({displayNumber})</span> : null}
        </h2>

        {mode === "create" && canDirect ? (
          <div role="radiogroup" aria-label="Origine du bon" className="grid gap-2 sm:grid-cols-2" data-testid="po-origin">
            {(
              [
                { value: "DA", label: "Depuis des demandes d'achat", help: "Cas normal : les lignes sont rattachées à des DA validées." },
                { value: "DIRECT", label: "Commande directe (Responsable)", help: "Sans DA : un motif est obligatoire et conservé." },
              ] as const
            ).map((o) => (
              <label key={o.value} className="flex min-h-14 cursor-pointer flex-col justify-center rounded-lg border px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-muted">
                <span className="flex items-center gap-2 font-medium">
                  <input
                    type="radio"
                    className="size-5"
                    name="po-origin"
                    checked={v.origin === o.value}
                    disabled={v.lines.length > 0}
                    onChange={() => set("origin", o.value)}
                    data-testid={`po-origin-${o.value}`}
                  />
                  {o.label}
                </span>
                <span className="mt-0.5 pl-7 text-xs text-muted-foreground">{o.help}</span>
              </label>
            ))}
          </div>
        ) : null}
        {direct ? (
          <FormField id="po-direct-reason" label="Motif de la commande directe" required error={errors.directReason} hint="10 caractères minimum. Ce motif est visible dans la chronologie.">
            <TextArea id="po-direct-reason" className="min-h-20" maxLength={500} value={v.directReason} onChange={(e) => set("directReason", e.target.value)} data-testid="po-direct-reason" />
          </FormField>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <FormField id="po-supplier" label="Fournisseur" required error={errors.supplierId} hint="Un bon de commande = un seul fournisseur. Les fournisseurs bloqués ne sont pas proposés.">
            <NativeSelect id="po-supplier" value={v.supplierId} disabled={lockSupplier} onChange={(e) => pickSupplier(e.target.value)} data-testid="po-supplier">
              <option value="">Choisir un fournisseur…</option>
              {allowedSuppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} – {s.name} ({s.type === "IMPORT" ? "Import" : "Local"}
                  {s.status === "EN_EVALUATION" ? ", en évaluation" : ""})
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField id="po-currency" label="Devise" hint={currency?.rate && v.currencyCode !== "XOF" ? `Taux indicatif : 1 ${v.currencyCode} = ${currency.rate} FCFA${currency.stale ? " (ancien, plus de 30 jours)" : ""}. Il sera figé à la validation.` : v.currencyCode !== "XOF" ? "Aucun taux connu : saisissez-le dans Paramètres > Devises avant la validation." : undefined}>
            <NativeSelect id="po-currency" value={v.currencyCode} onChange={(e) => set("currencyCode", e.target.value)} data-testid="po-currency">
              {options.currencies.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code === "XOF" ? "FCFA (XOF)" : `${c.name} (${c.code})`}
                </option>
              ))}
            </NativeSelect>
          </FormField>
        </div>
        {supplier?.status === "EN_EVALUATION" ? (
          <p role="note" className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950" data-testid="po-supplier-evaluation">
            Ce fournisseur est en cours d&apos;évaluation : la commande reste possible, le Responsable en sera informé.
          </p>
        ) : null}

        <div className="grid gap-4 md:grid-cols-3">
          <FormField id="po-payment" label="Conditions de paiement">
            <NativeSelect id="po-payment" value={v.paymentTerm} onChange={(e) => set("paymentTerm", e.target.value)} data-testid="po-payment">
              {Object.entries(PAYMENT_TERM_LABELS).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField id="po-payment-note" label="Précision sur le paiement">
            <Input id="po-payment-note" className="h-11" maxLength={100} value={v.paymentTermNote} onChange={(e) => set("paymentTermNote", e.target.value)} data-testid="po-payment-note" />
          </FormField>
          <FormField id="po-supplier-ref" label="Référence fournisseur (proforma, devis)">
            <Input id="po-supplier-ref" className="h-11" maxLength={60} value={v.supplierRef} onChange={(e) => set("supplierRef", e.target.value)} data-testid="po-supplier-ref" />
          </FormField>
        </div>

        {isImport ? (
          <div className="grid gap-4 md:grid-cols-2" data-testid="po-import-terms">
            <FormField id="po-incoterm" label="Incoterm" required error={errors.incoterm}>
              <NativeSelect id="po-incoterm" value={v.incoterm} onChange={(e) => set("incoterm", e.target.value)} data-testid="po-incoterm">
                <option value="">Choisir…</option>
                {Object.entries(INCOTERM_LABELS).map(([k, l]) => (
                  <option key={k} value={k}>
                    {k} – {l}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField id="po-incoterm-place" label="Lieu de l'incoterm" required hint="Ex. Shanghai, Abidjan.">
              <Input id="po-incoterm-place" className="h-11" maxLength={100} value={v.incotermPlace} onChange={(e) => set("incotermPlace", e.target.value)} data-testid="po-incoterm-place" />
            </FormField>
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-3">
          <FormField id="po-requested" label="Livraison demandée le" required error={errors.requestedDate}>
            <Input id="po-requested" type="date" className="h-11" min={mode === "create" ? today : undefined} value={v.requestedDate} onChange={(e) => set("requestedDate", e.target.value)} data-testid="po-requested" />
          </FormField>
          <FormField id="po-warehouse" label="Dépôt de livraison" required error={errors.warehouseId}>
            <NativeSelect id="po-warehouse" value={v.warehouseId} onChange={(e) => pickWarehouse(e.target.value)} data-testid="po-warehouse">
              <option value="">Choisir un dépôt…</option>
              {options.warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField id="po-address" label="Adresse de livraison" hint="Reprise du dépôt, modifiable.">
            <TextArea
              id="po-address"
              className="min-h-11"
              rows={2}
              maxLength={300}
              value={v.deliveryAddress}
              onChange={(e) => {
                setAddressTouched(true);
                set("deliveryAddress", e.target.value);
              }}
              data-testid="po-address"
            />
          </FormField>
        </div>
      </section>

      <section className="space-y-4 rounded-lg border bg-card p-5" aria-labelledby="po-lines-head">
        <h2 id="po-lines-head" className="font-medium">
          2. Lignes du bon
        </h2>
        {errors.lines ? (
          <p role="alert" data-testid="po-lines-error" className="text-sm text-red-700">
            {errors.lines}
          </p>
        ) : null}

        {!direct ? (
          <OrderableLinePicker supplierId={v.supplierId} onPick={addOrderable} disabled={busyAll} />
        ) : (
          <div className="space-y-3">
            <ItemSearchCombobox onSelect={addItem} disabled={busyAll} excludeIds={usedItems} testId="po-item-search" placeholder="Rechercher un article du catalogue (code ou désignation)" />
            {freeDraft ? (
              <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_12rem_auto]" data-testid="po-free-draft">
                <Input aria-label="Désignation de la ligne libre" placeholder="Désignation (5 caractères minimum)" className="h-11" maxLength={200} value={freeDraft.name} onChange={(e) => setFreeDraft({ ...freeDraft, name: e.target.value })} data-testid="po-free-name" />
                <UnitSelect aria-label="Unité" value={freeDraft.unit} onChange={(e) => setFreeDraft({ ...freeDraft, unit: e.target.value })} data-testid="po-free-unit" />
                <div className="flex gap-2">
                  <Button type="button" className="h-11" onClick={addFree} data-testid="po-free-add">
                    Ajouter
                  </Button>
                  <Button type="button" variant="outline" className="h-11" onClick={() => setFreeDraft(null)}>
                    Annuler
                  </Button>
                </div>
              </div>
            ) : (
              <Button type="button" variant="outline" className="h-11 px-4" onClick={() => setFreeDraft({ name: "", unit: "U" })} data-testid="po-add-free">
                <PackagePlus /> Ajouter une ligne libre (hors catalogue)
              </Button>
            )}
          </div>
        )}

        {v.lines.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground" data-testid="po-no-lines">
            Aucune ligne pour l&apos;instant.{" "}
            {direct ? "Recherchez un article du catalogue." : "Recherchez une ligne de demande d'achat à commander, ou passez par « À commander »."}
          </p>
        ) : (
          <ol className="space-y-3" data-testid="po-form-lines">
            {v.lines.map((l, i) => {
              const price = l.itemId ? prices[l.itemId] : undefined;
              const net = totals.lineNets[i] ?? 0;
              return (
                <li key={l.key} className="space-y-3 rounded-lg border p-3" data-testid={`po-form-line-${i + 1}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">Ligne {i + 1}</p>
                      {l.itemId ? (
                        <p className="font-medium">
                          <span className="font-mono text-xs text-muted-foreground">{l.code}</span> {l.name}
                        </p>
                      ) : (
                        <p className="font-medium">
                          {l.freeDesignation} <span className="text-xs font-normal text-muted-foreground">(hors catalogue)</span>
                        </p>
                      )}
                      {l.allocations.length > 0 ? (
                        <p className="mt-1 flex flex-wrap gap-1.5 text-xs" data-testid={`po-form-line-${i + 1}-allocations`}>
                          {l.allocations.map((a) => (
                            <span key={a.requestLineId} className="rounded border bg-muted/50 px-1.5 py-0.5">
                              {a.label} : {formatQty(a.qty)} {unitShort(a.unit)}
                            </span>
                          ))}
                        </p>
                      ) : null}
                    </div>
                    <Button type="button" variant="ghost" className="h-11 w-11 shrink-0 text-red-700" aria-label={`Retirer la ligne ${i + 1}`} onClick={() => removeLine(l.key)} data-testid={`po-form-line-${i + 1}-remove`}>
                      <Trash2 />
                    </Button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
                    <FormField id={`po-qty-${l.key}`} label={`Quantité (${unitShort(l.unit)})`} required error={lineErr(l.key, "quantity")}>
                      <Input
                        id={`po-qty-${l.key}`}
                        ref={(el) => {
                          qtyRefs.current[l.key] = el;
                        }}
                        inputMode="decimal"
                        className="h-12 text-right text-base"
                        value={l.quantity}
                        onChange={(e) => setLine(l.key, { quantity: cleanDecimal(e.target.value) })}
                        data-testid={`po-form-qty-${i + 1}`}
                      />
                    </FormField>
                    <FormField id={`po-price-${l.key}`} label={`Prix unitaire (${v.currencyCode === "XOF" ? "FCFA" : v.currencyCode})`} required error={lineErr(l.key, "unitPrice")}>
                      <Input
                        id={`po-price-${l.key}`}
                        inputMode="decimal"
                        className="h-12 text-right text-base"
                        value={l.unitPrice}
                        onChange={(e) => setLine(l.key, { unitPrice: cleanDecimal(e.target.value) })}
                        data-testid={`po-form-price-${i + 1}`}
                      />
                    </FormField>
                    <FormField id={`po-disc-${l.key}`} label="Remise (%)" error={lineErr(l.key, "discountPct")}>
                      <Input
                        id={`po-disc-${l.key}`}
                        inputMode="decimal"
                        className="h-12 text-right text-base"
                        value={l.discountPct}
                        onChange={(e) => setLine(l.key, { discountPct: cleanDecimal(e.target.value) })}
                        data-testid={`po-form-discount-${i + 1}`}
                      />
                    </FormField>
                    <FormField id={`po-vat-${l.key}`} label="TVA">
                      <NativeSelect id={`po-vat-${l.key}`} className="h-12" value={l.vatRate} onChange={(e) => setLine(l.key, { vatRate: e.target.value })} data-testid={`po-form-vat-${i + 1}`}>
                        {VAT_RATES.map((r) => (
                          <option key={r} value={String(r)}>
                            {r} %
                          </option>
                        ))}
                      </NativeSelect>
                    </FormField>
                    <FormField id={`po-sref-${l.key}`} label="Réf. fournisseur">
                      <Input id={`po-sref-${l.key}`} className="h-12" maxLength={60} value={l.supplierRef} onChange={(e) => setLine(l.key, { supplierRef: e.target.value })} />
                    </FormField>
                    <div className="space-y-1.5">
                      <p className="text-sm leading-none font-medium">Montant net</p>
                      <p className="flex h-12 items-center justify-end text-base font-semibold tabular-nums" data-testid={`po-form-net-${i + 1}`}>
                        {formatAmount(net, v.currencyCode, decimals)}
                      </p>
                    </div>
                  </div>
                  {price?.alert && price.message ? <PriceAlertBadge message={price.message} /> : null}
                  {price && !price.alert && price.lastPriceXof !== null ? (
                    <p className="text-xs text-muted-foreground" data-testid={`po-form-lastprice-${i + 1}`}>
                      Dernier prix d&apos;achat : {formatAmount(price.lastPriceXof, "XOF")}
                      {price.lastPriceDate ? ` le ${formatDateOnly(new Date(price.lastPriceDate))}` : ""}
                      {price.lastSupplierCode ? ` (${price.lastSupplierCode})` : ""}
                    </p>
                  ) : null}
                  {l.itemId && dups[l.itemId]?.length ? <DuplicateWarning messages={dups[l.itemId]} title="Déjà commandé" testId={`po-dup-${i + 1}`} /> : null}
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section className="space-y-3 rounded-lg border bg-card p-5" aria-labelledby="po-charges-head">
        <h2 id="po-charges-head" className="font-medium">
          3. Frais (transport, emballage…)
        </h2>
        {v.charges.map((c, i) => (
          <div key={c.key} className="grid gap-3 sm:grid-cols-[1fr_10rem_7rem_auto]" data-testid={`po-charge-${i + 1}`}>
            <Input
              aria-label={`Libellé du frais ${i + 1}`}
              placeholder="Libellé (ex. Transport)"
              className="h-12"
              maxLength={100}
              value={c.label}
              onChange={(e) => setV((p) => ({ ...p, charges: p.charges.map((x) => (x.key === c.key ? { ...x, label: e.target.value } : x)) }))}
              data-testid={`po-charge-label-${i + 1}`}
            />
            <Input
              aria-label={`Montant du frais ${i + 1}`}
              inputMode="decimal"
              placeholder="Montant"
              className="h-12 text-right text-base"
              value={c.amount}
              onChange={(e) => setV((p) => ({ ...p, charges: p.charges.map((x) => (x.key === c.key ? { ...x, amount: cleanDecimal(e.target.value) } : x)) }))}
              data-testid={`po-charge-amount-${i + 1}`}
            />
            <NativeSelect
              aria-label={`TVA du frais ${i + 1}`}
              className="h-12"
              value={c.vatRate}
              onChange={(e) => setV((p) => ({ ...p, charges: p.charges.map((x) => (x.key === c.key ? { ...x, vatRate: e.target.value } : x)) }))}
            >
              {VAT_RATES.map((r) => (
                <option key={r} value={String(r)}>
                  {r} %
                </option>
              ))}
            </NativeSelect>
            <Button type="button" variant="ghost" className="h-12 w-12 text-red-700" aria-label={`Retirer le frais ${i + 1}`} onClick={() => setV((p) => ({ ...p, charges: p.charges.filter((x) => x.key !== c.key) }))}>
              <Trash2 />
            </Button>
          </div>
        ))}
        {v.charges.length < MAX_CHARGES ? (
          <Button type="button" variant="outline" className="h-11 px-4" onClick={() => setV((p) => ({ ...p, charges: [...p.charges, { key: newKey(), label: "", amount: "", vatRate: newVat() }] }))} data-testid="po-add-charge">
            <Plus /> Ajouter un frais
          </Button>
        ) : null}
      </section>

      <section className="grid gap-4 rounded-lg border bg-card p-5 md:grid-cols-2" aria-labelledby="po-notes-head">
        <h2 id="po-notes-head" className="font-medium md:col-span-2">
          4. Observations
        </h2>
        <FormField id="po-notes" label="Observations (imprimées sur le bon)">
          <TextArea id="po-notes" maxLength={1000} value={v.notes} onChange={(e) => set("notes", e.target.value)} data-testid="po-notes" />
        </FormField>
        <FormField id="po-internal" label="Note interne (jamais imprimée)">
          <TextArea id="po-internal" maxLength={1000} value={v.internalNote} onChange={(e) => set("internalNote", e.target.value)} data-testid="po-internal-note" />
        </FormField>
      </section>

      <section className="rounded-lg border bg-card p-5" aria-label="Totaux">
        <OrderTotals
          currency={v.currencyCode}
          decimals={decimals}
          rate={currency?.rate ?? null}
          rateIndicative
          totals={{ totalHt: totals.totalHt, totalVat: totals.totalVat, totalTtc: totals.totalTtc, totalTtcXof: totals.totalTtcXof, vat: totals.vat }}
        />
        <p className="mt-2 flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
          <AlertTriangle className="size-3.5" aria-hidden /> Totaux indicatifs : le calcul définitif est fait à l&apos;enregistrement.
        </p>
      </section>

      <div className={cn("flex flex-wrap justify-end gap-3")}>
        <Button type="button" variant="outline" className="h-12 px-5" onClick={() => router.back()} disabled={busyAll} data-testid="po-form-cancel">
          Annuler
        </Button>
        <WriteButton type="submit" variant="outline" className="h-12 px-5 text-base" disabled={busyAll} data-testid="po-form-save">
          <Save /> {busyAll ? "Enregistrement…" : "Enregistrer le brouillon"}
        </WriteButton>
        <WriteButton
          type="button"
          className="h-12 px-5 text-base"
          disabled={busyAll}
          onClick={() => {
            if (validate(true)) setConfirmSubmit(true);
          }}
          data-testid="po-form-submit"
        >
          <Send /> Enregistrer et soumettre
        </WriteButton>
      </div>

      <ConfirmDialog
        open={confirmSubmit}
        onOpenChange={setConfirmSubmit}
        title="Soumettre le bon de commande ?"
        description="Le bon est enregistré puis envoyé au Responsable Achats pour validation. Il ne sera plus modifiable sauf s'il vous est renvoyé."
        confirmLabel="Soumettre le bon"
        pending={busyAll}
        testId="po-form-submit-dialog"
        onConfirm={() => save(true)}
      />
    </form>
  );
}

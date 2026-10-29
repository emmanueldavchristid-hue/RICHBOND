"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Check, CheckCircle2, RefreshCw, Search, Send } from "lucide-react";
import { saveInventoryCountAction, saveInventoryRecountAction, submitInventoryCountAction } from "@/app/(app)/stock/inventaires/actions";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FormError } from "@/components/form-field";
import { WriteButton } from "@/components/license/write-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { unitShort } from "@/components/unit-select";
import { useActionRunner } from "@/components/use-action-runner";
import { errorMessage, notifyError } from "@/lib/action-feedback";
import { formatQty } from "@/lib/money";
import { cn } from "@/lib/utils";
import { parseQty } from "@/components/stock/qty";
import type { BlindSheet } from "@/modules/inventory/types";
import { BarcodeScanButton } from "./barcode-scan-button";
import { NumericKeypad } from "./numeric-keypad";

/**
 * Écran de comptage AVEUGLE (tablette). Il ne reçoit jamais la quantité attendue ni le PMP ni une valeur :
 * sa seule source est `BlindSheet`. Les quantités saisies sont enregistrées automatiquement.
 */

interface Row {
  id: string;
  code: string;
  name: string;
  unit: string;
  barcode: string | null;
  /** Quantité saisie ("" = pas encore comptée, ou à recompter). Virgule décimale. */
  value: string;
  /** Dernière valeur confirmée par le serveur. */
  saved: string;
  /** Le premier comptage est à refaire (la quantité attendue n'est jamais révélée). */
  recount: boolean;
  phase: "COUNT" | "RECOUNT";
}

type Filter = "todo" | "done" | "all";
type SaveStatus = "idle" | "saving" | "saved" | "error";

const toText = (q: string | null) => (q === null ? "" : formatQty(q));

function initialRows(sheet: BlindSheet): Row[] {
  return sheet.lines.map((l) => {
    const recount = l.recountRequired;
    const value = recount ? "" : toText(l.recountQty ?? l.countedQty);
    return {
      id: l.id,
      code: l.code,
      name: l.name,
      unit: l.unit,
      barcode: l.barcode,
      value,
      saved: value,
      recount,
      phase: recount || l.recountQty !== null ? "RECOUNT" : "COUNT",
    };
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function BlindCountScreen({ sheet }: { sheet: BlindSheet }) {
  const router = useRouter();
  const { run, pending } = useActionRunner();

  const rowsRef = useRef<Row[]>(initialRows(sheet));
  const [rows, setRows] = useState<Row[]>(rowsRef.current);
  const update = useCallback((fn: (prev: Row[]) => Row[]) => {
    rowsRef.current = fn(rowsRef.current);
    setRows(rowsRef.current);
  }, []);

  const [filter, setFilter] = useState<Filter>("todo");
  const [q, setQ] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [entry, setEntry] = useState("");
  const [entryError, setEntryError] = useState<string | null>(null);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const saving = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const activeIdRef = useRef<string | null>(null);

  const setActive = (id: string | null, value = "") => {
    activeIdRef.current = id;
    setActiveId(id);
    setEntry(value);
    setEntryError(null);
  };

  // ------------------------------------------------------------- sauvegarde automatique
  const flush = useCallback(async () => {
    if (saving.current) return;
    saving.current = true;
    try {
      for (;;) {
        const dirty = rowsRef.current.filter((r) => r.value !== "" && r.value !== r.saved);
        if (dirty.length === 0) break;
        setStatus("saving");
        const newlyFlagged: string[] = [];
        for (const phase of ["COUNT", "RECOUNT"] as const) {
          const batch = dirty.filter((r) => r.phase === phase);
          if (batch.length === 0) continue;
          const res = await (phase === "COUNT" ? saveInventoryCountAction : saveInventoryRecountAction)({
            countId: sheet.id,
            lines: batch.map((r) => ({ lineId: r.id, quantity: parseQty(r.value) })),
          });
          if (!res.ok) {
            setStatus("error");
            notifyError(res, { reload: () => router.refresh(), login: () => router.push("/connexion") });
            // La ligne refusée n'est plus considérée comme « envoyée » : le bouton « Réessayer » la renverra.
            return;
          }
          const sent = new Map(batch.map((r) => [r.id, r.value]));
          const flagged = new Set((res.data as { recountLineIds: string[] }).recountLineIds);
          update((prev) =>
            prev.map((r) => {
              const v = sent.get(r.id);
              if (v === undefined) return r;
              if (flagged.has(r.id) && r.phase === "COUNT") {
                // Écart important au premier comptage : on efface la saisie (recomptage à l'aveugle).
                newlyFlagged.push(r.id);
                return { ...r, saved: "", value: r.value === v ? "" : r.value, recount: true, phase: "RECOUNT" };
              }
              return { ...r, saved: v, recount: flagged.has(r.id) };
            }),
          );
          // L'article en cours de saisie vient d'être signalé : on efface son champ, le recomptage se fait à l'aveugle.
          if (activeIdRef.current && newlyFlagged.includes(activeIdRef.current)) setEntry("");
        }
        if (newlyFlagged.length > 0) {
          const n = newlyFlagged.length;
          toast.warning(`${n} article${n > 1 ? "s sont" : " est"} à recompter. Comptez-${n > 1 ? "les" : "le"} de nouveau avec soin.`, { duration: 8000 });
          setFilter("todo");
        }
      }
      setStatus("saved");
    } catch {
      setStatus("error");
      toast.error("L'enregistrement a échoué. Vérifiez votre réseau puis appuyez sur « Réessayer ».");
    } finally {
      saving.current = false;
    }
  }, [router, sheet.id, update]);

  const scheduleFlush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 500);
  }, [flush]);

  // Dernière chance d'enregistrer quand l'écran passe en arrière-plan ou se ferme.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [flush]);

  // ------------------------------------------------------------- saisie
  const parsed = (text: string): number | null => {
    if (text.trim() === "") return null;
    const n = parseQty(text);
    return Number.isNaN(n) ? null : n;
  };

  function commit(id: string, text: string): boolean {
    const n = parsed(text);
    if (n === null) return false;
    const value = formatQty(n);
    update((prev) => prev.map((r) => (r.id === id ? { ...r, value } : r)));
    scheduleFlush();
    return true;
  }

  function select(id: string) {
    const current = activeIdRef.current;
    // Une saisie valide laissée en plan est enregistrée avant de changer d'article.
    if (current && current !== id) {
      const cur = rowsRef.current.find((r) => r.id === current);
      if (cur && entry !== cur.value) commit(current, entry);
    }
    const next = rowsRef.current.find((r) => r.id === id);
    setActive(id, next?.value ?? "");
  }

  function confirmEntry() {
    if (!activeId) return;
    if (entry.trim() === "") {
      setEntryError("Saisissez la quantité comptée (0 s'il n'y en a pas).");
      return;
    }
    if (!commit(activeId, entry)) {
      setEntryError("Quantité invalide : 3 décimales au plus.");
      return;
    }
    // Article suivant à faire, dans l'ordre de la liste.
    const list = rowsRef.current;
    const idx = list.findIndex((r) => r.id === activeId);
    const after = [...list.slice(idx + 1), ...list.slice(0, idx)].find((r) => r.value === "");
    if (after) setActive(after.id, "");
    else setActive(null);
  }

  function onEntryText(text: string) {
    const t = text.replace(".", ",");
    if (!/^\d{0,8}(,\d{0,3})?$/.test(t)) return;
    setEntry(t);
    setEntryError(null);
  }

  // ------------------------------------------------------------- recherche / scan
  const needle = q.trim().toLowerCase();
  const matches = (r: Row) => r.code.toLowerCase().includes(needle) || r.name.toLowerCase().includes(needle) || (r.barcode ?? "").toLowerCase() === needle;
  const counts = {
    todo: rows.filter((r) => r.value === "").length,
    done: rows.filter((r) => r.value !== "").length,
    all: rows.length,
  };
  const shown = rows.filter((r) => (needle ? matches(r) : filter === "all" ? true : filter === "todo" ? r.value === "" : r.value !== ""));

  function onScan(value: string) {
    const hit = rowsRef.current.find((r) => r.barcode === value || r.code === value);
    if (!hit) {
      toast.error(`Code « ${value} » absent de cet inventaire.`);
      return;
    }
    setQ("");
    select(hit.id);
    toast.success(`${hit.code} · ${hit.name}`);
  }

  function onSearchEnter() {
    if (shown.length === 1) {
      select(shown[0].id);
      setQ("");
    }
  }

  // ------------------------------------------------------------- soumission
  const remaining = counts.todo;
  const recountLeft = rows.filter((r) => r.recount && r.value === "").length;
  const active = rows.find((r) => r.id === activeId) ?? null;

  async function submit() {
    setServerError(null);
    if (timer.current) clearTimeout(timer.current);
    while (saving.current) await sleep(100);
    await flush();
    if (rowsRef.current.some((r) => r.value !== "" && r.value !== r.saved)) {
      setConfirmOpen(false);
      setServerError("Certaines quantités ne sont pas enregistrées. Appuyez sur « Réessayer » puis envoyez de nouveau.");
      return;
    }
    const res = await run(() => submitInventoryCountAction({ countId: sheet.id }), {
      success: "Comptage envoyé au Responsable Achats.",
      refresh: false,
      onSuccess: () => router.push(`/stock/inventaires/${sheet.id}`),
      onError: (f) => setServerError(errorMessage(f)),
    });
    if (res && !res.ok) setConfirmOpen(false);
  }

  const statusLabel =
    status === "saving" ? "Enregistrement…" : status === "saved" ? "Tout est enregistré" : status === "error" ? "Non enregistré" : "Saisie enregistrée automatiquement";

  return (
    <div className="space-y-4" data-testid="cnt-screen">
      <div className="rounded-xl border bg-card p-4" data-testid="cnt-header">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-base font-semibold" data-testid="cnt-progress">
            {counts.done} / {counts.all} comptés
          </p>
          <p
            className={cn("flex items-center gap-2 text-sm", status === "error" ? "font-medium text-red-700" : "text-muted-foreground")}
            role="status"
            data-testid="cnt-save-status"
            data-state={status}
          >
            {status === "saved" ? <CheckCircle2 className="size-4 text-emerald-700" aria-hidden /> : null}
            {statusLabel}
            {status === "error" ? (
              <Button type="button" variant="outline" className="h-11 px-4" onClick={() => void flush()} data-testid="cnt-retry">
                <RefreshCw /> Réessayer
              </Button>
            ) : null}
          </p>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="h-full bg-primary transition-[width] duration-150" style={{ width: `${counts.all === 0 ? 0 : Math.round((counts.done / counts.all) * 100)}%` }} />
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Comptage à l&apos;aveugle : comptez ce que vous voyez sur l&apos;étagère. L&apos;application ne montre pas la quantité attendue.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_21rem] md:items-start">
        {/* ---------------------------------------------------------- liste */}
        <section className="order-2 space-y-3 md:order-1" aria-label="Articles à compter">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-48 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                className="h-12 pl-9 text-base"
                placeholder="Rechercher un code ou une désignation"
                aria-label="Rechercher un article par code ou désignation"
                autoComplete="off"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onSearchEnter();
                }}
                data-testid="cnt-search"
              />
            </div>
            <BarcodeScanButton onDetect={onScan} />
          </div>
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filtrer la liste">
            {(
              [
                ["todo", "À faire"],
                ["done", "Comptés"],
                ["all", "Tous"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={filter === key && !needle}
                className={cn(
                  "h-11 rounded-full border px-4 text-sm font-medium transition-colors duration-150",
                  filter === key && !needle ? "border-primary bg-primary/10 text-primary" : "bg-card text-muted-foreground hover:bg-muted",
                )}
                onClick={() => {
                  setFilter(key);
                  setQ("");
                }}
                data-testid={`cnt-filter-${key}`}
              >
                {label} ({counts[key]})
              </button>
            ))}
          </div>

          {shown.length === 0 ? (
            <p className="rounded-xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground" data-testid="cnt-empty">
              {needle ? "Aucun article ne correspond à cette recherche." : filter === "todo" ? "Tout est compté. Vous pouvez envoyer le comptage au Responsable." : "Rien à afficher ici."}
            </p>
          ) : (
            <ul className="space-y-2" data-testid="cnt-list">
              {shown.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    aria-pressed={r.id === activeId}
                    onClick={() => select(r.id)}
                    className={cn(
                      "flex min-h-16 w-full items-center gap-3 rounded-xl border bg-card px-4 py-2 text-left transition-colors duration-150 hover:bg-muted",
                      r.id === activeId && "border-primary ring-2 ring-primary/30",
                    )}
                    data-testid={`cnt-row-${r.code}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="doc-number block text-muted-foreground">{r.code}</span>
                      <span className="block truncate text-base font-medium">{r.name}</span>
                    </span>
                    {r.recount && r.value === "" ? (
                      <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-100 px-2.5 py-1 text-sm font-medium text-amber-900" data-testid={`cnt-recount-${r.code}`}>
                        <AlertTriangle className="size-4" aria-hidden /> À recompter
                      </span>
                    ) : r.value !== "" ? (
                      <span className="flex items-center gap-2 text-lg font-semibold tabular-nums" data-testid={`cnt-value-${r.code}`}>
                        <Check className="size-5 text-emerald-700" aria-hidden />
                        {r.value} <span className="text-sm font-normal text-muted-foreground">{unitShort(r.unit)}</span>
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">À compter</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ---------------------------------------------------------- saisie */}
        <aside className="order-1 rounded-xl border bg-card p-4 md:sticky md:top-4 md:order-2" aria-label="Saisie de la quantité" data-testid="cnt-panel">
          {active ? (
            <div className="space-y-3">
              <div>
                <p className="doc-number text-muted-foreground" data-testid="cnt-active-code">
                  {active.code}
                </p>
                <p className="text-base font-semibold">{active.name}</p>
                {active.recount ? <p className="mt-1 text-sm text-amber-800">Recomptez cet article avec soin.</p> : null}
              </div>
              <div>
                <label htmlFor="cnt-input" className="mb-1.5 block text-sm font-medium">
                  Quantité comptée ({unitShort(active.unit)})
                </label>
                <Input
                  id="cnt-input"
                  inputMode="none"
                  autoComplete="off"
                  className="h-16 text-right text-3xl font-semibold tabular-nums"
                  value={entry}
                  placeholder="0"
                  aria-invalid={entryError ? true : undefined}
                  onChange={(e) => onEntryText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") confirmEntry();
                  }}
                  onFocus={(e) => e.currentTarget.select()}
                  data-testid="cnt-input"
                />
                {entryError ? (
                  <p role="alert" className="mt-1.5 text-sm text-red-700" data-testid="cnt-input-error">
                    {entryError}
                  </p>
                ) : null}
              </div>
              <NumericKeypad value={entry} onChange={(v) => {
                  setEntry(v);
                  setEntryError(null);
                }} />
              <WriteButton className="h-16 w-full text-lg" onClick={confirmEntry} data-testid="cnt-ok">
                <Check /> Valider cette quantité
              </WriteButton>
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground" data-testid="cnt-panel-empty">
              Touchez un article dans la liste pour saisir sa quantité.
            </p>
          )}
        </aside>
      </div>

      <FormError message={serverError} testId="cnt-error" />

      <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center justify-between gap-3 border-t bg-background/95 px-1 py-3 backdrop-blur">
        <p className="text-sm text-muted-foreground" data-testid="cnt-remaining">
          {remaining === 0
            ? "Tout est compté."
            : recountLeft > 0
              ? `Il reste ${remaining} article${remaining > 1 ? "s" : ""} à compter, dont ${recountLeft} à recompter.`
              : `Il reste ${remaining} article${remaining > 1 ? "s" : ""} à compter.`}
        </p>
        <WriteButton
          className="h-14 px-8 text-base"
          disabled={remaining > 0 || pending || status === "error"}
          onClick={() => setConfirmOpen(true)}
          data-testid="cnt-submit"
        >
          <Send /> Envoyer le comptage
        </WriteButton>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Envoyer le comptage au Responsable ?"
        description="Vous ne pourrez plus modifier vos quantités. Le Responsable Achats vérifiera les écarts et validera l'inventaire."
        confirmLabel="Envoyer le comptage"
        pending={pending}
        onConfirm={submit}
        testId="cnt-submit-confirm"
      />
    </div>
  );
}

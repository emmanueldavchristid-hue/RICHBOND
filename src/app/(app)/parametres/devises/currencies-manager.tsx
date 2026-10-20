"use client";

import { useState, type FormEvent } from "react";
import { AlertTriangle, History, Pencil, Plus, Power, PowerOff, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { CodeInput } from "@/components/code-input";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DateCell } from "@/components/date-cell";
import { FormError, FormField } from "@/components/form-field";
import { WriteButton } from "@/components/license/write-button";
import { NativeSelect } from "@/components/native-select";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useActionRunner } from "@/components/use-action-runner";
import { formatNumber } from "@/lib/money";
import {
  addExchangeRateAction,
  listExchangeRatesAction,
  setCurrencyActiveAction,
  updateExchangeRateAction,
  upsertCurrencyAction,
} from "./actions";

export interface RateView {
  id: string;
  date: Date;
  rate: string;
  note: string | null;
  updatedAt: Date;
}

export interface CurrencyView {
  code: string;
  name: string;
  symbol: string;
  decimals: number;
  isBase: boolean;
  active: boolean;
  updatedAt: Date;
  latestRate: (RateView & { stale: boolean }) | null;
  /** Ancienneté du dernier taux en jours (calculée côté serveur). */
  ageDays: number | null;
}

const EUR_FIXED = "655,957";

// ------------------------------------------------------------------ taux

function RateDialog({
  currency,
  target,
  today,
  onClose,
  onSaved,
}: {
  currency: CurrencyView;
  /** null = nouveau taux. */
  target: RateView | null;
  today: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { run, pending } = useActionRunner();
  const [date, setDate] = useState(target ? target.date.toISOString().slice(0, 10) : today);
  const [rate, setRate] = useState(target ? formatNumber(target.rate, 6).replace(/\s/g, "") : "");
  const [note, setNote] = useState(target?.note ?? "");
  const [errors, setErrors] = useState<{ date?: string; rate?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmCode, setConfirmCode] = useState<"EUR_PARITY_CONFIRM" | "RATE_DEVIATION_CONFIRM" | null>(null);
  const [confirmMessage, setConfirmMessage] = useState("");

  async function save(confirmDeviation: boolean) {
    setFormError(null);
    const next: { date?: string; rate?: string } = {};
    if (!target && !date) next.date = "La date est obligatoire.";
    if (rate.trim() === "") next.rate = "Le taux est obligatoire.";
    setErrors(next);
    if (next.date || next.rate) return;
    const cleanRate = rate.replace(/\s/g, "");
    await run(
      () =>
        target
          ? updateExchangeRateAction({ id: target.id, expectedUpdatedAt: target.updatedAt.toISOString(), rate: cleanRate, note, confirmDeviation })
          : addExchangeRateAction({ currencyCode: currency.code, date, rate: cleanRate, note, confirmDeviation }),
      {
        success: target ? "Taux modifié." : "Taux enregistré.",
        silentCodes: ["EUR_PARITY_CONFIRM", "RATE_DEVIATION_CONFIRM"],
        onSuccess: () => {
          setConfirmCode(null);
          onSaved();
        },
        onError: (f) => {
          if (f.code === "EUR_PARITY_CONFIRM" || f.code === "RATE_DEVIATION_CONFIRM") {
            setConfirmMessage(f.message);
            setConfirmCode(f.code);
          }
          else {
            setConfirmCode(null);
            if (f.code === "RATE_EXISTS" || f.code === "RATE_FUTURE" || f.code === "INVALID_DATE") setErrors({ date: f.message });
            else setFormError(f.message);
          }
        },
      },
    );
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void save(false);
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{target ? `Modifier le taux ${currency.code}` : `Saisir un taux ${currency.code}`}</DialogTitle>
        <DialogDescription>
          Nombre de FCFA pour 1 {currency.code}. Ce taux sera utilisé pour toutes les opérations à partir de sa date.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={onSubmit} noValidate className="space-y-4" data-testid="rate-form">
        <FormError message={formError} testId="rate-form-error" />
        <FormField id="rate-date" label="Date du taux" required error={errors.date}>
          <Input
            id="rate-date"
            type="date"
            className="h-11"
            value={date}
            max={today}
            disabled={!!target}
            onChange={(e) => {
              setDate(e.target.value);
              setErrors((p) => ({ ...p, date: undefined }));
            }}
            data-testid="rate-date"
          />
        </FormField>
        <FormField
          id="rate-value"
          label={`Taux (FCFA pour 1 ${currency.code})`}
          required
          error={errors.rate}
          hint={currency.code === "EUR" ? `Parité fixe : ${EUR_FIXED}. Une autre valeur demande confirmation.` : "Jusqu'à 6 décimales, virgule acceptée. Un écart de plus de 20 % avec le dernier taux demande confirmation."}
        >
          <Input
            id="rate-value"
            className="h-11"
            inputMode="decimal"
            value={rate}
            onChange={(e) => {
              setRate(e.target.value);
              setErrors((p) => ({ ...p, rate: undefined }));
            }}
            data-testid="rate-value"
          />
        </FormField>
        <FormField id="rate-note" label="Note (source du taux)">
          <Input id="rate-note" className="h-11" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} data-testid="rate-note" />
        </FormField>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" className="h-11 px-4" onClick={onClose}>
            Annuler
          </Button>
          <WriteButton type="submit" className="h-11 px-4" disabled={pending} data-testid="rate-save">
            {pending ? "Enregistrement…" : "Enregistrer"}
          </WriteButton>
        </div>
      </form>
      <ConfirmDialog
        open={confirmCode !== null}
        onOpenChange={(o) => (!o ? setConfirmCode(null) : undefined)}
        title={confirmCode === "RATE_DEVIATION_CONFIRM" ? "Taux très différent du dernier taux" : "Taux EUR différent de la parité fixe"}
        description={`${confirmMessage} Valeur saisie : ${rate || "—"}.`}
        confirmLabel="Oui, enregistrer ce taux"
        pending={pending}
        testId="rate-eur-confirm"
        onConfirm={() => save(true)}
      />
    </>
  );
}

// ------------------------------------------------------------------ devise

function CurrencyForm({ target, onDone }: { target: CurrencyView | null; onDone: () => void }) {
  const { run, pending } = useActionRunner();
  const [code, setCode] = useState(target?.code ?? "");
  const [name, setName] = useState(target?.name ?? "");
  const [symbol, setSymbol] = useState(target?.symbol ?? "");
  const [decimals, setDecimals] = useState(String(target?.decimals ?? 2));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const next: Record<string, string> = {};
    if (!/^[A-Z]{3}$/.test(code)) next.code = "Code devise invalide (3 lettres, ex. EUR).";
    if (name.trim().length < 2) next.name = "Le nom de la devise est obligatoire.";
    if (symbol.trim() === "") next.symbol = "Le symbole est obligatoire.";
    setErrors(next);
    if (Object.keys(next).length) return;
    await run(() => upsertCurrencyAction({ code, name, symbol, decimals }), {
      success: target ? "Devise modifiée." : "Devise créée.",
      onSuccess: onDone,
      onError: (f) => setFormError(f.message),
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4" data-testid="currency-form">
      <FormError message={formError} testId="currency-form-error" />
      <FormField id="cur-code" label="Code ISO" required error={errors.code} hint="3 lettres (ex. EUR, USD, CNY).">
        <CodeInput id="cur-code" value={code} onChange={(v) => setCode(v.slice(0, 3))} readOnly={!!target} data-testid="currency-code" />
      </FormField>
      <FormField id="cur-name" label="Nom" required error={errors.name}>
        <Input id="cur-name" className="h-11" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} data-testid="currency-name" />
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField id="cur-symbol" label="Symbole" required error={errors.symbol}>
          <Input id="cur-symbol" className="h-11" value={symbol} maxLength={5} onChange={(e) => setSymbol(e.target.value)} data-testid="currency-symbol" />
        </FormField>
        <FormField id="cur-decimals" label="Décimales">
          <NativeSelect id="cur-decimals" value={decimals} onChange={(e) => setDecimals(e.target.value)} data-testid="currency-decimals">
            {[0, 1, 2, 3, 4].map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" className="h-11 px-4" onClick={onDone}>
          Annuler
        </Button>
        <WriteButton type="submit" className="h-11 px-4" disabled={pending} data-testid="currency-save">
          {pending ? "Enregistrement…" : "Enregistrer"}
        </WriteButton>
      </div>
    </form>
  );
}

// ------------------------------------------------------------------ écran

export function CurrenciesManager({
  currencies,
  today,
  canManageCurrencies,
  canEnterRates,
}: {
  currencies: CurrencyView[];
  /** Jour courant (AAAA-MM-JJ, fuseau Africa/Abidjan). */
  today: string;
  canManageCurrencies: boolean;
  canEnterRates: boolean;
}) {
  const { run, pending } = useActionRunner();
  const [rateDialog, setRateDialog] = useState<{ currency: CurrencyView; target: RateView | null; reopenHistory: boolean } | null>(null);
  const [currencyDialog, setCurrencyDialog] = useState<{ target: CurrencyView | null } | null>(null);
  const [history, setHistory] = useState<{ currency: CurrencyView; rates: RateView[] } | null>(null);
  const [deactivating, setDeactivating] = useState<CurrencyView | null>(null);

  const alerts = currencies.filter((c) => c.active && !c.isBase && (c.latestRate === null || c.latestRate.stale));

  async function openHistory(currency: CurrencyView) {
    const res = await listExchangeRatesAction({ currencyCode: currency.code, limit: 60 });
    if (res.ok) {
      setHistory({
        currency,
        rates: res.data.map((r) => ({ id: r.id, date: new Date(r.date), rate: r.rate, note: r.note, updatedAt: new Date(r.updatedAt) })),
      });
    } else toast.error(res.message);
  }

  return (
    <div className="space-y-4" data-testid="currencies-page">
      {alerts.length > 0 ? (
        <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" data-testid="rates-stale-alert">
          <p className="flex items-center gap-2 font-medium">
            <AlertTriangle className="size-4" /> Taux de change à mettre à jour
          </p>
          <ul className="mt-1 list-disc pl-5">
            {alerts.map((c) => (
              <li key={c.code} data-testid={`rates-stale-${c.code}`}>
                {c.code} :{" "}
                {c.latestRate ? (
                  <>
                    dernier taux du <DateCell value={c.latestRate.date} /> ({c.ageDays} jours, plus de 30 jours)
                  </>
                ) : (
                  "aucun taux saisi"
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {canManageCurrencies ? (
        <div className="flex justify-end">
          <WriteButton type="button" className="h-11 px-4" onClick={() => setCurrencyDialog({ target: null })} data-testid="currency-create">
            <Plus /> Nouvelle devise
          </WriteButton>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm" data-testid="currencies-table">
          <thead className="text-left text-xs font-medium text-muted-foreground border-b">
            <tr>
              <th className="p-3">Devise</th>
              <th className="p-3">Dernier taux (FCFA pour 1 unité)</th>
              <th className="p-3">Date du taux</th>
              <th className="p-3">Statut</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {currencies.map((c) => (
              <tr key={c.code} className="border-t" data-testid={`currency-row-${c.code}`}>
                <td className="p-3">
                  <span className="font-mono font-medium">{c.code}</span> <span className="text-muted-foreground">{c.name} ({c.symbol})</span>
                </td>
                <td className="p-3 tabular-nums" data-testid={`currency-rate-${c.code}`}>
                  {c.isBase ? "1 (devise de base)" : c.latestRate ? formatNumber(c.latestRate.rate, 6) : "—"}
                </td>
                <td className="p-3">
                  {c.isBase ? "—" : <DateCell value={c.latestRate?.date} />}
                  {!c.isBase && c.active && c.latestRate?.stale ? (
                    <span className="ml-2">
                      <StatusBadge tone="warning" label={`Taux ancien (${c.ageDays} j)`} />
                    </span>
                  ) : null}
                  {!c.isBase && c.active && !c.latestRate ? (
                    <span className="ml-2">
                      <StatusBadge tone="danger" label="Aucun taux" />
                    </span>
                  ) : null}
                </td>
                <td className="p-3">
                  {c.isBase ? <StatusBadge tone="info" label="Devise de base" /> : <StatusBadge status={c.active ? "ACTIF" : "DESACTIVE"} />}
                </td>
                <td className="p-3">
                  <div className="flex flex-wrap justify-end gap-2">
                    {!c.isBase && c.active && canEnterRates ? (
                      <WriteButton
                        type="button"
                        className="h-11 px-3"
                        onClick={() => setRateDialog({ currency: c, target: null, reopenHistory: false })}
                        data-testid={`rate-add-${c.code}`}
                      >
                        <TrendingUp /> Saisir un taux
                      </WriteButton>
                    ) : null}
                    {!c.isBase ? (
                      <Button type="button" variant="outline" className="h-11 px-3" onClick={() => void openHistory(c)} data-testid={`rate-history-${c.code}`}>
                        <History /> Historique
                      </Button>
                    ) : null}
                    {canManageCurrencies && !c.isBase ? (
                      <>
                        <WriteButton type="button" variant="outline" className="h-11 px-3" onClick={() => setCurrencyDialog({ target: c })} data-testid={`currency-edit-${c.code}`}>
                          <Pencil /> Modifier
                        </WriteButton>
                        {c.active ? (
                          <WriteButton type="button" variant="destructive" className="h-11 px-3" onClick={() => setDeactivating(c)} data-testid={`currency-deactivate-${c.code}`}>
                            <PowerOff /> Désactiver
                          </WriteButton>
                        ) : (
                          <WriteButton
                            type="button"
                            variant="outline"
                            className="h-11 px-3"
                            disabled={pending}
                            onClick={() => void run(() => setCurrencyActiveAction({ code: c.code, active: true }), { success: "Devise réactivée." })}
                            data-testid={`currency-reactivate-${c.code}`}
                          >
                            <Power /> Réactiver
                          </WriteButton>
                        )}
                      </>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={rateDialog !== null} onOpenChange={(o) => (!o ? setRateDialog(null) : undefined)}>
        <DialogContent className="sm:max-w-md" data-testid="rate-dialog">
          {rateDialog ? (
            <RateDialog
              key={rateDialog.target?.id ?? "new"}
              currency={rateDialog.currency}
              target={rateDialog.target}
              today={today}
              onClose={() => setRateDialog(null)}
              onSaved={() => {
                const reopen = rateDialog.reopenHistory ? rateDialog.currency : null;
                setRateDialog(null);
                if (reopen) void openHistory(reopen);
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={history !== null} onOpenChange={(o) => (!o ? setHistory(null) : undefined)}>
        <DialogContent className="sm:max-w-xl" data-testid="rate-history-dialog">
          <DialogHeader>
            <DialogTitle>Historique des taux {history?.currency.code}</DialogTitle>
            <DialogDescription>60 derniers taux saisis (FCFA pour 1 {history?.currency.code}).</DialogDescription>
          </DialogHeader>
          {history && history.rates.length === 0 ? <p className="text-sm text-muted-foreground">Aucun taux saisi.</p> : null}
          {history && history.rates.length > 0 ? (
            <div className="max-h-96 overflow-auto rounded-lg border">
              <table className="w-full text-sm" data-testid="rate-history-table">
                <thead className="text-left text-xs font-medium text-muted-foreground border-b">
                  <tr>
                    <th className="p-3">Date</th>
                    <th className="p-3 text-right">Taux</th>
                    <th className="p-3">Note</th>
                    <th className="p-3" />
                  </tr>
                </thead>
                <tbody>
                  {history.rates.map((r) => (
                    <tr key={r.id} className="border-t" data-testid="rate-history-row">
                      <td className="p-3">
                        <DateCell value={r.date} />
                      </td>
                      <td className="p-3 text-right tabular-nums">{formatNumber(r.rate, 6)}</td>
                      <td className="p-3">{r.note ?? "—"}</td>
                      <td className="p-3 text-right">
                        {canEnterRates ? (
                          <WriteButton
                            type="button"
                            variant="outline"
                            className="h-11 px-3"
                            onClick={() => {
                              const cur = history.currency;
                              setHistory(null);
                              setRateDialog({ currency: cur, target: r, reopenHistory: true });
                            }}
                            data-testid="rate-edit"
                          >
                            Modifier
                          </WriteButton>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={currencyDialog !== null} onOpenChange={(o) => (!o ? setCurrencyDialog(null) : undefined)}>
        <DialogContent className="sm:max-w-md" data-testid="currency-dialog">
          <DialogHeader>
            <DialogTitle>{currencyDialog?.target ? `Modifier ${currencyDialog.target.code}` : "Nouvelle devise"}</DialogTitle>
            <DialogDescription>Les taux de change se saisissent ensuite depuis la liste.</DialogDescription>
          </DialogHeader>
          {currencyDialog ? <CurrencyForm key={currencyDialog.target?.code ?? "new"} target={currencyDialog.target} onDone={() => setCurrencyDialog(null)} /> : null}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deactivating !== null}
        onOpenChange={(o) => (!o ? setDeactivating(null) : undefined)}
        title={`Désactiver ${deactivating?.code ?? ""} ?`}
        description="Cette devise ne sera plus proposée pour les fournisseurs ni les prix. Impossible si un fournisseur actif l'utilise par défaut."
        confirmLabel="Désactiver"
        destructive
        pending={pending}
        testId="currency-confirm"
        onConfirm={async () => {
          if (!deactivating) return;
          await run(() => setCurrencyActiveAction({ code: deactivating.code, active: false }), {
            success: "Devise désactivée.",
            onSuccess: () => setDeactivating(null),
            onError: () => setDeactivating(null),
          });
        }}
      />
    </div>
  );
}

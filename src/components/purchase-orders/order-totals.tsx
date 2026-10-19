import { MoneyCell } from "@/components/money-cell";
import { formatNumber } from "@/lib/money";

export interface OrderTotalsView {
  totalHt: string | number;
  totalVat: string | number;
  totalTtc: string | number;
  totalHtXof?: number | null;
  totalTtcXof?: number | null;
  /** Détail par taux (facultatif). */
  vat?: { rate: number | string; vat: string | number }[];
}

/**
 * Totaux HT / TVA / TTC dans la devise du bon ; pour l'import, l'équivalent FCFA au taux figé (ou indicatif) est ajouté.
 * Montants FCFA : « 1 250 000 FCFA ».
 */
export function OrderTotals({
  currency,
  totals,
  rate,
  rateIndicative = false,
  decimals,
}: {
  currency: string;
  totals: OrderTotalsView;
  rate?: string | number | null;
  /** Vrai tant que le taux n'est pas figé (brouillon). */
  rateIndicative?: boolean;
  decimals?: number;
}) {
  const dec = currency === "XOF" ? 0 : (decimals ?? 2);
  const foreign = currency !== "XOF";
  return (
    <dl className="ml-auto w-full max-w-sm space-y-1.5 text-sm" data-testid="order-totals">
      <div className="flex justify-between gap-4">
        <dt className="text-muted-foreground">Total HT</dt>
        <dd className="tabular-nums" data-testid="order-total-ht">
          <MoneyCell value={totals.totalHt} currency={currency} decimals={dec} />
        </dd>
      </div>
      {(totals.vat ?? []).filter((v) => Number(v.vat) !== 0 || Number(v.rate) !== 0).map((v) => (
        <div key={String(v.rate)} className="flex justify-between gap-4">
          <dt className="text-muted-foreground">TVA {formatNumber(v.rate, 2)} %</dt>
          <dd className="tabular-nums">
            <MoneyCell value={v.vat} currency={currency} decimals={dec} />
          </dd>
        </div>
      ))}
      {!totals.vat ? (
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">TVA</dt>
          <dd className="tabular-nums">
            <MoneyCell value={totals.totalVat} currency={currency} decimals={dec} />
          </dd>
        </div>
      ) : null}
      <div className="flex justify-between gap-4 border-t pt-1.5 text-base font-semibold">
        <dt>Total TTC</dt>
        <dd className="tabular-nums" data-testid="order-total-ttc">
          <MoneyCell value={totals.totalTtc} currency={currency} decimals={dec} />
        </dd>
      </div>
      {foreign ? (
        <div className="flex justify-between gap-4 text-muted-foreground" data-testid="order-total-xof">
          <dt>
            Équivalent FCFA
            {rate ? <span className="block text-xs">taux {formatNumber(rate, 6)} {rateIndicative ? "(indicatif, figé à la validation)" : "(figé)"}</span> : <span className="block text-xs">aucun taux connu</span>}
          </dt>
          <dd className="tabular-nums">
            <MoneyCell value={totals.totalTtcXof ?? null} currency="XOF" empty="taux manquant" />
          </dd>
        </div>
      ) : null}
    </dl>
  );
}

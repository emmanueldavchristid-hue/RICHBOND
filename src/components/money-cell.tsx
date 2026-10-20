import { formatAmount } from "@/lib/money";

/**
 * Montant : FCFA entier (« 1 250 000 FCFA ») ou devise étrangère (« 1 250,50 CNY »).
 * Valeur absente => « – ». Accepte les Decimal sérialisés (chaînes).
 */
export function MoneyCell({
  value,
  currency = "XOF",
  decimals,
  empty = "—",
  className,
}: {
  value: number | string | null | undefined;
  currency?: string | null;
  decimals?: number;
  empty?: string;
  className?: string;
}) {
  if (value === null || value === undefined || value === "") return <span className="text-muted-foreground/70">{empty}</span>;
  return (
    <span className={className} data-testid="money">
      {formatAmount(value, currency ?? "XOF", decimals ?? 2)}
    </span>
  );
}

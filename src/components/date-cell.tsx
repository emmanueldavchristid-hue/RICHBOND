import { formatDate, formatDateTime } from "@/lib/dates";

/** JJ/MM/AAAA (ou JJ/MM/AAAA HH:mm avec `withTime`), fuseau Africa/Abidjan. */
export function DateCell({
  value,
  withTime = false,
  empty = "—",
}: {
  value: Date | string | null | undefined;
  withTime?: boolean;
  empty?: string;
}) {
  if (!value) return <span className="text-muted-foreground/70">{empty}</span>;
  const d = typeof value === "string" ? new Date(value) : value;
  return <span>{withTime ? formatDateTime(d) : formatDate(d)}</span>;
}

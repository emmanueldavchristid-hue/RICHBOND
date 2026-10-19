import { DateCell } from "@/components/date-cell";
import { formatDateOnly } from "@/lib/dates";
import { formatFcfa } from "@/lib/money";
import { cn } from "@/lib/utils";
import { CONTACT_CHANNEL_LABELS, PO_EVENT_LABELS, PO_STATUS_LABELS, type ContactChannelCode, type PoStatus } from "@/modules/purchase-orders/labels";

export interface OrderEvent {
  id: string;
  version: number;
  type: string;
  createdAt: Date | string;
  fromStatus: string | null;
  toStatus: string | null;
  comment: string | null;
  payload: unknown;
  user: { id: string; name: string };
}

const TONE: Record<string, string> = {
  APPROVED: "bg-emerald-600",
  CONFIRMED: "bg-emerald-600",
  REJECTED: "bg-red-600",
  CANCELLED: "bg-slate-500",
  RETURNED: "bg-amber-500",
  REMINDED: "bg-amber-500",
  PROMISED_DATE_CHANGED: "bg-amber-500",
  AMENDMENT_STARTED: "bg-violet-600",
};

type Payload = Record<string, unknown>;
const asPayload = (p: unknown): Payload => (p && typeof p === "object" ? (p as Payload) : {});
const statusLabel = (s: string | null) => (s ? (PO_STATUS_LABELS[s as PoStatus] ?? s) : null);
const channel = (c: unknown) => (typeof c === "string" ? (CONTACT_CHANNEL_LABELS[c as ContactChannelCode] ?? c) : null);
const day = (v: unknown) => (typeof v === "string" && v.length >= 10 ? formatDateOnly(new Date(`${v.slice(0, 10)}T00:00:00Z`)) : null);

function detail(e: OrderEvent): string[] {
  const p = asPayload(e.payload);
  const out: string[] = [];
  switch (e.type) {
    case "CREATED":
      if (p.origin === "DIRECT") out.push("Commande directe (sans demande d'achat)");
      break;
    case "APPROVED":
      if (typeof p.number === "string") out.push(`Numéro attribué : ${p.number}`);
      if (p.autoApproved === true) out.push("Auto-validé par le Responsable Achats");
      if (p.underThreshold === true) out.push("Validé automatiquement : montant sous le seuil de validation");
      if (typeof p.totalTtcXof === "number") out.push(`Total TTC : ${formatFcfa(p.totalTtcXof)}`);
      break;
    case "SENT": {
      const c = channel(p.channel);
      const d = day(p.sentDate);
      out.push([c ? `Par ${c}` : null, d ? `le ${d}` : null, typeof p.contact === "string" && p.contact ? `à ${p.contact}` : null].filter(Boolean).join(" "));
      break;
    }
    case "CONFIRMED": {
      const d = day(p.promisedDate);
      if (d) out.push(`Date promise : ${d}`);
      if (typeof p.supplierRef === "string" && p.supplierRef) out.push(`Référence fournisseur : ${p.supplierRef}`);
      break;
    }
    case "PROMISED_DATE_CHANGED": {
      const b = day(p.before);
      const a = day(p.after);
      if (a) out.push(`${b ?? "–"} → ${a}${typeof p.changes === "number" ? ` (report n° ${p.changes})` : ""}`);
      break;
    }
    case "REMINDED": {
      const c = channel(p.channel);
      out.push([c ? `Par ${c}` : null, typeof p.contact === "string" && p.contact ? `à ${p.contact}` : null, typeof p.count === "number" ? `(relance n° ${p.count})` : null].filter(Boolean).join(" "));
      break;
    }
    default:
      break;
  }
  return out.filter(Boolean);
}

/** Chronologie d'un bon de commande : événement, version, auteur, date JJ/MM/AAAA HH:mm, commentaire. */
export function OrderTimeline({ events }: { events: OrderEvent[] }) {
  if (events.length === 0) return <p className="text-sm text-muted-foreground">Aucun événement.</p>;
  return (
    <ol className="space-y-4" data-testid="po-timeline">
      {events.map((e) => {
        const lines = detail(e);
        return (
          <li key={e.id} className="flex gap-3" data-testid={`po-event-${e.type}`}>
            <span className={cn("mt-1.5 size-3 shrink-0 rounded-full", TONE[e.type] ?? "bg-sky-600")} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm">
                <span className="font-medium">{PO_EVENT_LABELS[e.type] ?? e.type}</span>
                {e.version > 1 ? <span className="text-muted-foreground"> (v{e.version})</span> : null}
                {e.fromStatus && e.toStatus && e.fromStatus !== e.toStatus ? (
                  <span className="text-muted-foreground">
                    {" "}
                    ({statusLabel(e.fromStatus)} → {statusLabel(e.toStatus)})
                  </span>
                ) : null}
                <span className="text-muted-foreground"> · {e.user.name} · </span>
                <span className="text-muted-foreground">
                  <DateCell value={e.createdAt} withTime />
                </span>
              </p>
              {lines.map((l, i) => (
                <p key={i} className="text-sm text-muted-foreground">
                  {l}
                </p>
              ))}
              {e.comment ? (
                <p className="mt-1 rounded-md bg-muted/60 px-3 py-2 text-sm whitespace-pre-wrap" data-testid="po-event-comment">
                  {e.comment}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

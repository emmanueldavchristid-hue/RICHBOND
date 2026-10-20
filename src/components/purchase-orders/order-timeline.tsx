import { TimelineItem } from "@/components/timeline-item";
import { formatDateOnly } from "@/lib/dates";
import { formatFcfa } from "@/lib/money";
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
      if (a) out.push(`${b ?? "—"} → ${a}${typeof p.changes === "number" ? ` (report n° ${p.changes})` : ""}`);
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
    <ol data-testid="po-timeline">
      {events.map((e, i) => {
        const lines = detail(e);
        return (
          <TimelineItem key={e.id} name={e.user.name} at={e.createdAt} testId={`po-event-${e.type}`} last={i === events.length - 1}>
            <p className="text-sm">
              <span className="font-medium">{PO_EVENT_LABELS[e.type] ?? e.type}</span>
              {e.version > 1 ? <span className="text-muted-foreground"> (v{e.version})</span> : null}
              {e.fromStatus && e.toStatus && e.fromStatus !== e.toStatus ? (
                <span className="text-muted-foreground">
                  {" "}
                  ({statusLabel(e.fromStatus)} → {statusLabel(e.toStatus)})
                </span>
              ) : null}
            </p>
            {lines.map((l, j) => (
              <p key={j} className="text-[13px] text-muted-foreground">
                {l}
              </p>
            ))}
            {e.comment ? (
              <p className="mt-1 rounded-md bg-muted px-3 py-2 text-sm whitespace-pre-wrap" data-testid="po-event-comment">
                {e.comment}
              </p>
            ) : null}
          </TimelineItem>
        );
      })}
    </ol>
  );
}

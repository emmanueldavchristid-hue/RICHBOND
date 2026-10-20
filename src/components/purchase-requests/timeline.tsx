import { TimelineItem } from "@/components/timeline-item";
import { formatQty } from "@/lib/money";
import { unitShort } from "@/components/unit-select";
import { PR_EVENT_LABELS, PR_STATUS_LABELS, type PrStatus } from "@/modules/purchase-requests/labels";

export interface TimelineEvent {
  id: string;
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
const statusLabel = (s: string | null) => (s ? (PR_STATUS_LABELS[s as PrStatus] ?? s) : null);

/** Détail lisible d'un événement (quantité modifiée, acheteur, auto-validation…). */
function detail(e: TimelineEvent): string[] {
  const p = asPayload(e.payload);
  const out: string[] = [];
  if (e.type === "QTY_CHANGED") {
    const unit = typeof p.unit === "string" ? ` ${unitShort(p.unit)}` : "";
    out.push(`Ligne ${String(p.lineNo ?? "?")} : ${formatQty(String(p.before ?? 0))}${unit} → ${formatQty(String(p.after ?? 0))}${unit}`);
  }
  if (e.type === "APPROVED") {
    if (p.autoApproved === true) out.push("Auto-validée par le Responsable Achats");
    out.push(typeof p.assignedBuyerName === "string" ? `Assignée à ${p.assignedBuyerName}` : "Aucun acheteur assigné");
  }
  if (e.type === "ASSIGNED" && typeof p.toName === "string") out.push(`Acheteur : ${p.toName}`);
  if ((e.type === "SUBMITTED" || e.type === "RESUBMITTED") && typeof p.number === "string") out.push(`Numéro ${p.number}`);
  if (e.type === "ATTACHMENT_ADDED" || e.type === "ATTACHMENT_REMOVED") return e.comment ? [e.comment] : [];
  return out;
}

/** Chronologie d'une DA : événement, auteur, date JJ/MM/AAAA HH:mm, commentaire. */
export function Timeline({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) return <p className="text-sm text-muted-foreground">Aucun événement.</p>;
  return (
    <ol data-testid="pr-timeline">
      {events.map((e, i) => {
        const lines = detail(e);
        const showComment = e.comment && e.type !== "ATTACHMENT_ADDED" && e.type !== "ATTACHMENT_REMOVED";
        return (
          <TimelineItem key={e.id} name={e.user.name} at={e.createdAt} testId={`pr-event-${e.type}`} last={i === events.length - 1}>
            <p className="text-sm">
              <span className="font-medium">{PR_EVENT_LABELS[e.type] ?? e.type}</span>
              {e.fromStatus && e.toStatus ? (
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
            {showComment ? (
              <p className="mt-1 rounded-md bg-muted px-3 py-2 text-sm whitespace-pre-wrap" data-testid="pr-event-comment">
                {e.comment}
              </p>
            ) : null}
          </TimelineItem>
        );
      })}
    </ol>
  );
}

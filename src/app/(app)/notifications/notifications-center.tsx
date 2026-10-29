"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCheck } from "lucide-react";
import { toast } from "sonner";
import { markAllNotificationsReadAction, markNotificationReadAction } from "./actions";
import { DateCell } from "@/components/date-cell";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Severity = "INFO" | "IMPORTANT" | "CRITIQUE";

interface Item {
  id: string;
  severity: Severity;
  title: string;
  body: string | null;
  link: string;
  readAt: string | null;
  createdAt: string;
}

const LABEL: Record<Severity, string> = { INFO: "Information", IMPORTANT: "Important", CRITIQUE: "Critique" };
const BADGE: Record<Severity, string> = {
  INFO: "bg-sky-50 text-sky-800 ring-sky-200",
  IMPORTANT: "bg-amber-50 text-amber-900 ring-amber-200",
  CRITIQUE: "bg-red-50 text-red-800 ring-red-200",
};

function href(severity: Severity | null, unreadOnly: boolean): string {
  const p = new URLSearchParams();
  if (severity) p.set("gravite", severity);
  if (unreadOnly) p.set("nonLues", "1");
  const q = p.toString();
  return q ? `/notifications?${q}` : "/notifications";
}

export function NotificationsCenter({
  severity,
  unreadOnly,
  unread,
  items,
}: {
  severity: Severity | null;
  unreadOnly: boolean;
  unread: number;
  items: Item[];
}) {
  const router = useRouter();

  async function open(n: Item) {
    if (!n.readAt) await markNotificationReadAction({ id: n.id });
    router.push(n.link);
  }

  async function markAll() {
    const r = await markAllNotificationsReadAction({});
    if (r.ok) {
      toast.success("Toutes les notifications sont marquées comme lues.");
      router.refresh();
    } else {
      toast.error(r.message);
    }
  }

  const chip = (active: boolean) =>
    cn(
      "inline-flex min-h-11 items-center rounded-md border px-4 text-sm font-medium",
      active ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
    );

  return (
    <div data-testid="notifications-page">
      <div className="mb-4 flex flex-wrap items-center gap-2" data-testid="notifications-filters">
        <span className="text-sm text-muted-foreground">Gravité :</span>
        <Link href={href(null, unreadOnly)} className={chip(!severity)} data-testid="filter-gravite-toutes">
          Toutes
        </Link>
        {(["CRITIQUE", "IMPORTANT", "INFO"] as Severity[]).map((s) => (
          <Link key={s} href={href(s, unreadOnly)} className={chip(severity === s)} data-testid={`filter-gravite-${s}`}>
            {LABEL[s]}
          </Link>
        ))}
        <Link href={href(severity, !unreadOnly)} className={chip(unreadOnly)} data-testid="filter-non-lues">
          Non lues uniquement
        </Link>
        <Button
          variant="outline"
          className="ml-auto h-11 px-4"
          disabled={unread === 0}
          onClick={() => void markAll()}
          data-testid="notifications-page-mark-all"
        >
          <CheckCheck /> Tout marquer comme lu
        </Button>
      </div>
      <p className="mb-2 text-sm text-muted-foreground" data-testid="notifications-page-unread">
        {unread} non lue{unread > 1 ? "s" : ""}
      </p>
      {items.length === 0 ? (
        <p className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground" data-testid="notifications-page-empty">
          Aucune notification pour ce filtre.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border bg-card" data-testid="notifications-page-list">
          {items.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                className={cn("flex min-h-16 w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted", !n.readAt && "bg-sky-50/60")}
                onClick={() => void open(n)}
                data-testid="notification-row"
                data-unread={!n.readAt}
                data-severity={n.severity}
              >
                <span className={cn("mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", BADGE[n.severity])}>
                  {LABEL[n.severity]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-sm", !n.readAt && "font-semibold")}>{n.title}</span>
                  {n.body ? <span className="block text-sm text-muted-foreground">{n.body}</span> : null}
                  <span className="block text-xs text-muted-foreground">
                    <DateCell value={n.createdAt} withTime />
                  </span>
                </span>
                {!n.readAt ? <span className="mt-1 text-xs font-medium text-sky-700">Non lue</span> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

import type { ReactNode } from "react";
import { Avatar } from "@/components/avatar";
import { formatDateTime } from "@/lib/dates";
import { relativeTime } from "@/lib/relative-time";

/**
 * Ligne de chronologie verticale : avatar de l'auteur, texte, horodatage relatif (« il y a 2 h »)
 * avec la date complète en infobulle ; un fil relie les événements.
 */
export function TimelineItem({
  name,
  at,
  testId,
  children,
  last,
}: {
  name: string;
  at: Date | string;
  testId?: string;
  children: ReactNode;
  last?: boolean;
}) {
  const date = typeof at === "string" ? new Date(at) : at;
  return (
    <li className="relative flex gap-3 pb-5 last:pb-0" data-testid={testId}>
      {!last ? <span className="absolute top-8 bottom-1 left-3.5 w-px bg-border" aria-hidden /> : null}
      <Avatar name={name} size={28} />
      <div className="min-w-0 flex-1">
        {children}
        <p className="mt-0.5 text-xs text-muted-foreground">
          {name} ·{" "}
          <time dateTime={date.toISOString()} title={formatDateTime(date)}>
            {relativeTime(date)}
          </time>
        </p>
      </div>
    </li>
  );
}

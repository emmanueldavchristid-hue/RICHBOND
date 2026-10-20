import type { ReactNode } from "react";
import { Inbox } from "lucide-react";

/** État vide : icône fine de 40 px, phrase utile, bouton d'action facultatif. */
export function EmptyState({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div
      data-testid="empty-state"
      className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-card px-6 py-12 text-center"
    >
      <div className="text-muted-foreground/70 [&_svg]:size-10 [&_svg]:stroke-[1.25]">{icon ?? <Inbox aria-hidden />}</div>
      <p className="text-[15px] font-semibold">{title}</p>
      {description ? <p className="max-w-md text-sm text-muted-foreground">{description}</p> : null}
      {children ? <div className="mt-2">{children}</div> : null}
    </div>
  );
}

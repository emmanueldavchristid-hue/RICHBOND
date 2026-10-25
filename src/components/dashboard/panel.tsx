import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** Panneau de tableau de bord : titre de section 15 px, description atténuée, lien « Voir tout », contenu. */
export function Panel({
  title,
  description,
  testId,
  href,
  hrefLabel = "Voir tout",
  badge,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  description?: string;
  testId: string;
  href?: string;
  hrefLabel?: string;
  badge?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={cn("flex min-w-0 flex-col rounded-xl border bg-card", className)}
      data-testid={testId}
      aria-labelledby={`${testId}-title`}
    >
      <header className="flex items-start justify-between gap-3 px-4 pt-4 pb-3">
        <div className="min-w-0">
          <h2 id={`${testId}-title`} className="flex items-center gap-2 text-[15px] leading-5 font-semibold">
            {title}
            {badge}
          </h2>
          {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
        </div>
        {href ? (
          <Link
            href={href}
            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-2 text-[13px] font-medium text-primary transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            data-testid={`${testId}-all`}
          >
            {hrefLabel} <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        ) : null}
      </header>
      <div className={cn("min-h-0 flex-1", bodyClassName)}>{children}</div>
    </section>
  );
}

/** Message de panneau vide : une phrase utile, discrète, centrée. */
export function PanelEmpty({
  icon,
  title,
  hint,
  testId,
}: {
  icon: ReactNode;
  title: string;
  hint?: string;
  testId?: string;
}) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-1.5 px-6 py-10 text-center"
      data-testid={testId ?? "dash-empty"}
    >
      <div className="text-muted-foreground/60 [&_svg]:size-9 [&_svg]:stroke-[1.25]">{icon}</div>
      <p className="text-sm font-medium">{title}</p>
      {hint ? <p className="max-w-xs text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

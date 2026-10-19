"use client";

import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** Indicateur chiffré avec une aide en infobulle (« i ») expliquant comment il est calculé. */
export function KpiCard({
  label,
  value,
  help,
  testId,
}: {
  label: string;
  value: string;
  help: string;
  testId: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-4" data-testid={testId}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{label}</p>
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-label={`Aide : ${label}`}
                className="inline-flex size-11 -m-3 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
                data-testid={`${testId}-help`}
              />
            }
          >
            <Info className="size-4" />
          </TooltipTrigger>
          <TooltipContent>{help}</TooltipContent>
        </Tooltip>
      </div>
      <p className="mt-1 text-2xl font-semibold tabular-nums" data-testid={`${testId}-value`}>
        {value}
      </p>
    </div>
  );
}

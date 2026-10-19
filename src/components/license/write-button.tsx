"use client";

import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useLicense } from "./license-provider";

/**
 * Bouton d'écriture : désactivé avec infobulle si la licence est en lecture seule.
 * Convention : tout bouton qui crée, modifie, valide ou annule utilise <WriteButton>.
 * Le serveur reste la vraie protection (requireWritable).
 */
/** `exempt` : action autorisée même en lecture seule (Super-admin sur comptes et licence, mot de passe). */
export function WriteButton({ exempt = false, ...props }: ComponentProps<typeof Button> & { exempt?: boolean }) {
  const { writable, readOnlyMessage } = useLicense();
  if (writable || exempt) return <Button {...props} />;
  return (
    <Tooltip>
      <TooltipTrigger
        render={<span className="inline-flex" tabIndex={0} data-testid="write-disabled-hint" />}
      >
        <Button {...props} disabled onClick={undefined} />
      </TooltipTrigger>
      <TooltipContent data-testid="write-disabled-tooltip">{readOnlyMessage}</TooltipContent>
    </Tooltip>
  );
}

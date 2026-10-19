"use client";

import { Lock } from "lucide-react";
import { useLicense } from "./license-provider";

/** Bandeau rouge fixe après l'échéance : dans le flux de la page, il ne masque aucun contenu. */
export function ReadOnlyBanner() {
  const { state, openDialog } = useLicense();
  if (state.status !== "EXPIRED") return null;
  return (
    <div
      role="alert"
      data-testid="read-only-banner"
      className="sticky top-0 z-40 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-red-700 px-4 py-2 text-sm font-medium text-white"
    >
      <Lock className="size-4 shrink-0" aria-hidden />
      <span>Période d&apos;essai terminée – consultation seule</span>
      <button type="button" onClick={openDialog} className="underline underline-offset-2" data-testid="read-only-details">
        En savoir plus
      </button>
    </div>
  );
}

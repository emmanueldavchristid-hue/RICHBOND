"use client";

import { Lock } from "lucide-react";
import { useLicense } from "./license-provider";

/** Bandeau fixe après l'échéance : dans le flux de la page, il ne masque aucun contenu. Sobre, comme l'alerte critique. */
export function ReadOnlyBanner() {
  const { state, openDialog, contact } = useLicense();
  if (state.status !== "EXPIRED") return null;
  return (
    <div
      role="alert"
      data-testid="read-only-banner"
      className="flex min-h-10 flex-wrap items-center gap-x-3 gap-y-1 border-b border-l-4 border-b-red-200 border-l-red-600 bg-red-50 px-4 py-1.5 text-sm font-medium text-red-800"
    >
      <Lock className="size-4 shrink-0" aria-hidden />
      <span>Période d&apos;essai terminée – consultation seule</span>
      <span className="font-normal" data-testid="read-only-contact">
        Contact : Christ-Emmanuel Mouhi
        {contact.email ? ` – ${contact.email}` : ""}
        {contact.phone ? ` – ${contact.phone}` : ""}
      </span>
      <button type="button" onClick={openDialog} className="ml-auto underline underline-offset-2 hover:no-underline" data-testid="read-only-details">
        En savoir plus
      </button>
    </div>
  );
}

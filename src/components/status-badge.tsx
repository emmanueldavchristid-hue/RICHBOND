import { cn } from "@/lib/utils";

/** Couleurs cohérentes par statut dans toute l'application. */
export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

const TONES: Record<StatusTone, string> = {
  success: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  warning: "bg-amber-50 text-amber-800 ring-amber-200",
  danger: "bg-red-50 text-red-800 ring-red-200",
  info: "bg-sky-50 text-sky-800 ring-sky-200",
  neutral: "bg-slate-100 text-slate-700 ring-slate-200",
};

export const STATUSES: Record<string, { label: string; tone: StatusTone }> = {
  ACTIF: { label: "Actif", tone: "success" },
  DESACTIVE: { label: "Désactivé", tone: "neutral" },
  VERROUILLE: { label: "Verrouillé", tone: "danger" },
  A_CHANGER: { label: "Mot de passe à définir", tone: "warning" },
  LICENCE_ESSAI: { label: "Période d'essai", tone: "info" },
  LICENCE_ACTIVE: { label: "Licence active", tone: "success" },
  LICENCE_EXPIREE: { label: "Essai terminé", tone: "danger" },
  // Articles et fournisseurs (LOT-03)
  BLOQUE: { label: "Bloqué", tone: "danger" },
  OBSOLETE: { label: "Obsolète", tone: "neutral" },
  EN_EVALUATION: { label: "En évaluation", tone: "warning" },
  // Criticité des articles
  CRITIQUE: { label: "Critique", tone: "danger" },
  IMPORTANT: { label: "Important", tone: "warning" },
  STANDARD: { label: "Standard", tone: "neutral" },
  // Types de fournisseur
  LOCAL: { label: "Local", tone: "neutral" },
  IMPORT: { label: "Import", tone: "info" },
  // Demandes d'achat (LOT-04)
  BROUILLON: { label: "Brouillon", tone: "neutral" },
  SOUMISE: { label: "À valider", tone: "info" },
  A_COMPLETER: { label: "À compléter", tone: "warning" },
  VALIDEE: { label: "Validée", tone: "success" },
  REFUSEE: { label: "Refusée", tone: "danger" },
  EN_CONSULTATION: { label: "En consultation", tone: "info" },
  PARTIELLEMENT_COMMANDEE: { label: "Partiellement commandée", tone: "warning" },
  COMMANDEE: { label: "Commandée", tone: "success" },
  ANNULEE: { label: "Annulée", tone: "neutral" },
  // Bons de commande (LOT-05) : BROUILLON est partagé avec les DA
  A_VALIDER: { label: "À valider", tone: "info" },
  VALIDE: { label: "Validé", tone: "success" },
  ENVOYE: { label: "Envoyé", tone: "info" },
  CONFIRME: { label: "Confirmé", tone: "success" },
  PARTIELLEMENT_RECU: { label: "Partiellement reçu", tone: "warning" },
  RECU: { label: "Reçu", tone: "success" },
  CLOTURE: { label: "Clôturé", tone: "neutral" },
  REFUSE: { label: "Refusé", tone: "danger" },
  ANNULE: { label: "Annulé", tone: "neutral" },
};

export function StatusBadge({
  status,
  label,
  tone,
  className,
}: {
  status?: string;
  label?: string;
  tone?: StatusTone;
  className?: string;
}) {
  const known = status ? STATUSES[status] : undefined;
  const t = tone ?? known?.tone ?? "neutral";
  return (
    <span
      data-testid={status ? `status-${status}` : undefined}
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        TONES[t],
        className,
      )}
    >
      {label ?? known?.label ?? status}
    </span>
  );
}

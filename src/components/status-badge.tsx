import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

/**
 * Couleurs cohérentes par statut dans toute l'application (DESIGN.md §3).
 * brouillon gris · à valider ambre · validé bleu · envoyé/confirmé indigo · partiellement reçu violet ·
 * reçu/conforme/terminé vert · refusé/annulé/rupture rouge.
 */
export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral" | "indigo" | "violet";

export const TONE_COLORS: Record<StatusTone, string> = {
  neutral: "#6b7280",
  warning: "#d97706",
  info: "#2f5bea",
  indigo: "#4f46e5",
  violet: "#7c3aed",
  success: "#15803d",
  danger: "#dc2626",
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
  IMPORT: { label: "Import", tone: "indigo" },
  // Demandes d'achat (LOT-04)
  BROUILLON: { label: "Brouillon", tone: "neutral" },
  SOUMISE: { label: "À valider", tone: "warning" },
  A_COMPLETER: { label: "À compléter", tone: "warning" },
  VALIDEE: { label: "Validée", tone: "info" },
  REFUSEE: { label: "Refusée", tone: "danger" },
  EN_CONSULTATION: { label: "En consultation", tone: "indigo" },
  PARTIELLEMENT_COMMANDEE: { label: "Partiellement commandée", tone: "violet" },
  COMMANDEE: { label: "Commandée", tone: "indigo" },
  ANNULEE: { label: "Annulée", tone: "danger" },
  // Bons de commande (LOT-05) : BROUILLON est partagé avec les DA
  A_VALIDER: { label: "À valider", tone: "warning" },
  VALIDE: { label: "Validé", tone: "info" },
  ENVOYE: { label: "Envoyé", tone: "indigo" },
  CONFIRME: { label: "Confirmé", tone: "indigo" },
  PARTIELLEMENT_RECU: { label: "Partiellement reçu", tone: "violet" },
  RECU: { label: "Reçu", tone: "success" },
  CLOTURE: { label: "Clôturé", tone: "success" },
  REFUSE: { label: "Refusé", tone: "danger" },
  ANNULE: { label: "Annulé", tone: "danger" },
  // Non-conformités (LOT-06)
  OUVERTE: { label: "Ouverte", tone: "warning" },
  CLOTUREE: { label: "Clôturée", tone: "success" },
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
      data-tone={t}
      style={{ "--tone": TONE_COLORS[t] } as CSSProperties}
      className={cn("status-badge", className)}
    >
      {label ?? known?.label ?? status}
    </span>
  );
}

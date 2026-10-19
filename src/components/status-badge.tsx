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

"use client";

import { useEffect } from "react";
import { fr } from "date-fns/locale";
import { formatInTimeZone } from "date-fns-tz";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatCountdown, trialProgress } from "@/modules/licensing/state";
import { useLicense } from "./license-provider";

const TZ = "Africa/Abidjan";

/** Date en toutes lettres, ex. « vendredi 20 novembre 2026 » (fuseau Abidjan). */
export function longDate(d: Date): string {
  return formatInTimeZone(d, TZ, "EEEE d MMMM yyyy", { locale: fr });
}

/**
 * Fenêtre « Version d'essai ». S'ouvre une fois par session, puis à nouveau les jours de rappel
 * (J-7, J-3, J-1, dernier jour). Après l'échéance : fenêtre explicative à chaque connexion.
 */
export function TrialDialog({ sessionId }: { sessionId: string }) {
  const { state, serverNow, dialogOpen, openDialog, closeDialog, contact } = useLicense();
  const { status, isReminderDay } = state;
  const dayKey = formatInTimeZone(serverNow, TZ, "yyyy-MM-dd");

  useEffect(() => {
    if (status === "ACTIVE") return;
    const base = `rb-trial-seen:${sessionId}`;
    try {
      if (!localStorage.getItem(base)) {
        localStorage.setItem(base, "1");
        // Le jour de rappel est consommé par cette première ouverture (pas de doublon après F5).
        if (status === "TRIAL" && isReminderDay) localStorage.setItem(`${base}:${dayKey}`, "1");
        openDialog();
        return;
      }
      const reminder = `${base}:${dayKey}`;
      if (status === "TRIAL" && isReminderDay && !localStorage.getItem(reminder)) {
        localStorage.setItem(reminder, "1");
        openDialog();
      }
    } catch {
      // Stockage indisponible (navigation privée) : pas d'affichage supplémentaire.
    }
  }, [status, isReminderDay, dayKey, sessionId, openDialog]);

  if (status === "ACTIVE") return null;
  const expired = status === "EXPIRED";
  const progress = trialProgress(state.trialStartsAt, state.trialEndsAt, serverNow);
  const tone = state.tone === "danger" ? "text-red-700" : state.tone === "warning" ? "text-amber-700" : "text-foreground";
  const totalMin = Math.floor(Math.max(0, state.msLeft) / 60_000);
  const tiles = [
    { label: "jours", value: Math.floor(totalMin / 1440) },
    { label: "heures", value: Math.floor((totalMin % 1440) / 60) },
    { label: "minutes", value: totalMin % 60 },
  ];

  return (
    <Dialog open={dialogOpen} onOpenChange={(o) => (o ? openDialog() : closeDialog())}>
      <DialogContent className="sm:max-w-md" data-testid="trial-dialog" data-status={status}>
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold tracking-tight" data-testid="trial-dialog-title">
            {expired ? "Période d'essai terminée" : "Version d'essai"}
          </DialogTitle>
          <DialogDescription className="text-sm text-foreground/80" data-testid="trial-dialog-text">
            {expired ? (
              <>
                La version d&apos;essai de l&apos;application RICHBOND Achats &amp; Stocks s&apos;est terminée le{" "}
                <strong>{longDate(state.trialEndsAt)}</strong>.
              </>
            ) : (
              <>
                Merci de tester l&apos;application RICHBOND Achats &amp; Stocks. La version d&apos;essai se termine le{" "}
                <strong data-testid="trial-end-date">{longDate(state.trialEndsAt)}</strong>.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {expired ? (
          <ul className="list-disc space-y-1 pl-5 text-base" data-testid="trial-expired-help">
            <li>L&apos;application est en consultation seule : aucune donnée n&apos;a été supprimée.</li>
            <li>Vous pouvez toujours consulter, imprimer et exporter vos données.</li>
            <li data-testid="trial-contact">
              Pour la réactiver, contactez Christ-Emmanuel Mouhi
              {contact.email ? ` – ${contact.email}` : ""}
              {contact.phone ? ` – ${contact.phone}` : ""}.
            </li>
          </ul>
        ) : (
          <div className="space-y-4">
            <p className="sr-only" data-testid="trial-countdown">
              {formatCountdown(state.msLeft)}
            </p>
            <div className="grid grid-cols-3 gap-3" aria-hidden data-testid="trial-tiles">
              {tiles.map((t) => (
                <div key={t.label} className="rounded-xl border bg-background px-3 py-4 text-center" data-testid={`trial-tile-${t.label}`}>
                  <p className={`text-4xl leading-none font-semibold tracking-tight tabular-nums ${tone}`}>{String(t.value).padStart(2, "0")}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{t.label}</p>
                </div>
              ))}
            </div>
            <div>
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
                aria-label="Avancement de la période d'essai"
                className="h-2 overflow-hidden rounded-full bg-muted"
                data-testid="trial-progress"
              >
                <div className="h-full rounded-full bg-warn transition-[width] duration-300" style={{ width: `${progress}%` }} />
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">{progress} % de la période d&apos;essai écoulée</p>
            </div>
            <p className="text-sm text-muted-foreground">Profitez-en pour tout essayer : vos données sont conservées et votre avis nous aide à améliorer l&apos;application.</p>
          </div>
        )}

        <DialogFooter>
          <Button className="h-11 px-8 text-sm" onClick={closeDialog} data-testid="trial-continue">
            Continuer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

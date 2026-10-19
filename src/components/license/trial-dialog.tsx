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
  const { state, serverNow, dialogOpen, openDialog, closeDialog } = useLicense();
  const { status, isReminderDay } = state;
  const dayKey = formatInTimeZone(serverNow, TZ, "yyyy-MM-dd");

  useEffect(() => {
    if (status === "ACTIVE") return;
    const base = `rb-trial-seen:${sessionId}`;
    try {
      if (!localStorage.getItem(base)) {
        localStorage.setItem(base, "1");
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
  const tone = state.tone === "danger" ? "text-red-700" : state.tone === "warning" ? "text-amber-700" : "text-primary";

  return (
    <Dialog open={dialogOpen} onOpenChange={(o) => (o ? openDialog() : closeDialog())}>
      <DialogContent className="sm:max-w-lg" data-testid="trial-dialog" data-status={status}>
        <DialogHeader>
          <DialogTitle className="text-xl" data-testid="trial-dialog-title">
            {expired ? "Période d'essai terminée" : "Version d'essai"}
          </DialogTitle>
          <DialogDescription className="text-base text-foreground/80" data-testid="trial-dialog-text">
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
            <li>Pour la réactiver, contactez Christ-Emmanuel Mouhi.</li>
          </ul>
        ) : (
          <div className="space-y-3">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Temps restant</p>
              <p className={`text-4xl font-bold tabular-nums ${tone}`} data-testid="trial-countdown">
                {formatCountdown(state.msLeft)}
              </p>
            </div>
            <div>
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
                aria-label="Avancement de la période d'essai"
                className="h-3 overflow-hidden rounded-full bg-muted"
                data-testid="trial-progress"
              >
                <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{progress} % de la période d&apos;essai écoulée</p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button className="h-12 px-8 text-base" onClick={closeDialog} data-testid="trial-continue">
            Continuer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

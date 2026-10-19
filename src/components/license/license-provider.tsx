"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { computeLicenseState, READ_ONLY_MESSAGE, type LicenseState } from "@/modules/licensing/state";

/** État de licence sérialisable envoyé par le serveur (dates en ISO). */
export interface LicenseSnapshot {
  stored: "TRIAL" | "ACTIVE";
  trialStartsAt: string;
  trialEndsAt: string;
  /** Heure serveur au moment du rendu : seule référence du compte à rebours. */
  serverNow: string;
  licensedTo: string | null;
  activatedAt: string | null;
}

interface LicenseContextValue {
  /** État recalculé chaque minute à partir de l'heure serveur. */
  state: LicenseState;
  serverNow: Date;
  writable: boolean;
  readOnlyMessage: string;
  dialogOpen: boolean;
  openDialog: () => void;
  closeDialog: () => void;
}

const LicenseContext = createContext<LicenseContextValue | null>(null);

const TICK_MS = 60_000;

export function LicenseProvider({ snapshot, children }: { snapshot: LicenseSnapshot; children: ReactNode }) {
  const router = useRouter();
  const serverNowMs = useMemo(() => new Date(snapshot.serverNow).getTime(), [snapshot.serverNow]);
  // Rendu initial = heure serveur (pas de décalage d'hydratation) ; ensuite on avance au rythme du navigateur.
  const [nowMs, setNowMs] = useState(serverNowMs);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    const t0 = performance.now();
    const id = window.setInterval(() => setNowMs(serverNowMs + (performance.now() - t0)), TICK_MS);
    return () => {
      window.clearInterval(id);
      setNowMs(serverNowMs);
    };
  }, [serverNowMs]);

  const state = useMemo(
    () =>
      computeLicenseState(
        {
          status: snapshot.stored,
          trialStartsAt: new Date(snapshot.trialStartsAt),
          trialEndsAt: new Date(snapshot.trialEndsAt),
          licensedTo: snapshot.licensedTo,
          activatedAt: snapshot.activatedAt ? new Date(snapshot.activatedAt) : null,
        },
        new Date(nowMs),
      ),
    [snapshot, nowMs],
  );

  // L'échéance est franchie pendant la session : on recharge pour que le serveur bloque aussi.
  const serverSaysTrial = snapshot.stored === "TRIAL" && new Date(snapshot.trialEndsAt).getTime() > serverNowMs;
  useEffect(() => {
    if (serverSaysTrial && state.status === "EXPIRED") router.refresh();
  }, [serverSaysTrial, state.status, router]);

  const value = useMemo<LicenseContextValue>(
    () => ({
      state,
      serverNow: new Date(nowMs),
      writable: state.writable,
      readOnlyMessage: READ_ONLY_MESSAGE,
      dialogOpen,
      openDialog: () => setDialogOpen(true),
      closeDialog: () => setDialogOpen(false),
    }),
    [state, nowMs, dialogOpen],
  );
  return <LicenseContext.Provider value={value}>{children}</LicenseContext.Provider>;
}

export function useLicense(): LicenseContextValue {
  const ctx = useContext(LicenseContext);
  if (!ctx) throw new Error("useLicense doit être utilisé dans <LicenseProvider>.");
  return ctx;
}

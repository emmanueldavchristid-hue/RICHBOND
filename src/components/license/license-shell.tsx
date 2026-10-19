import type { ReactNode } from "react";
import { getLicenseState } from "@/modules/licensing";
import { LicenseProvider } from "./license-provider";

/** Composant serveur : charge l'état de licence (heure serveur) et le fournit à toute l'application. */
export async function LicenseShell({ children }: { children: ReactNode }) {
  const l = await getLicenseState();
  return (
    <LicenseProvider
      snapshot={{
        stored: l.status === "ACTIVE" ? "ACTIVE" : "TRIAL",
        trialStartsAt: l.trialStartsAt.toISOString(),
        trialEndsAt: l.trialEndsAt.toISOString(),
        serverNow: l.serverNow.toISOString(),
        licensedTo: l.licensedTo,
        activatedAt: l.activatedAt?.toISOString() ?? null,
        contact: {
          email: process.env.CONTACT_EMAIL?.trim() || null,
          phone: process.env.CONTACT_PHONE?.trim() || null,
        },
      }}
    >
      {children}
    </LicenseProvider>
  );
}

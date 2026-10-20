import type { ReactNode } from "react";

/** Motif géométrique discret : grille de losanges et de lignes, en filigrane. */
function Pattern() {
  return (
    <svg className="pointer-events-none absolute inset-0 size-full text-white" aria-hidden focusable="false">
      <defs>
        <pattern id="rb-grid" width="64" height="64" patternUnits="userSpaceOnUse">
          <path d="M32 6 58 32 32 58 6 32Z" fill="none" stroke="currentColor" strokeOpacity="0.07" strokeWidth="1" />
          <path d="M0 32h64M32 0v64" stroke="currentColor" strokeOpacity="0.035" strokeWidth="1" />
          <circle cx="32" cy="32" r="1.5" fill="currentColor" fillOpacity="0.12" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#rb-grid)" />
    </svg>
  );
}

/** Écran de connexion partagé : panneau --sidebar (logotype, phrase de valeur, motif) et formulaire centré de 360 px. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-screen bg-background lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" data-testid="auth-screen">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-12 text-sidebar-foreground lg:flex" aria-label="Présentation">
        <Pattern />
        <div className="relative">
          <p className="text-xl font-semibold tracking-[0.08em] text-white">RICHBOND</p>
          <p className="mt-1 text-sm text-sidebar-muted">Achats &amp; Stocks</p>
        </div>
        <div className="relative max-w-md">
          <p className="text-[28px] leading-9 font-semibold tracking-tight text-white">Chaque achat suivi, chaque stock sous contrôle.</p>
          <p className="mt-3 text-sm leading-6 text-sidebar-foreground">
            Demandes, bons de commande, réceptions et inventaires au même endroit, en lien avec Sage.
          </p>
        </div>
        <p className="relative text-xs text-sidebar-muted">RICHBOND CI</p>
      </section>
      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-[360px]">{children}</div>
      </section>
    </main>
  );
}

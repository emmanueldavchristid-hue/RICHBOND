"use client";

import type { ReactNode } from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

/** Thème clair par défaut ; le choix de l'utilisateur est mémorisé sur son poste. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="light" enableSystem={false} storageKey="rb-theme" disableTransitionOnChange>
      {children}
    </NextThemesProvider>
  );
}

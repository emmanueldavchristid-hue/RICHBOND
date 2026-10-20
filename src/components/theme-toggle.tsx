"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

const subscribe = () => () => undefined;

/** Bascule clair / sombre. `variant="sidebar"` pour le fond bleu nuit du menu. */
export function ThemeToggle({ className, showLabel = false }: { className?: string; showLabel?: boolean }) {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const dark = mounted && resolvedTheme === "dark";
  const label = dark ? "Passer en thème clair" : "Passer en thème sombre";
  return (
    <button
      type="button"
      onClick={() => setTheme(dark ? "light" : "dark")}
      aria-label={label}
      title={label}
      data-testid="theme-toggle"
      className={cn(
        "inline-flex h-9 items-center justify-center gap-2 rounded-lg px-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      {dark ? <Sun className="size-[18px]" aria-hidden /> : <Moon className="size-[18px]" aria-hidden />}
      {showLabel ? <span>{dark ? "Thème clair" : "Thème sombre"}</span> : null}
    </button>
  );
}

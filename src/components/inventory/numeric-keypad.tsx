"use client";

import { Delete } from "lucide-react";
import { cn } from "@/lib/utils";

/** Ajoute une touche à la saisie : 3 décimales au plus, un seul séparateur, pas de zéros inutiles en tête. */
export function pressKey(current: string, key: string): string {
  if (key === ",") {
    if (current.includes(",")) return current;
    return current === "" ? "0," : `${current},`;
  }
  const next = current === "0" ? key : current + key;
  const [int, dec] = next.split(",");
  if (int.length > 8 || (dec !== undefined && dec.length > 3)) return current;
  return next;
}

export const eraseKey = (current: string) => current.slice(0, -1);

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ",", "0"] as const;

/** Pavé numérique large pour la tablette : chaque touche fait au moins 64 px de haut. */
export function NumericKeypad({ value, onChange, disabled = false }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const base =
    "flex h-16 items-center justify-center rounded-xl border bg-card text-2xl font-semibold tabular-nums select-none transition-colors duration-150 hover:bg-muted active:bg-muted disabled:opacity-50";
  return (
    <div className="grid grid-cols-3 gap-2" role="group" aria-label="Pavé numérique" data-testid="cnt-keypad">
      {KEYS.map((k) => (
        <button
          key={k}
          type="button"
          disabled={disabled}
          className={cn(base)}
          onClick={() => onChange(pressKey(value, k))}
          data-testid={`cnt-key-${k === "," ? "comma" : k}`}
        >
          {k}
        </button>
      ))}
      <button
        type="button"
        disabled={disabled}
        className={cn(base, "text-muted-foreground")}
        aria-label="Effacer le dernier chiffre"
        onClick={() => onChange(eraseKey(value))}
        data-testid="cnt-key-back"
      >
        <Delete className="size-6" aria-hidden />
      </button>
    </div>
  );
}

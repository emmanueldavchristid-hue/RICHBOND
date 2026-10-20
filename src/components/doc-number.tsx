import { cn } from "@/lib/utils";

/** Numéro de pièce (DA-2026-00003, BC-2026-00001) en JetBrains Mono 13 px. */
export function DocNumber({ value, className }: { value: string; className?: string }) {
  return <span className={cn("doc-number", className)}>{value}</span>;
}

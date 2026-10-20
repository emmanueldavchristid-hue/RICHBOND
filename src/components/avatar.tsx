import { cn } from "@/lib/utils";

const PALETTE = ["#2f5bea", "#4f46e5", "#7c3aed", "#0f766e", "#b45309", "#be185d", "#475569"];

/** « Marie-Claire Koné » => « MK ». */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/[\s-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function colorOf(name: string): string {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/** Pastille d'initiales ; la couleur dépend du nom (stable d'un écran à l'autre). */
export function Avatar({ name, size = 28, className }: { name: string; size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      title={name}
      style={{ width: size, height: size, backgroundColor: colorOf(name), fontSize: Math.max(10, Math.round(size * 0.4)) }}
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white select-none", className)}
    >
      {initialsOf(name)}
    </span>
  );
}

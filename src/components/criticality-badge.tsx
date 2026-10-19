import { StatusBadge } from "@/components/status-badge";

/** Criticité d'un article : Critique (rouge), Important (orange), Standard (gris). */
export function CriticalityBadge({ value }: { value: "CRITIQUE" | "IMPORTANT" | "STANDARD" | string }) {
  return <StatusBadge status={value} />;
}

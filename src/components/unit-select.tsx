import type { ComponentProps } from "react";
import { NativeSelect } from "@/components/native-select";
import { UNIT_LABELS, UNITS, type Unit } from "@/modules/referentials/units";

/** Affichage court d'une unité (FÛT, m², m³…). */
const SHORT: Partial<Record<string, string>> = { FUT: "FÛT", M2: "m²", M3: "m³", M: "m", L: "L", H: "h", G: "g", T: "t" };

export function unitShort(u: string): string {
  return SHORT[u] ?? u;
}

export function unitName(u: string): string {
  return UNIT_LABELS[u as Unit] ?? u;
}

/** Liste fermée des unités (R4). */
export function UnitSelect(props: ComponentProps<typeof NativeSelect>) {
  return (
    <NativeSelect {...props}>
      {UNITS.map((u) => (
        <option key={u} value={u}>
          {UNIT_LABELS[u]} ({unitShort(u)})
        </option>
      ))}
    </NativeSelect>
  );
}

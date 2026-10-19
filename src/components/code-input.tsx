"use client";

import type { ComponentProps } from "react";
import { Input } from "@/components/ui/input";

/** Saisie d'un code Sage : majuscules automatiques. Rien n'est tronqué ni retiré en silence : un code trop long ou contenant un caractère
 * non autorisé (espace, accent…) est refusé avec un message clair par la validation du formulaire (R1). */
export function CodeInput({ onChange, ...props }: Omit<ComponentProps<typeof Input>, "onChange"> & { onChange: (value: string) => void }) {
  return (
    <Input
      className="h-11 font-mono uppercase"
      autoComplete="off"
      autoCapitalize="characters"
      spellCheck={false}
      onChange={(e) => onChange(e.target.value.toUpperCase())}
      {...props}
    />
  );
}

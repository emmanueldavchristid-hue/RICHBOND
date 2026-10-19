"use client";

import type { ComponentProps } from "react";
import { Input } from "@/components/ui/input";

/** Saisie d'un code Sage : majuscules automatiques, sans espace, 17 caractères maximum. */
export function CodeInput({ onChange, ...props }: Omit<ComponentProps<typeof Input>, "onChange"> & { onChange: (value: string) => void }) {
  return (
    <Input
      className="h-11 font-mono uppercase"
      maxLength={17}
      autoComplete="off"
      autoCapitalize="characters"
      spellCheck={false}
      onChange={(e) => onChange(e.target.value.toUpperCase().replace(/\s/g, ""))}
      {...props}
    />
  );
}

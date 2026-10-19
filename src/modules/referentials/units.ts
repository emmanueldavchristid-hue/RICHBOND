import { z } from "zod";

/** R4 : liste fermée des unités (avant l'import Sage). */
export const UNITS = [
  "U", "KG", "G", "T", "L", "M", "M2", "M3", "ROULEAU", "FUT", "CARTON", "SAC", "PALETTE", "PAIRE", "JEU", "H", "FORFAIT", "BOBINE", "BIDON", "PCE",
] as const;

export type Unit = (typeof UNITS)[number];

export const UNIT_LABELS: Record<Unit, string> = {
  U: "Unité",
  KG: "Kilogramme",
  G: "Gramme",
  T: "Tonne",
  L: "Litre",
  M: "Mètre",
  M2: "Mètre carré",
  M3: "Mètre cube",
  ROULEAU: "Rouleau",
  FUT: "Fût",
  CARTON: "Carton",
  SAC: "Sac",
  PALETTE: "Palette",
  PAIRE: "Paire",
  JEU: "Jeu",
  H: "Heure",
  FORFAIT: "Forfait",
  BOBINE: "Bobine",
  BIDON: "Bidon",
  PCE: "Pièce",
};

export const unitSchema = z.enum(UNITS, { error: "Unité non reconnue." });

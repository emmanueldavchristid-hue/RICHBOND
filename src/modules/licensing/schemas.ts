import { z } from "zod";
import { isValidDateString } from "./state";

export const extendTrialSchema = z.object({
  date: z.string().refine(isValidDateString, "Date invalide (format AAAA-MM-JJ attendu)."),
  /** Requis pour raccourcir un essai déjà accordé. */
  confirmShorten: z.boolean().optional(),
});

export const activateLicenseSchema = z.object({
  licensedTo: z
    .string()
    .trim()
    .min(2, "Le bénéficiaire doit comporter au moins 2 caractères.")
    .max(100, "Le bénéficiaire ne doit pas dépasser 100 caractères.")
    .default("RICHBOND CI"),
  key: z
    .string()
    .trim()
    .min(10, "La clé de licence est trop courte.")
    .max(40, "La clé de licence est trop longue."),
});

export type ExtendTrialInput = z.infer<typeof extendTrialSchema>;
export type ActivateLicenseInput = z.infer<typeof activateLicenseSchema>;

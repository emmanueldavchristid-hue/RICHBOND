"use server";

import { withAction } from "@/modules/auth/session";
import { globalSearch, globalSearchSchema } from "@/modules/search";

/** Recherche globale de l'en-tête (Ctrl+K). Lecture seule : autorisée même quand l'essai est terminé. */
export const globalSearchAction = withAction(null, globalSearchSchema, ({ user, input }) => globalSearch(user, input), { writable: false });

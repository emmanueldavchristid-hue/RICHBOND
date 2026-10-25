"use server";

import { z } from "zod";
import { getNow } from "@/lib/clock";
import { withAction } from "@/modules/auth/session";
import { dashboardFor } from "./dashboard";

/**
 * Tableau de bord du rôle connecté (`dashboard.view`). Lecture : autorisée quand l'essai est expiré (lecture seule).
 * L'heure vient de `getNow()` (TEST_NOW / cookie de test).
 */
export const dashboardAction = withAction(
  "dashboard.view",
  z.object({}).default({}),
  async ({ user }) => dashboardFor(user, (await getNow()).now),
  { writable: false },
);

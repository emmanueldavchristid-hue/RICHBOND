"use server";

import { z } from "zod";
import { getNow } from "@/lib/clock";
import { withAction } from "@/modules/auth/session";
import { listMine, markAllRead, markRead } from "@/modules/notifications";

const READ = { writable: false } as const;

/** Cloche de l'en-tête : compteur de non lues + 10 dernières. Autorisé en lecture seule. */
export const getNotificationsAction = withAction(
  null,
  z.object({ limit: z.number().int().min(1).max(50).optional() }).optional(),
  ({ user, input }) => listMine(user.id, { limit: input?.limit ?? 10 }),
  READ,
);

/** Marquer lu reste possible quand l'essai est expiré (aucune donnée métier modifiée). */
export const markNotificationReadAction = withAction(
  null,
  z.object({ id: z.string().min(1) }),
  async ({ user, input }) => ({ updated: await markRead(user.id, input.id, (await getNow()).now) }),
  READ,
);

export const markAllNotificationsReadAction = withAction(
  null,
  z.object({}).optional(),
  async ({ user }) => ({ updated: await markAllRead(user.id, (await getNow()).now) }),
  READ,
);

"use server";

import { withAction } from "@/modules/auth/session";
import { getClientIp } from "@/modules/auth/ip";
import {
  createUser,
  createUserSchema,
  deactivateUser,
  listUsers,
  listUsersSchema,
  reactivateUser,
  resetPassword,
  unlockUser,
  updateUser,
  updateUserSchema,
  userIdSchema,
} from "@/modules/users";

/**
 * Toutes ces actions exigent `users.manage`. Plan A9 / recette I1 :
 * - le Super-admin n'est jamais soumis à la licence (il doit pouvoir réactiver l'accès) ;
 * - réinitialiser, déverrouiller, désactiver, réactiver sont des actions de sécurité : permises en lecture seule ;
 * - créer / modifier un compte (écritures de gestion) restent bloqués pour le Responsable si l'essai est expiré.
 */
const notSuperAdmin = (u: { role: string }) => u.role !== "SUPER_ADMIN";
const securityAction = { writable: false } as const;

export const listUsersAction = withAction(
  "users.manage",
  listUsersSchema,
  ({ user, input }) => listUsers(user, input),
  { writable: false },
);

export const createUserAction = withAction("users.manage", createUserSchema, async ({ user, input }) =>
  createUser(user, input, await getClientIp()),
  { writable: notSuperAdmin },
);

export const updateUserAction = withAction("users.manage", updateUserSchema, async ({ user, input }) =>
  updateUser(user, input, await getClientIp()),
  { writable: notSuperAdmin },
);

export const resetPasswordAction = withAction("users.manage", userIdSchema, async ({ user, input }) =>
  resetPassword(user, input.id, await getClientIp()),
  securityAction,
);

export const deactivateUserAction = withAction("users.manage", userIdSchema, async ({ user, input }) =>
  deactivateUser(user, input.id, await getClientIp()),
  securityAction,
);

export const reactivateUserAction = withAction("users.manage", userIdSchema, async ({ user, input }) =>
  reactivateUser(user, input.id, await getClientIp()),
  securityAction,
);

export const unlockUserAction = withAction("users.manage", userIdSchema, async ({ user, input }) =>
  unlockUser(user, input.id, await getClientIp()),
  securityAction,
);

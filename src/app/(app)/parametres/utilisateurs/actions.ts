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

/** Toutes ces actions exigent `users.manage` ; les écritures exigent aussi une licence active. */

export const listUsersAction = withAction(
  "users.manage",
  listUsersSchema,
  ({ user, input }) => listUsers(user, input),
  { writable: false },
);

export const createUserAction = withAction("users.manage", createUserSchema, async ({ user, input }) =>
  createUser(user, input, await getClientIp()),
);

export const updateUserAction = withAction("users.manage", updateUserSchema, async ({ user, input }) =>
  updateUser(user, input, await getClientIp()),
);

export const resetPasswordAction = withAction("users.manage", userIdSchema, async ({ user, input }) =>
  resetPassword(user, input.id, await getClientIp()),
);

export const deactivateUserAction = withAction("users.manage", userIdSchema, async ({ user, input }) =>
  deactivateUser(user, input.id, await getClientIp()),
);

export const reactivateUserAction = withAction("users.manage", userIdSchema, async ({ user, input }) =>
  reactivateUser(user, input.id, await getClientIp()),
);

export const unlockUserAction = withAction("users.manage", userIdSchema, async ({ user, input }) =>
  unlockUser(user, input.id, await getClientIp()),
);

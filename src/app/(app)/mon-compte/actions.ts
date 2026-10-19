"use server";

import { changePasswordSchema } from "@/modules/auth/schemas";
import { withAction } from "@/modules/auth/session";
import { getClientIp } from "@/modules/auth/ip";
import { changeOwnPassword } from "@/modules/users";

/** Utilisateur connecté, exempté de licence (A9) et du blocage « mot de passe à changer ». */
export const changePasswordAction = withAction(
  null,
  changePasswordSchema,
  async ({ user, input }) => {
    await changeOwnPassword(user.id, input, await getClientIp());
  },
  { writable: false, allowMustChangePassword: true },
);

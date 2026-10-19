"use server";

import { CredentialsSignin } from "next-auth";
import { z } from "zod";
import { signIn, signOut } from "@/lib/auth";
import { fail, ok, toActionError, type ActionResult } from "@/lib/errors";
import { loginSchema } from "@/modules/auth/schemas";
import { getClientIp } from "@/modules/auth/ip";
import { getCurrentUser } from "@/modules/auth/session";
import { loginErrorMessage, recordLogout, safeRedirect } from "@/modules/auth/login";

const inputSchema = loginSchema.extend({ retour: z.string().optional() });

/** Retourne `{ redirectTo }` en cas de succès ; le client fait `router.push(redirectTo)`. */
export async function loginAction(raw: unknown): Promise<ActionResult<{ redirectTo: string }>> {
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("VALIDATION", parsed.error.issues[0]?.message ?? "Saisie invalide.");
  }
  const { email, password, retour } = parsed.data;
  try {
    await signIn("credentials", { email, password, redirect: false });
    return ok({ redirectTo: safeRedirect(retour) });
  } catch (e) {
    if (e instanceof CredentialsSignin || (e as { type?: string })?.type === "CredentialsSignin") {
      const code = (e as { code?: string }).code;
      return fail("LOGIN_FAILED", await loginErrorMessage(code, email));
    }
    return toActionError(e);
  }
}

export async function logoutAction(): Promise<void> {
  const user = await getCurrentUser();
  if (user) await recordLogout(user.id, await getClientIp());
  await signOut({ redirectTo: "/connexion" });
}

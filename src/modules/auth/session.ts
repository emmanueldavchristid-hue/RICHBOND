import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { BusinessError, toActionError, type ActionResult } from "@/lib/errors";
import { can, requireAction, type Action, type PermissionResource } from "@/lib/permissions";
import { requireWritable } from "@/modules/licensing/guard";
import type { PurchaseScope, Role } from "@/generated/prisma/client";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  purchaseScope: PurchaseScope | null;
  mustChangePassword: boolean;
  /** Identifiant de la session en cours (connexion), pour les messages « une fois par session ». */
  sessionKey: string;
}

/**
 * Utilisateur courant relu en base à chaque requête : compte inactif ou
 * sessionVersion différente => null (JWT invalidé).
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth();
  const s = session?.user;
  if (!s?.id) return null;
  const u = await db.user.findUnique({ where: { id: s.id } });
  if (!u || !u.active || u.sessionVersion !== s.sessionVersion) return null;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    purchaseScope: u.purchaseScope,
    mustChangePassword: u.mustChangePassword,
    sessionKey: String(s.loginAt ?? 0),
  };
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new BusinessError("UNAUTHENTICATED", "Votre session a expiré. Reconnectez-vous.");
  return user;
}

/** Garde de page : non connecté => /connexion ; mot de passe à changer => /mon-compte ; droit manquant => /acces-refuse. */
export async function requirePageAction(
  action: Action | null,
  resource?: PermissionResource,
): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/connexion");
  if (user.mustChangePassword) redirect("/mon-compte?premiere=1");
  if (action && !can(user, action, resource)) redirect("/acces-refuse");
  return user;
}

export interface WithActionOptions {
  /** Écriture : refusée si la licence est en lecture seule (défaut true). */
  writable?: boolean | ((user: CurrentUser) => boolean);
  /** Autorise l'action alors que le mot de passe doit être changé (mon-compte). */
  allowMustChangePassword?: boolean;
}

export interface ActionContext<I> {
  user: CurrentUser;
  input: I;
}

function isNextControlFlow(e: unknown): boolean {
  const digest = (e as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_HTTP_ERROR_FALLBACK"));
}

/**
 * Enveloppe standard d'une server action : session -> mot de passe à changer ->
 * droit -> licence -> Zod -> fn. `action` null = tout utilisateur connecté.
 */
export function withAction<S extends z.ZodType, R>(
  action: Action | null,
  schema: S,
  fn: (ctx: ActionContext<z.output<S>>) => Promise<R>,
  options: WithActionOptions = {},
): (input: unknown) => Promise<ActionResult<R>> {
  const { writable = true, allowMustChangePassword = false } = options;
  return async (rawInput) => {
    try {
      const user = await requireUser();
      if (user.mustChangePassword && !allowMustChangePassword) {
        throw new BusinessError(
          "PASSWORD_CHANGE_REQUIRED",
          "Vous devez d'abord définir votre mot de passe (Mon compte).",
        );
      }
      if (action) requireAction(user, action);
      const needsWritable = typeof writable === "function" ? writable(user) : writable;
      if (needsWritable) await requireWritable();
      const parsed = schema.safeParse(rawInput);
      if (!parsed.success) {
        throw new BusinessError(
          "VALIDATION",
          parsed.error.issues[0]?.message ?? "Les données saisies sont invalides.",
        );
      }
      return { ok: true, data: await fn({ user, input: parsed.data }) };
    } catch (e) {
      if (isNextControlFlow(e)) throw e;
      return toActionError(e);
    }
  };
}

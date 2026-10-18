import { z } from "zod";
import { emailSchema } from "@/modules/auth/schemas";

const roleSchema = z.enum(["SUPER_ADMIN", "RESPONSABLE_ACHATS", "ACHETEUR", "MAGASINIER"]);
const scopeSchema = z.enum(["LOCAL", "IMPORT", "ALL"]);

const base = {
  name: z.string().trim().min(2, "Le nom est obligatoire.").max(100, "Le nom est trop long."),
  email: emailSchema,
  role: roleSchema,
  purchaseScope: scopeSchema.nullish(),
};

function scopeRule(v: { role: string; purchaseScope?: string | null }, ctx: z.RefinementCtx) {
  if (v.role === "ACHETEUR" && !v.purchaseScope) {
    ctx.addIssue({
      code: "custom",
      path: ["purchaseScope"],
      message: "Le périmètre est obligatoire pour un acheteur.",
    });
  }
}

export const createUserSchema = z.object(base).superRefine(scopeRule);
export const updateUserSchema = z.object({ id: z.string().min(1), ...base }).superRefine(scopeRule);
export const userIdSchema = z.object({ id: z.string().min(1) });
export const listUsersSchema = z.object({
  search: z.string().trim().optional(),
  role: roleSchema.optional(),
  active: z.boolean().optional(),
});

export type CreateUserInput = z.input<typeof createUserSchema>;
export type UpdateUserInput = z.input<typeof updateUserSchema>;
export type ListUsersInput = z.input<typeof listUsersSchema>;

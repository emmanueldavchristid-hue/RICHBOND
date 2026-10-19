import type { Role } from "@/generated/prisma/client";

/** Utilisateur qui agit (compatible `CurrentUser`). */
export interface Actor {
  id: string;
  role: Role;
}

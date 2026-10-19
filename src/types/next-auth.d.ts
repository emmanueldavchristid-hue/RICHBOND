import type { DefaultSession } from "next-auth";
import type { RoleCode, ScopeCode } from "@/lib/permissions";

declare module "next-auth" {
  interface User {
    role: RoleCode;
    purchaseScope: ScopeCode | null;
    sessionVersion: number;
  }
  interface Session {
    user: {
      id: string;
      role: RoleCode;
      purchaseScope: ScopeCode | null;
      sessionVersion: number;
      /** Horodatage (ms) de la connexion : identifie la session pour la fenêtre d'essai. */
      loginAt: number;
    } & DefaultSession["user"];
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    uid?: string;
    role: RoleCode;
    purchaseScope?: ScopeCode | null;
    sessionVersion: number;
    loginAt?: number;
  }
}

import "server-only";
import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authenticate } from "@/modules/auth/authenticate";
import { loginSchema } from "@/modules/auth/schemas";
import { authConfig } from "./auth.config";

export class LockedError extends CredentialsSignin {
  code = "LOCKED";
}
export class DisabledError extends CredentialsSignin {
  code = "DISABLED";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = loginSchema.safeParse(raw);
        if (!parsed.success) return null;
        const r = await authenticate(parsed.data.email, parsed.data.password);
        if (r.ok) {
          return {
            id: r.user.id,
            name: r.user.name,
            email: r.user.email,
            role: r.user.role,
            purchaseScope: r.user.purchaseScope,
            sessionVersion: r.user.sessionVersion,
          };
        }
        if (r.reason === "LOCKED") throw new LockedError();
        if (r.reason === "DISABLED") throw new DisabledError();
        return null;
      },
    }),
  ],
});

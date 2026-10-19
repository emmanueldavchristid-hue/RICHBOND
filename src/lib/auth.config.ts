import type { NextAuthConfig } from "next-auth";

/** Configuration sans accès base (réutilisée par src/proxy.ts). */
export const authConfig = {
  providers: [],
  session: { strategy: "jwt", maxAge: 8 * 60 * 60, updateAge: 60 * 60 },
  pages: { signIn: "/connexion" },
  trustHost: true,
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.uid = user.id as string;
        token.role = user.role;
        token.purchaseScope = user.purchaseScope ?? null;
        token.sessionVersion = user.sessionVersion;
        token.loginAt = Date.now();
      }
      return token;
    },
    session({ session, token }) {
      if (token.uid) {
        session.user.id = token.uid;
        session.user.role = token.role;
        session.user.purchaseScope = token.purchaseScope ?? null;
        session.user.sessionVersion = token.sessionVersion;
        session.user.loginAt = token.loginAt ?? 0;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;

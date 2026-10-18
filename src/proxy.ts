import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";
import { can, type Action } from "@/lib/permissions";

const { auth } = NextAuth(authConfig);

/** Contrôle de rôle par préfixe, en plus (pas à la place) des gardes de page et d'action. */
const PREFIX_ACTIONS: [string, Action][] = [
  ["/parametres/utilisateurs", "users.manage"],
  ["/parametres/journal", "audit.view"],
];

export default auth((req) => {
  const { nextUrl } = req;
  const path = nextUrl.pathname;
  const user = req.auth?.user;

  if (path === "/connexion") {
    return user ? NextResponse.redirect(new URL("/accueil", nextUrl)) : NextResponse.next();
  }
  if (!user) {
    const url = new URL("/connexion", nextUrl);
    url.searchParams.set("retour", path + nextUrl.search);
    return NextResponse.redirect(url);
  }
  for (const [prefix, action] of PREFIX_ACTIONS) {
    if ((path === prefix || path.startsWith(prefix + "/")) && !can(user, action)) {
      return NextResponse.redirect(new URL("/acces-refuse", nextUrl));
    }
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|.*\.(?:png|jpg|jpeg|svg|gif|webp|ico|css|js)$).*)"],
};

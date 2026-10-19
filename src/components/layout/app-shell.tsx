import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getCurrentUser } from "@/modules/auth/session";
import { roleLabel, visibleNav } from "@/lib/permissions";
import { AppHeader } from "./app-header";
import { AppSidebar } from "./app-sidebar";

/** Composant serveur : lit la session (à placer sous <Suspense>). */
export async function AppShell({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/connexion");
  const minimal = user.mustChangePassword;
  const items = minimal ? [] : visibleNav(user).map(({ label, href, icon }) => ({ label, href, icon }));
  return (
    <div className="flex min-h-screen bg-slate-50">
      {minimal ? null : <AppSidebar items={items} />}
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader items={items} name={user.name} roleLabel={roleLabel(user)} minimal={minimal} />
        <main className="flex-1 p-4 md:p-6" data-testid="page-content">
          {children}
        </main>
      </div>
    </div>
  );
}

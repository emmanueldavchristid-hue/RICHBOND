import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getNow } from "@/lib/clock";
import { getCurrentUser, type CurrentUser } from "@/modules/auth/session";
import { can, roleLabel, visibleNav } from "@/lib/permissions";
import { homeOrderSummary } from "@/modules/purchase-orders";
import { homeRequestSummary, listCriticalPending } from "@/modules/purchase-requests";
import { ReadOnlyBanner } from "@/components/license/read-only-banner";
import { TrialDialog } from "@/components/license/trial-dialog";
import { CriticalBanner } from "./critical-banner";
import { AppHeader } from "./app-header";
import { AppSidebar } from "./app-sidebar";
import type { NavBadge } from "./nav-items";

/** Compteurs du menu : DA à valider (Responsable) ou assignées (Acheteur), BC en retard et à valider. */
async function navBadges(user: CurrentUser): Promise<Record<string, NavBadge[]>> {
  const out: NavBadge[] = [];
  const { now } = await getNow();
  const [requests, orders] = await Promise.all([
    can(user, "purchaseRequest.view") ? homeRequestSummary(user) : null,
    can(user, "purchaseOrder.view") ? homeOrderSummary(user, now) : null,
  ]);
  if (requests && requests.toValidate > 0) out.push({ count: requests.toValidate, tone: "warn", label: `${requests.toValidate} DA à valider` });
  if (requests && requests.assignedToMe > 0) out.push({ count: requests.assignedToMe, tone: "warn", label: `${requests.assignedToMe} DA assignées à vous` });
  if (orders && orders.toValidate > 0) out.push({ count: orders.toValidate, tone: "warn", label: `${orders.toValidate} BC à valider` });
  if (orders && orders.late > 0) out.push({ count: orders.late, tone: "danger", label: `${orders.late} BC en retard` });
  return out.length > 0 ? { "/achats": out } : {};
}

/** Composant serveur : lit la session (à placer sous <Suspense>). */
export async function AppShell({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/connexion");
  const minimal = user.mustChangePassword;
  const items = minimal ? [] : visibleNav(user).map(({ label, href, icon }) => ({ label, href, icon }));
  const critical = !minimal && can(user, "purchaseRequest.approve") ? await listCriticalPending() : [];
  const badges = minimal ? {} : await navBadges(user);
  return (
    <div className="flex min-h-screen bg-background">
      {minimal ? null : <AppSidebar items={items} badges={badges} name={user.name} roleLabel={roleLabel(user)} />}
      <div className="flex min-w-0 flex-1 flex-col">
        <ReadOnlyBanner />
        <CriticalBanner items={critical} />
        <AppHeader items={items} badges={badges} name={user.name} roleLabel={roleLabel(user)} minimal={minimal} />
        <main className="flex-1 p-4 md:p-6 min-[1440px]:p-8" data-testid="page-content">
          {children}
        </main>
      </div>
      <TrialDialog sessionId={`${user.id}:${user.sessionKey}`} />
    </div>
  );
}

import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader, PageSkeleton } from "@/components/page-header";
import { getCurrentUser } from "@/modules/auth/session";
import { listFiltered } from "@/modules/notifications";
import { NotificationsCenter } from "./notifications-center";

export const metadata: Metadata = { title: "Notifications – RICHBOND" };

type Severity = "INFO" | "IMPORTANT" | "CRITIQUE";
const SEVERITIES: Severity[] = ["INFO", "IMPORTANT", "CRITIQUE"];

async function Content({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/connexion");
  if (user.mustChangePassword) redirect("/mon-compte?premiere=1");
  const sp = await searchParams;
  const g = Array.isArray(sp.gravite) ? sp.gravite[0] : sp.gravite;
  const severity = SEVERITIES.find((s) => s === g);
  const unreadOnly = (Array.isArray(sp.nonLues) ? sp.nonLues[0] : sp.nonLues) === "1";
  const { unread, items } = await listFiltered(user.id, { severity, unreadOnly, limit: 100 });
  return (
    <NotificationsCenter
      severity={severity ?? null}
      unreadOnly={unreadOnly}
      unread={unread}
      items={items.map((n) => ({ ...n, createdAt: n.createdAt.toISOString(), readAt: n.readAt ? n.readAt.toISOString() : null }))}
    />
  );
}

export default function NotificationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Notifications" description="Vos alertes et messages, les plus récents en premier." />
      <Suspense fallback={<PageSkeleton />}>
        <Content searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

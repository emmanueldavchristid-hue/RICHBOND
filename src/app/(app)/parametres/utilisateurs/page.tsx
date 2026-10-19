import { Suspense } from "react";
import type { Metadata } from "next";
import { PageHeader, PageSkeleton } from "@/components/page-header";
import { requirePageAction } from "@/modules/auth/session";
import { isUserLocked, listUsers } from "@/modules/users";
import { UsersManager, type UserRow } from "./users-manager";

export const metadata: Metadata = { title: "Utilisateurs – RICHBOND" };

async function UsersContent() {
  const user = await requirePageAction("users.manage");
  const users = await listUsers(user);
  const rows: UserRow[] = users.map((u) => ({
    ...u,
    locked: isUserLocked(u.lockedUntil),
  }));
  return (
    <UsersManager
      users={rows}
      currentUserId={user.id}
      canAssignAdmin={user.role === "SUPER_ADMIN"}
    />
  );
}

export default function UtilisateursPage() {
  return (
    <>
      <PageHeader title="Utilisateurs" description="Créez et gérez les comptes de l'application." />
      <Suspense fallback={<PageSkeleton />}>
        <UsersContent />
      </Suspense>
    </>
  );
}

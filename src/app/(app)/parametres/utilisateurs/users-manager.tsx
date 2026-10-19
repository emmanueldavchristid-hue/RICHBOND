"use client";

import { useMemo, useState, useTransition, type ComponentProps } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DateCell } from "@/components/date-cell";
import { EmptyState } from "@/components/empty-state";
import { NativeSelect } from "@/components/native-select";
import { StatusBadge } from "@/components/status-badge";
import { ROLE_LABELS, SCOPE_LABELS, type RoleCode, type ScopeCode } from "@/lib/permissions";
import { formatDateTime } from "@/lib/dates";
import type { ActionResult } from "@/lib/errors";
import {
  deactivateUserAction,
  reactivateUserAction,
  resetPasswordAction,
  unlockUserAction,
} from "./actions";
import { UserFormDialog, type UserFormTarget } from "./user-form-dialog";
import { TempPasswordDialog, type TempPasswordInfo } from "./temp-password-dialog";

export interface UserRow {
  id: string;
  name: string;
  email: string;
  role: RoleCode;
  purchaseScope: ScopeCode | null;
  active: boolean;
  lastLoginAt: Date | null;
  lockedUntil: Date | null;
  mustChangePassword: boolean;
  /** Calculé côté serveur à l'affichage de la page. */
  locked: boolean;
}

type Confirm = { kind: "deactivate" | "reset"; user: UserRow } | null;

/** Bouton d'écriture : désactivé avec infobulle si la licence est en lecture seule. */
function WriteButton({
  readOnly,
  ...props
}: ComponentProps<typeof Button> & { readOnly: boolean }) {
  if (!readOnly) return <Button {...props} />;
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex" tabIndex={0} />}>
        <Button {...props} disabled />
      </TooltipTrigger>
      <TooltipContent>Période d&apos;essai terminée : l&apos;application est en lecture seule.</TooltipContent>
    </Tooltip>
  );
}

export function UsersManager({
  users,
  currentUserId,
  canAssignAdmin,
  readOnly,
}: {
  users: UserRow[];
  currentUserId: string;
  canAssignAdmin: boolean;
  readOnly: boolean;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<UserFormTarget | null>(null);
  const [tempInfo, setTempInfo] = useState<TempPasswordInfo | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (q && !u.name.toLowerCase().includes(q) && !u.email.toLowerCase().includes(q)) return false;
      if (roleFilter && u.role !== roleFilter) return false;
      if (statusFilter === "actif" && !u.active) return false;
      if (statusFilter === "desactive" && u.active) return false;
      return true;
    });
  }, [users, search, roleFilter, statusFilter]);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }
  function openEdit(u: UserRow) {
    setEditing({ id: u.id, name: u.name, email: u.email, role: u.role, purchaseScope: u.purchaseScope });
    setFormOpen(true);
  }

  function run<T>(fn: () => Promise<ActionResult<T>>, success: string, then?: (data: T) => void) {
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        toast.success(success);
        then?.(res.data);
        setConfirm(null);
        router.refresh();
      } else {
        toast.error(res.message);
        setConfirm(null);
      }
    });
  }

  function onConfirm() {
    if (!confirm) return;
    const u = confirm.user;
    if (confirm.kind === "deactivate") {
      run(() => deactivateUserAction({ id: u.id }), `Compte de ${u.name} désactivé.`);
    } else {
      run(
        () => resetPasswordAction({ id: u.id }),
        "Mot de passe réinitialisé.",
        (data) => setTempInfo({ name: u.name, email: u.email, temporaryPassword: data.temporaryPassword }),
      );
    }
  }

  return (
    <div className="space-y-4" data-testid="users-page">
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative min-w-60 flex-1">
          <Search className="pointer-events-none absolute top-3.5 left-3 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un nom ou un email"
            aria-label="Rechercher un utilisateur"
            className="h-11 pl-9"
            data-testid="users-search"
          />
        </div>
        <NativeSelect
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          aria-label="Filtrer par rôle"
          className="w-52"
          data-testid="users-filter-role"
        >
          <option value="">Tous les rôles</option>
          {(Object.keys(ROLE_LABELS) as RoleCode[])
            .filter((r) => canAssignAdmin || r !== "SUPER_ADMIN")
            .map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
        </NativeSelect>
        <NativeSelect
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filtrer par statut"
          className="w-44"
          data-testid="users-filter-status"
        >
          <option value="">Tous les statuts</option>
          <option value="actif">Actifs</option>
          <option value="desactive">Désactivés</option>
        </NativeSelect>
        <WriteButton readOnly={readOnly} className="h-11 px-4" onClick={openCreate} data-testid="user-create">
          <Plus /> Nouvel utilisateur
        </WriteButton>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="Aucun utilisateur trouvé" description="Modifiez la recherche ou les filtres." />
      ) : (
        <ul className="divide-y rounded-lg border bg-card" data-testid="users-table">
          {filtered.map((u) => {
            const isSelf = u.id === currentUserId;
            return (
              <li
                key={u.id}
                data-testid={`user-row-${u.email}`}
                className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <p className="font-medium">{u.name}</p>
                  <p className="truncate text-sm text-muted-foreground">{u.email}</p>
                  <p className="text-sm">
                    {ROLE_LABELS[u.role]}
                    {u.role === "ACHETEUR" && u.purchaseScope ? ` (${SCOPE_LABELS[u.purchaseScope]})` : ""}
                    <span className="text-muted-foreground"> · Dernière connexion : </span>
                    <DateCell value={u.lastLoginAt} withTime empty="Jamais" />
                  </p>
                  <div className="flex flex-wrap gap-1">
                    <StatusBadge status={u.active ? "ACTIF" : "DESACTIVE"} />
                    {u.active && u.locked && u.lockedUntil ? (
                      <StatusBadge
                        status="VERROUILLE"
                        label={`Verrouillé jusqu'à ${formatDateTime(u.lockedUntil).slice(-5)}`}
                      />
                    ) : null}
                    {u.active && u.mustChangePassword ? <StatusBadge status="A_CHANGER" /> : null}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 lg:max-w-md lg:justify-end">
                  <WriteButton readOnly={readOnly} variant="outline" className="h-10 px-3" onClick={() => openEdit(u)} data-testid="user-edit">
                    Modifier
                  </WriteButton>
                  {u.active && !isSelf ? (
                    <Button
                      variant="outline"
                      className="h-10 px-3"
                      onClick={() => setConfirm({ kind: "reset", user: u })}
                      data-testid="user-reset"
                    >
                      Réinitialiser le mot de passe
                    </Button>
                  ) : null}
                  {u.active && isSelf ? (
                    <Link
                      href="/mon-compte"
                      className={cn(buttonVariants({ variant: "outline" }), "h-10 px-3")}
                      data-testid="user-self-password"
                    >
                      Changer mon mot de passe
                    </Link>
                  ) : null}
                  {u.active && u.locked ? (
                    <Button
                      variant="outline"
                      className="h-10 px-3"
                      disabled={pending}
                      onClick={() => run(() => unlockUserAction({ id: u.id }), `Compte de ${u.name} déverrouillé.`)}
                      data-testid="user-unlock"
                    >
                      Déverrouiller
                    </Button>
                  ) : null}
                  {u.active ? (
                    isSelf ? null : (
                      <Button
                        variant="destructive"
                        className="h-10 px-3"
                        onClick={() => setConfirm({ kind: "deactivate", user: u })}
                        data-testid="user-deactivate"
                      >
                        Désactiver
                      </Button>
                    )
                  ) : (
                    <Button
                      variant="outline"
                      className="h-10 px-3"
                      disabled={pending}
                      onClick={() => run(() => reactivateUserAction({ id: u.id }), `Compte de ${u.name} réactivé.`)}
                      data-testid="user-reactivate"
                    >
                      Réactiver
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <UserFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        target={editing}
        canAssignAdmin={canAssignAdmin}
        onCreated={(info) => {
          setTempInfo(info);
          router.refresh();
        }}
        onSaved={() => router.refresh()}
      />
      <TempPasswordDialog info={tempInfo} onClose={() => setTempInfo(null)} />
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => (!o ? setConfirm(null) : undefined)}
        destructive={confirm?.kind === "deactivate"}
        pending={pending}
        title={confirm?.kind === "deactivate" ? "Désactiver ce compte ?" : "Réinitialiser le mot de passe ?"}
        description={
          confirm?.kind === "deactivate"
            ? `${confirm.user.name} ne pourra plus se connecter. Vous pourrez réactiver le compte plus tard.`
            : confirm
              ? `Un nouveau mot de passe temporaire sera généré pour ${confirm.user.name}. L'ancien ne fonctionnera plus et la session en cours sera fermée.`
              : undefined
        }
        confirmLabel={confirm?.kind === "deactivate" ? "Désactiver" : "Réinitialiser"}
        onConfirm={onConfirm}
        testId="users-confirm"
      />
    </div>
  );
}

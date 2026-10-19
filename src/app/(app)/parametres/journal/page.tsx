import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { DateCell } from "@/components/date-cell";
import { NativeSelect } from "@/components/native-select";
import { PageHeader, PageSkeleton } from "@/components/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AUDIT_ACTION_LABELS, AUDIT_ENTITY_LABELS, auditActionLabel, auditEntityLabel } from "@/lib/audit-labels";
import { cn } from "@/lib/utils";
import { auditFiltersSchema, listAudit } from "@/modules/audit/list";
import { requirePageAction } from "@/modules/auth/session";
import { listUsers } from "@/modules/users";
import { AuditDetailButton } from "./audit-detail";

export const metadata: Metadata = { title: "Journal d'activité – RICHBOND" };

type Params = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return s ? s : undefined;
}

async function JournalContent({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requirePageAction("audit.view");
  const sp = await searchParams;
  const raw = {
    userId: first(sp.userId),
    action: first(sp.action),
    entity: first(sp.entity),
    from: first(sp.from),
    to: first(sp.to),
    showAuth: first(sp.showAuth),
    page: first(sp.page),
  };
  const valid = auditFiltersSchema.safeParse(raw).success;
  const filters = valid ? raw : {};
  const [result, users] = await Promise.all([listAudit(filters, user.role), listUsers(user)]);
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));

  const pageHref = (page: number) => {
    const p = new URLSearchParams();
    const f: Record<string, string | undefined> = filters;
    for (const k of ["userId", "action", "entity", "from", "to", "showAuth"]) {
      const v = f[k];
      if (v) p.set(k, v);
    }
    p.set("page", String(page));
    return `/parametres/journal?${p.toString()}`;
  };

  return (
    <div className="space-y-4" data-testid="journal-page">
      {!valid ? (
        <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Les filtres saisis sont invalides : ils ont été ignorés.
        </p>
      ) : null}
      <form
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4"
        data-testid="journal-filtres"
      >
        <div className="space-y-1.5">
          <Label htmlFor="from">Du</Label>
          <Input id="from" name="from" type="date" defaultValue={raw.from ?? ""} className="h-11 w-44" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="to">Au</Label>
          <Input id="to" name="to" type="date" defaultValue={raw.to ?? ""} className="h-11 w-44" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="userId">Utilisateur</Label>
          <NativeSelect id="userId" name="userId" defaultValue={raw.userId ?? ""} className="w-52">
            <option value="">Tous</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="action">Action</Label>
          <NativeSelect id="action" name="action" defaultValue={raw.action ?? ""} className="w-60">
            <option value="">Toutes</option>
            {Object.entries(AUDIT_ACTION_LABELS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="entity">Élément</Label>
          <NativeSelect id="entity" name="entity" defaultValue={raw.entity ?? ""} className="w-44">
            <option value="">Tous</option>
            {Object.entries(AUDIT_ENTITY_LABELS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <label className="flex h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="showAuth"
            value="1"
            defaultChecked={raw.showAuth === "1"}
            className="size-5"
            data-testid="journal-show-auth"
          />
          Afficher les connexions et déconnexions
        </label>
        <Button type="submit" className="h-11 px-4" data-testid="journal-appliquer">
          Filtrer
        </Button>
        <Link href="/parametres/journal" className={cn(buttonVariants({ variant: "outline" }), "h-11 px-4")}>
          Réinitialiser
        </Link>
      </form>

      {result.items.length === 0 ? (
        <EmptyState title="Aucune entrée dans le journal" description="Aucune opération ne correspond à ces filtres." />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <Table data-testid="journal-table">
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Utilisateur</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Élément</TableHead>
                <TableHead>Concerné</TableHead>
                <TableHead>Détail</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.items.map((e) => (
                <TableRow key={e.id} data-testid="journal-row">
                  <TableCell>
                    <DateCell value={e.createdAt} withTime />
                  </TableCell>
                  <TableCell>{e.user?.name ?? "Système"}</TableCell>
                  <TableCell data-testid="journal-action">{auditActionLabel(e.action)}</TableCell>
                  <TableCell>{auditEntityLabel(e.entity)}</TableCell>
                  <TableCell className="text-sm" title={e.entityId}>{e.entityRef}</TableCell>
                  <TableCell>
                    <AuditDetailButton title={auditActionLabel(e.action)} before={e.before} after={e.after} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex items-center justify-between text-sm" data-testid="journal-pagination">
        <span className="text-muted-foreground">
          {result.total} entrée{result.total > 1 ? "s" : ""} – page {result.page} sur {pages}
        </span>
        <div className="flex gap-2">
          {result.page > 1 ? (
            <Link href={pageHref(result.page - 1)} className={cn(buttonVariants({ variant: "outline" }), "h-11 px-4")}>
              Précédent
            </Link>
          ) : null}
          {result.page < pages ? (
            <Link href={pageHref(result.page + 1)} className={cn(buttonVariants({ variant: "outline" }), "h-11 px-4")}>
              Suivant
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function JournalPage({ searchParams }: PageProps<"/parametres/journal">) {
  return (
    <>
      <PageHeader title="Journal d'activité" description="Historique des connexions et des opérations sensibles." />
      <Suspense fallback={<PageSkeleton />}>
        <JournalContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

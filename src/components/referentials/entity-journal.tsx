import { DateCell } from "@/components/date-cell";
import { EmptyState } from "@/components/empty-state";
import { auditActionLabel } from "@/lib/audit-labels";
import { listEntityAudit } from "@/modules/audit/list";
import { AuditDetailButton } from "@/app/(app)/parametres/journal/audit-detail";

/** Onglet « Journal » d'une fiche : qui a fait quoi, et quand (réservé aux utilisateurs ayant `audit.view`). */
export async function EntityJournal({
  entity,
  entityId,
  related = [],
}: {
  entity: string;
  entityId: string;
  related?: { entity: string; ids: string[] }[];
}) {
  const entries = await listEntityAudit(entity, entityId, 50, related);
  if (entries.length === 0) {
    return <EmptyState title="Aucune opération enregistrée" description="Les créations et modifications de cette fiche apparaîtront ici." />;
  }
  return (
    <div className="overflow-x-auto rounded-lg border bg-card" data-testid="entity-journal">
      <table className="w-full text-sm">
        <thead className="text-left text-xs font-medium text-muted-foreground border-b">
          <tr>
            <th className="p-3">Date</th>
            <th className="p-3">Utilisateur</th>
            <th className="p-3">Opération</th>
            <th className="p-3">Détail</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id} className="border-t" data-testid="journal-row">
              <td className="p-3 whitespace-nowrap">
                <DateCell value={e.createdAt} withTime />
              </td>
              <td className="p-3">{e.user?.name ?? "Système"}</td>
              <td className="p-3">{auditActionLabel(e.action)}</td>
              <td className="p-3">
                <AuditDetailButton title={auditActionLabel(e.action)} before={e.before} after={e.after} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

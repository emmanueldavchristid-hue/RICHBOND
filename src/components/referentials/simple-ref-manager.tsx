"use client";

import { useState, type FormEvent } from "react";
import { Pencil, Plus, Power, PowerOff } from "lucide-react";
import { CodeInput } from "@/components/code-input";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { FormError, FormField } from "@/components/form-field";
import { WriteButton } from "@/components/license/write-button";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useActionRunner } from "@/components/use-action-runner";
import type { ActionResult } from "@/lib/errors";

export interface SimpleRefRow {
  id: string;
  code: string;
  name: string;
  active: boolean;
  updatedAt: Date;
}

type Act = (input: unknown) => Promise<ActionResult<unknown>>;

export interface SimpleRefLabels {
  /** « dépôt » */
  singular: string;
  /** « Dépôts » */
  plural: string;
  /** « Nouveau dépôt » */
  newButton: string;
  /** « Nom du dépôt » */
  nameLabel: string;
  /** Genre grammatical pour les accords : « créé » / « créée ». */
  created: string;
  /** Préfixe des data-testid. */
  testId: string;
}

function RefForm({ labels, target, create, update, onDone }: { labels: SimpleRefLabels; target: SimpleRefRow | null; create: Act; update: Act; onDone: () => void }) {
  const { run, pending } = useActionRunner();
  const [code, setCode] = useState(target?.code ?? "");
  const [name, setName] = useState(target?.name ?? "");
  const [errors, setErrors] = useState<{ code?: string; name?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const next: { code?: string; name?: string } = {};
    if (!target && code.trim() === "") next.code = "Le code est obligatoire.";
    if (name.trim().length < 2) next.name = `Le nom est obligatoire (2 caractères minimum).`;
    setErrors(next);
    if (next.code || next.name) return;
    await run(() => (target ? update({ id: target.id, expectedUpdatedAt: target.updatedAt.toISOString(), name }) : create({ code, name })), {
      success: target ? `${labels.singular[0].toUpperCase()}${labels.singular.slice(1)} modifié.` : `${labels.singular[0].toUpperCase()}${labels.singular.slice(1)} ${labels.created}.`,
      onSuccess: onDone,
      onError: (f) => (f.code === "CODE_EXISTS" ? setErrors({ code: f.message }) : setFormError(f.message)),
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4" data-testid={`${labels.testId}-form`}>
      <FormError message={formError} testId={`${labels.testId}-form-error`} />
      <FormField id={`${labels.testId}-code`} label="Code" required={!target} error={errors.code} hint={target ? "Le code ne peut pas être modifié." : "Lettres majuscules et chiffres, 17 caractères maximum."}>
        <CodeInput
          id={`${labels.testId}-code`}
          value={code}
          onChange={(v) => {
            setCode(v);
            setErrors((p) => ({ ...p, code: undefined }));
          }}
          readOnly={!!target}
          data-testid={`${labels.testId}-code`}
        />
      </FormField>
      <FormField id={`${labels.testId}-name`} label={labels.nameLabel} required error={errors.name}>
        <Input
          id={`${labels.testId}-name`}
          className="h-11"
          value={name}
          maxLength={80}
          onChange={(e) => {
            setName(e.target.value);
            setErrors((p) => ({ ...p, name: undefined }));
          }}
          data-testid={`${labels.testId}-name`}
        />
      </FormField>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" className="h-11 px-4" onClick={onDone}>
          Annuler
        </Button>
        <WriteButton type="submit" className="h-11 px-4" disabled={pending} data-testid={`${labels.testId}-save`}>
          {pending ? "Enregistrement…" : "Enregistrer"}
        </WriteButton>
      </div>
    </form>
  );
}

/** Liste simple code + nom + actif (dépôts, services demandeurs). Jamais de suppression : on désactive. */
export function SimpleRefManager({
  rows,
  labels,
  createAction,
  updateAction,
  setActiveAction,
}: {
  rows: SimpleRefRow[];
  labels: SimpleRefLabels;
  createAction: Act;
  updateAction: Act;
  setActiveAction: Act;
}) {
  const { run, pending } = useActionRunner();
  const [dialog, setDialog] = useState<{ target: SimpleRefRow | null } | null>(null);
  const [deactivating, setDeactivating] = useState<SimpleRefRow | null>(null);
  const t = labels.testId;

  return (
    <div className="space-y-4" data-testid={`${t}-page`}>
      <div className="flex justify-end">
        <WriteButton type="button" className="h-11 px-4" onClick={() => setDialog({ target: null })} data-testid={`${t}-create`}>
          <Plus /> {labels.newButton}
        </WriteButton>
      </div>
      {rows.length === 0 ? (
        <EmptyState title={`Aucun ${labels.singular}`} description={`Créez le premier ${labels.singular}.`} />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm" data-testid={`${t}-table`}>
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground uppercase">
              <tr>
                <th className="p-3">Code</th>
                <th className="p-3">Nom</th>
                <th className="p-3">Statut</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t" data-testid={`${t}-row-${r.code}`}>
                  <td className="p-3 font-mono">{r.code}</td>
                  <td className="p-3">{r.name}</td>
                  <td className="p-3">
                    <StatusBadge status={r.active ? "ACTIF" : "DESACTIVE"} />
                  </td>
                  <td className="p-3">
                    <div className="flex justify-end gap-2">
                      <WriteButton type="button" variant="outline" className="h-11 px-3" onClick={() => setDialog({ target: r })} data-testid={`${t}-edit`}>
                        <Pencil /> Modifier
                      </WriteButton>
                      {r.active ? (
                        <WriteButton type="button" variant="destructive" className="h-11 px-3" onClick={() => setDeactivating(r)} data-testid={`${t}-deactivate`}>
                          <PowerOff /> Désactiver
                        </WriteButton>
                      ) : (
                        <WriteButton
                          type="button"
                          variant="outline"
                          className="h-11 px-3"
                          disabled={pending}
                          onClick={() =>
                            void run(() => setActiveAction({ id: r.id, active: true, expectedUpdatedAt: r.updatedAt.toISOString() }), {
                              success: `${labels.singular[0].toUpperCase()}${labels.singular.slice(1)} réactivé.`,
                            })
                          }
                          data-testid={`${t}-reactivate`}
                        >
                          <Power /> Réactiver
                        </WriteButton>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={dialog !== null} onOpenChange={(o) => (!o ? setDialog(null) : undefined)}>
        <DialogContent className="sm:max-w-md" data-testid={`${t}-dialog`}>
          <DialogHeader>
            <DialogTitle>{dialog?.target ? `Modifier : ${dialog.target.name}` : labels.newButton}</DialogTitle>
            <DialogDescription>{dialog?.target ? "Seul le nom peut être modifié." : "Le code ne pourra plus être modifié ensuite."}</DialogDescription>
          </DialogHeader>
          {dialog ? (
            <RefForm key={dialog.target?.id ?? "new"} labels={labels} target={dialog.target} create={createAction} update={updateAction} onDone={() => setDialog(null)} />
          ) : null}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={deactivating !== null}
        onOpenChange={(o) => (!o ? setDeactivating(null) : undefined)}
        title={`Désactiver ${deactivating?.name ?? ""} ?`}
        description={`Ce ${labels.singular} ne sera plus proposé dans les listes. L'historique est conservé et vous pourrez le réactiver.`}
        confirmLabel="Désactiver"
        destructive
        pending={pending}
        testId={`${t}-confirm`}
        onConfirm={async () => {
          if (!deactivating) return;
          await run(() => setActiveAction({ id: deactivating.id, active: false, expectedUpdatedAt: deactivating.updatedAt.toISOString() }), {
            success: `${labels.singular[0].toUpperCase()}${labels.singular.slice(1)} désactivé.`,
            onSuccess: () => setDeactivating(null),
            onError: () => setDeactivating(null),
          });
        }}
      />
    </div>
  );
}

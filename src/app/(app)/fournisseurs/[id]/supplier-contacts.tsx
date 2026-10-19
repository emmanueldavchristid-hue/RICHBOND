"use client";

import { useState, type FormEvent } from "react";
import { Mail, Pencil, Phone, Plus, UserCheck, UserX } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { FormError, FormField } from "@/components/form-field";
import { WriteButton } from "@/components/license/write-button";
import { StatusBadge } from "@/components/status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useActionRunner } from "@/components/use-action-runner";
import { cn } from "@/lib/utils";
import { addContactSchema, updateContactSchema } from "@/modules/suppliers/schemas";
import { addContactAction, setContactActiveAction, updateContactAction } from "../actions";

export interface ContactRow {
  id: string;
  name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
  isPrimary: boolean;
  active: boolean;
  updatedAt: Date;
}

interface Values {
  name: string;
  role: string;
  phone: string;
  email: string;
  isPrimary: boolean;
}

function ContactForm({ supplierId, target, onDone }: { supplierId: string; target: ContactRow | null; onDone: () => void }) {
  const { run, pending } = useActionRunner();
  const [v, setV] = useState<Values>({
    name: target?.name ?? "",
    role: target?.role ?? "",
    phone: target?.phone ?? "",
    email: target?.email ?? "",
    isPrimary: target?.isPrimary ?? false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const set = <K extends keyof Values>(k: K, value: Values[K]) => {
    setV((p) => ({ ...p, [k]: value }));
    setErrors((p) => ({ ...p, [k]: "" }));
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const payload = target
      ? { id: target.id, expectedUpdatedAt: target.updatedAt.toISOString(), ...v }
      : { supplierId, ...v };
    const check = (target ? updateContactSchema : addContactSchema).safeParse(payload);
    if (!check.success) {
      const next: Record<string, string> = {};
      for (const issue of check.error.issues) {
        const key = String(issue.path[0] ?? "");
        if (key && !next[key]) next[key] = issue.message;
      }
      setErrors(next);
      return;
    }
    await run(() => (target ? updateContactAction(payload) : addContactAction(payload)), {
      success: target ? "Contact modifié." : "Contact ajouté.",
      onSuccess: onDone,
      onError: (f) => setFormError(f.message),
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4" data-testid="contact-form">
      <FormError message={formError} testId="contact-form-error" />
      <FormField id="c-name" label="Nom" required error={errors.name}>
        <Input id="c-name" className="h-11" value={v.name} maxLength={100} onChange={(e) => set("name", e.target.value)} data-testid="contact-name" />
      </FormField>
      <FormField id="c-role" label="Fonction" error={errors.role}>
        <Input id="c-role" className="h-11" value={v.role} maxLength={80} onChange={(e) => set("role", e.target.value)} data-testid="contact-role" />
      </FormField>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField id="c-phone" label="Téléphone" error={errors.phone}>
          <Input id="c-phone" className="h-11" type="tel" inputMode="tel" value={v.phone} onChange={(e) => set("phone", e.target.value)} data-testid="contact-phone" />
        </FormField>
        <FormField id="c-email" label="Email" error={errors.email}>
          <Input id="c-email" className="h-11" type="email" inputMode="email" value={v.email} onChange={(e) => set("email", e.target.value)} data-testid="contact-email" />
        </FormField>
      </div>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" className="size-5" checked={v.isPrimary} onChange={(e) => set("isPrimary", e.target.checked)} data-testid="contact-primary" />
        Contact principal
      </label>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" className="h-11 px-4" onClick={onDone}>
          Annuler
        </Button>
        <WriteButton type="submit" className="h-11 px-4" disabled={pending} data-testid="contact-save">
          {pending ? "Enregistrement…" : "Enregistrer"}
        </WriteButton>
      </div>
    </form>
  );
}

/** Contacts du fournisseur : appel et email en un geste sur tablette. */
export function SupplierContacts({ supplierId, contacts, canEdit }: { supplierId: string; contacts: ContactRow[]; canEdit: boolean }) {
  const { run, pending } = useActionRunner();
  const [dialog, setDialog] = useState<{ target: ContactRow | null } | null>(null);
  const [deactivating, setDeactivating] = useState<ContactRow | null>(null);

  return (
    <div className="space-y-4" data-testid="supplier-contacts">
      {canEdit ? (
        <div className="flex justify-end">
          <WriteButton type="button" className="h-11 px-4" onClick={() => setDialog({ target: null })} data-testid="contact-add">
            <Plus /> Ajouter un contact
          </WriteButton>
        </div>
      ) : null}
      {contacts.length === 0 ? (
        <EmptyState title="Aucun contact" description="Ajoutez au moins un contact pour joindre ce fournisseur." />
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {contacts.map((c) => (
            <li key={c.id} className={cn("flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between", !c.active && "opacity-60")} data-testid={`contact-row-${c.name}`}>
              <div className="min-w-0 space-y-1">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  {c.name}
                  {c.isPrimary ? <StatusBadge tone="info" label="Principal" /> : null}
                  {!c.active ? <StatusBadge status="DESACTIVE" /> : null}
                </p>
                {c.role ? <p className="text-sm text-muted-foreground">{c.role}</p> : null}
                <div className="flex flex-wrap gap-2 pt-1">
                  {c.phone ? (
                    <a href={`tel:${c.phone.replace(/[^+\d]/g, "")}`} className={cn(buttonVariants({ variant: "outline" }), "h-11 px-3")} data-testid="contact-call">
                      <Phone /> {c.phone}
                    </a>
                  ) : null}
                  {c.email ? (
                    <a href={`mailto:${c.email}`} className={cn(buttonVariants({ variant: "outline" }), "h-11 px-3")} data-testid="contact-mail">
                      <Mail /> {c.email}
                    </a>
                  ) : null}
                </div>
              </div>
              {canEdit ? (
                <div className="flex flex-wrap gap-2">
                  <WriteButton type="button" variant="outline" className="h-11 px-3" onClick={() => setDialog({ target: c })} data-testid="contact-edit">
                    <Pencil /> Modifier
                  </WriteButton>
                  {c.active ? (
                    <WriteButton type="button" variant="destructive" className="h-11 px-3" onClick={() => setDeactivating(c)} data-testid="contact-deactivate">
                      <UserX /> Désactiver
                    </WriteButton>
                  ) : (
                    <WriteButton
                      type="button"
                      variant="outline"
                      className="h-11 px-3"
                      disabled={pending}
                      onClick={() =>
                        void run(() => setContactActiveAction({ id: c.id, active: true, expectedUpdatedAt: c.updatedAt.toISOString() }), {
                          success: "Contact réactivé.",
                        })
                      }
                      data-testid="contact-reactivate"
                    >
                      <UserCheck /> Réactiver
                    </WriteButton>
                  )}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <Dialog open={dialog !== null} onOpenChange={(o) => (!o ? setDialog(null) : undefined)}>
        <DialogContent className="sm:max-w-lg" data-testid="contact-dialog">
          <DialogHeader>
            <DialogTitle>{dialog?.target ? "Modifier le contact" : "Nouveau contact"}</DialogTitle>
            <DialogDescription>Nom, fonction, téléphone et email du contact chez le fournisseur.</DialogDescription>
          </DialogHeader>
          {dialog ? <ContactForm key={dialog.target?.id ?? "new"} supplierId={supplierId} target={dialog.target} onDone={() => setDialog(null)} /> : null}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={deactivating !== null}
        onOpenChange={(o) => (!o ? setDeactivating(null) : undefined)}
        title="Désactiver ce contact ?"
        description={deactivating ? `${deactivating.name} ne sera plus proposé comme contact. Vous pourrez le réactiver.` : undefined}
        confirmLabel="Désactiver"
        destructive
        pending={pending}
        testId="contact-confirm"
        onConfirm={async () => {
          if (!deactivating) return;
          await run(() => setContactActiveAction({ id: deactivating.id, active: false, expectedUpdatedAt: deactivating.updatedAt.toISOString() }), {
            success: "Contact désactivé.",
            onSuccess: () => setDeactivating(null),
            onError: () => setDeactivating(null),
          });
        }}
      />
    </div>
  );
}

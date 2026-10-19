"use client";

import { useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import { FormError, FormField, TextArea } from "@/components/form-field";
import { WriteButton } from "@/components/license/write-button";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useActionRunner } from "@/components/use-action-runner";
import type { ContactChannelCode } from "@/modules/purchase-orders/labels";
import { reminderTextAction, remindSupplierAction } from "@/app/(app)/achats/commandes/actions";
import { ChannelSelect } from "./channel-select";
import { SupplierTextPanel, type SupplierText } from "./supplier-text-panel";

/**
 * Relance d'un fournisseur (D20) : texte prêt à copier (WhatsApp / e-mail), puis enregistrement de la relance
 * (moyen, contact, commentaire). L'application n'envoie rien : le texte est copié ou ouvert dans l'application du poste.
 */
export function ReminderDialog(props: { open: boolean; onOpenChange: (open: boolean) => void; orderId: string; updatedAt: string; displayNumber: string }) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl" data-testid="po-remind-dialog">
        <ReminderBody {...props} />
      </DialogContent>
    </Dialog>
  );
}

/** Contenu monté à l'ouverture seulement : l'état (texte, moyen, contact) repart à zéro à chaque relance. */
function ReminderBody({
  onOpenChange,
  orderId,
  updatedAt,
  displayNumber,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  updatedAt: string;
  displayNumber: string;
}) {
  const { run, pending } = useActionRunner();
  const [data, setData] = useState<SupplierText | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [channel, setChannel] = useState<ContactChannelCode | "">("");
  const [contact, setContact] = useState("");
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void reminderTextAction({ id: orderId }).then((res) => {
      if (!alive) return;
      if (res.ok) {
        const d = res.data as SupplierText;
        setData(d);
        setContact(d.contact?.name ?? "");
      } else setLoadError(res.message);
    });
    return () => {
      alive = false;
    };
  }, [orderId]);

  async function save() {
    if (!channel) return setError("Choisissez le moyen utilisé pour relancer (e-mail, WhatsApp, téléphone…).");
    setError(null);
    await run(() => remindSupplierAction({ id: orderId, expectedUpdatedAt: updatedAt, channel, contact: contact || null, comment: comment || null }), {
      success: `Relance de ${displayNumber} enregistrée.`,
      onSuccess: () => onOpenChange(false),
    });
  }

  return (
    <>
        <DialogHeader>
          <DialogTitle>Relancer le fournisseur : {displayNumber}</DialogTitle>
          <DialogDescription>
            Copiez le texte ou ouvrez-le dans WhatsApp / votre messagerie, puis enregistrez la relance pour garder la trace de l&apos;appel ou du message.
          </DialogDescription>
        </DialogHeader>
        {loadError ? <FormError message={loadError} testId="po-remind-load-error" /> : null}
        {data ? <SupplierTextPanel data={data} testId="po-remind-text" /> : !loadError ? <p className="text-sm text-muted-foreground">Préparation du texte…</p> : null}
        <FormError message={error} testId="po-remind-error" />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="po-remind-channel" label="Moyen utilisé" required>
            <ChannelSelect id="po-remind-channel" value={channel} onChange={setChannel} testId="po-remind-channel" />
          </FormField>
          <FormField id="po-remind-contact" label="Contact joint">
            <Input id="po-remind-contact" className="h-11" maxLength={100} value={contact} onChange={(e) => setContact(e.target.value)} data-testid="po-remind-contact" />
          </FormField>
        </div>
        <FormField id="po-remind-comment" label="Commentaire (réponse du fournisseur, nouvelle date…)">
          <TextArea id="po-remind-comment" className="min-h-20" maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)} data-testid="po-remind-comment" />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" className="h-11 px-4" onClick={() => onOpenChange(false)} data-testid="po-remind-cancel">
            Fermer
          </Button>
          <WriteButton type="button" className="h-11 px-4" disabled={pending} onClick={() => void save()} data-testid="po-remind-confirm">
            <BellRing /> {pending ? "Enregistrement…" : "Enregistrer la relance"}
          </WriteButton>
        </div>
    </>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Download, Send } from "lucide-react";
import { FormError, FormField } from "@/components/form-field";
import { WriteButton } from "@/components/license/write-button";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useActionRunner } from "@/components/use-action-runner";
import type { ContactChannelCode } from "@/modules/purchase-orders/labels";
import { markSentAction, sendTextAction } from "@/app/(app)/achats/commandes/actions";
import { ChannelSelect } from "./channel-select";
import { SupplierTextPanel, type SupplierText } from "./supplier-text-panel";

/**
 * « Marquer comme envoyé » (D17) : l'application ne transmet rien. L'acheteur télécharge le PDF, l'envoie au fournisseur
 * (texte d'accompagnement fourni), puis enregistre ici le moyen, la date et le contact.
 */
export function SendDialog({
  open,
  onOpenChange,
  orderId,
  updatedAt,
  displayNumber,
  today,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  updatedAt: string;
  displayNumber: string;
  /** Jour courant à Abidjan (yyyy-MM-dd). */
  today: string;
}) {
  const { run, pending } = useActionRunner();
  const [data, setData] = useState<SupplierText | null>(null);
  const [channel, setChannel] = useState<ContactChannelCode | "">("");
  const [date, setDate] = useState(today);
  const [contact, setContact] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setData(null);
    setChannel("");
    setDate(today);
    setContact("");
    setError(null);
    void sendTextAction({ id: orderId }).then((res) => {
      if (!alive || !res.ok) return;
      const d = res.data as SupplierText;
      setData(d);
      setContact(d.contact?.name ?? "");
    });
    return () => {
      alive = false;
    };
  }, [open, orderId, today]);

  async function save() {
    if (!channel) return setError("Choisissez le moyen utilisé pour envoyer le bon (e-mail, WhatsApp, remis en main propre…).");
    if (!date || date > today) return setError("La date d'envoi ne peut pas être dans le futur.");
    setError(null);
    await run(() => markSentAction({ id: orderId, expectedUpdatedAt: updatedAt, channel, sentDate: date, contact: contact || null }), {
      success: `${displayNumber} marqué comme envoyé au fournisseur.`,
      onSuccess: () => onOpenChange(false),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl" data-testid="po-send-dialog">
        <DialogHeader>
          <DialogTitle>Envoyer {displayNumber} au fournisseur</DialogTitle>
          <DialogDescription>
            1. Téléchargez le PDF. 2. Envoyez-le avec le texte ci-dessous. 3. Enregistrez l&apos;envoi pour suivre la confirmation du fournisseur.
          </DialogDescription>
        </DialogHeader>
        <a
          href={`/api/purchase-orders/${orderId}/pdf`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-11 w-fit items-center gap-1.5 rounded-lg border px-4 text-sm font-medium hover:bg-muted"
          data-testid="po-send-pdf"
        >
          <Download className="size-4" /> Télécharger le PDF
        </a>
        {data ? <SupplierTextPanel data={data} testId="po-send-text" /> : <p className="text-sm text-muted-foreground">Préparation du texte…</p>}
        <FormError message={error} testId="po-send-error" />
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField id="po-send-channel" label="Moyen utilisé" required>
            <ChannelSelect id="po-send-channel" value={channel} onChange={setChannel} testId="po-send-channel" />
          </FormField>
          <FormField id="po-send-date" label="Date d'envoi" required>
            <Input id="po-send-date" type="date" className="h-11" max={today} value={date} onChange={(e) => setDate(e.target.value)} data-testid="po-send-date" />
          </FormField>
          <FormField id="po-send-contact" label="Contact">
            <Input id="po-send-contact" className="h-11" maxLength={100} value={contact} onChange={(e) => setContact(e.target.value)} data-testid="po-send-contact" />
          </FormField>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" className="h-11 px-4" onClick={() => onOpenChange(false)} data-testid="po-send-cancel">
            Retour
          </Button>
          <WriteButton type="button" className="h-11 px-4" disabled={pending} onClick={() => void save()} data-testid="po-send-confirm">
            <Send /> {pending ? "Enregistrement…" : "Marquer comme envoyé"}
          </WriteButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}

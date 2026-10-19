"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Ban,
  BellRing,
  CheckCircle2,
  CircleCheckBig,
  CalendarClock,
  CornerUpLeft,
  Download,
  FilePen,
  Lock,
  MessageSquare,
  Pencil,
  Send,
  Undo2,
  XCircle,
} from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FormField, TextArea } from "@/components/form-field";
import { WriteButton } from "@/components/license/write-button";
import { PromiseDialog } from "@/components/purchase-orders/promise-dialog";
import { ReminderDialog } from "@/components/purchase-orders/reminder-dialog";
import { SendDialog } from "@/components/purchase-orders/send-dialog";
import { ReasonDialog } from "@/components/purchase-requests/reason-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useActionRunner } from "@/components/use-action-runner";
import type { PoAction } from "@/modules/purchase-orders/workflow";
import {
  abandonAmendmentAction,
  addOrderCommentAction,
  approveOrderAction,
  cancelOrderAction,
  closeOrderAction,
  rejectOrderAction,
  returnOrderAction,
  startAmendmentAction,
  submitOrderAction,
} from "../actions";

type Dlg = null | "submit" | "approve" | "reject" | "return" | "cancel" | "send" | "confirm" | "promise" | "remind" | "amend" | "abandon" | "close";

/** Boutons de la fiche : n'apparaissent que si le serveur les autorise (`availableActions`). Le serveur reste la vraie protection. */
export function OrderActions({
  id,
  updatedAt,
  displayNumber,
  actions,
  status,
  today,
  orderDay,
  promisedDay,
  selfApprove,
  alertCount,
  amendment,
}: {
  id: string;
  updatedAt: string;
  displayNumber: string;
  actions: PoAction[];
  status: string;
  /** Jour courant à Abidjan (yyyy-MM-dd). */
  today: string;
  /** Jour du bon (validation, sinon création) : borne basse de la date promise. */
  orderDay: string;
  promisedDay: string | null;
  /** Le Responsable valide son propre bon : il sera marqué « auto-validé ». */
  selfApprove: boolean;
  alertCount: number;
  amendment: boolean;
}) {
  const router = useRouter();
  const { run, pending } = useActionRunner();
  const [dialog, setDialog] = useState<Dlg>(null);
  const [note, setNote] = useState("");
  const [comment, setComment] = useState("");
  const [commentError, setCommentError] = useState<string | null>(null);
  const can = (a: PoAction) => actions.includes(a);
  const close = () => setDialog(null);
  const openWith = (d: Dlg) => {
    setNote("");
    setDialog(d);
  };
  const preview = status === "BROUILLON" || status === "A_VALIDER";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3" data-testid="po-actions">
        {can("submit") ? (
          <WriteButton className="h-12 px-5 text-base" disabled={pending} onClick={() => openWith("submit")} data-testid="po-action-submit">
            <Send /> Soumettre pour validation
          </WriteButton>
        ) : null}
        {can("edit") ? (
          <WriteButton variant="outline" className="h-12 px-5 text-base" onClick={() => router.push(`/achats/commandes/${id}/modifier`)} data-testid="po-action-edit">
            <Pencil /> Modifier
          </WriteButton>
        ) : null}
        {can("approve") ? (
          <WriteButton className="h-12 bg-emerald-700 px-5 text-base text-white hover:bg-emerald-800" disabled={pending} onClick={() => openWith("approve")} data-testid="po-action-approve">
            <CheckCircle2 /> Valider
          </WriteButton>
        ) : null}
        {can("return") ? (
          <WriteButton variant="outline" className="h-12 px-5 text-base" onClick={() => openWith("return")} data-testid="po-action-return">
            <CornerUpLeft /> Renvoyer pour correction
          </WriteButton>
        ) : null}
        {can("reject") ? (
          <WriteButton variant="outline" className="h-12 px-5 text-base text-red-700" onClick={() => openWith("reject")} data-testid="po-action-reject">
            <XCircle /> Refuser
          </WriteButton>
        ) : null}
        {can("send") ? (
          <WriteButton className="h-12 px-5 text-base" onClick={() => openWith("send")} data-testid="po-action-send">
            <Send /> Marquer comme envoyé
          </WriteButton>
        ) : null}
        {can("confirm") ? (
          <WriteButton className="h-12 px-5 text-base" onClick={() => openWith("confirm")} data-testid="po-action-confirm">
            <CircleCheckBig /> Confirmer (date promise)
          </WriteButton>
        ) : null}
        {can("changePromisedDate") ? (
          <WriteButton variant="outline" className="h-12 px-5 text-base" onClick={() => openWith("promise")} data-testid="po-action-promise">
            <CalendarClock /> Changer la date promise
          </WriteButton>
        ) : null}
        {can("remind") ? (
          <WriteButton variant="outline" className="h-12 px-5 text-base" onClick={() => openWith("remind")} data-testid="po-action-remind">
            <BellRing /> Relancer
          </WriteButton>
        ) : null}
        {can("startAmendment") ? (
          <WriteButton variant="outline" className="h-12 px-5 text-base" onClick={() => openWith("amend")} data-testid="po-action-amend">
            <FilePen /> Créer un avenant
          </WriteButton>
        ) : null}
        {can("abandonAmendment") ? (
          <WriteButton variant="outline" className="h-12 px-5 text-base" onClick={() => openWith("abandon")} data-testid="po-action-abandon">
            <Undo2 /> Abandonner l&apos;avenant
          </WriteButton>
        ) : null}
        {can("close") ? (
          <WriteButton variant="outline" className="h-12 px-5 text-base" onClick={() => openWith("close")} data-testid="po-action-close">
            <Lock /> Clôturer
          </WriteButton>
        ) : null}
        {can("cancel") ? (
          <WriteButton variant="ghost" className="h-12 px-5 text-base text-red-700" onClick={() => openWith("cancel")} data-testid="po-action-cancel">
            <Ban /> Annuler le bon
          </WriteButton>
        ) : null}
        {can("pdf") ? (
          <a
            href={`/api/purchase-orders/${id}/pdf`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-12 items-center gap-2 rounded-lg border bg-background px-5 text-base font-medium hover:bg-muted"
            data-testid="po-action-pdf"
          >
            <Download className="size-4" /> {preview ? "Aperçu PDF (non validé)" : "Télécharger le PDF"}
          </a>
        ) : null}
      </div>

      {can("comment") ? (
        <div className="space-y-2 rounded-lg border bg-card p-4" data-testid="po-comment-box">
          <FormField id="po-comment" label="Ajouter un commentaire" error={commentError ?? undefined} hint="Visible dans la chronologie par toutes les personnes qui ont accès au bon de commande.">
            <TextArea
              id="po-comment"
              className="min-h-20"
              value={comment}
              maxLength={1000}
              onChange={(e) => {
                setComment(e.target.value);
                setCommentError(null);
              }}
              data-testid="po-comment"
            />
          </FormField>
          <div className="flex justify-end">
            <WriteButton
              variant="outline"
              className="h-11 px-4"
              disabled={pending}
              onClick={async () => {
                if (comment.trim() === "") return setCommentError("Saisissez un commentaire.");
                await run(() => addOrderCommentAction({ id, comment }), { success: "Commentaire ajouté.", onSuccess: () => setComment("") });
              }}
              data-testid="po-comment-send"
            >
              <MessageSquare /> Commenter
            </WriteButton>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={dialog === "submit"}
        onOpenChange={(o) => (!o ? close() : undefined)}
        title={`Soumettre ${displayNumber} ?`}
        description="Le bon part chez le Responsable Achats pour validation. Il ne sera plus modifiable sauf s'il vous est renvoyé pour correction."
        confirmLabel="Soumettre le bon"
        pending={pending}
        testId="po-submit-dialog"
        onConfirm={async () => {
          await run(() => submitOrderAction({ id, expectedUpdatedAt: updatedAt }), {
            success: (d) => (d.status === "VALIDE" ? `${d.displayNumber} validé automatiquement (montant sous le seuil).` : "Bon de commande soumis au Responsable Achats."),
            onSuccess: close,
            onError: close,
          });
        }}
      />

      <Dialog open={dialog === "approve"} onOpenChange={(o) => (!o ? close() : undefined)}>
        <DialogContent className="sm:max-w-lg" data-testid="po-approve-dialog">
          <DialogHeader>
            <DialogTitle>Valider {displayNumber} ?</DialogTitle>
            <DialogDescription>
              {amendment
                ? "L'avenant garde le même numéro. Une fois validé, il devra être renvoyé au fournisseur."
                : "Le numéro de bon de commande est attribué à la validation, et le taux de change est figé."}{" "}
              {selfApprove ? "Vous avez créé ce bon : il sera marqué « auto-validé »." : ""}
            </DialogDescription>
          </DialogHeader>
          {alertCount > 0 ? (
            <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950" data-testid="po-approve-alerts">
              {alertCount === 1 ? "1 point d'attention est signalé" : `${alertCount} points d'attention sont signalés`} sur ce bon (voir la fiche). Vérifiez-les avant de valider.
            </p>
          ) : null}
          <FormField id="po-approve-comment" label="Commentaire (facultatif)">
            <TextArea id="po-approve-comment" className="min-h-20" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} data-testid="po-approve-comment" />
          </FormField>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" className="h-12 px-4" onClick={close} data-testid="po-approve-cancel">
              Retour
            </Button>
            <WriteButton
              className="h-12 bg-emerald-700 px-5 text-base text-white hover:bg-emerald-800"
              disabled={pending}
              onClick={() =>
                void run(() => approveOrderAction({ id, expectedUpdatedAt: updatedAt, comment: note.trim() || null }), {
                  success: (d) => `${d.displayNumber} validé.`,
                  onSuccess: close,
                  onError: close,
                })
              }
              data-testid="po-approve-confirm"
            >
              {pending ? "Validation…" : "Valider le bon de commande"}
            </WriteButton>
          </div>
        </DialogContent>
      </Dialog>

      <ReasonDialog
        open={dialog === "reject"}
        onOpenChange={(o) => (!o ? close() : undefined)}
        title={`Refuser ${displayNumber} ?`}
        description="Le refus est définitif : le bon ne pourra plus être modifié. L'acheteur verra le motif."
        label="Motif du refus"
        confirmLabel="Refuser le bon"
        destructive
        pending={pending}
        testId="po-reject-dialog"
        onConfirm={(reason) => void run(() => rejectOrderAction({ id, expectedUpdatedAt: updatedAt, reason }), { success: `${displayNumber} refusé.`, onSuccess: close })}
      />
      <ReasonDialog
        open={dialog === "return"}
        onOpenChange={(o) => (!o ? close() : undefined)}
        title={`Renvoyer ${displayNumber} pour correction ?`}
        description="Le bon retourne en brouillon chez son créateur, qui le corrige puis le soumet à nouveau."
        label="Ce qu'il faut corriger"
        max={1000}
        confirmLabel="Renvoyer pour correction"
        pending={pending}
        testId="po-return-dialog"
        onConfirm={(c) => void run(() => returnOrderAction({ id, expectedUpdatedAt: updatedAt, comment: c }), { success: `${displayNumber} renvoyé pour correction.`, onSuccess: close })}
      />
      <ReasonDialog
        open={dialog === "cancel"}
        onOpenChange={(o) => (!o ? close() : undefined)}
        title={`Annuler ${displayNumber} ?`}
        description={
          status === "BROUILLON" || status === "A_VALIDER"
            ? "L'annulation est définitive. Les quantités réservées sur les demandes d'achat sont libérées."
            : "L'annulation est définitive. Les demandes d'achat liées sont rouvertes et l'acheteur est prévenu : pensez à prévenir le fournisseur."
        }
        label="Motif d'annulation"
        confirmLabel="Annuler le bon"
        destructive
        pending={pending}
        testId="po-cancel-dialog"
        onConfirm={(reason) => void run(() => cancelOrderAction({ id, expectedUpdatedAt: updatedAt, reason }), { success: `${displayNumber} annulé.`, onSuccess: close })}
      />
      <ReasonDialog
        open={dialog === "amend"}
        onOpenChange={(o) => (!o ? close() : undefined)}
        title={`Créer un avenant à ${displayNumber} ?`}
        description="Le bon repasse en brouillon (version suivante, même numéro) puis devra être revalidé. L'historique et le PDF de la version actuelle sont conservés."
        label="Motif de l'avenant"
        confirmLabel="Créer l'avenant"
        pending={pending}
        testId="po-amend-dialog"
        onConfirm={(reason) =>
          void run(() => startAmendmentAction({ id, expectedUpdatedAt: updatedAt, reason }), {
            success: "Avenant créé : modifiez le bon puis soumettez-le.",
            onSuccess: () => {
              close();
              router.push(`/achats/commandes/${id}/modifier`);
            },
          })
        }
      />
      <ConfirmDialog
        open={dialog === "abandon"}
        onOpenChange={(o) => (!o ? close() : undefined)}
        title="Abandonner l'avenant ?"
        description="Les modifications de l'avenant sont perdues : le bon retrouve exactement sa version précédente validée."
        confirmLabel="Abandonner l'avenant"
        destructive
        pending={pending}
        testId="po-abandon-dialog"
        onConfirm={async () => {
          await run(() => abandonAmendmentAction({ id, expectedUpdatedAt: updatedAt, reason: null }), {
            success: "Avenant abandonné : version précédente restaurée.",
            onSuccess: close,
            onError: close,
          });
        }}
      />
      <ConfirmDialog
        open={dialog === "close"}
        onOpenChange={(o) => (!o ? close() : undefined)}
        title={`Clôturer ${displayNumber} ?`}
        description="Le bon est entièrement reçu. Une fois clôturé, il ne peut plus être modifié."
        confirmLabel="Clôturer le bon"
        pending={pending}
        testId="po-close-dialog"
        onConfirm={async () => {
          await run(() => closeOrderAction({ id, expectedUpdatedAt: updatedAt, comment: null }), {
            success: `${displayNumber} clôturé.`,
            onSuccess: close,
            onError: close,
          });
        }}
      />

      <SendDialog open={dialog === "send"} onOpenChange={(o) => (!o ? close() : undefined)} orderId={id} updatedAt={updatedAt} displayNumber={displayNumber} today={today} />
      <PromiseDialog
        mode="confirm"
        open={dialog === "confirm"}
        onOpenChange={(o) => (!o ? close() : undefined)}
        orderId={id}
        updatedAt={updatedAt}
        displayNumber={displayNumber}
        currentPromised={null}
        minDate={orderDay}
      />
      <PromiseDialog
        mode="change"
        open={dialog === "promise"}
        onOpenChange={(o) => (!o ? close() : undefined)}
        orderId={id}
        updatedAt={updatedAt}
        displayNumber={displayNumber}
        currentPromised={promisedDay}
        minDate={orderDay}
      />
      <ReminderDialog open={dialog === "remind"} onOpenChange={(o) => (!o ? close() : undefined)} orderId={id} updatedAt={updatedAt} displayNumber={displayNumber} />
    </div>
  );
}

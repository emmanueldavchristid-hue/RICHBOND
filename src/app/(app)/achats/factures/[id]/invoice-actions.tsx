"use client";

import { useState } from "react";
import { Ban, CheckCircle2, RefreshCw, Scale, Send, Undo2 } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { WriteButton } from "@/components/license/write-button";
import { ReasonDialog } from "@/components/purchase-requests/reason-dialog";
import { useActionRunner } from "@/components/use-action-runner";
import { REASON_MIN, type InvoiceStatusCode } from "@/modules/invoices/labels";
import { approvePaymentAction, cancelInvoiceAction, markLitigeAction, rematchInvoiceAction, resolveLitigeAction, transmitInvoiceAction } from "../actions";

type Dlg = null | "approve" | "approve-gap" | "transmit" | "litige" | "resolve" | "cancel";

const BTN = "h-12 px-5 text-base";

/** Boutons selon le statut et les droits. Le serveur revérifie tout : ces boutons ne sont qu'un confort. */
export function InvoiceActions({
  id,
  number,
  status,
  canManage,
  canApprove,
}: {
  id: string;
  number: string;
  status: InvoiceStatusCode;
  canManage: boolean;
  canApprove: boolean;
}) {
  const { run, pending } = useActionRunner();
  const [dialog, setDialog] = useState<Dlg>(null);
  const [error, setError] = useState<string | null>(null);
  const close = () => {
    setDialog(null);
    setError(null);
  };
  const fail = (f: { message: string }) => setError(f.message);

  const canRematch = canManage && ["SAISIE", "CONFORME", "ECART"].includes(status);
  const canPay = canApprove && (status === "CONFORME" || status === "ECART");
  const canTransmit = canManage && status === "BON_A_PAYER";
  const canLitige = canManage && ["SAISIE", "CONFORME", "ECART", "BON_A_PAYER"].includes(status);
  const canResolve = canManage && status === "LITIGE";
  const canCancel = canManage && status !== "TRANSMISE" && status !== "ANNULEE";

  if (!(canRematch || canPay || canTransmit || canLitige || canResolve || canCancel)) return null;

  return (
    <>
      <div className="flex flex-wrap items-center gap-3" data-testid="inv-actions">
        {canPay ? (
          <WriteButton
            className={`${BTN} bg-emerald-700 text-white hover:bg-emerald-800`}
            disabled={pending}
            onClick={() => setDialog(status === "ECART" ? "approve-gap" : "approve")}
            data-testid="inv-action-approve"
          >
            <CheckCircle2 /> Bon à payer
          </WriteButton>
        ) : null}
        {canTransmit ? (
          <WriteButton className={BTN} disabled={pending} onClick={() => setDialog("transmit")} data-testid="inv-action-transmit">
            <Send /> Transmettre à la comptabilité
          </WriteButton>
        ) : null}
        {canResolve ? (
          <WriteButton className={BTN} disabled={pending} onClick={() => setDialog("resolve")} data-testid="inv-action-resolve">
            <Scale /> Résoudre le litige
          </WriteButton>
        ) : null}
        {canRematch ? (
          <WriteButton
            variant="outline"
            className={BTN}
            disabled={pending}
            onClick={() => void run(() => rematchInvoiceAction({ id }), { success: "Rapprochement refait." })}
            data-testid="inv-action-rematch"
          >
            <RefreshCw /> Refaire le rapprochement
          </WriteButton>
        ) : null}
        {canLitige ? (
          <WriteButton variant="outline" className={`${BTN} text-amber-800`} onClick={() => setDialog("litige")} data-testid="inv-action-litige">
            <Undo2 /> Mettre en litige
          </WriteButton>
        ) : null}
        {canCancel ? (
          <WriteButton variant="ghost" className={`${BTN} text-red-700`} onClick={() => setDialog("cancel")} data-testid="inv-action-cancel">
            <Ban /> Annuler la facture
          </WriteButton>
        ) : null}
      </div>

      <ConfirmDialog
        open={dialog === "approve"}
        onOpenChange={(o) => !o && close()}
        title={`Mettre la facture ${number} en bon à payer ?`}
        description="La facture est conforme au bon de commande et à la réception. Le bon à payer est tracé à votre nom."
        confirmLabel="Donner le bon à payer"
        pending={pending}
        testId="inv-approve-dialog"
        onConfirm={async () => {
          await run(() => approvePaymentAction({ id, derogationReason: null }), { success: "Bon à payer donné.", onSuccess: close, onError: fail });
        }}
      />
      <ReasonDialog
        open={dialog === "approve-gap"}
        onOpenChange={(o) => !o && close()}
        title={`Bon à payer avec écart : ${number}`}
        description="Cette facture présente des écarts avec le bon de commande ou la réception. Pour la payer quand même, indiquez le motif de la dérogation : il sera conservé dans le journal."
        label="Motif de la dérogation"
        min={REASON_MIN}
        max={300}
        confirmLabel="Donner le bon à payer malgré l'écart"
        pending={pending}
        error={error}
        testId="inv-derogation-dialog"
        onConfirm={(reason) => void run(() => approvePaymentAction({ id, derogationReason: reason }), { success: "Bon à payer donné avec dérogation.", onSuccess: close, onError: fail })}
      />
      <ConfirmDialog
        open={dialog === "transmit"}
        onOpenChange={(o) => !o && close()}
        title={`Transmettre ${number} à la comptabilité ?`}
        description="Après transmission, la facture ne peut plus être modifiée ni annulée."
        confirmLabel="Transmettre"
        pending={pending}
        testId="inv-transmit-dialog"
        onConfirm={async () => {
          await run(() => transmitInvoiceAction({ id }), { success: "Facture transmise à la comptabilité.", onSuccess: close, onError: fail });
        }}
      />
      <ConfirmDialog
        open={dialog === "resolve"}
        onOpenChange={(o) => !o && close()}
        title="Résoudre le litige ?"
        description="Le litige est levé et le rapprochement est refait avec les quantités et prix actuels."
        confirmLabel="Résoudre le litige"
        pending={pending}
        testId="inv-resolve-dialog"
        onConfirm={async () => {
          await run(() => resolveLitigeAction({ id }), { success: "Litige résolu, rapprochement refait.", onSuccess: close, onError: fail });
        }}
      />
      <ReasonDialog
        open={dialog === "litige"}
        onOpenChange={(o) => !o && close()}
        title={`Mettre ${number} en litige`}
        description="La facture est bloquée tant que le désaccord avec le fournisseur n'est pas réglé."
        label="Motif du litige"
        min={REASON_MIN}
        max={300}
        confirmLabel="Mettre en litige"
        pending={pending}
        error={error}
        testId="inv-litige-dialog"
        onConfirm={(reason) => void run(() => markLitigeAction({ id, reason }), { success: "Facture mise en litige.", onSuccess: close, onError: fail })}
      />
      <ReasonDialog
        open={dialog === "cancel"}
        onOpenChange={(o) => !o && close()}
        title={`Annuler la facture ${number} ?`}
        description="Les quantités facturées sont libérées : elles pourront être facturées de nouveau. Cette action est définitive."
        label="Motif de l'annulation"
        min={REASON_MIN}
        max={300}
        confirmLabel="Annuler la facture"
        destructive
        pending={pending}
        error={error}
        testId="inv-cancel-dialog"
        onConfirm={(reason) => void run(() => cancelInvoiceAction({ id, reason }), { success: "Facture annulée.", onSuccess: close, onError: fail })}
      />
    </>
  );
}

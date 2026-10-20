"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, CheckCircle2, CornerUpLeft, FilePlus2, MessageSquare, Pencil, Send, UserCog, XCircle } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FormError, FormField, TextArea } from "@/components/form-field";
import { WriteButton } from "@/components/license/write-button";
import { NativeSelect } from "@/components/native-select";
import { ReasonDialog } from "@/components/purchase-requests/reason-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { unitShort } from "@/components/unit-select";
import { useActionRunner } from "@/components/use-action-runner";
import { formatQty } from "@/lib/money";
import { PR_TYPE_LABELS, type PrType } from "@/modules/purchase-requests/labels";
import type { PrAction } from "@/modules/purchase-requests/workflow";
import {
  addCommentAction,
  approveRequestAction,
  assignBuyerAction,
  cancelRequestAction,
  rejectRequestAction,
  returnRequestAction,
  submitRequestAction,
} from "../actions";

export interface BuyerChoice {
  proposedId: string | null;
  buyers: { id: string; name: string; openCount: number }[];
}

export interface ActionLine {
  id: string;
  lineNo: number;
  code: string;
  name: string;
  quantity: string;
  unit: string;
  approvedQty: string | null;
}

const toNumber = (s: string) => Number(s.trim().replace(",", "."));

/** Boutons de la fiche : n'apparaissent que si le serveur les autorise (`availableActions`). */
export function RequestActions({
  id,
  updatedAt,
  displayNumber,
  actions,
  type,
  isStop,
  lines,
  buyers,
  assignedBuyerId,
  selfApprove,
  exceedsThreshold,
}: {
  id: string;
  updatedAt: string;
  displayNumber: string;
  actions: PrAction[];
  type: PrType;
  isStop: boolean;
  lines: ActionLine[];
  buyers: Record<"LOCAL" | "IMPORT", BuyerChoice>;
  assignedBuyerId: string | null;
  /** Le Responsable valide sa propre DA : la chronologie le mentionnera. */
  selfApprove: boolean;
  exceedsThreshold: boolean;
}) {
  const router = useRouter();
  const { run, pending } = useActionRunner();
  const [dialog, setDialog] = useState<null | "submit" | "approve" | "reject" | "return" | "cancel" | "assign">(null);
  const can = (a: PrAction) => actions.includes(a);
  const close = () => setDialog(null);

  // --- validation
  const [approved, setApproved] = useState<Record<string, string>>({});
  const [chosenType, setChosenType] = useState<"LOCAL" | "IMPORT" | "">("");
  const [buyerId, setBuyerId] = useState("");
  const [approveError, setApproveError] = useState<string | null>(null);

  const effectiveType = type === "A_DEFINIR" ? chosenType : type;
  const buyerChoice = effectiveType ? buyers[effectiveType] : null;

  function openApprove() {
    setApproved(Object.fromEntries(lines.map((l) => [l.id, formatQty(l.quantity).replace(/\s/g, "")])));
    setChosenType("");
    setBuyerId("");
    setApproveError(null);
    setDialog("approve");
  }

  const qtyErrors = useMemo(() => {
    const out: Record<string, string> = {};
    for (const l of lines) {
      const raw = approved[l.id] ?? "";
      const n = toNumber(raw);
      if (raw.trim() === "" || !Number.isFinite(n) || n < 0) out[l.id] = "Quantité invalide.";
      else if (Math.abs(n * 1000 - Math.round(n * 1000)) > 1e-6) out[l.id] = "3 décimales maximum.";
      else if (n > Number(l.quantity)) out[l.id] = `Maximum ${formatQty(l.quantity)} (quantité demandée).`;
    }
    return out;
  }, [approved, lines]);
  const allZero = lines.every((l) => toNumber(approved[l.id] ?? "") === 0);

  async function approve() {
    if (Object.keys(qtyErrors).length > 0) return setApproveError("Corrigez les quantités signalées en rouge.");
    if (allZero) return setApproveError("Au moins une ligne doit rester à une quantité supérieure à 0. Refusez la demande sinon.");
    if (type === "A_DEFINIR" && !chosenType) return setApproveError("Choisissez Local ou Import avant de valider.");
    setApproveError(null);
    const changed = lines.filter((l) => toNumber(approved[l.id]) !== Number(l.quantity));
    await run(
      () =>
        approveRequestAction({
          id,
          expectedUpdatedAt: updatedAt,
          type: type === "A_DEFINIR" ? chosenType : null,
          buyerId: buyerId || null,
          lines: changed.map((l) => ({ lineId: l.id, approvedQty: toNumber(approved[l.id]) })),
        }),
      {
        success: (d) =>
          d.unassigned
            ? `${displayNumber} validée. Aucun acheteur compatible : assignez-la manuellement.`
            : `${displayNumber} validée et assignée à ${d.assignedBuyer?.name ?? "l'acheteur"}.`,
        onSuccess: close,
      },
    );
  }

  // --- assignation
  const [assignTo, setAssignTo] = useState("");
  const assignChoice = type === "LOCAL" || type === "IMPORT" ? buyers[type] : null;

  // --- commentaire
  const [comment, setComment] = useState("");
  const [commentError, setCommentError] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3" data-testid="pr-actions">
        {can("submit") ? (
          <WriteButton className="h-12 px-5 text-base" disabled={pending} onClick={() => setDialog("submit")} data-testid="pr-action-submit">
            <Send /> Soumettre
          </WriteButton>
        ) : null}
        {can("edit") ? (
          <WriteButton variant="outline" className="h-12 px-5 text-base" onClick={() => router.push(`/achats/demandes/${id}/modifier`)} data-testid="pr-action-edit">
            <Pencil /> Modifier
          </WriteButton>
        ) : null}
        {can("approve") ? (
          <WriteButton className="h-12 bg-emerald-700 px-5 text-base text-white hover:bg-emerald-800" disabled={pending} onClick={openApprove} data-testid="pr-action-approve">
            <CheckCircle2 /> Valider
          </WriteButton>
        ) : null}
        {can("return") ? (
          <WriteButton variant="outline" className="h-12 px-5 text-base" onClick={() => setDialog("return")} data-testid="pr-action-return">
            <CornerUpLeft /> Renvoyer à compléter
          </WriteButton>
        ) : null}
        {can("reject") ? (
          <WriteButton variant="outline" className="h-12 px-5 text-base text-red-700" onClick={() => setDialog("reject")} data-testid="pr-action-reject">
            <XCircle /> Refuser
          </WriteButton>
        ) : null}
        {can("assign") ? (
          <WriteButton
            variant="outline"
            className="h-12 px-5 text-base"
            onClick={() => {
              setAssignTo(assignedBuyerId ?? "");
              setDialog("assign");
            }}
            data-testid="pr-action-assign"
          >
            <UserCog /> Changer l&apos;acheteur
          </WriteButton>
        ) : null}
        {can("createOrder") ? (
          <WriteButton className="h-12 px-5 text-base" onClick={() => router.push(`/achats/commandes/nouvelle?da=${id}`)} data-testid="pr-action-create-order">
            <FilePlus2 /> Créer le BC
          </WriteButton>
        ) : null}
        {can("cancel") ? (
          <WriteButton variant="ghost" className="h-12 px-5 text-base text-red-700" onClick={() => setDialog("cancel")} data-testid="pr-action-cancel">
            <Ban /> Annuler la demande
          </WriteButton>
        ) : null}
      </div>

      {can("comment") ? (
        <div className="space-y-2 rounded-lg border bg-card p-4" data-testid="pr-comment-box">
          <FormField id="pr-comment" label="Ajouter un commentaire" error={commentError ?? undefined} hint="Visible dans la chronologie par toutes les personnes qui ont accès à la demande.">
            <TextArea
              id="pr-comment"
              className="min-h-20"
              value={comment}
              maxLength={1000}
              onChange={(e) => {
                setComment(e.target.value);
                setCommentError(null);
              }}
              data-testid="pr-comment"
            />
          </FormField>
          <div className="flex justify-end">
            <WriteButton
              variant="outline"
              className="h-11 px-4"
              disabled={pending}
              onClick={async () => {
                if (comment.trim() === "") return setCommentError("Saisissez un commentaire.");
                await run(() => addCommentAction({ id, comment }), { success: "Commentaire ajouté.", onSuccess: () => setComment("") });
              }}
              data-testid="pr-comment-send"
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
        description={
          isStop
            ? "Le Responsable Achats sera alerté immédiatement (arrêt de production). La demande ne sera plus modifiable sauf si elle vous est renvoyée à compléter."
            : "La demande part chez le Responsable Achats. Elle ne sera plus modifiable sauf si elle vous est renvoyée à compléter."
        }
        confirmLabel="Soumettre la demande"
        pending={pending}
        testId="pr-submit-dialog"
        onConfirm={async () => {
          await run(() => submitRequestAction({ id, expectedUpdatedAt: updatedAt }), {
            success: (d) => `Demande ${d.displayNumber} soumise au Responsable Achats.`,
            onSuccess: close,
            onError: close,
          });
        }}
      />

      <ReasonDialog
        open={dialog === "reject"}
        onOpenChange={(o) => (!o ? close() : undefined)}
        title={`Refuser ${displayNumber} ?`}
        description="Le refus est définitif : la demande ne pourra plus être modifiée. Le demandeur verra le motif."
        label="Motif du refus"
        confirmLabel="Refuser la demande"
        destructive
        pending={pending}
        testId="pr-reject-dialog"
        onConfirm={(reason) =>
          void run(() => rejectRequestAction({ id, expectedUpdatedAt: updatedAt, reason }), { success: `${displayNumber} refusée.`, onSuccess: close })
        }
      />
      <ReasonDialog
        open={dialog === "return"}
        onOpenChange={(o) => (!o ? close() : undefined)}
        title={`Renvoyer ${displayNumber} pour complément ?`}
        description="La demande retourne au demandeur, qui la corrige puis la soumet à nouveau (même numéro)."
        label="Ce qu'il faut compléter"
        max={1000}
        confirmLabel="Renvoyer à compléter"
        pending={pending}
        testId="pr-return-dialog"
        onConfirm={(comment) =>
          void run(() => returnRequestAction({ id, expectedUpdatedAt: updatedAt, comment }), { success: `${displayNumber} renvoyée au demandeur.`, onSuccess: close })
        }
      />
      <ReasonDialog
        open={dialog === "cancel"}
        onOpenChange={(o) => (!o ? close() : undefined)}
        title={`Annuler ${displayNumber} ?`}
        description="L'annulation est définitive. La demande reste consultable avec son motif."
        label="Motif d'annulation"
        confirmLabel="Annuler la demande"
        destructive
        pending={pending}
        testId="pr-cancel-dialog"
        onConfirm={(reason) =>
          void run(() => cancelRequestAction({ id, expectedUpdatedAt: updatedAt, reason }), { success: `${displayNumber} annulée.`, onSuccess: close })
        }
      />

      <Dialog open={dialog === "assign"} onOpenChange={(o) => (!o ? close() : undefined)}>
        <DialogContent className="sm:max-w-lg" data-testid="pr-assign-dialog">
          <DialogHeader>
            <DialogTitle>Changer l&apos;acheteur de {displayNumber}</DialogTitle>
            <DialogDescription>Seuls les acheteurs habilités pour ce type d&apos;achat ({PR_TYPE_LABELS[type]}) sont proposés.</DialogDescription>
          </DialogHeader>
          <FormField id="pr-assign-buyer" label="Acheteur" required>
            <NativeSelect id="pr-assign-buyer" value={assignTo} onChange={(e) => setAssignTo(e.target.value)} data-testid="pr-assign-buyer">
              <option value="">Choisir un acheteur…</option>
              {(assignChoice?.buyers ?? []).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.openCount} DA en cours)
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" className="h-11 px-4" onClick={close}>
              Retour
            </Button>
            <WriteButton
              className="h-11 px-4"
              disabled={pending || !assignTo || assignTo === assignedBuyerId}
              onClick={() =>
                void run(() => assignBuyerAction({ id, expectedUpdatedAt: updatedAt, buyerId: assignTo }), {
                  success: "Acheteur modifié.",
                  onSuccess: close,
                })
              }
              data-testid="pr-assign-confirm"
            >
              Assigner
            </WriteButton>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "approve"} onOpenChange={(o) => (!o ? close() : undefined)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl" data-testid="pr-approve-dialog">
          <DialogHeader>
            <DialogTitle>Valider {displayNumber}</DialogTitle>
            <DialogDescription>
              Vous pouvez réduire une quantité (0 = ligne retirée). Chaque modification est tracée dans la chronologie.
              {selfApprove ? " Vous avez créé cette demande : elle sera marquée « auto-validée »." : ""}
            </DialogDescription>
          </DialogHeader>
          <FormError message={approveError} testId="pr-approve-error" />
          {exceedsThreshold ? (
            <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950" data-testid="pr-approve-threshold">
              Au-delà du seuil : validation direction prévue (information, rien ne bloque aujourd&apos;hui).
            </p>
          ) : null}
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm" data-testid="pr-approve-lines">
              <thead className="text-left text-xs font-medium text-muted-foreground border-b">
                <tr>
                  <th className="p-2">Article</th>
                  <th className="p-2 text-right">Demandé</th>
                  <th className="p-2">Quantité validée</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.id} className="border-t" data-testid={`pr-approve-line-${l.lineNo}`}>
                    <td className="p-2">
                      {l.code ? <span className="font-mono text-xs text-muted-foreground">{l.code} </span> : null}
                      {l.name}
                    </td>
                    <td className="p-2 text-right whitespace-nowrap tabular-nums">
                      {formatQty(l.quantity)} {unitShort(l.unit)}
                    </td>
                    <td className="p-2">
                      <Input
                        inputMode="decimal"
                        className="h-12 w-32 text-right text-base"
                        aria-label={`Quantité validée, ligne ${l.lineNo}`}
                        value={approved[l.id] ?? ""}
                        onChange={(e) => setApproved((p) => ({ ...p, [l.id]: e.target.value.replace(/[^\d.,]/g, "") }))}
                        aria-invalid={!!qtyErrors[l.id]}
                        data-testid={`pr-approve-qty-${l.lineNo}`}
                      />
                      {qtyErrors[l.id] ? (
                        <p role="alert" className="mt-1 text-xs text-red-700">
                          {qtyErrors[l.id]}
                        </p>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {type === "A_DEFINIR" ? (
              <FormField id="pr-approve-type" label="Type d'achat" required hint="Cette demande est « À définir » : choisissez le circuit.">
                <NativeSelect
                  id="pr-approve-type"
                  value={chosenType}
                  onChange={(e) => {
                    setChosenType(e.target.value as "LOCAL" | "IMPORT" | "");
                    setBuyerId("");
                  }}
                  data-testid="pr-approve-type"
                >
                  <option value="">Choisir…</option>
                  <option value="LOCAL">{PR_TYPE_LABELS.LOCAL}</option>
                  <option value="IMPORT">{PR_TYPE_LABELS.IMPORT}</option>
                </NativeSelect>
              </FormField>
            ) : null}
            <FormField id="pr-approve-buyer" label="Acheteur" hint="Par défaut : l'acheteur du périmètre qui a le moins de DA en cours.">
              <NativeSelect id="pr-approve-buyer" value={buyerId} onChange={(e) => setBuyerId(e.target.value)} disabled={!buyerChoice} data-testid="pr-approve-buyer">
                <option value="">
                  {!buyerChoice
                    ? "Choisissez d'abord le type"
                    : buyerChoice.proposedId
                      ? `Automatique (${buyerChoice.buyers.find((b) => b.id === buyerChoice.proposedId)?.name ?? "le moins chargé"})`
                      : "Aucun acheteur compatible"}
                </option>
                {(buyerChoice?.buyers ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.openCount} DA en cours)
                  </option>
                ))}
              </NativeSelect>
            </FormField>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" className="h-12 px-4" onClick={close} data-testid="pr-approve-cancel">
              Retour
            </Button>
            <WriteButton className="h-12 bg-emerald-700 px-5 text-base text-white hover:bg-emerald-800" disabled={pending} onClick={() => void approve()} data-testid="pr-approve-confirm">
              {pending ? "Validation…" : "Valider la demande"}
            </WriteButton>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

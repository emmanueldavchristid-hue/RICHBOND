"use client";

import { useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { WriteButton } from "@/components/license/write-button";
import { useActionRunner } from "@/components/use-action-runner";
import { removeItemPhotoAction, setItemStatusAction, setItemPhotoAction } from "../actions";

type ItemStatusCode = "ACTIF" | "BLOQUE" | "OBSOLETE";

const PHOTO_MAX_BYTES = 2 * 1024 * 1024;

const STATUS_ACTIONS: Record<ItemStatusCode, { to: ItemStatusCode; label: string; confirm: string; destructive: boolean; success: string }[]> = {
  ACTIF: [
    {
      to: "BLOQUE",
      label: "Bloquer",
      confirm: "L'article ne sera plus proposé dans les demandes d'achat ni les commandes tant qu'il est bloqué. Vous pourrez le réactiver.",
      destructive: true,
      success: "Article bloqué.",
    },
    {
      to: "OBSOLETE",
      label: "Marquer obsolète",
      confirm: "L'article ne sera plus proposé dans les demandes d'achat ni les commandes. Son historique est conservé.",
      destructive: true,
      success: "Article marqué obsolète.",
    },
  ],
  BLOQUE: [
    { to: "ACTIF", label: "Réactiver", confirm: "L'article redeviendra disponible pour les demandes d'achat et les commandes.", destructive: false, success: "Article réactivé." },
    {
      to: "OBSOLETE",
      label: "Marquer obsolète",
      confirm: "L'article sera définitivement retiré des propositions. Son historique est conservé.",
      destructive: true,
      success: "Article marqué obsolète.",
    },
  ],
  OBSOLETE: [
    { to: "ACTIF", label: "Réactiver", confirm: "L'article redeviendra disponible pour les demandes d'achat et les commandes.", destructive: false, success: "Article réactivé." },
  ],
};

/** Désactivation / réactivation d'un article (jamais de suppression), avec confirmation. */
export function ItemStatusActions({ id, updatedAt, status, itemLabel }: { id: string; updatedAt: string; status: ItemStatusCode; itemLabel: string }) {
  const { run, pending } = useActionRunner();
  const [target, setTarget] = useState<(typeof STATUS_ACTIONS)[ItemStatusCode][number] | null>(null);

  return (
    <>
      <div className="flex flex-wrap gap-2" data-testid="item-status-actions">
        {STATUS_ACTIONS[status].map((a) => (
          <WriteButton
            key={a.to}
            type="button"
            variant="outline"
            className="h-11 px-4"
            onClick={() => setTarget(a)}
            data-testid={`item-status-${a.to}`}
          >
            {a.label}
          </WriteButton>
        ))}
      </div>
      <ConfirmDialog
        open={target !== null}
        onOpenChange={(o) => (!o ? setTarget(null) : undefined)}
        title={target ? `${target.label} : ${itemLabel} ?` : ""}
        description={target?.confirm}
        confirmLabel={target?.label}
        destructive={target?.destructive}
        pending={pending}
        testId="item-status-confirm"
        onConfirm={async () => {
          if (!target) return;
          await run(() => setItemStatusAction({ id, status: target.to, expectedUpdatedAt: updatedAt }), {
            success: target.success,
            onSuccess: () => setTarget(null),
            onError: () => setTarget(null),
          });
        }}
      />
    </>
  );
}

/** Photo facultative : JPEG, PNG ou WebP, 2 Mo maximum. */
export function ItemPhoto({ id, updatedAt, hasPhoto, canEdit }: { id: string; updatedAt: string; hasPhoto: boolean; canEdit: boolean }) {
  const { run, pending } = useActionRunner();
  const input = useRef<HTMLInputElement>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  async function onPick(file: File | undefined) {
    if (!file) return;
    if (file.size > PHOTO_MAX_BYTES) {
      toast.error("La photo dépasse 2 Mo : réduisez-la avant de l'envoyer.");
      if (input.current) input.current.value = "";
      return;
    }
    const body = new FormData();
    body.set("id", id);
    body.set("expectedUpdatedAt", updatedAt);
    body.set("file", file);
    await run(() => setItemPhotoAction(body), { success: "Photo enregistrée." });
    if (input.current) input.current.value = "";
  }

  return (
    <div className="space-y-3" data-testid="item-photo">
      <div className="flex aspect-square w-full max-w-60 items-center justify-center overflow-hidden rounded-lg border bg-muted/40">
        {hasPhoto ? (
          // Photo privée servie par une route protégée : pas d'optimisation d'image.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/items/${id}/photo?v=${encodeURIComponent(updatedAt)}`}
            alt="Photo de l'article"
            className="size-full object-contain"
            data-testid="item-photo-img"
          />
        ) : (
          <span className="px-4 text-center text-sm text-muted-foreground" data-testid="item-photo-empty">
            Aucune photo
          </span>
        )}
      </div>
      {canEdit ? (
        <div className="flex flex-wrap gap-2">
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            tabIndex={-1}
            aria-label="Choisir une photo"
            onChange={(e) => void onPick(e.target.files?.[0])}
            data-testid="item-photo-input"
          />
          <WriteButton type="button" variant="outline" className="h-11 px-4" disabled={pending} onClick={() => input.current?.click()} data-testid="item-photo-change">
            <ImagePlus /> {hasPhoto ? "Remplacer" : "Ajouter une photo"}
          </WriteButton>
          {hasPhoto ? (
            <WriteButton type="button" variant="destructive" className="h-11 px-4" disabled={pending} onClick={() => setConfirmRemove(true)} data-testid="item-photo-remove">
              <Trash2 /> Retirer
            </WriteButton>
          ) : null}
        </div>
      ) : null}
      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title="Retirer la photo ?"
        description="La photo sera supprimée de la fiche. Vous pourrez en ajouter une autre."
        confirmLabel="Retirer"
        destructive
        pending={pending}
        testId="item-photo-confirm"
        onConfirm={async () => {
          await run(() => removeItemPhotoAction({ id, expectedUpdatedAt: updatedAt }), {
            success: "Photo retirée.",
            onSuccess: () => setConfirmRemove(false),
            onError: () => setConfirmRemove(false),
          });
        }}
      />
    </div>
  );
}

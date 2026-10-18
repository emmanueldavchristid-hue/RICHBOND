"use client";

import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export interface TempPasswordInfo {
  name: string;
  email: string;
  temporaryPassword: string;
}

/** Le mot de passe temporaire n'est jamais stocké en clair : il n'est visible qu'ici, une seule fois. */
export function TempPasswordDialog({
  info,
  onClose,
}: {
  info: TempPasswordInfo | null;
  onClose: () => void;
}) {
  async function copy() {
    if (!info) return;
    try {
      await navigator.clipboard.writeText(info.temporaryPassword);
      toast.success("Mot de passe copié.");
    } catch {
      toast.error("Copie impossible : recopiez le mot de passe à la main.");
    }
  }
  return (
    <Dialog open={info !== null} onOpenChange={(o) => (!o ? onClose() : undefined)} disablePointerDismissal>
      <DialogContent className="sm:max-w-md" data-testid="temp-password-dialog" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Mot de passe temporaire</DialogTitle>
          <DialogDescription>
            Transmettez ce mot de passe à {info?.name} ({info?.email}). Il ne sera plus affiché : notez-le
            maintenant. L&apos;utilisateur devra le changer à sa première connexion.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <code
            data-testid="temp-password-value"
            className="flex-1 select-all rounded-lg border bg-muted px-3 py-3 text-center font-mono text-xl tracking-wider"
          >
            {info?.temporaryPassword}
          </code>
          <Button variant="outline" className="h-12 px-4" onClick={() => void copy()} data-testid="temp-password-copy">
            <Copy /> Copier
          </Button>
        </div>
        <Button className="h-11" onClick={onClose} data-testid="temp-password-close">
          J&apos;ai noté le mot de passe
        </Button>
      </DialogContent>
    </Dialog>
  );
}

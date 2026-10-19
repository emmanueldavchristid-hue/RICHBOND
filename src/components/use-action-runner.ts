"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/errors";
import { notifyError, type ActionFailure } from "@/lib/action-feedback";

interface RunOptions<T> {
  /** Message de succès (toast). */
  success?: string | ((data: T) => string);
  onSuccess?: (data: T) => void;
  onError?: (failure: ActionFailure) => void;
  /** Codes d'erreur gérés par l'appelant : aucun toast d'erreur n'est affiché. */
  silentCodes?: string[];
  /** Recharge les données de la page après un succès (défaut : oui). */
  refresh?: boolean;
}

/**
 * Exécute une server action avec retour visuel : toast de succès ou d'erreur,
 * rechargement des données, gestion de CONFLICT (recharger) et de la session expirée.
 */
export function useActionRunner() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const run = useCallback(
    async <T,>(fn: () => Promise<ActionResult<T>>, opts: RunOptions<T> = {}): Promise<ActionResult<T> | null> => {
      setPending(true);
      try {
        const res = await fn();
        if (res.ok) {
          if (opts.success) toast.success(typeof opts.success === "function" ? opts.success(res.data) : opts.success);
          opts.onSuccess?.(res.data);
          if (opts.refresh !== false) router.refresh();
        } else {
          if (!opts.silentCodes?.includes(res.code)) {
            notifyError(res, { reload: () => router.refresh(), login: () => router.push("/connexion") });
          }
          opts.onError?.(res);
        }
        return res;
      } catch {
        toast.error("La connexion au serveur a échoué. Vérifiez votre réseau puis réessayez.");
        return null;
      } finally {
        setPending(false);
      }
    },
    [router],
  );

  return { run, pending };
}

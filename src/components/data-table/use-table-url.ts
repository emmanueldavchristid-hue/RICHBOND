"use client";

import { useCallback, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * État d'une liste dans l'URL (?q=&statut=&tri=&ordre=&page=&taille=) : lien partageable,
 * retour arrière du navigateur fonctionnel. Tout changement de filtre ou de tri revient à la page 1.
 */
export function useTableUrl() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const get = useCallback((key: string) => searchParams.get(key) ?? "", [searchParams]);

  const setParams = useCallback(
    (patch: Record<string, string | undefined>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined || value === "") next.delete(key);
        else next.set(key, value);
      }
      if (!("page" in patch)) next.delete("page");
      const qs = next.toString();
      startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
    },
    [searchParams, pathname, router],
  );

  /** Filtres courants sans la pagination : sert à l'export Excel. */
  const filterQuery = useCallback(() => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("page");
    next.delete("taille");
    return next.toString();
  }, [searchParams]);

  return { get, setParams, filterQuery, isPending };
}

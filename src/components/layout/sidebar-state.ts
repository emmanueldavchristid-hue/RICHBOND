/** État replié / déployé du menu latéral, mémorisé sur le poste (useSyncExternalStore : aucun effet, aucune erreur d'hydratation). */
export type SidebarMode = "expanded" | "collapsed";

const KEY = "rb-sidebar";
const listeners = new Set<() => void>();

export function subscribeSidebar(cb: () => void): () => void {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

/** Sans choix mémorisé : replié sous 1280 px (tablette), déployé au-delà. */
export function getSidebarSnapshot(): SidebarMode {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "collapsed" || v === "expanded") return v;
  } catch {
    // stockage indisponible
  }
  return window.innerWidth < 1280 ? "collapsed" : "expanded";
}

export const getSidebarServerSnapshot = (): SidebarMode => "expanded";

export function setSidebarMode(mode: SidebarMode): void {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    // stockage indisponible : le choix vaut pour la session seulement
  }
  listeners.forEach((l) => l());
}

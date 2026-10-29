/**
 * Limitation des tentatives de connexion par e-mail + IP, et par IP seule (LOT-18).
 * Fonction pure sur un magasin en mémoire (processus unique : déploiement mono-serveur).
 * Le verrouillage par compte (authenticate.ts) reste en place ; ceci couvre aussi les e-mails inconnus.
 */
export const THROTTLE_WINDOW_MS = 15 * 60_000;
export const MAX_FAILURES_PER_EMAIL_IP = 10;
export const MAX_FAILURES_PER_IP = 30;

interface Bucket {
  failures: number[];
}

export interface Throttle {
  /** Date de fin de blocage si la clé est bloquée à `now`, sinon null. */
  blockedUntil(email: string, ip: string | null, now: Date): Date | null;
  /** Enregistre un échec ; retourne true si cet échec déclenche le blocage. */
  recordFailure(email: string, ip: string | null, now: Date): boolean;
  /** Réussite : efface le compteur e-mail + IP. */
  reset(email: string, ip: string | null): void;
  clear(): void;
}

function keys(email: string, ip: string | null) {
  const addr = ip ?? "inconnue";
  return { pair: `${addr}|${email.trim().toLowerCase()}`, ip: `${addr}` };
}

export function createThrottle(): Throttle {
  const pairs = new Map<string, Bucket>();
  const ips = new Map<string, Bucket>();

  function recent(b: Bucket | undefined, now: Date): number[] {
    if (!b) return [];
    const min = now.getTime() - THROTTLE_WINDOW_MS;
    b.failures = b.failures.filter((t) => t > min);
    return b.failures;
  }
  function until(list: number[], max: number): Date | null {
    if (list.length < max) return null;
    // Le blocage dure jusqu'à ce que la plus ancienne tentative comptée sorte de la fenêtre.
    const pivot = list[list.length - max];
    return new Date(pivot + THROTTLE_WINDOW_MS);
  }

  return {
    blockedUntil(email, ip, now) {
      const k = keys(email, ip);
      const a = until(recent(pairs.get(k.pair), now), MAX_FAILURES_PER_EMAIL_IP);
      const b = until(recent(ips.get(k.ip), now), MAX_FAILURES_PER_IP);
      if (a && b) return a > b ? a : b;
      return a ?? b;
    },
    recordFailure(email, ip, now) {
      const k = keys(email, ip);
      const before = this.blockedUntil(email, ip, now);
      for (const [map, key] of [[pairs, k.pair], [ips, k.ip]] as const) {
        const b = map.get(key) ?? { failures: [] };
        recent(b, now);
        b.failures.push(now.getTime());
        map.set(key, b);
      }
      if (pairs.size > 5000) this.clear();
      return !before && this.blockedUntil(email, ip, now) !== null;
    },
    reset(email, ip) {
      pairs.delete(keys(email, ip).pair);
    },
    clear() {
      pairs.clear();
      ips.clear();
    },
  };
}

/** Instance partagée du processus. */
export const loginThrottle = createThrottle();

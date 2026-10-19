import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const LOCK = path.resolve(process.cwd(), ".test-db.lock");

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Les tests d'intégration (vitest) et les e2e (Playwright) partagent la même base de test : lancés en même temps,
 * ils se piétinent (comptes du seed désactivés par `parkSeedBuyers`, licence supprimée, TRUNCATE...), d'où des échecs
 * de connexion « Email ou mot de passe incorrect » sans rapport avec le produit. Un verrou de fichier l'interdit.
 * Retourne la fonction de libération.
 */
export function acquireTestDbLock(owner: string): () => void {
  if (existsSync(LOCK)) {
    const [pidText, who] = readFileSync(LOCK, "utf8").split(" ");
    const pid = Number(pidText);
    if (pid && pid !== process.pid && alive(pid)) {
      throw new Error(
        `La base de test est déjà utilisée par « ${who ?? "?"} » (pid ${pid}). Attendez la fin de cette suite avant de lancer « ${owner} » : les deux partagent la même base.`,
      );
    }
  }
  writeFileSync(LOCK, `${process.pid} ${owner}`);
  return () => {
    try {
      if (readFileSync(LOCK, "utf8").startsWith(`${process.pid} `)) rmSync(LOCK);
    } catch {
      // déjà libéré
    }
  };
}

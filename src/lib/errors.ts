/** Erreur métier : le message est destiné à l'utilisateur, en français. */
export class BusinessError extends Error {
  readonly code: string;
  readonly messageFr: string;

  constructor(code: string, messageFr: string) {
    super(messageFr);
    this.name = "BusinessError";
    this.code = code;
    this.messageFr = messageFr;
    Object.setPrototypeOf(this, BusinessError.prototype);
  }
}

export function isBusinessError(e: unknown): e is BusinessError {
  return e instanceof BusinessError;
}

export type ActionResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function fail(code: string, message: string): ActionResult<never> {
  return { ok: false, code, message };
}

/** Convertit toute erreur en ActionResult ; les erreurs techniques restent opaques. */
export function toActionError(e: unknown): ActionResult<never> {
  if (isBusinessError(e)) return fail(e.code, e.messageFr);
  return fail("INTERNAL", "Une erreur technique est survenue. Réessayez ou contactez l'administrateur.");
}

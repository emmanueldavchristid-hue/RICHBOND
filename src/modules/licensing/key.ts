import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Clés de licence : `RB-` + base32(HMAC-SHA256(LICENSE_SECRET, "<bénéficiaire>|ACTIVE")) tronqué à
 * 20 caractères en 4 groupes de 5. Pas de `server-only` : importé aussi par le script de génération.
 */
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const KEY_CHARS = 20;
export const MIN_SECRET_LENGTH = 32;
const DEV_FALLBACK_SECRET = "dev-only-richbond-license-secret-not-for-production-0000";

function base32(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/**
 * Secret serveur (>= 32 car.), sinon null (activation impossible).
 * Secret de repli constant uniquement si NODE_ENV === "test" ou ALLOW_TEST_NOW === "1".
 */
export function getLicenseSecret(env: Record<string, string | undefined> = process.env): string | null {
  const s = env.LICENSE_SECRET;
  if (s && s.length >= MIN_SECRET_LENGTH) return s;
  if (env.NODE_ENV === "test" || env.ALLOW_TEST_NOW === "1") return DEV_FALLBACK_SECRET;
  return null;
}

/** Bénéficiaire canonique : espaces rognés et réduits, majuscules (insensible à la casse). */
export function normalizeLicensedTo(input: string): string {
  return input.trim().replace(/\s+/g, " ").toUpperCase();
}

export function generateLicenseKey(secret: string, licensedTo: string): string {
  const mac = createHmac("sha256", secret).update(`${normalizeLicensedTo(licensedTo)}|ACTIVE`).digest();
  const chars = base32(mac).slice(0, KEY_CHARS);
  return `RB-${chars.match(/.{5}/g)!.join("-")}`;
}

/** Majuscules, sans espaces ; tirets optionnels ; préfixe initial `RB-`/`RB` retiré une seule fois. */
export function normalizeKey(input: string): string {
  const upper = input.trim().toUpperCase();
  const compact = upper.replace(/[\s-]/g, "");
  let body = compact;
  const explicitPrefix = /^RB[\s-]/.test(upper);
  if (compact.startsWith("RB") && (explicitPrefix || compact.length === KEY_CHARS + 2)) body = compact.slice(2);
  return body.length === KEY_CHARS ? `RB-${body.match(/.{5}/g)!.join("-")}` : `RB-${body}`;
}

export function verifyLicenseKey(secret: string, licensedTo: string, input: string): boolean {
  const expected = Buffer.from(generateLicenseKey(secret, licensedTo));
  const given = Buffer.from(normalizeKey(input));
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Empreinte stockée en base (jamais la clé). */
export function fingerprint(key: string): string {
  return createHash("sha256").update(normalizeKey(key)).digest("hex");
}

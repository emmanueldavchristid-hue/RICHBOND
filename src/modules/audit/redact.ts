const SECRET_KEY = /(password|passwd|secret|token|bankDetails)|^(key|licenseKey)$/i;

/** Retire récursivement tout champ sensible (passwordHash, password*…) avant écriture dans l'audit. */
export function redactSecrets<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => redactSecrets(v)) as unknown as T;
  if (value instanceof Date) return value;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY.test(k)) continue;
      out[k] = redactSecrets(v);
    }
    return out as T;
  }
  return value;
}

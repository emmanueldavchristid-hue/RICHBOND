import { describe, expect, it } from "vitest";
import {
  createThrottle,
  MAX_FAILURES_PER_EMAIL_IP,
  MAX_FAILURES_PER_IP,
  THROTTLE_WINDOW_MS,
} from "@/modules/auth/rate-limit";

const T0 = new Date("2026-01-01T10:00:00Z");
const at = (ms: number) => new Date(T0.getTime() + ms);

describe("limitation des tentatives de connexion", () => {
  it("bloque après N échecs sur le même e-mail + IP, signale le déclenchement une seule fois", () => {
    const t = createThrottle();
    const flags: boolean[] = [];
    for (let i = 0; i < MAX_FAILURES_PER_EMAIL_IP; i++) flags.push(t.recordFailure("A@x.ci", "1.1.1.1", at(i * 1000)));
    expect(flags.filter(Boolean)).toHaveLength(1);
    expect(flags[flags.length - 1]).toBe(true);
    expect(t.blockedUntil("a@x.ci", "1.1.1.1", at(20_000))).not.toBeNull();
    expect(t.recordFailure("a@x.ci", "1.1.1.1", at(21_000))).toBe(false);
  });

  it("ne bloque pas une autre IP pour le même e-mail", () => {
    const t = createThrottle();
    for (let i = 0; i < MAX_FAILURES_PER_EMAIL_IP; i++) t.recordFailure("a@x.ci", "1.1.1.1", at(i));
    expect(t.blockedUntil("a@x.ci", "2.2.2.2", at(100))).toBeNull();
  });

  it("débloque une fois la fenêtre écoulée", () => {
    const t = createThrottle();
    for (let i = 0; i < MAX_FAILURES_PER_EMAIL_IP; i++) t.recordFailure("a@x.ci", "1.1.1.1", at(i));
    expect(t.blockedUntil("a@x.ci", "1.1.1.1", at(THROTTLE_WINDOW_MS + 1000))).toBeNull();
  });

  it("une connexion réussie remet le compteur e-mail + IP à zéro", () => {
    const t = createThrottle();
    for (let i = 0; i < MAX_FAILURES_PER_EMAIL_IP - 1; i++) t.recordFailure("a@x.ci", "1.1.1.1", at(i));
    t.reset("a@x.ci", "1.1.1.1");
    expect(t.recordFailure("a@x.ci", "1.1.1.1", at(1000))).toBe(false);
    expect(t.blockedUntil("a@x.ci", "1.1.1.1", at(1000))).toBeNull();
  });

  it("bloque une IP qui essaie beaucoup d'e-mails différents", () => {
    const t = createThrottle();
    for (let i = 0; i < MAX_FAILURES_PER_IP; i++) t.recordFailure(`u${i}@x.ci`, "9.9.9.9", at(i));
    expect(t.blockedUntil("nouveau@x.ci", "9.9.9.9", at(100))).not.toBeNull();
  });
});

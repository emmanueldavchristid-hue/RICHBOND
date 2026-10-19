import { describe, expect, it } from "vitest";
import {
  computeLicenseState,
  computeTrialEnd,
  effectiveNow,
  formatBadge,
  formatCountdown,
  trialProgress,
} from "@/modules/licensing/state";

const lic = (over: Partial<Parameters<typeof computeLicenseState>[0]> = {}) => ({
  status: "TRIAL" as const,
  trialStartsAt: new Date("2026-10-01T00:00:00Z"),
  trialEndsAt: new Date("2026-11-20T23:59:59.999Z"),
  ...over,
});

describe("computeLicenseState", () => {
  it("borne stricte : 23:59:59.998 => TRIAL, 23:59:59.999 => EXPIRED", () => {
    expect(computeLicenseState(lic(), new Date("2026-11-20T23:59:59.998Z")).status).toBe("TRIAL");
    const at = computeLicenseState(lic(), new Date("2026-11-20T23:59:59.999Z"));
    expect(at.status).toBe("EXPIRED");
    expect(at.writable).toBe(false);
    expect(computeLicenseState(lic(), new Date("2026-11-21T00:00:00.000Z")).status).toBe("EXPIRED");
  });

  it("ACTIVE ignore les dates", () => {
    const s = computeLicenseState(lic({ status: "ACTIVE" }), new Date("2030-01-01T00:00:00Z"));
    expect(s).toMatchObject({ status: "ACTIVE", writable: true, tone: null });
  });

  it("EXPIRED stocké avec fin future (après prolongation) => TRIAL", () => {
    expect(computeLicenseState(lic({ status: "EXPIRED" }), new Date("2026-11-01T00:00:00Z")).status).toBe("TRIAL");
  });

  it("daysLeft, rappels et tons", () => {
    const at = (d: string) => computeLicenseState(lic(), new Date(`${d}T10:00:00Z`));
    expect(at("2026-11-20")).toMatchObject({ daysLeft: 0, isReminderDay: true, tone: "danger" });
    expect(at("2026-11-19")).toMatchObject({ daysLeft: 1, isReminderDay: true, tone: "danger" });
    expect(at("2026-11-18")).toMatchObject({ daysLeft: 2, isReminderDay: false, tone: "danger" });
    expect(at("2026-11-17")).toMatchObject({ daysLeft: 3, isReminderDay: true, tone: "warning" });
    expect(at("2026-11-13")).toMatchObject({ daysLeft: 7, isReminderDay: true, tone: "warning" });
    expect(at("2026-11-12")).toMatchObject({ daysLeft: 8, isReminderDay: false, tone: "neutral" });
  });

  it("indépendant de process.env.TZ", () => {
    const old = process.env.TZ;
    process.env.TZ = "Pacific/Auckland";
    try {
      expect(computeLicenseState(lic(), new Date("2026-11-20T10:00:00Z")).daysLeft).toBe(0);
    } finally {
      if (old === undefined) delete process.env.TZ;
      else process.env.TZ = old;
    }
  });
});

describe("effectiveNow (anti-recul)", () => {
  it("ne recule jamais avant lastSeenAt", () => {
    const seen = new Date("2026-11-25T00:00:00Z");
    expect(effectiveNow(new Date("2026-11-01T00:00:00Z"), seen)).toEqual(seen);
    expect(effectiveNow(new Date("2026-12-01T00:00:00Z"), seen)).toEqual(new Date("2026-12-01T00:00:00Z"));
    expect(effectiveNow(new Date("2026-12-01T00:00:00Z"), null)).toEqual(new Date("2026-12-01T00:00:00Z"));
  });
});

describe("formatCountdown / formatBadge / trialProgress", () => {
  it("formate", () => {
    expect(formatCountdown(0)).toBe("0 min");
    expect(formatCountdown(-5000)).toBe("0 min");
    expect(formatCountdown(59 * 60_000)).toBe("59 min");
    expect(formatCountdown(((12 * 24 + 5) * 60 + 32) * 60_000)).toBe("12 j 05 h 32 min");
    expect(formatCountdown((5 * 60 + 12) * 60_000)).toBe("5 h 12 min");
  });
  it("badge", () => {
    expect(formatBadge({ status: "TRIAL", daysLeft: 12, msLeft: 1 })).toBe("Essai : 12 j restants");
    expect(formatBadge({ status: "TRIAL", daysLeft: 1, msLeft: 1 })).toBe("Essai : 1 j restant");
    expect(formatBadge({ status: "TRIAL", daysLeft: 0, msLeft: (5 * 60 + 12) * 60_000 })).toBe(
      "Essai : se termine dans 5 h 12 min",
    );
    expect(formatBadge({ status: "EXPIRED", daysLeft: 0, msLeft: 0 })).toBe("Consultation seule");
    expect(formatBadge({ status: "ACTIVE", daysLeft: 0, msLeft: 0 })).toBe("");
  });
  it("progression bornée", () => {
    const s = new Date("2026-01-01T00:00:00Z");
    const e = new Date("2026-01-11T00:00:00Z");
    expect(trialProgress(s, e, new Date("2026-01-06T00:00:00Z"))).toBe(50);
    expect(trialProgress(s, e, new Date("2025-12-01T00:00:00Z"))).toBe(0);
    expect(trialProgress(s, e, new Date("2027-01-01T00:00:00Z"))).toBe(100);
  });
});

describe("computeTrialEnd", () => {
  const now = new Date("2026-10-19T14:00:00Z");
  it("TRIAL_END_DATE valide => 23:59:59.999 Abidjan", () => {
    expect(computeTrialEnd({ TRIAL_END_DATE: "2026-11-20" }, now).trialEndsAt.toISOString()).toBe("2026-11-20T23:59:59.999Z");
  });
  it("TRIAL_END_DATE passée acceptée telle quelle", () => {
    const r = computeTrialEnd({ TRIAL_END_DATE: "2026-01-01" }, now);
    expect(r.trialEndsAt.toISOString()).toBe("2026-01-01T23:59:59.999Z");
  });
  it("TRIAL_END_DATE invalide => défaut 30 j + avertissement", () => {
    for (const bad of ["20/11/2026", "2026-02-30", "abc"]) {
      const r = computeTrialEnd({ TRIAL_END_DATE: bad }, now);
      expect(r.trialEndsAt.toISOString()).toBe("2026-11-18T23:59:59.999Z");
      expect(r.warnings).toHaveLength(1);
    }
  });
  it("TRIAL_DAYS", () => {
    expect(computeTrialEnd({}, now).trialEndsAt.toISOString()).toBe("2026-11-18T23:59:59.999Z");
    expect(computeTrialEnd({ TRIAL_DAYS: "10" }, now).trialEndsAt.toISOString()).toBe("2026-10-29T23:59:59.999Z");
    for (const bad of ["abc", "0", "400", "-3", "1.5"]) {
      const r = computeTrialEnd({ TRIAL_DAYS: bad }, now);
      expect(r.trialEndsAt.toISOString()).toBe("2026-11-18T23:59:59.999Z");
      expect(r.warnings).toHaveLength(1);
    }
  });
});

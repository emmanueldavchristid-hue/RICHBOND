import { describe, expect, it } from "vitest";
import { isTestClock, resolveNow } from "@/lib/clock";

const real = new Date("2026-10-19T10:00:00Z");
const T = "2026-12-01T00:00:00.000Z";

describe("resolveNow", () => {
  it("TEST_NOW ignorée en production", () => {
    expect(resolveNow({ NODE_ENV: "production", ALLOW_TEST_NOW: "1", TEST_NOW: T }, T, real)).toEqual(real);
  });
  it("TEST_NOW ignorée sans ALLOW_TEST_NOW=1", () => {
    expect(resolveNow({ NODE_ENV: "test", TEST_NOW: T }, T, real)).toEqual(real);
    expect(resolveNow({ NODE_ENV: "test", ALLOW_TEST_NOW: "0", TEST_NOW: T }, undefined, real)).toEqual(real);
  });
  it("autorisée : cookie prioritaire sur env", () => {
    const env = { NODE_ENV: "test", ALLOW_TEST_NOW: "1", TEST_NOW: T };
    expect(resolveNow(env, undefined, real)).toEqual(new Date(T));
    expect(resolveNow(env, "2027-01-01T00:00:00Z", real)).toEqual(new Date("2027-01-01T00:00:00Z"));
    expect(isTestClock(env)).toBe(true);
  });
  it("ISO invalide ignoré", () => {
    const env = { NODE_ENV: "test", ALLOW_TEST_NOW: "1", TEST_NOW: "pas une date" };
    expect(resolveNow(env, "autre texte", real)).toEqual(real);
    expect(isTestClock(env, "x")).toBe(false);
  });
});

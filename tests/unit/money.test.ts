import { describe, expect, it } from "vitest";
import { formatFcfa, parseFcfa, roundFcfa, toFcfa } from "@/lib/money";

const NB = " ";

describe("formatFcfa", () => {
  it("formate zéro", () => expect(formatFcfa(0)).toBe(`0${NB}FCFA`));
  it("formate 1 250 000", () => expect(formatFcfa(1250000)).toBe(`1${NB}250${NB}000${NB}FCFA`));
  it("formate un négatif", () => expect(formatFcfa(-1250)).toBe(`-1${NB}250${NB}FCFA`));
  it("formate le maximum Int", () =>
    expect(formatFcfa(2147483647)).toBe(`2${NB}147${NB}483${NB}647${NB}FCFA`));
  it("refuse un décimal", () => expect(() => formatFcfa(10.5)).toThrow());
  it("refuse NaN", () => expect(() => formatFcfa(NaN)).toThrow());
});

describe("roundFcfa", () => {
  it("arrondit 0,5 vers le haut", () => {
    expect(roundFcfa(0.5)).toBe(1);
    expect(roundFcfa(2.5)).toBe(3);
    expect(roundFcfa(1.4)).toBe(1);
  });
  it("ne renvoie jamais -0", () => expect(Object.is(roundFcfa(-0.2), 0)).toBe(true));
});

describe("toFcfa", () => {
  it("convertit EUR en FCFA à 655,957", () => {
    expect(toFcfa(100, 655.957)).toBe(65596);
    expect(toFcfa("1000.00", "655.957")).toBe(655957);
  });
  it("accepte la virgule", () => expect(toFcfa("10,5", "2")).toBe(21));
  it("refuse une valeur invalide", () => expect(() => toFcfa("abc", 1)).toThrow());
});

describe("parseFcfa", () => {
  it("lit un montant formaté", () => {
    expect(parseFcfa("1 250 000")).toBe(1250000);
    expect(parseFcfa(formatFcfa(-4500))).toBe(-4500);
  });
  it("refuse un décimal", () => expect(() => parseFcfa("12,5")).toThrow());
});

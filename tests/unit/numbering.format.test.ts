import { describe, expect, it } from "vitest";
import { formatDocumentNumber } from "@/modules/numbering/format";
import type { CounterKey } from "@/modules/numbering/keys";

describe("formatDocumentNumber", () => {
  it("largeur 5 pour DA/BC/REC/SOR", () => {
    expect(formatDocumentNumber("DA", 2026, 1)).toBe("DA-2026-00001");
    expect(formatDocumentNumber("BC", 2026, 123)).toBe("BC-2026-00123");
    expect(formatDocumentNumber("REC", 2027, 42)).toBe("REC-2027-00042");
    expect(formatDocumentNumber("SOR", 2026, 7)).toBe("SOR-2026-00007");
  });
  it("largeur 4 pour INV/IMP", () => {
    expect(formatDocumentNumber("INV", 2026, 3)).toBe("INV-2026-0003");
    expect(formatDocumentNumber("IMP", 2026, 12)).toBe("IMP-2026-0012");
  });
  it("dépasse la largeur sans tronquer", () =>
    expect(formatDocumentNumber("DA", 2026, 123456)).toBe("DA-2026-123456"));
  it("rejette une clé inconnue", () =>
    expect(() => formatDocumentNumber("XYZ" as CounterKey, 2026, 1)).toThrow());
  it("rejette un numéro invalide", () => expect(() => formatDocumentNumber("DA", 2026, 0)).toThrow());
});

import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { buildWorkbook, sanitizeCell } from "@/lib/excel";

describe("sanitizeCell – injection de formules", () => {
  it.each(["=SUM(A1)", "+1+1", "-2+3", "@cmd", "\tX", "\rX"])("préfixe %j d'une apostrophe", (v) => {
    expect(sanitizeCell(v)).toBe(`'${v}`);
  });
  it("laisse intacts texte normal, nombres, dates et null", () => {
    const d = new Date();
    expect(sanitizeCell("Huile 5L")).toBe("Huile 5L");
    expect(sanitizeCell(-5)).toBe(-5);
    expect(sanitizeCell(d)).toBe(d);
    expect(sanitizeCell(null)).toBeNull();
  });
  it("l'export Excel ne contient aucune formule pour une valeur hostile", async () => {
    const buf = await buildWorkbook("T", [{ header: "Nom", value: (r: { n: string }) => r.n }], [{ n: "=HYPERLINK(\"http://x\")" }]);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const cell = wb.worksheets[0].getCell("A2");
    expect(typeof cell.value).toBe("string");
    expect(cell.value).toBe("'=HYPERLINK(\"http://x\")");
  });
});

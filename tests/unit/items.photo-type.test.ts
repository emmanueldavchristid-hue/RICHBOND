import { describe, expect, it } from "vitest";
import { detectImageType } from "@/modules/items/photo-type";

describe("detectImageType (R19)", () => {
  it("JPEG, PNG, WebP reconnus par signature", () => {
    expect(detectImageType(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))?.mime).toBe("image/jpeg");
    expect(detectImageType(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))?.ext).toBe("png");
    const webp = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]);
    expect(detectImageType(webp)?.mime).toBe("image/webp");
  });
  it("GIF, PDF, texte et fichier vide refusés", () => {
    expect(detectImageType(new TextEncoder().encode("GIF89a"))).toBeNull();
    expect(detectImageType(new TextEncoder().encode("%PDF-1.7"))).toBeNull();
    expect(detectImageType(new TextEncoder().encode("<script>alert(1)</script>"))).toBeNull();
    expect(detectImageType(new Uint8Array())).toBeNull();
  });
});

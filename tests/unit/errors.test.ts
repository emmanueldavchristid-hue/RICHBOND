import { describe, expect, it } from "vitest";
import { BusinessError, isBusinessError, toActionError } from "@/lib/errors";

describe("BusinessError", () => {
  it("conserve code et message FR", () => {
    const e = new BusinessError("STOCK_INSUFFISANT", "Stock insuffisant.");
    expect(e.code).toBe("STOCK_INSUFFISANT");
    expect(e.messageFr).toBe("Stock insuffisant.");
    expect(e.message).toBe("Stock insuffisant.");
    expect(e).toBeInstanceOf(BusinessError);
    expect(e).toBeInstanceOf(Error);
    expect(isBusinessError(e)).toBe(true);
    expect(isBusinessError(new Error("x"))).toBe(false);
  });
  it("toActionError masque les erreurs techniques", () => {
    expect(toActionError(new BusinessError("A", "Message"))).toEqual({
      ok: false,
      code: "A",
      message: "Message",
    });
    const r = toActionError(new Error("secret SQL"));
    expect(r.ok === false && r.message).not.toContain("SQL");
  });
});

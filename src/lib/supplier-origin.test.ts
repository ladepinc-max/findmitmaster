import { describe, expect, it } from "vitest";
import { formatSupplierFee, originFromGps } from "./supplier-origin";

describe("supplier origin", () => {
  it("treats Accra GPS as Ghanaian", () => expect(originFromGps(5.6037, -0.187)).toBe("gh"));
  it("treats Lagos GPS as international", () => expect(originFromGps(6.5244, 3.3792)).toBe("intl"));
  it("treats London GPS as international", () => expect(originFromGps(51.5, -0.12)).toBe("intl"));
  it("prices Ghana in cedis and others in dollars", () => {
    expect(formatSupplierFee("gh", 2500)).toBe("GH₵ 2,500");
    expect(formatSupplierFee("intl", 600)).toBe("$600");
  });
});

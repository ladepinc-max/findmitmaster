import { describe, expect, it } from "vitest";
import { depositInsurance, emptyFinance, requestEmergencyLoan } from "./shop-finance";

describe("shop finance", () => {
  it("rejects non-positive deposits", () => {
    expect(depositInsurance(emptyFinance(), 0).ok).toBe(false);
  });
  it("locks deposits for 5 years", () => {
    const r = depositInsurance(emptyFinance(), 100, new Date("2026-01-01T00:00:00Z"));
    expect(r.ok && r.state.insuranceLockedUntil?.startsWith("2031")).toBe(true);
  });
  it("denies loans above the insurance reserve", () => {
    expect(requestEmergencyLoan({ ...emptyFinance(), insuranceBalance: 100 }, 150, 3).ok).toBe(false);
  });
  it("denies a second active loan", () => {
    expect(requestEmergencyLoan({ ...emptyFinance(), insuranceBalance: 500, activeEmergencyLoan: 50 }, 100, 2).ok).toBe(false);
  });
  it("credits sales account and splits monthly deduction", () => {
    const r = requestEmergencyLoan({ ...emptyFinance(), insuranceBalance: 600 }, 300, 3);
    expect(r.ok && r.state.mainSalesAccount).toBe(300);
    expect(r.ok && r.state.loanMonthlyDeduction).toBe(100);
  });
});

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

import { ghanaSpoofReason, isGhanaianMobile } from "./supplier-origin";
describe("anti-spoofing for the Ghana supplier rate", () => {
  const ok = { gpsOrigin: "gh" as const, ipCountry: "GH", networkOrg: "MTN Ghana", timeZone: "Africa/Accra", offsetMinutes: 0, momoNumber: "0241234567" };
  it("accepts when GPS, network, time zone and MoMo all agree", () => { expect(ghanaSpoofReason(ok)).toBeNull(); });
  it("refuses a foreign network country", () => { expect(ghanaSpoofReason({ ...ok, ipCountry: "NG" })).not.toBeNull(); });
  it("refuses VPN/hosting networks", () => { expect(ghanaSpoofReason({ ...ok, networkOrg: "DigitalOcean, LLC" })).not.toBeNull(); });
  it("refuses a non-Ghana time zone", () => { expect(ghanaSpoofReason({ ...ok, timeZone: "Africa/Lagos", offsetMinutes: -60 })).not.toBeNull(); });
  it("refuses a non-Ghanaian number", () => { expect(ghanaSpoofReason({ ...ok, momoNumber: "+2348012345678" })).not.toBeNull(); });
  it("accepts +233 numbers", () => { expect(isGhanaianMobile("+233 55 123 4567")).toBe(true); });
  it("does not check international suppliers", () => { expect(ghanaSpoofReason({ ...ok, gpsOrigin: "intl", ipCountry: "US" })).toBeNull(); });
});

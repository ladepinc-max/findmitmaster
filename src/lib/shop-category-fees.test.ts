import { describe, expect, it } from "vitest";
import { categoryRegistrationFee, categorySlug } from "./shop-category-fees";

const rows = [
  { value: "hotel", registration_fee: 500, is_waived: false, is_active: true },
  { value: "clinic", registration_fee: 500, is_waived: true, is_active: true },
  { value: "old", registration_fee: 900, is_waived: false, is_active: false },
];
const std = { amount: 200, waived: false };

describe("category registration fees", () => {
  it("charges a big shop its own category fee", () => {
    expect(categoryRegistrationFee(rows, "hotel", std)).toEqual({ amount: 500, waived: false });
  });
  it("makes a waived category free", () => {
    expect(categoryRegistrationFee(rows, "clinic", std)).toEqual({ amount: 0, waived: true });
  });
  it("uses the standard fee for owner-written or disabled categories", () => {
    expect(categoryRegistrationFee(rows, "Car wash", std).amount).toBe(200);
    expect(categoryRegistrationFee(rows, "old", std).amount).toBe(200);
  });
  it("turns admin-typed names into category codes", () => {
    expect(categorySlug("Car Wash & Spa")).toBe("car-wash-spa");
  });
});

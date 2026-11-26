import { describe, expect, it } from "vitest";
import { shopDirectoryAction, supplierDirectoryAction } from "./directory";

describe("directory registration actions", () => {
  it("offers shop registration only when the signed-in user has no shop", () => {
    expect(shopDirectoryAction(false)).toBe("Register shop");
    expect(shopDirectoryAction(true)).toBe("Manage shop");
  });

  it("offers supplier registration only when the signed-in user has no supplier profile", () => {
    expect(supplierDirectoryAction(false)).toBe("Register as a Supplier");
    expect(supplierDirectoryAction(true)).toBe("Manage supplier");
  });
});

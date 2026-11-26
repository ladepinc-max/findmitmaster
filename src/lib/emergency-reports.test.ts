import { describe, expect, it } from "vitest";
import { NEXT_STATUS, STATION_INCIDENTS, stationKind } from "./emergency-reports";

describe("emergency stations", () => {
  it("detects police and fire stations, not shops", () => {
    expect(stationKind({ category: "police", handle: "accra" })).toBe("police");
    expect(stationKind({ category: "shop", handle: "tema.fireservice" })).toBe("fire");
    expect(stationKind({ category: "food", handle: "ama.food" })).toBeNull();
  });
  it("offers four report buttons per station", () => {
    expect(STATION_INCIDENTS.police).toHaveLength(4);
    expect(STATION_INCIDENTS.fire).toHaveLength(4);
  });
  it("moves status forward until resolved", () => {
    expect(NEXT_STATUS.new).toBe("acknowledged");
    expect(NEXT_STATUS.resolved).toBeNull();
  });
});

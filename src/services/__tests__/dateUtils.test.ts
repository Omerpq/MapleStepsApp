// src/services/__tests__/dateUtils.test.ts
import { pickDisplayTime } from "../dateUtils";

describe("pickDisplayTime", () => {
  it("prefers cachedAt", () => {
    const ts = new Date("2025-01-05T23:15:00Z").getTime();
    expect(pickDisplayTime(ts, "2024-12-31")).toBe("2025-01-06"); // local TZ may roll over
  });

  it("falls back to meta.last_checked", () => {
    expect(pickDisplayTime(null, "2025-02-02")).toBe("2025-02-02");
  });

  it("returns dash on bad input", () => {
    expect(pickDisplayTime(null, undefined)).toBe("—");
  });
});

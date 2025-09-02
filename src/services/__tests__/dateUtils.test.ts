// src/services/__tests__/dateUtils.test.ts
import { pickDisplayTime } from "../dateUtils";

const toYMDLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;


describe("pickDisplayTime", () => {
  it("prefers cachedAt", () => {
  const ts = new Date("2025-01-05T23:15:00Z").getTime();
  // Expect the local calendar date of the cached timestamp (stable across CI TZ and local)
  expect(pickDisplayTime(ts, "2024-12-31")).toBe(toYMDLocal(new Date(ts)));
});


  it("falls back to meta.last_checked", () => {
    expect(pickDisplayTime(null, "2025-02-02")).toBe("2025-02-02");
  });

  it("returns dash on bad input", () => {
    expect(pickDisplayTime(null, undefined)).toBe("—");
  });
});

// src/utils/__tests__/freshness.test.ts
import { sourceTitle, syncQualifier, tsFrom, makeMetaLineCompact } from "../../utils/freshness";

describe("freshness util", () => {
  test("sourceTitle maps correctly", () => {
    expect(sourceTitle("remote")).toBe("Remote");
    expect(sourceTitle("cache")).toBe("Cache");
    expect(sourceTitle("local")).toBe("Local");
    // unknown falls back to Local label
    expect(sourceTitle("weird")).toBe("Local");
  });

  test("syncQualifier detects updated/validated", () => {
    expect(syncQualifier({ status: 200 })).toBe("updated");
    expect(syncQualifier({ status: 304 })).toBe("validated");
    expect(syncQualifier({})).toBeUndefined();
    expect(syncQualifier(undefined)).toBeUndefined();
  });

  test("tsFrom prefers cachedAt over last_checked", () => {
    const now = Date.now();
    expect(tsFrom(now, { last_checked: "2020-01-01T00:00:00Z" })).toBe(now);
    const iso = "2021-02-03T04:05:06Z";
    expect(tsFrom(null, { last_checked: iso })).toBe(Date.parse(iso));
    expect(tsFrom(null, {})).toBeNull();
  });

  test("makeMetaLineCompact falls back to bundled", () => {
    const line = makeMetaLineCompact("CRS", null);
    expect(line.startsWith("CRS • bundled")).toBe(true);
  });
});

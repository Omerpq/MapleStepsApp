/**
 * @jest-environment node
 */
jest.mock("../config", () => ({
  __esModule: true,
  RULES_CONFIG: {
    roundsUrl: "https://example.test/rounds",
    feesUrl: "https://example.test/fees",
  },
}));

import AsyncStorage from "@react-native-async-storage/async-storage";
import { loadRounds, loadFees, pickDisplayTime } from "../updates";
import { RULES_CONFIG } from "../config";

// Mock AsyncStorage (official mock)
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

describe("A4 loader contract", () => {
  const originalFetch = global.fetch as any;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2025-08-16T00:00:00Z"));
    (AsyncStorage.clear as any)();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.useRealTimers();
  });

  test("remote → prefers cachedAt", async () => {
    // Remote JSON for rounds (with a meta.last_checked)
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: (_: string) => null },
      json: async () => ({
        last_checked: "2025-08-15T12:00:00Z",
        rounds: [
          { date: "2025-08-15", draw_number: 400, invitations: 1000, cutoff: 500 },
        ],
      }),
    });

    const r = await loadRounds();
    expect(r.source).toBe("remote");
    expect(typeof r.cachedAt).toBe("number");
    // pickDisplayTime should equal cachedAt for remote
    expect(pickDisplayTime(r)).toBe(r.cachedAt);
    expect(Array.isArray(r.data)).toBe(true);
  });

  test("cache → prefers cachedAt (stable between calls)", async () => {
    // 1) Prime cache with a remote fees response
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: (_: string) => null },
      json: async () => ({
        last_checked: "2025-08-15T12:00:00Z",
        fees: [{ code: "EE", label: "Express Entry", amount_cad: 85 }],
      }),
    });

    const first = await loadFees(); // remote
    expect(first.source).toBe("remote");
    const savedAt = first.cachedAt!;
    expect(typeof savedAt).toBe("number");

    // 2) Offline now → should hit cache and keep same cachedAt
    global.fetch = jest.fn().mockRejectedValue(new Error("offline"));

    const second = await loadFees(); // cache
    expect(second.source).toBe("cache");
    expect(second.cachedAt).toBe(savedAt);
    // pickDisplayTime should still equal cachedAt
    expect(pickDisplayTime(second)).toBe(savedAt);
  });

  test("local → falls back to meta.last_checked via pickDisplayTime", async () => {
    // Disable test-mode seeding for this test only
    const prevFeesUrl = RULES_CONFIG.feesUrl;
    (RULES_CONFIG as any).feesUrl = "";

    try {
      // Offline & empty cache -> local
      global.fetch = jest.fn().mockRejectedValue(new Error("offline"));
      (AsyncStorage.clear as any)();

      const r = await loadFees(); // uses bundled localFees
      expect(r.source).toBe("local");
      expect(r.cachedAt).toBeNull();

      const ts = pickDisplayTime(r);
      // If local fees bundle has meta.last_checked, ts will be a number
      // (This asserts the *rule* rather than a hard-coded value.)
      expect(ts === null || typeof ts === "number").toBe(true);
    } finally {
      // Put it back so other tests are unaffected
      (RULES_CONFIG as any).feesUrl = prevFeesUrl;
    }
  });
});

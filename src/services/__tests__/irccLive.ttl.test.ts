/**
 * IRCC Live TTL + force refresh
 * - Fresh cache (<=24h) → returns source: "cache"
 * - forceRemote=true → fetches "live" and updates verifiedAtISO
 */
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

// Make Platform non-web so fetchCorsAware uses real fetch in the module.
jest.mock("react-native", () => ({ Platform: { OS: "ios" } }));

import AsyncStorage from "@react-native-async-storage/async-storage";
import { loadIrccLiveMeta, IRCC_LINKS } from "../../services/irccLive";

function makeResp(
  status: number,
  headers: Record<string, string> = {}
) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (k: string) => headers[k] ?? null,
    },
  } as any;
}

describe("IRCC Live TTL", () => {
  const KEY = "ms.eapr.ircc.live.meta.v1";
  const lastMod = "Wed, 01 Oct 2025 10:00:00 GMT";

  beforeEach(async () => {
    jest.restoreAllMocks();
    (AsyncStorage as any).clear();
    // simple HEAD mock for all links
    (global as any).fetch = jest.fn().mockResolvedValue(makeResp(200, { "Last-Modified": lastMod }));
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2025-10-03T09:00:00.000Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("returns cached meta when within 24h TTL (source: cache)", async () => {
    const cached = {
      verifiedAtISO: new Date("2025-10-03T08:30:00.000Z").toISOString(),
      links: IRCC_LINKS.map((l) => ({ ...l, status: 200, lastModified: lastMod })),
      source: "live" as const,
    };
    await AsyncStorage.setItem(KEY, JSON.stringify(cached));

    const meta = await loadIrccLiveMeta(false);
    expect(meta.source).toBe("cache");
    expect(new Date(meta.verifiedAtISO).getTime()).toBeGreaterThan(0);
    expect(meta.links.length).toBe(IRCC_LINKS.length);
    // should NOT have called network because TTL served
    expect((global as any).fetch).toHaveBeenCalledTimes(0);
  });

  it("forceRemote=true fetches live and updates verifiedAtISO", async () => {
    const beforeISO = new Date("2025-10-02T08:00:00.000Z").toISOString();
    await AsyncStorage.setItem(
      KEY,
      JSON.stringify({
        verifiedAtISO: beforeISO,
        links: IRCC_LINKS.map((l) => ({ ...l, status: 200, lastModified: lastMod })),
        source: "live",
      })
    );

    const meta = await loadIrccLiveMeta(true);
    expect(meta.source).toBe("live");
    expect(meta.links.length).toBe(IRCC_LINKS.length);
    expect(new Date(meta.verifiedAtISO).getTime()).toBeGreaterThan(new Date(beforeISO).getTime());
    // called HEAD once per link
    expect((global as any).fetch).toHaveBeenCalledTimes(IRCC_LINKS.length);
  });
});

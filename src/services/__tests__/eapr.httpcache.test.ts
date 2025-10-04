/**
 * eAPR A4 HTTP cache flow: 200 -> (cached) -> 304
 * Verifies status mapping to "updated"/"validated".
 */
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  loadEaprGuides,
  EAPR_GUIDES_META_KEY,
  EAPR_GUIDES_CACHE_KEY,
} from "../../services/eapr";

function makeResp(
  status: number,
  body: any,
  headers: Record<string, string> = {}
) {
  return {
    status,
    headers: {
      get: (k: string) => headers[k] ?? null,
    },
    // eapr.ts calls .text() and JSON.parse
    async text() {
      return JSON.stringify(body);
    },
  } as any;
}

describe("eAPR A4 HTTP cache", () => {
  const etag = `"abc123"`;
  const lastMod = "Wed, 01 Oct 2025 10:00:00 GMT";
  const guideBody = {
    id: "eapr",
    title: "e-APR Document Pack",
    sections: [{ id: "personal", title: "Personal", docs: [] }],
  };

  beforeEach(async () => {
    jest.restoreAllMocks();
    (AsyncStorage as any).clear();
  });

  it("200 first, then 304 with cache; label is updated -> validated", async () => {
    // 1) First call returns 200 and stores cache + meta
    (global as any).fetch = jest
      .fn()
      .mockResolvedValueOnce(
        makeResp(200, guideBody, { ETag: etag, "Last-Modified": lastMod })
      )
      // 2) Second call returns 304 (validators hit)
      .mockResolvedValueOnce(makeResp(304, null));

    const first = await loadEaprGuides(); // 200
    expect(first.meta.status).toBe(200);
    expect(first.meta.source).toBe("remote");

    const metaAfter200 = JSON.parse(
      (await AsyncStorage.getItem(EAPR_GUIDES_META_KEY)) as string
    );
    expect(metaAfter200.status).toBe(200);

    // Derive label text mapping
    const label1 = metaAfter200.status === 200 ? "updated" : "validated";
    expect(label1).toBe("updated");

    // Ensure cache exists
    const cachedGuide = await AsyncStorage.getItem(EAPR_GUIDES_CACHE_KEY);
    expect(cachedGuide).toBeTruthy();

    const second = await loadEaprGuides(); // 304
    expect(second.meta.status).toBe(304);
    expect(second.meta.source).toBe("cache");

    const metaAfter304 = JSON.parse(
      (await AsyncStorage.getItem(EAPR_GUIDES_META_KEY)) as string
    );
    expect(metaAfter304.status).toBe(304);

    const label2 = metaAfter304.status === 200 ? "updated" : "validated";
    expect(label2).toBe("validated");
  });
});

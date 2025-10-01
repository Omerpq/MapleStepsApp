/**
 * EE Profile Checklist — unit tests aligned to the new rules:
 * - PoF compares the 6-month minimum to the required amount.
 * - "OK" requires 6/6 months present AND min6 >= required.
 * - Below threshold => severity:error, status:issue.
 * - NOC freshness uses taxonomy cache (savedAt) and should be OK when fresh.
 */

import { getEEChecklist } from "../eeProfile";
import AsyncStorage from "@react-native-async-storage/async-storage";

// ── In-memory AsyncStorage mock ────────────────────────────────────────────────
jest.mock("@react-native-async-storage/async-storage", () => {
  let store: Record<string, string | null> = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn((k: string) => Promise.resolve(store[k] ?? null)),
      setItem: jest.fn((k: string, v: string) => {
        store[k] = v;
        return Promise.resolve();
      }),
      removeItem: jest.fn((k: string) => {
        delete store[k];
        return Promise.resolve();
      }),
      clear: jest.fn(() => {
        store = {};
        return Promise.resolve();
      }),
      __STORE__: store,
    },
  };
});

// ── Helpers to seed state ─────────────────────────────────────────────────────
const setJSON = (k: string, v: any) => AsyncStorage.setItem(k, JSON.stringify(v));
const nowISO = () => new Date().toISOString();

function sixMonthsWindow(amounts: number[]): any[] {
  // amounts.length must be 6; build last 6 yyyy-MM keys ascending
  const today = new Date();
  const keys: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    keys.push(`${yyyy}-${mm}`);
  }
  return keys.map((yyyyMm, idx) => ({
    yyyyMm,
    entries: [{ typeId: "chequing", amount_cad: amounts[idx] }],
  }));
}

async function seedHappyPath() {
  // ECA selected
  await setJSON("ms.eca.state.v1", { selectedBodyId: "wes", updatedAt: nowISO() });

  // Language booked
  await setJSON("ms.language.state.v1", { testId: "ielts", testDateISO: nowISO() });

  // PoF thresholds (Rules or Live both acceptable)
  await setJSON("ms.pof.thresholds.cache.v1", {
    data: { thresholds: [{ family_size: 1, amount_cad: 15263 }] },
    meta: { status: 200 },
  });

  // PoF state: 6 months all >= 16,000 → min6 >= required
  await setJSON("ms.pof.state.v1", {
    familySize: 1,
    months: sixMonthsWindow([16000, 16000, 16000, 16000, 16000, 16000]),
    updatedAt: nowISO(),
  });

  // NOC taxonomy cache "fresh"
  await setJSON("ms_noc_cache_v1", {
    savedAt: Date.now(), // fresh
    meta: {
      last_checked: new Date().toISOString().slice(0, 10),
      source_name: "NOC 2021 (ESDC/StatCan)",
      source_url: "https://example",
    },
    data: [{ code: "11202", title: "Professional occupations in advertising, marketing and public relations" }],
  });

  // Premium off
  await setJSON("ms.payments.state.v1", { isActive: false, updatedAt: nowISO() });

  // (optional) NOC Verify selection present (cosmetic)
  await setJSON("ms.noc.verify.state.v1", { selectedNocCode: "11202" });
}

async function seedBelowThreshold() {
  // Keep ECA/Lang the same as happy path
  await setJSON("ms.eca.state.v1", { selectedBodyId: "wes", updatedAt: nowISO() });
  await setJSON("ms.language.state.v1", { testId: "ielts", testDateISO: nowISO() });

  // Required 15,263
  await setJSON("ms.pof.thresholds.cache.v1", {
    data: { thresholds: [{ family_size: 1, amount_cad: 15263 }] },
    meta: { status: 200 },
  });

  // PoF: 6 months, one month dips to 12,000 → min6 = 12,000 < required
  await setJSON("ms.pof.state.v1", {
    familySize: 1,
    months: sixMonthsWindow([16000, 16000, 12000, 16000, 16000, 16000]),
    updatedAt: nowISO(),
  });

  // Fresh NOC taxonomy cache
  await setJSON("ms_noc_cache_v1", {
    savedAt: Date.now(),
    meta: { last_checked: new Date().toISOString().slice(0, 10) },
    data: [{ code: "11202", title: "Professional occupations in advertising, marketing and public relations" }],
  });

  await setJSON("ms.payments.state.v1", { isActive: false, updatedAt: nowISO() });
  await setJSON("ms.noc.verify.state.v1", { selectedNocCode: "11202" });
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("EE Profile Checklist • getEEChecklist()", () => {
  beforeEach(async () => {
    await (AsyncStorage as any).clear();
  });

  test("flags errors/warnings when nothing is set", async () => {
    const checks = await getEEChecklist();
    const byId = Object.fromEntries(checks.map((c) => [c.id, c]));

    // Expect ECA error, Language warn, PoF info/warn, NOC warn (no cache)
    expect(byId["eca_selected"].status).toBe("issue");
    expect(byId["language_booked"].status).toBe("issue");
    expect(byId["pof_adequate"].status).toBe("issue");
    expect(byId["noc_verified"].status).toBe("issue");
  });

  test("OK when core items present and PoF 6-month minimum meets threshold", async () => {
    await seedHappyPath();

    const checks = await getEEChecklist();
    const byId = Object.fromEntries(checks.map((c) => [c.id, c]));

    expect(byId["eca_selected"].status).toBe("ok");
    expect(byId["language_booked"].status).toBe("ok");
    expect(byId["noc_verified"].status).toBe("ok");
    expect(byId["pof_adequate"].status).toBe("ok");
  });

  test("PoF below threshold → error (min6 < required with 6/6 months)", async () => {
    await seedBelowThreshold();

    const checks = await getEEChecklist();
    const pof = checks.find((c) => c.id === "pof_adequate");

    expect(pof?.severity).toBe("error");
    expect(pof?.status).toBe("issue");
    expect(pof?.details || "").toMatch(/6-month minimum/i);
  });
});

/**
 * S4-01 — ITA readiness gate tests
 */
import { checkReadiness, formatBlockers } from "../ita";

// Mock eeProfile so we don’t hit real loaders
jest.mock("../eeProfile", () => ({
  getEEChecklist: jest.fn(),
  applyFix: jest.fn(),
}));

import { getEEChecklist } from "../eeProfile";

const ok = (id: string, title = id) => ({
  id,
  title,
  status: "ok",
  severity: "ok",
  details: "",
  fix: { type: "none" as const },
});

const warn = (id: string, title = id) => ({
  id,
  title,
  status: "warn",
  severity: "warn",
  details: "Needs attention",
  fix: { type: "navigate" as const, route: "EEProfileChecklist" },
});

describe("ITA readiness gate", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("reports ready when all required items are ok", async () => {
    (getEEChecklist as jest.Mock).mockResolvedValue([
      ok("eca_selected"),
      ok("language_booked"),
      ok("pof_adequate"),
      ok("noc_verified"),
      ok("premium_ready"),
      ok("ircc_profile_prep"),
    ]);

    const res = await checkReadiness();
    expect(res.ready).toBe(true);
    expect(res.blockers).toHaveLength(0);
    expect(res.all.length).toBeGreaterThanOrEqual(4);
  });

  it("reports blockers when any required item is not ok", async () => {
    (getEEChecklist as jest.Mock).mockResolvedValue([
      ok("eca_selected"),
      warn("language_booked"),
      ok("pof_adequate"),
      ok("noc_verified"),
    ]);

    const res = await checkReadiness();
    expect(res.ready).toBe(false);
    expect(res.blockers.map(b => b.id)).toContain("language_booked");

    const msg = formatBlockers(res.blockers);
    expect(msg).toMatch(/language_booked/i);
  });
});

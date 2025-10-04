// src/services/tests/tracker.state.test.ts
// src/services/tests/tracker.state.test.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  loadTracker,
  setMilestoneDate,
  setMilestoneNotes,
  clearAllMilestones,
  getTimeline,
  type TrackerState,
} from "../tracker";


const FIXED = "2025-10-04";

describe("PR tracker state", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it("loads defaults on first run", async () => {
    const st = await loadTracker();
    expect(st.milestones.length).toBeGreaterThanOrEqual(10);
    const ids = st.milestones.map(m => m.id);
    expect(ids[0]).toBe("aor"); // Application submitted (AOR)
  });

  it("sets date & notes and persists", async () => {
    let st = await loadTracker();
    const target = st.milestones.find(m => m.id === "med_passed");
    expect(target?.dateISO).toBeNull();

    st = await setMilestoneDate("med_passed", FIXED);
    st = await setMilestoneNotes("med_passed", "Panel clinic near home");

    // simulate new app session
    const again = await loadTracker();
    const med = again.milestones.find(m => m.id === "med_passed");
    expect(med?.dateISO).toBe(FIXED);
    expect(med?.notes).toBe("Panel clinic near home");
  });

  it("clearAllMilestones resets dates & notes", async () => {
    await setMilestoneDate("aor", FIXED);
    await setMilestoneNotes("aor", "AOR email at 10:15 AM");

    const cleared = await clearAllMilestones();
    const aor = cleared.milestones.find(m => m.id === "aor");
    expect(aor?.dateISO).toBeNull();
    expect(aor?.notes ?? null).toBeNull();
  });

  it("timeline sorts by date first, then canonical order", async () => {
    // Set two later milestones with earlier/later dates
    await setMilestoneDate("bg_completed", "2025-05-01");
    await setMilestoneDate("eligibility_passed", "2025-04-20");

    const st: TrackerState = await loadTracker();
    const tl = getTimeline(st);

    const idxElig = tl.findIndex(m => m.id === "eligibility_passed");
    const idxBG   = tl.findIndex(m => m.id === "bg_completed");

    // Since 2025-04-20 < 2025-05-01, eligibility should appear before background
    expect(idxElig).toBeGreaterThanOrEqual(0);
    expect(idxBG).toBeGreaterThanOrEqual(0);
    expect(idxElig).toBeLessThan(idxBG);
  });
});

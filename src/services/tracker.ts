// src/services/tracker.ts
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Post-submission PR tracker (AOR → PPR/COPR).
 * Persistence key is versioned for safe future migrations.
 */
const KEY = "ms.tracker.state.v1";

export type MilestoneID =
  | "aor"                // Acknowledgment of Receipt
  | "biometrics_letter"  // BIL received
  | "biometrics_done"    // Biometrics completed
  | "med_passed"         // Medicals passed (MEP)
  | "adr_received"       // Additional documents requested (ADR)
  | "adr_submitted"      // ADR submitted
  | "eligibility_passed" // Eligibility passed (GCMS/Portal comms)
  | "bg_completed"       // Background completed
  | "ppr_or_portal1"     // PPR email OR PR Confirmation Portal (Portal 1)
  | "ecopr_or_copr"      // eCOPR/CoPR
  | "pr_card_received";  // PR card received (mail)

export type Milestone = {
  id: MilestoneID;
  title: string;
  dateISO: string | null;   // YYYY-MM-DD (user-entered) or null if not done
  notes?: string | null;    // optional short note
  createdAt?: string;       // ISO ms
  updatedAt?: string;       // ISO ms
};

export type TrackerState = {
  milestones: Milestone[];
  // reserved for future additions (office, VO, UCI, etc.)
  meta?: Record<string, any>;
  __version: 1;
  __savedAt?: string; // ISO ms (when last saved)
};

// Ordered canonical list for new users
// Ordered canonical list for new users (plain-language titles)
const DEFAULTS: Milestone[] = [
  { id: "aor",               title: "Application submitted (AOR)", dateISO: null },
  { id: "biometrics_letter", title: "Biometrics request received",   dateISO: null },
  { id: "biometrics_done",   title: "Biometrics completed",          dateISO: null },
  { id: "med_passed",        title: "Medical exam passed",           dateISO: null },
  { id: "adr_received",      title: "IRCC asked for more documents", dateISO: null },
  { id: "adr_submitted",     title: "Additional documents submitted", dateISO: null },

  { id: "eligibility_passed",title: "Eligibility check passed",      dateISO: null },
  { id: "bg_completed",      title: "Background check completed",    dateISO: null },
  { id: "ppr_or_portal1",    title: "Approval email / PR Portal invite", dateISO: null },
  { id: "ecopr_or_copr",     title: "PR confirmation (eCOPR/CoPR)", dateISO: null },

  { id: "pr_card_received",  title: "PR card received in mail",      dateISO: null },
];

const TITLE_MAP: Record<MilestoneID, string> = {
  aor: "Application submitted (AOR)",
  biometrics_letter: "Biometrics request received",
  biometrics_done: "Biometrics completed",
  med_passed: "Medical exam passed",
  adr_received: "IRCC asked for more documents",
  adr_submitted: "Additional documents submitted",
  eligibility_passed: "Eligibility check passed",
  bg_completed: "Background check completed",
  ppr_or_portal1: "Approval email / PR Portal invite",
  ecopr_or_copr: "PR confirmation (eCOPR/CoPR)",
  pr_card_received: "PR card received in mail",
};

function todayISO(): string {
  // Always YYYY-MM-DD local
  const d = new Date();
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function normalizeTitles(state: TrackerState): TrackerState {
  state.milestones = state.milestones.map(m => {
    const t = TITLE_MAP[m.id as MilestoneID];
    return t ? { ...m, title: t } : m;
  });
  return state;
}

export async function loadTracker(): Promise<TrackerState> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) {
      let parsed = JSON.parse(raw) as TrackerState;
      if (parsed?.__version === 1 && Array.isArray(parsed.milestones)) {
        // 🔧 apply latest titles to any old saved state
        parsed = normalizeTitles(parsed);
        await AsyncStorage.setItem(KEY, JSON.stringify({ ...parsed, __savedAt: new Date().toISOString() }));
        return parsed;
      }
    }
  } catch {
    // fall through to defaults
  }
  return {
    milestones: DEFAULTS.map(m => ({ ...m, createdAt: new Date().toISOString() })),
    meta: {},
    __version: 1,
  };
}


async function save(state: TrackerState): Promise<void> {
  const copy: TrackerState = { ...state, __savedAt: new Date().toISOString() };
  await AsyncStorage.setItem(KEY, JSON.stringify(copy));
}

export async function setMilestoneDate(id: MilestoneID, dateISO: string | null): Promise<TrackerState> {
  const st = await loadTracker();
  const ix = st.milestones.findIndex(m => m.id === id);
  if (ix >= 0) {
    st.milestones[ix] = {
      ...st.milestones[ix],
      dateISO,
      updatedAt: new Date().toISOString(),
    };
  } else {
    // if a new milestone id comes via future update, append gracefully
    st.milestones.push({
      id,
      title: id,
      dateISO,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as Milestone);
  }
  await save(st);
  return st;
}

export async function setMilestoneNotes(id: MilestoneID, notes: string | null): Promise<TrackerState> {
  const st = await loadTracker();
  const ix = st.milestones.findIndex(m => m.id === id);
  if (ix >= 0) {
    st.milestones[ix] = { ...st.milestones[ix], notes: notes ?? null, updatedAt: new Date().toISOString() };
    await save(st);
  }
  return st;
}

export async function clearAllMilestones(): Promise<TrackerState> {
  const st: TrackerState = {
    milestones: DEFAULTS.map(m => ({ ...m, dateISO: null, notes: null, createdAt: new Date().toISOString() })),
    meta: {},
    __version: 1,
  };
  await save(st);
  return st;
}

/** Sorted timeline, filled first by date then by canonical order. */
export function getTimeline(state: TrackerState): Milestone[] {
  const order = new Map(DEFAULTS.map((m, i) => [m.id, i]));
  return [...state.milestones].sort((a, b) => {
    const ad = a.dateISO ? Date.parse(a.dateISO) : NaN;
    const bd = b.dateISO ? Date.parse(b.dateISO) : NaN;
    if (!isNaN(ad) && !isNaN(bd)) return ad - bd; // older first
    if (!isNaN(ad)) return -1;
    if (!isNaN(bd)) return 1;
    // fall back to canonical order
    return (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0);
  });
}

/** Convenience to set today's date quickly. */
export async function markToday(id: MilestoneID): Promise<TrackerState> {
  return setMilestoneDate(id, todayISO());
}

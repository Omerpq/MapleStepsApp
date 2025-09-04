// src/utils/nextTasks.ts
import seed from "../data/action_plan.seed.json";

export type Access = "free" | "premium";
export type PersistedTask = {
  id: string;         // may be suffixed: foo__i1
  title: string;      // may start with 【Free】/【Premium】
  baseISO: string;
  offsetDays: number;
  dueISO: string;
  done: boolean;
};
export type SeedItem = {
  id: string;                 // base id in seed (no __iN)
  title: string;
  access: Access;
  due_offset_days: number;
  depends_on?: string[];      // base ids
  step?: number | string;     // order hint
  route?: string;
};
export type NextTaskCandidate = {
  id: string;                 // original persisted id (may have __iN)
  title: string;
  dueISO: string | null;
  seedIndex: number;
  stepOrder: number;
  isPremium: boolean;
  isBlocked: boolean;
  isLocked: boolean;
  routeHint?: string;
};
export type NextTaskResult = {
  next: NextTaskCandidate | null;
  candidates: NextTaskCandidate[];
};

// ───────────────────────────────────────────────────────────────────────────────
// Helpers

const SEED: SeedItem[] = (seed as unknown as SeedItem[]);

// normalize: drop trailing "__iN" used by expanded/duplicated tasks
const baseId = (id: string) => id.replace(/__i\d+$/, "");

const seedByBaseId: Record<string, SeedItem> = Object.create(null);
const indexByBaseId: Record<string, number> = Object.create(null);
SEED.forEach((item, i) => {
  const bid = baseId(item.id);
  seedByBaseId[bid] = item;
  indexByBaseId[bid] = i;
});

function stepOrderOf(item: SeedItem | undefined, fallbackIndex: number): number {
  if (!item) return Number.MAX_SAFE_INTEGER;
  const s = item.step;
  if (typeof s === "number" && Number.isFinite(s)) return s;
  if (typeof s === "string") {
    const n = parseInt(s.replace(/\D+/g, ""), 10);
    if (Number.isFinite(n)) return n;
  }
  return fallbackIndex;
}

function parseISO(s?: string | null): number | null {
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

function isPremiumFrom(title: string, seedItem?: SeedItem): boolean {
  if (seedItem) return seedItem.access === "premium";
  if (title.startsWith("【Premium】")) return true;
  if (title.startsWith("【Free】")) return false;
  return false;
}

function isBlockedByDeps(baseTaskId: string, doneBaseIds: Set<string>): boolean {
  const deps = seedByBaseId[baseTaskId]?.depends_on;
  if (!deps || deps.length === 0) return false;
  for (const dep of deps) {
    const depBase = baseId(dep);
    if (!doneBaseIds.has(depBase)) return true;
  }
  return false;
}

// ───────────────────────────────────────────────────────────────────────────────
// Comparator (tie-breakers): due date → step order → seed index → id
export function compareCandidates(a: NextTaskCandidate, b: NextTaskCandidate): number {
  const at = parseISO(a.dueISO);
  const bt = parseISO(b.dueISO);
  if (at !== null && bt !== null && at !== bt) return at - bt;
  if (at !== null && bt === null) return -1;
  if (at === null && bt !== null) return 1;

  if (a.stepOrder !== b.stepOrder) return a.stepOrder - b.stepOrder;
  if (a.seedIndex !== b.seedIndex) return a.seedIndex - b.seedIndex;

  return a.id.localeCompare(b.id);
}

// ───────────────────────────────────────────────────────────────────────────────
// Public API

export function getNextTask(tasks: PersistedTask[], subscriptionActive: boolean): NextTaskResult {
  // Track completed base ids so deps work regardless of __i suffixes
  const doneBaseIds = new Set(tasks.filter(t => t.done).map(t => baseId(t.id)));

  const candidates: NextTaskCandidate[] = tasks
    .filter(t => !t.done) // exclude completed upfront
    .map<NextTaskCandidate>((t) => {
      const bid = baseId(t.id);
      const si = seedByBaseId[bid];
      const seedIndex = indexByBaseId[bid] ?? Number.MAX_SAFE_INTEGER;

      const isPremium = isPremiumFrom(t.title, si);
      const isBlocked = isBlockedByDeps(bid, doneBaseIds);
      const isLocked = isPremium && !subscriptionActive;

      return {
        id: t.id, // keep original (with __iN) for navigation/focus
        title: t.title.replace(/^【(Free|Premium)】\s*/, ""), // cleaner banner text
        dueISO: t.dueISO || null,
        seedIndex,
        stepOrder: stepOrderOf(si, seedIndex),
        isPremium,
        isBlocked,
        isLocked,
        routeHint: si?.route,
      };
    })
    .filter(c => !c.isBlocked)
    .filter(c => !c.isLocked)
    .sort(compareCandidates);

  return { next: candidates[0] ?? null, candidates };
}

export function goToTask(
  navigation: { navigate: (screen: string, params?: any) => void },
  task: NextTaskCandidate
) {
  if (task.routeHint) { navigation.navigate(task.routeHint); return; }
  navigation.navigate("ActionPlan", { focusTaskId: task.id });
}

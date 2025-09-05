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
// Helpers (SAFE against malformed seed rows)

const baseId = (id: unknown): string =>
  typeof id === "string" ? id.replace(/__i\d+$/, "") : "";

const isValidSeedItem = (x: any): x is SeedItem =>
  x && typeof x.id === "string" && x.id.trim().length > 0;

const RAW: any = (seed as any) ?? [];
const SEED: SeedItem[] = Array.isArray(RAW) ? RAW.filter(isValidSeedItem) : [];

if (__DEV__ && Array.isArray(RAW)) {
  const dropped = RAW.length - SEED.length;
  if (dropped > 0) {
    // Useful hint if your seed carries section dividers or comments without ids
    // eslint-disable-next-line no-console
    console.warn(`[nextTasks] Dropped ${dropped} invalid seed row(s) (missing id).`);
  }
}

const seedByBaseId: Record<string, SeedItem> = Object.create(null);
const indexByBaseId: Record<string, number> = Object.create(null);
SEED.forEach((item, i) => {
  const bid = baseId(item.id);
  if (!bid) return; // skip defensive
  seedByBaseId[bid] = item;
  indexByBaseId[bid] = i;
});

const stripPrefix = (s: string) => String(s || '').replace(/^【(Free|Premium)】\s*/, '');
const seedByTitle: Record<string, SeedItem> = Object.create(null);
SEED.forEach((item) => {
  seedByTitle[stripPrefix(item.title)] = item;
});


function stepOrderOf(item: SeedItem | undefined, fallbackIndex: number): number {
  if (!item) return fallbackIndex;
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
  if (typeof title === "string" && title.startsWith("【Premium】")) return true;
  if (typeof title === "string" && title.startsWith("【Free】")) return false;
  return false;
}

function isBlockedByDeps(baseTaskId: string, doneBaseIds: Set<string>): boolean {
  const si = seedByBaseId[baseTaskId];
  const deps = si?.depends_on;
  if (!deps || deps.length === 0) return false;
  for (const dep of deps) {
    const depBase = baseId(dep);
    if (depBase && !doneBaseIds.has(depBase)) return true;
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
  const doneBaseIds = new Set(tasks.filter(t => t.done).map(t => baseId(t.id)));

  const candidates: NextTaskCandidate[] = tasks
    .filter(t => !t.done)
    .map<NextTaskCandidate>((t) => {
      const bid = baseId(t.id);
let si = seedByBaseId[bid];
if (!si) {
  si = seedByTitle[stripPrefix(String(t.title))];
}

      const seedIndex = indexByBaseId[bid] ?? Number.MAX_SAFE_INTEGER;

      const isPremium = isPremiumFrom(t.title, si);
      const deps: string[] = si?.depends_on ?? [];
const isBlocked = deps.some(d => {
  const depSeed = seedByBaseId[baseId(d)] ?? seedByTitle[stripPrefix(String(d))];
  const depBase = depSeed?.id ? baseId(depSeed.id) : baseId(String(d));
  return !doneBaseIds.has(depBase);
});

      const isLocked = isPremium && !subscriptionActive;

      return {
        id: t.id,
        title: String(t.title || "").replace(/^【(Free|Premium)】\s*/, ""),
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

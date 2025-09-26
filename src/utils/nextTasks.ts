// src/utils/nextTasks.ts
import seed from "../data/action_plan.seed.json";

/** Public types */
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
  depends_on?: string[];      // id(s) or titles (legacy tolerated)
  step?: number | string;     // order hint
  route?: string;
};
export type NextTaskCandidate = {
  id: string;                 // original persisted id (may have __iN)
  title: string;
  dueISO: string | null;
  seedIndex: number;
  stepOrder: number;          // for sorting
  stepNumber: number;         // for focus-floor filtering
  isPremium: boolean;
  isBlocked: boolean;
  isLocked: boolean;
  routeHint?: string;
};
export type NextTaskResult = {
  next: NextTaskCandidate | null;
  candidates: NextTaskCandidate[];
};

/** Helpers */
const baseId = (id: unknown): string =>
  typeof id === "string" ? id.replace(/__i\d+$/, "") : "";

const stripPrefix = (s: string) =>
  String(s || "").replace(/^【(Free|Premium)】\s*/, "");

/** Seed ingestion — DO NOT drop rows without id */
type SeedLoose = Partial<SeedItem> & { title?: string; id?: string };

const RAW: SeedLoose[] = Array.isArray(seed as any) ? (seed as any) : [];

// Index by id and by title, and keep their positions for seedIndex fallback
const seedByBaseId: Record<string, SeedLoose> = Object.create(null);
const indexByBaseId: Record<string, number> = Object.create(null);
const seedByTitle: Record<string, SeedLoose> = Object.create(null);
const indexByTitle: Record<string, number> = Object.create(null);

RAW.forEach((item, i) => {
  if (!item) return;
  if (typeof item.title === "string") {
    const t = stripPrefix(item.title);
    seedByTitle[t] = item;
    indexByTitle[t] = i;
  }
  if (typeof item.id === "string" && item.id.trim()) {
    const bid = baseId(item.id);
    seedByBaseId[bid] = item;
    indexByBaseId[bid] = i;
  }
});

function stepOrderOf(item: SeedLoose | undefined, fallbackIndex: number): number {
  if (!item) return fallbackIndex;
  const s: any = (item as any).step;
  if (typeof s === "number" && Number.isFinite(s)) return s;
  if (typeof s === "string") {
    const n = parseInt(s.replace(/\D+/g, ""), 10);
    if (Number.isFinite(n)) return n;
  }
  return fallbackIndex;
}

function stepNumberOf(item: SeedLoose | undefined): number {
  if (!item) return 1; // default to Step 1 if unspecified
  const s: any = (item as any).step;
  if (typeof s === "number" && Number.isFinite(s)) return s;
  if (typeof s === "string") {
    const n = parseInt(s.replace(/\D+/g, ""), 10);
    if (Number.isFinite(n)) return n;
  }
  return 1;
}

function parseISO(s?: string | null): number | null {
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

function isPremiumFrom(title: string, seedItem?: SeedLoose): boolean {
  if (seedItem && (seedItem as any).access) {
    return (seedItem as any).access === "premium";
  }
  if (typeof title === "string" && title.startsWith("【Premium】")) return true;
  if (typeof title === "string" && title.startsWith("【Free】")) return false;
  return false;
}

/** Comparator (tie-breakers): due date → step order → seed index → id */
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

/** Core API */
export function getNextTask(tasks: PersistedTask[], subscriptionActive: boolean): NextTaskResult {
  const doneBaseIds = new Set(tasks.filter(t => t.done).map(t => baseId(t.id)));
const doneTitles = new Set(
  tasks
    .filter(t => t.done)
    .map(t => String(t.title || "").replace(/^【(Free|Premium)】\s*/, ""))
);

  const candidates: NextTaskCandidate[] = tasks
    .filter(t => !t.done)
    .map<NextTaskCandidate>((t) => {
      const bid = baseId(t.id);
      const normTitle = stripPrefix(String(t.title || ""));

      // Prefer id lookup; fall back to title lookup
      const si: SeedLoose | undefined = seedByBaseId[bid] ?? seedByTitle[normTitle];

      // Compute stable seed index from id OR title
      const seedIndex =
        (bid && bid in indexByBaseId) ? indexByBaseId[bid] :
        (normTitle in indexByTitle)    ? indexByTitle[normTitle] :
        Number.MAX_SAFE_INTEGER;

      // Dependencies: accept seed ids or legacy titles
const deps: string[] = (si?.depends_on as string[] | undefined) ?? [];
const isBlocked = deps.some(d => {
  const depSeed =
    seedByBaseId[baseId(d)] ??
    seedByTitle[String(d).replace(/^【(Free|Premium)】\s*/, "")];

  const depBase = depSeed?.id ? baseId(depSeed.id) : "";
  const depTitle = String(depSeed?.title ?? d).replace(/^【(Free|Premium)】\s*/, "");

  // Satisfied if either the dep's ID is done OR its normalized title is done
  const satisfiedById = depBase ? doneBaseIds.has(depBase) : false;
  const satisfiedByTitle = doneTitles.has(depTitle);

  return !(satisfiedById || satisfiedByTitle);
});

      const isPremium = isPremiumFrom(normTitle, si);
      const isLocked = isPremium && !subscriptionActive;

      return {
        id: t.id,
        title: normTitle,
        dueISO: t.dueISO || null,
        seedIndex,
        stepOrder: stepOrderOf(si, seedIndex),
        stepNumber: stepNumberOf(si),
        isPremium,
        isBlocked,
        isLocked,
        routeHint: (si as any)?.route,
      };
    })
    .filter(c => !c.isBlocked)
    // NOTE: do NOT filter out locked — banner may point to Premium; tap -> Paywall
    .sort(compareCandidates);

  return { next: candidates[0] ?? null, candidates };
}

/**
 * Centralized navigation for Action Plan taps.
 * - Premium + unsubscribed -> Paywall (with { from: task.id })
 * - Otherwise -> routeHint (if set) or fall back to ActionPlan focus
 */


export function goToTask(

  navigation: { navigate: (screen: string, params?: any) => void },
  task: NextTaskCandidate,
  isSubscribed: boolean
) {
  if (task.isPremium && !isSubscribed) {
    navigation.navigate("Paywall", { from: task.id });
    return;
  }
  if (task.routeHint) {
    navigation.navigate(task.routeHint);
    return;
  }
  navigation.navigate("ActionPlan", { focusTaskId: task.id });
}

import { getNextTask, compareCandidates, PersistedTask } from "./nextTasks";

jest.mock("../data/action_plan.seed.json", () => ([
  { id: "01_noc_pick",       title: "Pick your NOC", access: "free",    due_offset_days: 0,  step: 1, route: "QuickCheck" },
  { id: "02_eca_start",      title: "Start ECA",     access: "premium", due_offset_days: 7,  step: 2, depends_on: ["01_noc_pick"], route: "ECAWizard" },
  { id: "03_language_book",  title: "Book IELTS/TEF",access: "premium", due_offset_days: 14, step: 3, depends_on: ["02_eca_start"], route: "LanguagePlanner" },
  { id: "04_pof_setup",      title: "Set up PoF",    access: "free",    due_offset_days: 10, step: 4 },
]), { virtual: true });

const t = (p: Partial<PersistedTask>): PersistedTask => ({
  id: "x",
  title: "【Free】 X",
  baseISO: "2025-09-01T09:00:00.000Z",
  offsetDays: 0,
  dueISO: "2025-09-01T09:00:00.000Z",
  done: false,
  ...p,
});

test("compareCandidates tie-breakers", () => {
  const a = { id: "a", title: "A", dueISO: "2025-09-10T09:00:00.000Z", seedIndex: 2, stepOrder: 2, stepNumber: 2, isPremium: false, isBlocked: false, isLocked: false };
  const b = { id: "b", title: "B", dueISO: "2025-09-09T09:00:00.000Z", seedIndex: 1, stepOrder: 1, stepNumber: 1, isPremium: false, isBlocked: false, isLocked: false };
  expect([a, b].sort(compareCandidates)[0].id).toBe("b");
});

test("getNextTask gates premium + respects deps", () => {
  const tasks: PersistedTask[] = [
    t({ id: "01_noc_pick__i1",      title: "【Free】 Pick your NOC",     dueISO: "2025-09-02T09:00:00.000Z", done: true  }),
    t({ id: "02_eca_start__i1",     title: "【Premium】 Start ECA",      dueISO: "2025-09-03T09:00:00.000Z", done: false }),
    t({ id: "03_language_book__i1", title: "【Premium】 Book IELTS/TEF", dueISO: "2025-09-04T09:00:00.000Z", done: false }),
    // PoF due AFTER ECA so the gating effect is visible
    t({ id: "04_pof_setup__i1",     title: "【Free】 Set up PoF",        dueISO: "2025-09-05T09:00:00.000Z", done: false }),
  ];
  // Unsubscribed → premium locked → PoF is next
  expect(getNextTask(tasks, false).next?.id).toBe("02_eca_start__i1");
  // Subscribed → ECA now accessible and due earlier than PoF → ECA wins
  expect(getNextTask(tasks, true).next?.id).toBe("02_eca_start__i1");
});


test("when due dates are equal or missing: earlier step, then lower seed index", () => {
  const a = { id: "a", title: "A", dueISO: null, seedIndex: 5, stepOrder: 3, stepNumber: 3, isPremium: false, isBlocked: false, isLocked: false };
  const b = { id: "b", title: "B", dueISO: null, seedIndex: 1, stepOrder: 2, stepNumber: 2, isPremium: false, isBlocked: false, isLocked: false };
  const c = { id: "c", title: "C", dueISO: null, seedIndex: 0, stepOrder: 2, stepNumber: 2, isPremium: false, isBlocked: false, isLocked: false };
  // step wins over index, then index between b & c
  expect([a, b, c].sort(compareCandidates).map(x => x.id)).toEqual(["c", "b", "a"]);
});

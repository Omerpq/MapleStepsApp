// src/utils/applySeed.ts
export type Access = 'free' | 'premium';

export interface SeedTask {
  title: string;
  access: Access;
  due_offset_days: number;
  depends_on?: string[];
}

export interface Task {
  id: string;
  title: string;        // prefixed with 【Free】/【Premium】
  baseISO: string;      // anchor date for due calculations (local at DUE_HOUR)
  offsetDays: number;   // editable by user
  dueISO: string;       // computed from baseISO + offsetDays at DUE_HOUR
  done: boolean;
}

const VERSION_TAG = 'v1';

// Default due time for all tasks (change if you like)
export const DUE_HOUR = 9;   // 9am local
export const DUE_MINUTE = 0; // :00

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function atFixedLocalTime(d: Date) {
  const x = new Date(d);
  x.setHours(DUE_HOUR, DUE_MINUTE, 0, 0);
  return x;
}

export function calcDueISO(baseISO: string, offsetDays: number): string {
  const base = new Date(baseISO);
  const d = new Date(base);
  d.setDate(d.getDate() + offsetDays);
  // ensure we keep fixed time for DST boundaries, etc.
  d.setHours(DUE_HOUR, DUE_MINUTE, 0, 0);
  return d.toISOString();
}

/**
 * Expand seed to Task[] with:
 * - stable ids
 * - 【Free】/【Premium】 prefixes
 * - baseISO = today at DUE_HOUR
 * - offsetDays = due_offset_days (editable later)
 * - dueISO = calc(baseISO, offsetDays)
 * - sorted by offset, then original index (keep seed order for ties)
 */
export function applySeed(seed: SeedTask[], today: Date = new Date()): Task[] {
  const base = atFixedLocalTime(today).toISOString();

  const withMeta = seed.map((item, index) => {
    const id = `${slugify(item.title)}__${item.access}__d${item.due_offset_days}__${VERSION_TAG}__i${index}`;
    const prefix = item.access === 'free' ? '【Free】' : '【Premium】';
    const offsetDays = item.due_offset_days;
    const dueISO = calcDueISO(base, offsetDays);
    return {
      task: {
        id,
        title: `${prefix} ${item.title}`,
        baseISO: base,
        offsetDays,
        dueISO,
        done: false,
      },
      offset: offsetDays,
      index,
    };
  });

  withMeta.sort((a, b) => (a.offset - b.offset) || (a.index - b.index));
  return withMeta.map(x => x.task);
}

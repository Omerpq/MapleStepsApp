// src/services/eca.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as Notifications from './notifications';
import { ECA_GUIDES_URL } from './config'; // added in Step 1c below

type NotifAPI = {
  // support either of these cancel shapes
  cancel?: (key: string) => Promise<void>;
  cancelByKey?: (key: string) => Promise<void>;
  // support either of these schedule shapes
  reschedule?: (key: string, dateISO: string, payload: { title: string; body: string }) => Promise<void>;
  schedule?: (key: string, dateISO: string, payload: { title: string; body: string }) => Promise<string | void>;
};
const N = Notifications as unknown as NotifAPI;

// -------------------------
// Keys
// -------------------------
const ECA_STATE_KEY = 'ms.eca.state.v1';
const ECA_GUIDES_CACHE_KEY = 'ms.eca.guides.cache.v1';
const ECA_GUIDES_META_KEY = 'ms.eca.guides.meta.v1';
const ECA_NOTIF_MAP_KEY = 'ms.eca.notifications.map.v1'; // local map: ecaItemKey -> localNotificationId
export const ECA_TASK_ID = '03_eca_choose_and_start';


// -------------------------
// Types (aligned with A4-style loader contract)
// -------------------------
export type LoaderSource = 'remote' | 'cache' | 'local';
export type LoaderMeta = {
  etag?: string;
  last_modified?: string;
  status?: 200 | 304;
};
export type LoaderResult<T> = {
  source: LoaderSource;
  cachedAt: string; // ISO
  meta?: LoaderMeta;
  data: T;
};

export type EcaGuideItem = {
  id: string;
  title: string;
  note?: string;
  default_offset_days?: number;
};

export type EcaGuideBody = {
  id: string; // e.g., "wes"
  name: string; // e.g., "WES"
  items: EcaGuideItem[];
  notes?: string;
  link?: string;
};

export type EcaGuides = {
  bodies: EcaGuideBody[];
  version: string;
  updated: string; // ISO
};

export type EcaItemStatus = 'not_started' | 'in_progress' | 'done';

export type EcaStateItem = {
  id: string;                 // matches EcaGuideItem.id
  title: string;
  status: EcaItemStatus;
  targetISO?: string;         // 09:00 local scheduled by default
};

export type EcaState = {
  selectedBodyId?: string;
  items: EcaStateItem[];      // bound to the selected body
  updatedAt: string;          // ISO
};

// Focus floor for "What's Next" banner (persisted)
export const ECA_FOCUS_FLOOR_KEY = 'ms.tasks.focus_floor.v1';

export async function nudgeFocusToStep(minStep: number): Promise<void> {
  await AsyncStorage.setItem(ECA_FOCUS_FLOOR_KEY, String(minStep));
}


// -------------------------
// Helpers
// -------------------------

const nowISO = () => new Date().toISOString();

const dayAtNineLocal = (isoLike: string) => {
  const d = new Date(isoLike);
  // normalize to 09:00 local on that same date
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
};

const ecaItemNotifKey = (bodyId: string, itemId: string) => `eca:${bodyId}:${itemId}`;

// Internal notification map: ecaKey -> localNotificationId
type NotifMap = Record<string, string>;

// -------------------------
// Public API
// -------------------------

/**
 * Fetch guides with Remote → Cache → Local behavior and conditional validators.
 * Matches the A4 loader shape: { source, cachedAt, meta, data }.
 */
export async function loadGuides(): Promise<LoaderResult<EcaGuides>> {
  // 1) try Remote (with validators)
  try {
    const metaRaw = await AsyncStorage.getItem(ECA_GUIDES_META_KEY);
    const meta = metaRaw ? JSON.parse(metaRaw) as LoaderMeta : {};
    const headers: Record<string, string> = {};
    if (meta.etag) headers['If-None-Match'] = meta.etag;
    if (meta.last_modified) headers['If-Modified-Since'] = meta.last_modified;

    const res = await fetch(ECA_GUIDES_URL, { headers });
    if (res.status === 304) {
      const cachedRaw = await AsyncStorage.getItem(ECA_GUIDES_CACHE_KEY);
      if (cachedRaw) {
        const { data, cachedAt } = JSON.parse(cachedRaw) as LoaderResult<EcaGuides>;
        return { source: 'cache', cachedAt, meta: { ...meta, status: 304 }, data };
      }
      // No cache even though 304 → fall through to Local
    }
    if (res.ok) {
      const data = await res.json() as EcaGuides;
      const etag = res.headers.get('ETag') ?? undefined;
      const last_modified = res.headers.get('Last-Modified') ?? undefined;
      const out: LoaderResult<EcaGuides> = {
        source: 'remote',
        cachedAt: nowISO(),
        meta: { etag, last_modified, status: 200 },
        data,
      };
      await AsyncStorage.multiSet([
        [ECA_GUIDES_CACHE_KEY, JSON.stringify(out)],
        [ECA_GUIDES_META_KEY, JSON.stringify(out.meta)],
      ]);
      return out;
    }
    // If Remote failed but not fatal → try Cache next
  } catch {
    // ignore → try Cache
  }

  // 2) try Cache
  const cachedRaw = await AsyncStorage.getItem(ECA_GUIDES_CACHE_KEY);
  if (cachedRaw) {
    const { data, cachedAt, meta } = JSON.parse(cachedRaw) as LoaderResult<EcaGuides>;
    return { source: 'cache', cachedAt, meta, data };
  }

  // 3) fallback Local (bundled)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const data = require('../data/guides/eca.json') as EcaGuides;
  return { source: 'local', cachedAt: nowISO(), data };
}

/** Load persisted wizard state (or an empty state). */
export async function loadState(): Promise<EcaState> {
  const raw = await AsyncStorage.getItem(ECA_STATE_KEY);
  if (raw) return JSON.parse(raw) as EcaState;
  return { items: [], updatedAt: nowISO() };
}

/** Select an ECA body and instantiate its checklist. */
export async function selectBody(bodyId: string): Promise<EcaState> {
  const guides = await loadGuides();
  const body = guides.data.bodies.find(b => b.id === bodyId);
  if (!body) throw new Error('Unknown ECA body');

  const items: EcaStateItem[] = body.items.map(it => ({
    id: it.id,
    title: it.title,
    status: 'not_started',
    targetISO: it.default_offset_days != null
      ? dayAtNineLocal(new Date(Date.now() + it.default_offset_days * 86400000).toISOString())
      : undefined,
  }));

  const next: EcaState = { selectedBodyId: bodyId, items, updatedAt: nowISO() };
  await AsyncStorage.setItem(ECA_STATE_KEY, JSON.stringify(next));
  // reconcile notifications for prefilled targets
  await reconcileNotifications(next);
  await syncActionPlanEcaChoose(ECA_TASK_ID);

  return next;
}
/** Clear the selected ECA body (wizard-only action).
 *  - Empties the wizard checklist & cancels reminders
 *  - Unchecks the Action-Plan “Pick your ECA body …” row
 */
export async function clearSelectedBody(): Promise<EcaState> {
  const next: EcaState = {
    selectedBodyId: undefined,
    items: [],
    updatedAt: nowISO(),
  };

  // Persist cleared state
  await AsyncStorage.setItem(ECA_STATE_KEY, JSON.stringify(next));

  // 🔔 Cancel any outstanding ECA item reminders (reconcile with empty desired set)
  await reconcileNotifications(next);

  // 🔄 Flip the AP row to Not-done (this is the ONLY path that may uncheck it)
  await syncActionPlanEcaChoose(ECA_TASK_ID);

  return next;
}

/** Update item status (Not started / In progress / Done). */
export async function setItemStatus(itemId: string, status: EcaItemStatus): Promise<EcaState> {
  const state = await loadState();
  if (!state.selectedBodyId) throw new Error('Select ECA body first');

  state.items = state.items.map(it => it.id === itemId ? { ...it, status } : it);
  state.updatedAt = nowISO();
  await AsyncStorage.setItem(ECA_STATE_KEY, JSON.stringify(state));

  // 🔔 make sure reminders are updated (cancel if done, schedule if due & not done)
  await reconcileNotifications(state);

  return state;
}


/** Set/clear a target date for an item and (re)schedule a 09:00 local reminder. */
export async function setItemTarget(itemId: string, isoOrUndefined?: string): Promise<EcaState> {
  const state = await loadState();
  if (!state.selectedBodyId) throw new Error('Select ECA body first');

  const targetISO = isoOrUndefined ? dayAtNineLocal(isoOrUndefined) : undefined;
  state.items = state.items.map(it => it.id === itemId ? { ...it, targetISO } : it);
  state.updatedAt = nowISO();
  await AsyncStorage.setItem(ECA_STATE_KEY, JSON.stringify(state));

  await reconcileNotifications(state);
  return state;
}

/** Convenience: mark all items as Done. */
export async function markAllDone(): Promise<EcaState> {
  const state = await loadState();
  state.items = state.items.map(it => ({ ...it, status: 'done' }));
  state.updatedAt = nowISO();
  await AsyncStorage.setItem(ECA_STATE_KEY, JSON.stringify(state));
  await reconcileNotifications(state); // will cancel any future reminders
  return state;
}

/**
 * Hook for Action Plan dependencies:
 * If the wizard for bodyId is fully Done, mark the given ActionPlan taskId as done=true in ms.tasks.v1.
 * Pass the exact task id from your seed (e.g., "03_eca_choose_and_start").
 */
export async function markActionPlanTaskIfComplete(taskId: string): Promise<void> {
  const state = await loadState();
  if (!state.selectedBodyId) return;

  // Only proceed when ALL wizard items are done
  const allDone = state.items.length > 0 && state.items.every(it => it.status === 'done');
  if (!allDone) return;

  const raw = await AsyncStorage.getItem('ms.tasks.v1');
  if (!raw) return;

  // Fallbacks: match by base id or by canonical title (prefix removed)
  const base = (s: string) => String(s || '').replace(/__i\d+$/, '');
  const strip = (s: string) => String(s || '').replace(/^【(Free|Premium)】\s*/, '');

  // Canonical title from seed (keep EXACT)
  const ECA_TASK_TITLE =
    'Pick your ECA body (WES/ICES/IQAS/ICAS/CES/others) based on degree & region';

  try {
    const tasks = JSON.parse(raw) as Array<{ id: string; title?: string; done?: boolean }>;
    let changed = false;

    const next = tasks.map(t => {
      const byId = base(t.id) === base(taskId);
      const byTitle = strip(String(t.title || '')) === ECA_TASK_TITLE;
      if ((byId || byTitle) && !t.done) {
        changed = true;
        return { ...t, done: true };
      }
      return t;
    });

    if (changed) {
      await AsyncStorage.setItem('ms.tasks.v1', JSON.stringify(next));
    }

    // 💡 Ensure the banner focuses Step 2 going forward
    await AsyncStorage.setItem('ms.tasks.focus_floor.v1', '2');

  } catch {
    // ignore shape issues safely
  }
}

/**
 * Keep the Action Plan row ("03_eca_choose_and_start") aligned with wizard selection.
 * - done = true when ANY ECA body is selected
 * - done = false when selection is cleared
 * (This lets you uncheck only via "Change ECA body", not by manual toggling on Action Plan.)
 */
export async function syncActionPlanEcaChoose(taskId: string): Promise<void> {
  const rawState = await AsyncStorage.getItem('ms.eca.state.v1');
  const state = rawState ? (JSON.parse(rawState) as EcaState) : null;

  const selected = Boolean(state?.selectedBodyId); // body chosen?
  const rawTasks = await AsyncStorage.getItem('ms.tasks.v1');
  if (!rawTasks) return;

  const base = (s: string) => String(s || '').replace(/__i\d+$/, '');
  const strip = (s: string) => String(s || '').replace(/^【(Free|Premium)】\s*/, '');
  const ECA_TASK_TITLE =
    'Pick your ECA body (WES/ICES/IQAS/ICAS/CES/others) based on degree & region';

  try {
    const tasks = JSON.parse(rawTasks) as Array<{ id: string; title?: string; done?: boolean }>;
    let changed = false;

    const next = tasks.map(t => {
      const byId = base(t.id) === base(taskId);
      const byTitle = strip(String(t.title || '')) === ECA_TASK_TITLE;
      if (byId || byTitle) {
        if (t.done !== selected) { changed = true; return { ...t, done: selected }; }
      }
      return t;
    });

    if (changed) {
      await AsyncStorage.setItem('ms.tasks.v1', JSON.stringify(next));
    }

    // Optional: if selected, nudge banner to Step 2
    if (selected) {
      await AsyncStorage.setItem('ms.tasks.focus_floor.v1', '2');
    }
  } catch {
    // ignore malformed storage safely
  }
}



// -------------------------
// Notifications wiring
// -------------------------
async function reconcileNotifications(state: EcaState) {
  const mapRaw = await AsyncStorage.getItem(ECA_NOTIF_MAP_KEY);
  const notifMap: NotifMap = mapRaw ? JSON.parse(mapRaw) : {};

  // Build desired set
  const desired: Array<{ key: string; dateISO: string; title: string }> = [];
  if (state.selectedBodyId) {
    for (const it of state.items) {
      if (it.targetISO && it.status !== 'done') {
        desired.push({
          key: ecaItemNotifKey(state.selectedBodyId, it.id),
          dateISO: it.targetISO,
          title: `ECA: ${it.title}`,
        });
      }
    }
  }

  // Cancel orphaned
  const desiredKeys = new Set(desired.map(d => d.key));
  for (const existingKey of Object.keys(notifMap)) {
    if (!desiredKeys.has(existingKey)) {
if (N.cancel)      await N.cancel(existingKey);
else if (N.cancelByKey) await N.cancelByKey(existingKey);
      delete notifMap[existingKey];
    }
  }

  // Schedule / update desired
  for (const d of desired) {
    const bodyText =
  Platform.select({
    ios: 'Tap to review your ECA checklist item.',
    android: 'Tap to review your ECA checklist item.',
    default: 'Tap to review your ECA checklist item.',
  }) || 'Tap to review your ECA checklist item.';

if (N.reschedule) {
  await N.reschedule(d.key, d.dateISO, { title: d.title, body: bodyText });
} else if (N.schedule) {
  await N.schedule(d.key, d.dateISO, { title: d.title, body: bodyText });
}

    notifMap[d.key] = d.key; // we rely on Notifications service’s own map; store key for orphan cleanup
  }

  await AsyncStorage.setItem(ECA_NOTIF_MAP_KEY, JSON.stringify(notifMap));
}

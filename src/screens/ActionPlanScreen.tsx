// src/screens/ActionPlanScreen.tsx
import { useNavigation, useFocusEffect } from '@react-navigation/native';

import { ECA_FOCUS_FLOOR_KEY, ECA_TASK_ID } from '../services/eca';

import * as ECA from '../services/eca';

import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';

import { View, Text, FlatList, Pressable, ActivityIndicator, StyleSheet, Switch, useWindowDimensions, Platform } from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';

import { getNextTask, goToTask, NextTaskCandidate, PersistedTask } from '../utils/nextTasks';


import { applySeed, Task, SeedTask, calcDueISO } from '../utils/applySeed';
import rawSeed from '../data/action_plan.seed.json';


import { notifications } from '../services/notifications';

import { isSubscribed as getIsSubscribed } from '../services/payments';

import { getPersistedState } from '../services/payments';

import { __devSetSubscribed } from '../services/payments';



// Wraps rows; on web we render a <div> to avoid nested <button> warnings.
// We still handle clicks on web via onClick.
// at top: ensure Pressable is imported from 'react-native'

type RowTouchableProps = {
  disabled?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: any;
  children: React.ReactNode;
};

const RowTouchable: React.FC<RowTouchableProps> = ({
  disabled,
  onPress,
  accessibilityLabel,
  style,
  children,
}) => {
  if (Platform.OS === "web") {
    const handleKeyDown = (e: any) => {
      if (!disabled && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault?.();
        onPress?.();
      }
    };

    // NOTE: Cast web-only props so TS doesn’t complain on RN types
    const webOnlyProps = {
      onClick: disabled ? undefined : onPress,
      onKeyDown: handleKeyDown,
      role: "button",
      tabIndex: disabled ? -1 : 0,
      "aria-disabled": disabled ? "true" : "false",
      "aria-label": accessibilityLabel,
    } as any;

    return (
      <View
        {...webOnlyProps}
        style={style}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
      >
        {children}
      </View>
    );
  }

  return (
    <Pressable
      disabled={!!disabled}
      onPress={onPress}
      style={style}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      {children}
    </Pressable>
  );
};




const seed = rawSeed as unknown as SeedTask[];
const STORAGE_KEY = 'ms.tasks.v1';
const VIEWMODE_KEY = 'ms.tasks.viewmode.v1';

type ViewMode = 'due' | 'suggested';

// --- Sorters ---
function sortByDue(arr: Task[]) {
  return [...arr].sort((a, b) => {
    const ad = new Date(a.dueISO).getTime();
    const bd = new Date(b.dueISO).getTime();
    if (ad !== bd) return ad - bd;
    const ai = Number(a.id.split('__i').pop());
    const bi = Number(b.id.split('__i').pop());
    return (isNaN(ai) || isNaN(bi)) ? a.id.localeCompare(b.id) : ai - bi;
  });
}
function sortBySuggested(arr: Task[]) {
  return [...arr].sort((a, b) => {
    const ai = Number(a.id.split('__i').pop());
    const bi = Number(b.id.split('__i').pop());
    if (!isNaN(ai) && !isNaN(bi)) return ai - bi;
    return a.id.localeCompare(b.id);
  });
}

/** Tiny chip with tooltip on hover (web) or long-press (mobile) */
function Chip({
  label,
  onPress,
  tip,
  primary = false,
}: {
  label: string;
  onPress: () => void;
  tip: string;
  primary?: boolean;
}) {
  const [showTip, setShowTip] = useState(false);
  const hideTimer = useRef<NodeJS.Timeout | null>(null);

  const hideLater = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowTip(false), 1200);
  };

  return (
    <View style={styles.tooltipWrap}>
      <Pressable
        onPress={onPress}
        onLongPress={() => { setShowTip(true); hideLater(); }}
        onHoverIn={() => setShowTip(true)}
        onHoverOut={() => setShowTip(false)}
        style={primary ? styles.chipPrimary : styles.chipSecondary}
        accessibilityLabel={label}
      >
        <Text style={primary ? styles.chipPrimaryText : styles.chipSecondaryText}>{label}</Text>
      </Pressable>
      {showTip && (
        <View style={styles.tooltip}>
          <Text style={styles.tooltipText}>{tip}</Text>
        </View>
      )}
    </View>
  );
}


// DEV: hard re-seed Action Plan from bundled seed (filters rows without `id`)
async function hardReseedActionPlan() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const seed: Array<any> = require('../data/action_plan.seed.json');

  const now = new Date();
  const atNine = (d: Date) => {
    const x = new Date(d);
    x.setHours(9, 0, 0, 0);
    return x.toISOString();
  };
  const addDays = (d: Date, days: number) => {
    const x = new Date(d);
    x.setDate(x.getDate() + days);
    return x;
  };

  const tasks = seed
    .filter((row) => !!row.id) // keep only valid rows (drop those without id)
    .map((row) => {
      const offsetDays = Number(row.due_offset_days ?? 0) || 0;
      const baseISO = now.toISOString();
      const dueISO = atNine(addDays(now, offsetDays));
      return {
        id: String(row.id),
        title: String(row.title || ''),
        baseISO,
        offsetDays,
        dueISO,
        done: false,
        // carry optional fields your UI may read
        step: row.step,
        route: row.route,
        depends_on: row.depends_on,
        access: row.access,
      };
    });

  await AsyncStorage.setItem('ms.tasks.v1', JSON.stringify(tasks));
  // Optional: also reset the focus floor if you want the banner to consider Step 3 immediately:
  // await AsyncStorage.removeItem('ms.tasks.focus_floor.v1');
}

export default function ActionPlanScreen() {
  const navigation = useNavigation<any>();

// inside ActionPlanScreen()
const [isSubscribed, setIsSubscribed] = useState(false);

  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('due'); // default: due-date order
  const { width } = useWindowDimensions();
  const isCompact = width < 380;
  
  // Replace with real subscription flag when available
  const [focusFloor, setFocusFloor] = useState<number | null>(null);
  const [ecaProgress, setEcaProgress] = useState<{ done: number; total: number } | null>(null);


  const reconcilingRef = useRef(false);

  // --- Helpers for premium/blocked visuals ---
const stripPrefix = (s: string) => String(s || '').replace(/^【(Free|Premium)】\s*/, '');
const baseId = (id: string) => String(id || '').replace(/__i\d+$/, '');

// Build seed indexes by id and by (prefix-stripped) title
const seedIndex = useMemo(() => {
  const byId = new Map<string, any>();
  const byTitle = new Map<string, any>();
  (rawSeed as any[]).forEach((r: any) => {
    if (!r) return;
    if (r.id) byId.set(baseId(r.id), r);
    if (r.title) byTitle.set(stripPrefix(r.title), r);
  });
  return { byId, byTitle };
}, []);

const doneBaseIds = useMemo(
  () => new Set((tasks ?? []).filter(t => t.done).map(t => baseId(t.id))),
  [tasks]
);
const doneTitles = useMemo(
  () => new Set((tasks ?? []).filter(t => t.done).map(t => stripPrefix(t.title))),
  [tasks]
);

const isPremiumTask = useCallback(
  (t: Task) => typeof t.title === 'string' && t.title.startsWith('【Premium】'),
  []
);

const findSeedForTask = useCallback(
  (t: Task) => seedIndex.byId.get(baseId(t.id)) ?? seedIndex.byTitle.get(stripPrefix(t.title)),
  [seedIndex]
);

// Returns the list of unmet prerequisite titles for this task
const getUnmetDeps = useCallback(
  (t: Task): string[] => {
    const row = findSeedForTask(t);
    const deps: string[] = row?.depends_on ?? [];
    const unmet: string[] = [];
    deps.forEach(d => {
      const depRow =
        seedIndex.byId.get(baseId(d)) ?? seedIndex.byTitle.get(stripPrefix(d));
      const depBase = depRow?.id ? baseId(depRow.id) : baseId(String(d));
      const depTitle = depRow?.title ? stripPrefix(depRow.title) : stripPrefix(String(d));
      if (!(doneBaseIds.has(depBase) || doneTitles.has(depTitle))) {
        unmet.push(depTitle);
      }
    });
    return unmet;
  },
  [findSeedForTask, seedIndex, doneBaseIds, doneTitles]
);

const isBlockedTask = useCallback(
  (t: Task) => getUnmetDeps(t).length > 0,
  [getUnmetDeps]
);

// Parse numeric step from a seed field that could be number or "Step 2" string
const numericStepOf = (s: any): number => {
  if (typeof s === 'number' && Number.isFinite(s)) return s;
  if (typeof s === 'string') {
    const n = parseInt(s.replace(/\D+/g, ''), 10);
    if (Number.isFinite(n)) return n;
  }
  return 1; // default to Step 1 if unspecified
};

// Get step for a candidate using local seed (by id OR title)
const stepForCandidate = (c: NextTaskCandidate): number => {
  const row =
    seedIndex.byId.get(baseId(c.id)) ??
    seedIndex.byTitle.get(stripPrefix(c.title));
  return numericStepOf(row?.step);
};

// Identify the ECA “Pick your body” row, even if the title changes slightly
const isEcaChooseRow = useCallback((t: Task) => {
  const title = stripPrefix(t.title);
  return baseId(t.id) === ECA_TASK_ID || title.startsWith('Pick your ECA body');
}, []);





const toCandidate = useCallback(
  (t: Task): NextTaskCandidate => {
    const row = findSeedForTask(t);
    const unmet = getUnmetDeps(t);
    const blocked = unmet.length > 0;
    const premium = isPremiumTask(t);

    // Derive a numeric step for focus-floor behavior
    const stepNum = (() => {
      const s: any = row?.step;
      if (typeof s === 'number' && Number.isFinite(s)) return s;
      if (typeof s === 'string') {
        const n = parseInt(s.replace(/\D+/g, ''), 10);
        if (Number.isFinite(n)) return n;
      }
      return 1; // default if seed has no explicit step
    })();

    return {
      id: t.id,
      title: stripPrefix(t.title),
      dueISO: t.dueISO ?? null,
      // Not used by goToTask in this screen; safe placeholders
      seedIndex: 0,
      stepOrder: 0,
      stepNumber: stepNum,              // <- added
      isPremium: premium,
      isBlocked: blocked,
      isLocked: premium && !isSubscribed,
      routeHint: row?.route,
    };
  },
  [findSeedForTask, getUnmetDeps, isPremiumTask, isSubscribed]
);

  // Compute "What's Next" (recomputes whenever tasks or subscription change)
  const nextUp = useMemo<NextTaskCandidate | null>(() => {
  if (!tasks) return null;
  const { next, candidates } = getNextTask(
    tasks as unknown as PersistedTask[],
    isSubscribed
  );

  if (focusFloor && candidates.length) {
    // Prefer first candidate whose step (from local seed) is at/after the floor
    const focused = candidates.find(c => stepForCandidate(c) >= focusFloor);
    if (focused) return focused;
  }
  return next;
}, [tasks, isSubscribed, focusFloor, seedIndex]);


const reconcileSchedules = useCallback(async (list: Task[]) => {
  if (reconcilingRef.current) return;     // prevent overlap
  reconcilingRef.current = true;
  try {
    const now = Date.now();
    for (const t of list) {
      if (!t.dueISO) { await notifications.cancel(t.id); continue; }
      const dueMs = new Date(t.dueISO).getTime();
      if (!t.done && dueMs > now) {
        await notifications.reschedule(t.id, t.dueISO, {
          title: 'MapleSteps — Due today',
          body: stripPrefix(t.title),
        });
      } else {
        await notifications.cancel(t.id);
      }
    }
  } finally {
    reconcilingRef.current = false;
  }
}, []);

  const seedNow = useCallback(async () => {
    const expanded = applySeed(seed);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(expanded));
    setTasks(expanded);
    // 🔔 reset all (dev) and schedule future, not-done tasks
    await notifications.cancelAllDev();
    await reconcileSchedules(expanded);
    return expanded.length;
  }, [reconcileSchedules]);

  const sortByMode = useCallback((list: Task[], mode: ViewMode) => {
    return mode === 'due' ? sortByDue(list) : sortBySuggested(list);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      let list: Task[];
      if (raw) {
        list = JSON.parse(raw) as Task[];
      } else {
        await seedNow();
        const seeded = await AsyncStorage.getItem(STORAGE_KEY);
        list = seeded ? (JSON.parse(seeded) as Task[]) : [];
      }




      const v = await AsyncStorage.getItem(VIEWMODE_KEY);
const mode: ViewMode = v === 'suggested' ? 'suggested' : 'due';
setViewMode(mode);
const sorted = sortByMode(list, mode);

// 👇 add these 3 lines
const ffRaw = await AsyncStorage.getItem(ECA_FOCUS_FLOOR_KEY);
const ff = ffRaw ? parseInt(ffRaw, 10) : NaN;
setFocusFloor(Number.isFinite(ff) ? ff : null);

setTasks(sorted);
await reconcileSchedules(sorted);

    } catch {
      await seedNow();
      const seeded = await AsyncStorage.getItem(STORAGE_KEY);
      const list = seeded ? (JSON.parse(seeded) as Task[]) : [];
      const sorted = sortByMode(list, 'due');
      setTasks(sorted);
      setViewMode('due');
      void reconcileSchedules(sorted);
    } finally {
      setLoading(false);
    }
}, [seedNow, sortByMode, reconcileSchedules]);
  useEffect(() => { load(); }, [load]);

  useFocusEffect(
  React.useCallback(() => {
    // Re-read ms.tasks.v1 so changes made by ECA wizard are reflected
    load();
    return () => {};
  }, [load])
);
useFocusEffect(
  useCallback(() => {
    let alive = true;
    (async () => {
      const ok = await getIsSubscribed();   // ← uses the aliased import
      if (alive) setIsSubscribed(ok);       // ← writes the boolean state
    })();
    return () => { alive = false; };
  }, [])
);

useFocusEffect(
  React.useCallback(() => {
    (async () => {
      const s = await ECA.loadState();
      if (s?.selectedBodyId && Array.isArray(s.items) && s.items.length > 0) {
        const total = s.items.length;
        const done = s.items.filter(i => i.status === 'done').length;
        setEcaProgress({ done, total });
        console.log('[debug] ECA progress', { done, total, selected: s.selectedBodyId });
      } else {
        setEcaProgress(null);
        console.log('[debug] ECA progress', null);
      }
    })();
    return () => {};
  }, [])
);

useFocusEffect(
  React.useCallback(() => {
    (async () => {
      try {
        const st = await getPersistedState();
        setIsSubscribed(!!st?.isActive);
      } catch {
        // keep whatever is there if read fails
      }
    })();
    return () => {};
  }, [])
);

  const save = useCallback(async (next: Task[]) => {
    setTasks(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const toggleDone = useCallback(async (id: string) => {
  // Wizard-controlled: ignore manual toggles for the ECA choose row
  if (baseId(id) === ECA_TASK_ID) {
    if (__DEV__) console.log('[guard] ignore manual toggle for ECA choose row');
    return;
  }

  if (!tasks) return;
  const prev = tasks.find(t => t.id === id);
  const nextDone = !prev?.done;
  const next = tasks.map(t => (t.id === id ? { ...t, done: nextDone } : t));
  await save(next);

  // 🔔 notifications
  if (nextDone) {
    await notifications.cancel(id);
  } else if (prev?.dueISO && new Date(prev.dueISO).getTime() > Date.now()) {
    await notifications.reschedule(id, prev.dueISO, { body: stripPrefix(prev.title) });
  } else {
    await notifications.cancel(id);
  }
}, [tasks, save]);



  // Offset change: push/pull depending on current view
  const adjustOffset = useCallback(async (id: string, delta: number) => {
    if (!tasks) return;
    const next = tasks.map(t => {
      if (t.id !== id) return t;
      const offsetDays = Math.max(-365, Math.min(365 * 2, t.offsetDays + delta));
      const dueISO = calcDueISO(t.baseISO, offsetDays);
      return { ...t, offsetDays, dueISO };
    });
    const sorted = viewMode === 'due' ? sortByDue(next) : sortBySuggested(next);
    await save(sorted);
    // 🔔 notifications for only the changed task
    const updated = next.find(t => t.id === id);
    if (updated) {
      if (updated.done) {
        await notifications.cancel(id);
      } else if (updated.dueISO && new Date(updated.dueISO).getTime() > Date.now()) {
        await notifications.reschedule(id, updated.dueISO, { body: stripPrefix(updated.title) });
      } else {
        await notifications.cancel(id);
      }
    }
  }, [tasks, viewMode, save]);

  // ✅ Immediate reset (no Alert dialog). Fully clears and re-seeds.
  const resetImmediate = useCallback(async () => {
  await AsyncStorage.removeItem(STORAGE_KEY);
  await notifications.cancelAllDev();
  await seedNow();
  const updated = await AsyncStorage.getItem(STORAGE_KEY);
  const list = updated ? (JSON.parse(updated) as Task[]) : [];
  const sorted = sortByMode(list, viewMode);
  setTasks(sorted);
  await reconcileSchedules(sorted);
}, [seedNow, sortByMode, viewMode, reconcileSchedules]);

  // ── DEV helpers: inspect banner + force floor + unblock ECA overview ──
  const debugBanner = useCallback(async () => {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const list = raw ? (JSON.parse(raw) as Task[]) : [];
    const { candidates } = getNextTask(list as unknown as PersistedTask[], isSubscribed);
    const ffRaw = await AsyncStorage.getItem(ECA_FOCUS_FLOOR_KEY);

    // Inspect in Metro logs
    console.log('[debug] focusFloor =', ffRaw);
    console.table(
      candidates.slice(0, 8).map((c: any) => ({
        id: c.id,
        title: c.title,
        stepNumber: c.stepNumber,
        stepOrder: c.stepOrder,
        due: c.dueISO,
        locked: c.isLocked,
        blocked: c.isBlocked,
      }))
    );
  }, [isSubscribed]);

  const forceFloor2 = useCallback(async () => {
    await AsyncStorage.setItem(ECA_FOCUS_FLOOR_KEY, '2');
    await load();
  }, [load]);

  const markEcaOverviewDone = useCallback(async () => {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const list = JSON.parse(raw) as Task[];
    const next = list.map(t =>
      stripPrefix(t.title) === 'Read: ECA overview (why, who needs it, which bodies)'
        ? { ...t, done: true }
        : t
    );
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    await load();
  }, [load]);


  if (loading || !tasks) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.muted}>Loading Action Plan…</Text>
      </View>
    );
  }

  const renderItem = ({ item }: { item: Task }) => {
  const premiumLocked = !isSubscribed && isPremiumTask(item);
  const unmet = getUnmetDeps(item);
  const blocked = unmet.length > 0;
  const isEcaChoose = isEcaChooseRow(item);

  return (
    <View
      style={[
        styles.row,
        item.done && styles.rowDone,
        (premiumLocked || blocked) && styles.rowDisabled,
      ]}
    >
      {/* Checkbox (still a Pressable) */}
      <Pressable
        disabled={blocked || premiumLocked || isEcaChoose}
        onPress={() => {
          if (blocked || premiumLocked || isEcaChoose) return;
          toggleDone(item.id);
        }}
        style={[
          styles.checkbox,
          item.done && styles.checkboxOn,
          (blocked || premiumLocked || isEcaChoose) && { opacity: 0.5 },
        ]}
      />

      {/* Row body wrapper — div on web, Pressable on native */}
      <RowTouchable
  style={{ flex: 1 }}
  disabled={blocked || isEcaChoose} // ECA row is wizard-controlled
  onPress={() => goToTask(navigation, toCandidate(item), isSubscribed)}
  accessibilityLabel={`Open: ${stripPrefix(item.title)}`} // <-- satisfies the test
>

        <Text style={[styles.itemTitle, item.done && styles.itemTitleDone]}>
          {item.title}
        </Text>

        <Text style={styles.due}>
          Due: {new Date(item.dueISO).toLocaleString()} • Offset: {item.offsetDays}d
        </Text>

        {/* Wizard-controlled pill for ECA row */}
        {isEcaChoose && (
          <Pressable
            onPress={() => goToTask(navigation, toCandidate(item), isSubscribed)}
            style={styles.ecaNotePill}
            accessibilityRole="button"
            accessibilityLabel="Open ECA Wizard"
          >
            <Text style={styles.ecaNotePillText}>
              Wizard-controlled — open ECA Wizard
            </Text>
          </Pressable>
        )}

        {/* ECA progress chip (only on the ECA “Pick your body” row) */}
        {isEcaChoose && ecaProgress && ecaProgress.total > 0 ? (
          <View
            style={[
              styles.progressChip,
              ecaProgress.done === 0
                ? styles.progGray
                : ecaProgress.done === ecaProgress.total
                ? styles.progGreen
                : styles.progAmber,
            ]}
          >
            <Text style={styles.progressText}>
              ECA {ecaProgress.done}/{ecaProgress.total}
            </Text>
          </View>
        ) : null}

        {/* Notes for locked / blocked */}
        {premiumLocked && <Text style={styles.lockNote}>🔒 Premium — unlock to act</Text>}
        {blocked && (
          <>
            <Text style={styles.blockedNote}>⛔ Blocked — complete prerequisite first</Text>
            <Text style={styles.blockedDetail}>Needs: {unmet.join(', ')}</Text>
          </>
        )}

        {/* Offset stepper; on web move pointerEvents into style to silence deprecation */}
        <View
          style={[
            styles.stepper,
            Platform.OS === 'web' && (premiumLocked || blocked)
              ? ({ pointerEvents: 'none' } as any)
              : null,
          ]}
        >
          <Pressable onPress={() => adjustOffset(item.id, -1)} style={styles.chip}>
            <Text style={styles.chipText}>− 1d</Text>
          </Pressable>
          <Pressable onPress={() => adjustOffset(item.id, +1)} style={styles.chip}>
            <Text style={styles.chipText}>+ 1d</Text>
          </Pressable>
        </View>
      </RowTouchable>
    </View>
  );
};





  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Action Plan</Text>
        </View>

        {/* Tiny toggle row */}
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>{viewMode === 'suggested' ? 'Suggested order' : 'Due date order'}</Text>
          <Switch value={viewMode === 'suggested'} onValueChange={async (flag) => {
            const mode: ViewMode = flag ? 'suggested' : 'due';
            await AsyncStorage.setItem(VIEWMODE_KEY, mode);
            setViewMode(mode);
            const sorted = sortByMode(tasks!, mode);
            await save(sorted);
          }} />
        </View>

        {/* Dev bar: compact chips with tooltips */}
        {__DEV__ && (
          <View style={[styles.devBar, isCompact && { justifyContent: 'flex-start' }]}>
            <Chip
              label="Reset"
              tip="Start over: replace your checklist with the default plan."
              onPress={resetImmediate}
            />
            <Chip
              label="Re-seed"
              tip="Refresh plan: load the default steps (replaces current tasks)."
              onPress={async () => {
              await notifications.cancelAllDev();
              await seedNow();
              const updated = await AsyncStorage.getItem(STORAGE_KEY);
              const list = updated ? (JSON.parse(updated) as Task[]) : [];
              const sorted = sortByMode(list, viewMode);
              setTasks(sorted);
              await reconcileSchedules(sorted);
            }}
              primary
            />
            {/* NEW: bypasses seed helper and writes from bundled JSON immediately */}
   <Chip
     label="Hard Re-seed (DEV)"
     tip="Bypass seed helper; write tasks from bundled JSON."
     onPress={async () => {
       await notifications.cancelAllDev();
       await hardReseedActionPlan(); // writes ms.tasks.v1 from src/data/action_plan.seed.json
       const updated = await AsyncStorage.getItem(STORAGE_KEY);
       const list = updated ? (JSON.parse(updated) as Task[]) : [];
       const sorted = sortByMode(list, viewMode);
       setTasks(sorted);
       await reconcileSchedules(sorted);
       alert('Re-seeded from bundled seed.\nIf list looks unchanged, reopen Action Plan once.');
     }}
  />
            <Chip
              label={isSubscribed ? "Premium ON" : "Premium OFF"}
              tip="Toggle premium for testing"
              onPress={async () => {
    const next = !isSubscribed;
    setIsSubscribed(next);            // local
    await __devSetSubscribed(next);   // persist so it stays after navigation
  }}
              
              primary
            />
            {/* ⬇️  INSERT THESE THREE LINES BELOW */}
    <Chip label="Debug banner" tip="Print floor & top candidates" onPress={debugBanner} />
    <Chip label="Force floor=2" tip="Focus on Step 2 tasks" onPress={forceFloor2} />
    <Chip label="Done: ECA overview" tip="Unblock Step-2 ECA chain" onPress={markEcaOverviewDone} />
            </View>
      )}
          
      </View>
      

      {/* List */}
      <FlatList
  data={tasks}
  keyExtractor={(item) => item.id}
  contentContainerStyle={{ paddingBottom: 24 }}
  renderItem={renderItem}
  ItemSeparatorComponent={() => <View style={styles.sep} />}
  // 👇 Make the banner sticky
ListHeaderComponent={
  nextUp
    ? (
      <View style={styles.stickyWrap}>
        <Pressable
onPress={() => goToTask(navigation, nextUp, isSubscribed)}
          style={[styles.banner, styles.bannerSticky]}
          accessibilityRole="button"
          accessibilityLabel={`Next step: ${nextUp.title}`}
        >
          <Text style={styles.bannerTitle}>Next step: {nextUp.title}</Text>
          {nextUp.dueISO ? (
            <Text style={styles.bannerDue}>
              {(() => {
                const due = nextUp.dueISO as string;
                return `Due ${new Date(due).toLocaleDateString()}`;
              })()}
            </Text>
          ) : null}
        </Pressable>
        {/* 🔒 Edge cover: overlaps the first row by ~1px so nothing peeks */}
        
      </View>
    )
    : null
}
ListHeaderComponentStyle={{ backgroundColor: 'transparent', marginBottom: 8 }}

stickyHeaderIndices={nextUp ? [0] : undefined}
/>




</View>
  );
}
const styles = StyleSheet.create({
rowDisabled: { opacity: 0.5 },
lockNote: { marginTop: 4, fontSize: 12, color: '#fbbf24' },   // amber
blockedNote: { marginTop: 4, fontSize: 12, color: '#f87171' }, // red
blockedDetail: { marginTop: 2, fontSize: 12, color: '#9ca3af' },

  container: { flex: 1, padding: 16 },
  header: { marginBottom: 8 },
  title: { fontSize: 22, fontWeight: '700' },

  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  toggleLabel: { color: '#6b7280', fontSize: 12, marginRight: 4 },

  devBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,

    
  },
progressChip: {
  marginTop: 6,
  alignSelf: 'flex-start',
  paddingHorizontal: 10,
  paddingVertical: 4,
  borderRadius: 12,
},
progGray:  { backgroundColor: '#e5e7eb' }, // 0 / y
progAmber: { backgroundColor: '#fde68a' }, // 0 < x < y
progGreen: { backgroundColor: '#bbf7d0' }, // y / y
progressText: { fontSize: 12, fontWeight: '700', color: '#111827' },
ecaNotePill: {
  alignSelf: 'flex-start',
  marginTop: 6,
  marginBottom: 4,
  paddingHorizontal: 10,
  paddingVertical: 4,
  borderRadius: 999,
  backgroundColor: '#1f2937',
  borderWidth: 1,
  borderColor: '#374151',
},
ecaNotePillText: {
  fontSize: 11,
  fontWeight: '700',
  color: '#93c5fd',
},


  // ✅ Keep banner STYLES AT TOP LEVEL (not inside devBar)
  banner: {
  paddingVertical: 12,
  paddingHorizontal: 14,
  backgroundColor: '#111827',
  borderRadius: 12,
  // No border/shadow — prevents any 1px artifact
  // shadowOpacity: 0, elevation: 0,
},

bannerSticky: {
  backgroundColor: '#024111ff',      // slightly different tone for the sticky card
},


// ✅ add these two new styles
stickyWrap: {
  backgroundColor: 'transparent',  // no opaque rectangle behind the card
},




  bannerTitle: { color: '#f9fafb', fontWeight: '700' },
  bannerDue: { color: '#9ca3af', marginTop: 2, fontSize: 12 },

  // Tooltip
  tooltipWrap: { position: 'relative' },
  tooltip: {
    position: 'absolute',
    top: -34,
    left: 0,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: '#111827',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#374151',
    zIndex: 10,
    maxWidth: 220,
  },
  tooltipText: { color: '#e5e7eb', fontSize: 12 },

  // Generic row
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: '#111827',
  },
  rowDone: { opacity: 0.6 },
  checkbox: {
    width: 20, height: 20, borderRadius: 4, borderWidth: 2, borderColor: '#a3a3a3', marginRight: 12,
    backgroundColor: 'transparent',
  },
  checkboxOn: { backgroundColor: '#22c55e', borderColor: '#22c55e' },
  itemTitle: { fontSize: 15, fontWeight: '600', color: '#f3f4f6' },
  itemTitleDone: { textDecorationLine: 'line-through', color: '#d1d5db' },
  due: { marginTop: 4, fontSize: 12, color: '#9ca3af' },

  // Small chips
  stepper: { flexDirection: 'row', marginTop: 8 },
  chip: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: '#0ea5e9', marginRight: 8,
  },
  chipText: { color: '#fff', fontWeight: '700' },

  chipPrimary: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: '#0ea5e9',
  },
  chipPrimaryText: { color: '#fff', fontWeight: '700' },

  chipSecondary: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: '#1f2937',
    borderWidth: 1, borderColor: '#374151',
    marginRight: 8,
  },
  chipSecondaryText: { color: '#e5e7eb', fontWeight: '700' },

  sep: { height: 8 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  muted: { color: '#9ca3af', marginTop: 8 },
});

// src/screens/ActionPlanScreen.tsx
import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';

import {
  View, Text, FlatList, Pressable, ActivityIndicator, StyleSheet, Switch, useWindowDimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useNavigation } from '@react-navigation/native';
import { getNextTask, goToTask, NextTaskCandidate, PersistedTask } from '../utils/nextTasks';


import { applySeed, Task, SeedTask, calcDueISO } from '../utils/applySeed';
import rawSeed from '../data/action_plan.seed.json';

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

export default function ActionPlanScreen() {
  const navigation = useNavigation<any>();

  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('due'); // default: due-date order
  const { width } = useWindowDimensions();
  const isCompact = width < 380;
    // Replace with real subscription flag when available
  const [isSubscribed, setIsSubscribed] = useState(false);

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

const toCandidate = useCallback(
  (t: Task): NextTaskCandidate => {
    const row = findSeedForTask(t);
    const unmet = getUnmetDeps(t);
    const blocked = unmet.length > 0;
    const premium = isPremiumTask(t);

    return {
      id: t.id,
      title: stripPrefix(t.title),
      dueISO: t.dueISO ?? null,
      // These two aren't used by goToTask; safe dummies
      seedIndex: 0,
      stepOrder: 0,
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
    const { next } = getNextTask(tasks as unknown as PersistedTask[], isSubscribed);
    return next;
  }, [tasks, isSubscribed]);

  const seedNow = useCallback(async () => {
    const expanded = applySeed(seed);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(expanded));
    setTasks(expanded);
    return expanded.length;
  }, []);

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
      setTasks(sortByMode(list, mode));
    } catch {
      await seedNow();
      const seeded = await AsyncStorage.getItem(STORAGE_KEY);
      const list = seeded ? (JSON.parse(seeded) as Task[]) : [];
      setTasks(sortByMode(list, 'due'));
      setViewMode('due');
    } finally {
      setLoading(false);
    }
  }, [seedNow, sortByMode]);

  useEffect(() => { load(); }, [load]);

  const save = useCallback(async (next: Task[]) => {
    setTasks(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const toggleDone = useCallback(async (id: string) => {
    if (!tasks) return;
    const next = tasks.map(t => (t.id === id ? { ...t, done: !t.done } : t));
    await save(next);
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
  }, [tasks, viewMode, save]);

  // ✅ Immediate reset (no Alert dialog). Fully clears and re-seeds.
  const resetImmediate = useCallback(async () => {
    await AsyncStorage.removeItem(STORAGE_KEY);
    await seedNow();
    const updated = await AsyncStorage.getItem(STORAGE_KEY);
    const list = updated ? (JSON.parse(updated) as Task[]) : [];
    setTasks(sortByMode(list, viewMode));
  }, [seedNow, sortByMode, viewMode]);

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

  return (
    <View style={[
      styles.row,
      item.done && styles.rowDone,
      (premiumLocked || blocked) && styles.rowDisabled,
    ]}>
      <Pressable
        onPress={() => { if (premiumLocked || blocked) return; toggleDone(item.id); }}
        style={[styles.checkbox, item.done && styles.checkboxOn]}
      />
      <Pressable
  style={{ flex: 1 }}
  // Blocked tasks remain disabled; Premium-locked should open Paywall
  disabled={blocked}
  onPress={() => goToTask(navigation, toCandidate(item), isSubscribed)}
  accessibilityRole="button"
  accessibilityLabel={`Open: ${stripPrefix(item.title)}`}
>
  <Text style={[styles.itemTitle, item.done && styles.itemTitleDone]}>
    {item.title}
  </Text>
  <Text style={styles.due}>
    Due: {new Date(item.dueISO).toLocaleString()} • Offset: {item.offsetDays}d
  </Text>

  {premiumLocked && <Text style={styles.lockNote}>🔒 Premium — unlock to act</Text>}
  {blocked && (
    <>
      <Text style={styles.blockedNote}>⛔ Blocked — complete prerequisite first</Text>
      <Text style={styles.blockedDetail}>Needs: {unmet.join(', ')}</Text>
    </>
  )}

  <View style={styles.stepper} pointerEvents={(premiumLocked || blocked) ? 'none' : 'auto'}>
    <Pressable onPress={() => adjustOffset(item.id, -1)} style={styles.chip}>
      <Text style={styles.chipText}>− 1d</Text>
    </Pressable>
    <Pressable onPress={() => adjustOffset(item.id, +1)} style={styles.chip}>
      <Text style={styles.chipText}>+ 1d</Text>
    </Pressable>
  </View>
</Pressable>

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
                await seedNow();
                const updated = await AsyncStorage.getItem(STORAGE_KEY);
                const list = updated ? (JSON.parse(updated) as Task[]) : [];
                setTasks(sortByMode(list, viewMode));
              }}
              primary
            />
            <Chip
              label={isSubscribed ? "Premium ON" : "Premium OFF"}
              tip="Toggle premium for testing"
              onPress={() => setIsSubscribed(v => !v)}
              primary
            />

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

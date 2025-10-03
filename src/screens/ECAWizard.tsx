// src/screens/ECAWizard.tsx
import * as ECA from '../services/eca'; // keep namespace import

import React, { useEffect, useMemo, useState, useLayoutEffect, useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Platform,
} from 'react-native';
import { useNavigation } from "@react-navigation/native";

// ---------- UI helpers ----------
function fmtDay(iso?: string) {
  if (!iso) return 'None';
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day} • 09:00`;
}

function addDays(base: Date, days: number) {
  return new Date(base.getTime() + days * 86400000);
}

function nextStatus(s: ECA.EcaItemStatus): ECA.EcaItemStatus {
  if (s === 'not_started') return 'in_progress';
  if (s === 'in_progress') return 'done';
  return 'not_started';
}
async function confirmClear(): Promise<boolean> {
  if (Platform.OS === 'web') {
    // RN Web doesn’t support multi-button Alert. Use browser confirm.
    // This returns true on “OK”, false on “Cancel”.
    // eslint-disable-next-line no-restricted-globals
    return Promise.resolve(window.confirm(
      'Clear ECA selection?\nThis will remove your selected ECA body and mark the Action Plan step as Not done.'
    ));
  }
  // Native: use 2-button Alert and resolve the choice.
  return new Promise<boolean>((resolve) => {
    Alert.alert(
      'Clear ECA selection?',
      'This will remove your selected ECA body and mark the Action Plan step as Not done.',
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Clear', style: 'destructive', onPress: () => resolve(true) },
      ]
    );
  });
}

// ---------- Screen ----------
export default function ECAWizard() {
  const navigation = useNavigation<any>();
  const [loading, setLoading] = useState(true);
  const [guides, setGuides] = useState<ECA.LoaderResult<ECA.EcaGuides> | null>(null);
  const [state, setState] = useState<ECA.EcaState | null>(null);

  const selectedBody = useMemo(() => {
    if (!guides || !state?.selectedBodyId) return undefined;
    return guides.data.bodies.find(b => b.id === state.selectedBodyId);
  }, [guides, state?.selectedBodyId]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [g, s] = await Promise.all([ECA.loadGuides(), ECA.loadState()]);
    setGuides(g);
    setState(s);
    await ECA.nudgeFocusToStep(2);
    setLoading(false);
    // in case it’s already complete from earlier sessions
    await ECA.markActionPlanTaskIfComplete(ECA.ECA_TASK_ID);
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      await loadAll();
      if (!mounted) return;
    })();
    return () => { mounted = false; };
  }, [loadAll]);

  // Header: Clear selection (Option A)
  useLayoutEffect(() => {
  navigation.setOptions({
    headerRight: () =>
      state?.selectedBodyId ? (
        <Pressable
          onPress={async () => {
            const confirmed = await confirmClear();
            if (!confirmed) return;

            setLoading(true);
            const next = await ECA.clearSelectedBody();             // wipes ms.eca.state.v1 + cancels reminders
            await ECA.syncActionPlanEcaChoose(ECA.ECA_TASK_ID);     // keep AP row in sync
            setState(next);
            setLoading(false);

            if (navigation.canGoBack && navigation.canGoBack()) {
              navigation.goBack();
            } else {
              navigation.navigate('MainTabs', { screen: 'ActionPlan' });

            }
          }}
          style={{
            marginRight: 12,
            backgroundColor: '#7F1D1D',
            paddingVertical: 6,
            paddingHorizontal: 10,
            borderRadius: 8,
            opacity: loading ? 0.7 : 1,
          }}
          disabled={loading}
          accessibilityRole="button"
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>Clear selection</Text>
        </Pressable>
      ) : null,
  });
  // include 'loading' so the button disables while clearing
}, [navigation, state?.selectedBodyId, loading]);


  async function handleSelectBody(bodyId: string) {
    setLoading(true);
    const s = await ECA.selectBody(bodyId); // selection auto-syncs AP row inside service
    setState(s);
    setLoading(false);
    await ECA.markActionPlanTaskIfComplete(ECA.ECA_TASK_ID);
  }

  async function handleToggleStatus(itemId: string) {
    if (!state) return;
    const current = state.items.find(i => i.id === itemId)?.status ?? 'not_started';
    const next = nextStatus(current);
    const s = await ECA.setItemStatus(itemId, next);
    setState(s);
    await ECA.markActionPlanTaskIfComplete(ECA.ECA_TASK_ID);
  }

  async function handleQuickTarget(itemId: string, mode: 'today' | '+7' | 'clear') {
    const base = new Date();
    const iso =
      mode === 'clear' ? undefined :
      mode === 'today' ? base.toISOString() :
      addDays(base, 7).toISOString();
    const s = await ECA.setItemTarget(itemId, iso);
    setState(s);
    await ECA.markActionPlanTaskIfComplete(ECA.ECA_TASK_ID);
  }

  async function handleMarkAllDone() {
    Alert.alert('Mark all done?', 'This will mark every checklist item as Done.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Mark all',
        style: 'destructive',
        onPress: async () => {
          const s = await ECA.markAllDone();
          setState(s);
          await ECA.markActionPlanTaskIfComplete(ECA.ECA_TASK_ID);
        },
      },
    ]);
  }

  const header = useMemo(() => {
    if (!guides) return null;
    const srcLabel =
      guides.source === 'remote' ? 'Remote' :
      guides.source === 'cache'  ? 'Cache'  : 'Local';
    const when = new Date(guides.cachedAt).toLocaleString();

    return (
      <View style={styles.header}>
        <Text style={styles.h1}>Education Credential Assessment (ECA)</Text>
        <Text style={styles.subtle}>{srcLabel} • last synced {when}</Text>
        {/* Removed DEV/inline “Change ECA body” buttons — use headerRight instead */}
      </View>
    );
  }, [guides]);

  if (loading && !guides) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.subtle}>Loading…</Text>
      </View>
    );
  }

  if (!guides || !state) {
    return (
      <View style={styles.center}>
        <Text>Unable to load ECA guides/state.</Text>
      </View>
    );
  }

  // --------- Body selection view ----------
  if (!state.selectedBodyId) {
    return (
      <ScrollView contentContainerStyle={styles.screen}>
        {header}
        <Text style={styles.h2}>Pick your ECA body</Text>
        {guides.data.bodies.map(b => (
          <View key={b.id} style={styles.card}>
            <Text style={styles.cardTitle}>{b.name}</Text>
            {!!b.notes && <Text style={styles.notes}>{b.notes}</Text>}
            <View style={styles.row}>
              {b.link && (
                <Pressable onPress={() => Linking.openURL(b.link!)} style={styles.linkBtn}>
                  <Text style={styles.linkText}>Open website</Text>
                </Pressable>
              )}

              <Pressable onPress={() => handleSelectBody(b.id)} style={styles.primaryBtn}>
                <Text style={styles.primaryText}>Select</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </ScrollView>
    );
  }

  // --------- Checklist view ----------
  return (
    <View style={styles.screen}>
      {header}
      <View style={styles.rowBetween}>
        <Text style={styles.h2}>
          {selectedBody?.name ?? 'ECA Body'} — Checklist
        </Text>
        {selectedBody?.link && (
          <Pressable onPress={() => Linking.openURL(selectedBody.link!)} style={styles.linkBtnSmall}>
            <Text style={styles.linkText}>Site</Text>
          </Pressable>
        )}
      </View>

      <FlatList
        data={state.items}
        keyExtractor={(it) => it.id}
        contentContainerStyle={{ paddingBottom: 24 }}
        renderItem={({ item }) => (
          <View style={styles.itemRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemTitle}>{item.title}</Text>
              <Text style={styles.meta}>Target: {fmtDay(item.targetISO)}</Text>
              <View style={styles.chipsRow}>
                <Pressable
                  onPress={() => handleToggleStatus(item.id)}
                  style={[
                    styles.statusChip,
                    item.status === 'not_started' && styles.gray,
                    item.status === 'in_progress' && styles.amber,
                    item.status === 'done' && styles.green,
                  ]}
                >
                  <Text style={styles.chipText}>
                    {item.status === 'not_started' ? 'Not started'
                      : item.status === 'in_progress' ? 'In progress'
                      : 'Done'}
                  </Text>
                </Pressable>

                <Pressable onPress={() => handleQuickTarget(item.id, 'today')} style={styles.outlineChip}>
                  <Text style={styles.outlineText}>Today</Text>
                </Pressable>
                <Pressable onPress={() => handleQuickTarget(item.id, '+7')} style={styles.outlineChip}>
                  <Text style={styles.outlineText}>+7d</Text>
                </Pressable>
                <Pressable onPress={() => handleQuickTarget(item.id, 'clear')} style={styles.outlineChip}>
                  <Text style={styles.outlineText}>Clear</Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}
        ListFooterComponent={
          <View style={{ marginTop: 8 }}>
            <Pressable onPress={handleMarkAllDone} style={styles.secondaryBtn}>
              <Text style={styles.secondaryText}>Mark all done</Text>
            </Pressable>
            {/* Removed footer “Change ECA body” button to avoid duplicate/unsafe paths */}
          </View>
        }
      />
    </View>
  );
}

// ---------- Styles ----------
const styles = StyleSheet.create({
  screen: { padding: 16, flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { marginBottom: 8 },
  h1: { fontSize: 20, fontWeight: '700' },
  h2: { fontSize: 16, fontWeight: '600', marginVertical: 8 },
  subtle: { color: '#666', marginTop: 4 },
  notes: { color: '#444', marginTop: 6 },
  row: { flexDirection: 'row', marginTop: 12, flexWrap: 'wrap' },

  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  card: { padding: 12, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: '#ddd', marginBottom: 12, backgroundColor: '#fff' },
  cardTitle: { fontSize: 15, fontWeight: '600' },
  itemRow: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#eee' },
  itemTitle: { fontSize: 14, fontWeight: '500' },
  meta: { color: '#666', marginTop: 4 },
  chipsRow: { flexDirection: 'row', marginTop: 8, flexWrap: 'wrap' },
  statusChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16 },
  gray: { backgroundColor: '#e5e7eb' },
  amber: { backgroundColor: '#fde68a' },
  green: { backgroundColor: '#bbf7d0' },
  chipText: { fontSize: 12, fontWeight: '600' },
  outlineChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: '#bbb' },
  outlineText: { fontSize: 12, fontWeight: '600', color: '#333' },
  primaryBtn: { paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#111827', borderRadius: 8 },
  primaryText: { color: '#fff', fontWeight: '700' },
  secondaryBtn: { paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#e5e7eb', borderRadius: 8, marginTop: 8 },
  secondaryText: { fontWeight: '700', color: '#111827' },
  linkBtn: { paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#f3f4f6', borderRadius: 8 },
  linkBtnSmall: { paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#f3f4f6', borderRadius: 8 },
  linkText: { color: '#2563eb', fontWeight: '600' },
});

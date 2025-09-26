// src/screens/ECAWizard.tsx
import * as ECA from '../services/eca'; // already there
// no new import needed if ECA is namespaced

import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useMemo, useState } from 'react';
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
} from 'react-native';


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

// ---------- Screen ----------
export default function ECAWizard() {
  const [loading, setLoading] = useState(true);
  const [guides, setGuides] = useState<ECA.LoaderResult<ECA.EcaGuides> | null>(null);
  const [state, setState] = useState<ECA.EcaState | null>(null);

  const selectedBody = useMemo(() => {
    if (!guides || !state?.selectedBodyId) return undefined;
    return guides.data.bodies.find(b => b.id === state.selectedBodyId);
  }, [guides, state?.selectedBodyId]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      const [g, s] = await Promise.all([ECA.loadGuides(), ECA.loadState()]);
if (!mounted) return;
setGuides(g);
setState(s);

// 👇 add this line
await ECA.nudgeFocusToStep(2);

setLoading(false);
// in case it’s already complete from earlier sessions
await ECA.markActionPlanTaskIfComplete(ECA.ECA_TASK_ID);

    })();
    return () => { mounted = false; };
  }, []);

  async function handleSelectBody(bodyId: string) {
  setLoading(true);
  const s = await ECA.selectBody(bodyId); // this now auto-syncs the AP row
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

      {__DEV__ && (
        <Pressable
  onPress={async () => {
    const next = await ECA.clearSelectedBody(); // unchecks AP row (only path)
    setState(next);
  }}
  style={styles.linkBtn}
>
  <Text style={styles.linkText}>Change ECA body</Text>
</Pressable>

      )}
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
            <Pressable
  onPress={async () => {
    // persistently clear selection
    const next = { selectedBodyId: undefined, items: [], updatedAt: new Date().toISOString() };
    await AsyncStorage.setItem('ms.eca.state.v1', JSON.stringify(next));
    setState(next);
    // sync AP row -> not done; clear focus floor
    await ECA.syncActionPlanEcaChoose('03_eca_choose_and_start');
  }}
  style={styles.linkBtn}
>
  <Text style={styles.linkText}>Change ECA body</Text>
</Pressable>

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

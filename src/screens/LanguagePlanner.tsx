// src/screens/LanguagePlanner.tsx

import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Picker } from '@react-native-picker/picker';
import PrimaryButton from '../components/PrimaryButton';
import { colors } from '../theme/colors';
import {
  loadLanguageGuides,
  loadLanguageState,
  saveBasicsAndBuildPlan,
  setResultsCLB,
  type LanguageGuides,
  type LanguageState,
  type TestId,
  type WeeklyPlanItem,
  abilityLabel,
} from '../services/language';


import { useLayoutEffect } from "react";



// === Date helpers (future-only) ===
const today = new Date();
const MIN_Y = today.getFullYear();
const MIN_M = today.getMonth() + 1; // 1-12
const MIN_D = today.getDate();

const pad2 = (n: number) => String(n).padStart(2, '0');
const daysInMonth = (y: number, m: number) => new Date(y, m, 0).getDate();

// === Local state + validation for Y/M/D ===
const buildYearOptions = (span = 4) =>
  Array.from({ length: span }, (_, i) => MIN_Y + i);

const buildMonthOptions = (y: number) => {
  const start = y === MIN_Y ? MIN_M : 1;
  return Array.from({ length: 12 - start + 1 }, (_, i) => start + i);
};

const buildDayOptions = (y: number, m: number) => {
  const dim = daysInMonth(y, m);
  const start = y === MIN_Y && m === MIN_M ? MIN_D : 1;
  return Array.from({ length: dim - start + 1 }, (_, i) => start + i);
};

// Returns ISO string YYYY-MM-DD
const toISO = (y: number, m: number, d: number) =>
  `${y}-${pad2(m)}-${pad2(d)}`;

// Keep a small helper to check & clamp if user changes Y/M causing the day to overflow
const clampDay = (y: number, m: number, d: number) => {
  const start = y === MIN_Y && m === MIN_M ? MIN_D : 1;
  const max = daysInMonth(y, m);
  return Math.max(start, Math.min(d, max));
};


export default function LanguagePlanner() {
  const navigation = useNavigation();

  // Guides/meta
  const [guides, setGuides] = React.useState<LanguageGuides | null>(null);
  const [guideSource, setGuideSource] = React.useState<'remote' | 'cache' | 'local' | null>(null);
  const [guideCachedAt, setGuideCachedAt] = React.useState<string | null>(null);

  // Planner basics
  const [testId, setTestId] = React.useState<TestId>('ielts');
  const [targetClb, setTargetClb] = React.useState<string>('9');
  const [testDate, setTestDate] = React.useState<string>(''); // YYYY-MM-DD
  const [hoursPerWeek, setHoursPerWeek] = React.useState<string>('6');

  // Keep year/month/day in sync with saved ISO; restrict to today-or-future
const [y, setY] = React.useState<number>(MIN_Y);
const [m, setM] = React.useState<number>(MIN_M);
const [d, setD] = React.useState<number>(MIN_D);

React.useEffect(() => {
  if (!testDate) { setY(MIN_Y); setM(MIN_M); setD(MIN_D); return; }
  const [yy, mm, dd] = testDate.split('-').map(Number);
  const yy2 = Math.max(MIN_Y, yy || MIN_Y);
  const mm2 = yy2 === MIN_Y ? Math.max(MIN_M, mm || MIN_M) : (mm || 1);
  const dd2 = clampDay(yy2, mm2, dd || 1);
  setY(yy2); setM(mm2); setD(dd2);
}, [testDate]);


  // Generated plan
  const [plan, setPlan] = React.useState<WeeklyPlanItem[] | undefined>(undefined);

  // Results (CLB per ability)
  const [readingClb, setReadingClb] = React.useState<string>('');
  const [listeningClb, setListeningClb] = React.useState<string>('');
  const [writingClb, setWritingClb] = React.useState<string>('');
  const [speakingClb, setSpeakingClb] = React.useState<string>('');

  const [busy, setBusy] = React.useState(false);
  const [savedTick, setSavedTick] = React.useState<null | string>(null);

  React.useEffect(() => {
    (async () => {
      const g = await loadLanguageGuides();
      setGuides(g.data);
      setGuideSource(g.source);
      setGuideCachedAt(g.cachedAt);

      const s = await loadLanguageState();
      // hydrate basics
      if (s.testId) setTestId(s.testId);
      if (typeof s.targetClb === 'number') setTargetClb(String(s.targetClb));
      if (s.testDateISO) setTestDate(toYmd(s.testDateISO));
      if (typeof s.hoursPerWeek === 'number') setHoursPerWeek(String(s.hoursPerWeek));
      if (s.plan) setPlan(s.plan);

      // hydrate results (CLB per ability)
      if (s.results?.readingClb != null) setReadingClb(String(s.results.readingClb));
      if (s.results?.listeningClb != null) setListeningClb(String(s.results.listeningClb));
      if (s.results?.writingClb != null) setWritingClb(String(s.results.writingClb));
      if (s.results?.speakingClb != null) setSpeakingClb(String(s.results.speakingClb));
    })();
  }, []);
useLayoutEffect(() => {
  navigation.setOptions({
    headerRight: () => (
      <Pressable
        onPress={async () => {
          const confirm = Platform.OS === "web"
            ? window.confirm("Clear planned Language test date?")
            : await new Promise<boolean>(res => Alert.alert(
                "Clear planned date?",
                "This removes the saved test date.",
                [{ text: "Cancel", style: "cancel", onPress: () => res(false) },
                 { text: "Clear", style: "destructive", onPress: () => res(true) }]));
          if (!confirm) return;

          const K = "ms.language.state.v1";
          const raw = await AsyncStorage.getItem(K);
          const s = raw ? JSON.parse(raw) : {};
          delete s.testDateISO;
          if (Array.isArray(s.plan) && s.plan.length === 0) {
            // leave plan alone; checklist already treats non-empty plan as OK
          }
          await AsyncStorage.setItem(K, JSON.stringify(s));
          // ensure UI reflects removal (call your existing reload if present)
          navigation.goBack();
        }}
        style={{ marginRight: 12, backgroundColor: "#7F1D1D", paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8 }}
      >
        <Text style={{ color: "#fff", fontWeight: "700" }}>Clear date</Text>
      </Pressable>
    )
  });
}, [navigation]);
navigation
  const onGenerate = async () => {
    if (!testDate.trim()) {
      flashTick('Enter a test date (YYYY-MM-DD)');
      return;
    }
    setBusy(true);
    try {
      const next = await saveBasicsAndBuildPlan({
        testId,
        targetClb: safeInt(targetClb, undefined, 0, 10) ?? undefined,
        testDateISO: `${testDate}T09:00:00`,
        hoursPerWeek: safeInt(hoursPerWeek, 6, 1, 40) ?? 6,
      });
      setPlan(next.plan);
      flashTick('Plan updated');
    } finally {
      setBusy(false);
    }
  };

  const onSaveResults = async (goToScoreAfter = true) => {
    setBusy(true);
    try {
      await setResultsCLB({
        readingClb: safeInt(readingClb, undefined, 0, 10) ?? undefined,
        listeningClb: safeInt(listeningClb, undefined, 0, 10) ?? undefined,
        writingClb: safeInt(writingClb, undefined, 0, 10) ?? undefined,
        speakingClb: safeInt(speakingClb, undefined, 0, 10) ?? undefined,
      });
      flashTick('Saved. Score will pick this up.');
      if (goToScoreAfter) {
        // Give AsyncStorage a brief tick to settle on slow devices
        setTimeout(() => {
  // Jump to the Score tab inside the MainTabs navigator
  // (RootNavigator has: <Stack.Screen name="MainTabs" component={Tabs} />)
  // @ts-ignore: param typing for nested navigation
  navigation.navigate('MainTabs', { screen: 'Score' });
}, 50);
      }
    } finally {
      setBusy(false);
    }
  };

  function flashTick(msg: string) {
    setSavedTick(msg);
    setTimeout(() => setSavedTick(null), 1500);
  }

  return (
    
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {__DEV__ && (
  <Pressable
    onPress={async () => {
      await AsyncStorage.multiRemove([
        'ms.language.guides.cache.v1',
        'ms.language.guides.meta.v1',
      ]);
      alert('Language guides cache cleared.\nClose this screen and reopen to fetch Remote.');
    }}
    style={{
      alignSelf: 'flex-start',
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: '#ddd',
      backgroundColor: '#fff',
      marginBottom: 8
    }}
    accessibilityRole="button"
    testID="lp-dev-force-remote"
  >
    <Text style={{ fontWeight: '700' }}>Force Remote (Language)</Text>
  </Pressable>
)}

      <Text style={styles.h1}>Language Planner</Text>
      {!!guides && (
        <Text style={styles.meta}>
          Guides: {guideSource} • {guideCachedAt ? new Date(guideCachedAt).toLocaleString() : ''}
        </Text>
      )}

      {/* Basics */}
      <Text style={styles.h2}>Targets</Text>
      <View style={styles.row}>
        <Text style={styles.label}>Test</Text>
        <View style={styles.pickerWrap}>
          <Picker<TestId> selectedValue={testId} onValueChange={setTestId} style={styles.picker}>
            {(guides?.tests || [
              { id: 'ielts', name: 'IELTS' },
              { id: 'celpip', name: 'CELPIP' },
              { id: 'tef', name: 'TEF' },
              { id: 'tcf', name: 'TCF' },
            ]).map((t) => (
              <Picker.Item key={t.id} label={t.name} value={t.id} />
            ))}
          </Picker>
        </View>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Target CLB (0–10)</Text>
        <TextInput
          style={styles.input}
          keyboardType="number-pad"
          value={targetClb}
          onChangeText={(t) => setTargetClb(sanitizeIntString(t, 0, 10))}
          maxLength={2}
        />
      </View>

      <View style={styles.row}>
  <Text style={styles.label}>Test date</Text>
  <View style={{ flex: 1, flexDirection: 'row', gap: 8 }}>
    {/* Year */}
    <View style={styles.pickerWrap}>
      <Picker<number>
        selectedValue={y}
        onValueChange={(yy) => {
          const mm = yy === MIN_Y ? Math.max(MIN_M, m) : m;
          const dd = clampDay(yy, mm, d);
          setY(yy); setM(mm); setD(dd);
          setTestDate(toISO(yy, mm, dd));
        }}
        style={styles.picker}
      >
        {buildYearOptions(4).map((yy) => (
          <Picker.Item key={yy} label={String(yy)} value={yy} />
        ))}
      </Picker>
    </View>

    {/* Month */}
    <View style={styles.pickerWrap}>
      <Picker<number>
        selectedValue={m}
        onValueChange={(mm) => {
          const dd = clampDay(y, mm, d);
          setM(mm); setD(dd);
          setTestDate(toISO(y, mm, dd));
        }}
        style={styles.picker}
      >
        {buildMonthOptions(y).map((mm) => (
          <Picker.Item key={mm} label={String(mm).padStart(2, '0')} value={mm} />
        ))}
      </Picker>
    </View>

    {/* Day */}
    <View style={styles.pickerWrap}>
      <Picker<number>
        selectedValue={d}
        onValueChange={(dd) => {
          setD(dd);
          setTestDate(toISO(y, m, dd));
        }}
        style={styles.picker}
      >
        {buildDayOptions(y, m).map((dd) => (
          <Picker.Item key={dd} label={String(dd).padStart(2, '0')} value={dd} />
        ))}
      </Picker>
    </View>
  </View>
</View>


      <View style={styles.row}>
        <Text style={styles.label}>Hours per week</Text>
        <TextInput
          style={styles.input}
          keyboardType="number-pad"
          value={hoursPerWeek}
          onChangeText={(t) => setHoursPerWeek(sanitizeIntString(t, 1, 40))}
          maxLength={2}
        />
      </View>

      <PrimaryButton title={busy ? 'Please wait…' : 'Generate Plan'} onPress={onGenerate} disabled={busy} />

      {/* Plan */}
      {plan && (
        <>
          <Text style={[styles.h2, { marginTop: 16 }]}>Weekly Plan</Text>
          <View style={styles.planWrap}>
            {plan.map((w) => (
              <View key={w.weekIndex} style={styles.planCard}>
                <Text style={styles.planTitle}>
                  Week {w.weekIndex + 1} • {fmtYmd(w.startISO)} → {fmtYmd(w.endISO)}
                </Text>
                <Text style={styles.planMeta}>Focus: {abilityLabel[w.focus]}</Text>
                <View style={{ height: 6 }} />
                {w.tasks.map((t, i) => (
                  <Text key={i} style={styles.planTask}>
                    • {t}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        </>
      )}

      {/* Results */}
      <Text style={[styles.h2, { marginTop: 16 }]}>Enter Your Results (CLB)</Text>
      <Text style={styles.meta}>Saving will update the Score screen’s CLB automatically.</Text>

      <View style={styles.row}>
        <Text style={styles.label}>Reading</Text>
        <TextInput
          style={styles.input}
          keyboardType="number-pad"
          value={readingClb}
          onChangeText={(t) => setReadingClb(sanitizeIntString(t, 0, 10))}
          maxLength={2}
        />
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Listening</Text>
        <TextInput
          style={styles.input}
          keyboardType="number-pad"
          value={listeningClb}
          onChangeText={(t) => setListeningClb(sanitizeIntString(t, 0, 10))}
          maxLength={2}
        />
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Writing</Text>
        <TextInput
          style={styles.input}
          keyboardType="number-pad"
          value={writingClb}
          onChangeText={(t) => setWritingClb(sanitizeIntString(t, 0, 10))}
          maxLength={2}
        />
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Speaking</Text>
        <TextInput
          style={styles.input}
          keyboardType="number-pad"
          value={speakingClb}
          onChangeText={(t) => setSpeakingClb(sanitizeIntString(t, 0, 10))}
          maxLength={2}
        />
      </View>

      <View style={{ gap: 8 }}>
        <PrimaryButton title={busy ? 'Saving…' : 'Save Results (updates CRS)'} onPress={() => onSaveResults(true)} disabled={busy} />
        <Pressable onPress={() => onSaveResults(false)} accessibilityRole="button" style={styles.secondaryBtn}>
          <Text style={styles.secondaryBtnText}>Save without leaving</Text>
        </Pressable>
      </View>

      {!!savedTick && <Text style={[styles.meta, { marginTop: 8 }]}>{savedTick}</Text>}

      <View style={{ height: 24 }} />
    </ScrollView>
  );
}



// ------- helpers -------
function sanitizeIntString(s: string, min: number, max: number): string {
  const n = safeInt(s, 0, min, max);
  return n == null ? '' : String(n);
}
function safeInt(s: string, fallback?: number, min?: number, max?: number): number | undefined {
  const n = Number(String(s).replace(/[^0-9]/g, ''));
  if (!Number.isFinite(n)) return fallback;
  let v = Math.trunc(n);
  if (typeof min === 'number') v = Math.max(min, v);
  if (typeof max === 'number') v = Math.min(max, v);
  return v;
}
function toYmd(iso: string): string {
  try {
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  } catch {
    return '';
  }
}
function fmtYmd(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  } catch {
    return iso;
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16 },
  h1: { fontSize: 22, fontWeight: '700', color: colors.text, marginBottom: 4 },
  h2: { fontSize: 18, fontWeight: '700', color: colors.text, marginTop: 12, marginBottom: 8 },
  meta: { color: '#666', fontSize: 12 },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  label: { width: 200, color: colors.text, paddingTop: 8 },
  input: { flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 6, padding: 10, backgroundColor: '#fafafa' },
  pickerWrap: { flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 6, overflow: 'hidden' },
  picker: { width: '100%' },
  planWrap: { gap: 10 },
  planCard: { borderWidth: 1, borderColor: '#eee', borderRadius: 10, padding: 12, backgroundColor: '#fafafa' },
  planTitle: { fontWeight: '700' },
  planMeta: { color: '#666', marginTop: 2 },
  planTask: { marginTop: 2, color: colors.text },
  secondaryBtn: { alignSelf: 'flex-start', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: '#ddd' },
  secondaryBtnText: { color: '#111', fontWeight: '600' },
});

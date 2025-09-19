// src/screens/NOCVerify.tsx
// add:
import { resetNocRulesCache, fetchNocFromRules } from "../services/nocRules";

import { fetchNocFromLive } from "../services/nocLive";

import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  TextInput,
  Modal,
  StyleSheet,
  Switch,
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
} from 'react-native';

import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';

import {
  loadState,
  setSelectedNoc,
  toggleDuty,
  setDutyNote,
  computeProgress,
  suggestEvidenceForDuty,
  buildReferenceLetterMarkdown,
  type DutyCheck,
  type NocVerifyState,
  type NocBasics,
} from '../services/nocVerify';

import NocPicker from '../components/NocPicker'; // We’ll render it inside a modal

type ExportForm = {
  applicantName: string;
  jobTitle: string;
  employerName: string;
  employerAddress?: string;
  startDateISO: string;
  endDateISO?: string;
  hoursPerWeek?: string;
  salaryPerYear?: string;
  supervisorName?: string;
  supervisorTitle?: string;
  contactEmail?: string;
  contactPhone?: string;
};

import { loadRefLetterTemplate, applyRefLetterTemplate, type RefLetterInput } from '../services/templates';

// ✅ single JSON import with a unique name
import nocDb from '../data/noc.2021.json';
// helpers to normalize code & map duties of any shape
function normCode(x: any): string {
  const s = String(x ?? '').replace(/\D/g, ''); // keep digits only
  return s ? s.padStart(5, '0') : '';
}
function teerFromCode(c?: string): string | undefined {
  const s = String(c ?? '');
  return /^\d{5}$/.test(s) ? s[1] : undefined;   // NOC 2021: 2nd digit = TEER
}

// turn whatever JSON shape we have into an array of records
type AnyRec = Record<string, any>;
function toDbArray(raw: any): AnyRec[] {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.items)) return raw.items;
  if (raw && Array.isArray(raw.data)) return raw.data;
  if (raw && typeof raw === 'object') return Object.values(raw);
  return [];
}

function getRecordFor(code5: string): AnyRec | null {
  const arr = toDbArray(nocDb);
  const recFromArray =
    arr.find((r) => normCode(r.code) === code5 || normCode(r.noc) === code5) || null;
  if (recFromArray) return recFromArray;

  // object keyed by code ("00014": {...}) or number (14)
  if (nocDb && typeof nocDb === 'object') {
    const obj = nocDb as AnyRec;
    return (obj[code5] || obj[String(Number(code5))]) ?? null;
  }
  return null;
}

function extractMainDuties(rec: AnyRec | null): string[] {
  if (!rec) return [];
  const dutyLikeKeys = Object.keys(rec).filter((k) =>
    /(main[_ ]?dut(y|ies)|duties)/i.test(k)
  );
  const collected = dutyLikeKeys.map((k) => rec[k]);

  const flattened = collected
    .flatMap((v) => (Array.isArray(v) ? v : String(v).split(/\r?\n|•/g)))
    .map((s) => String(s).replace(/^[•\-\u2022]\s*/, '').trim())
    .filter(Boolean);

  // de-duplicate while preserving order
  return Array.from(new Set(flattened));
}
// Minimal local fallbacks so the UI works if JSON has no duties
const DUTY_FALLBACKS: Record<string, string[]> = {
  '00014': [
    'Direct corporate strategy and long-term goals across business units.',
    'Approve budgets and allocate material, human and financial resources.',
    'Establish policies and performance targets; review results with directors.',
    'Represent the organization to partners, media, or government.',
    'Authorize major hires, contracts and organizational changes.',
  ],
};

// Fallback: hydrate mainDuties (and TEER) from bundled NOC 2021 if picker item lacks them
async function ensureMainDuties(noc: NocBasics): Promise<NocBasics> {
  try {
    if (noc.mainDuties && noc.mainDuties.length) return noc;

    const code5 = normCode(noc.code);
    const rec = getRecordFor(code5);

    let duties = extractMainDuties(rec);
    // 👇 If JSON lacks duties, fall back to our local list
    if (duties.length === 0 && DUTY_FALLBACKS[code5]?.length) {
  duties = DUTY_FALLBACKS[code5];
}
console.log('[NOC] using duties for', code5, duties.slice(0, 3));


    const teer =
      noc.teer ??
      (rec?.teer != null ? String(rec.teer) : undefined) ??
      (rec?.TEER != null ? String(rec.TEER) : undefined) ??
      teerFromCode(code5);

    return { ...noc, mainDuties: duties, teer };
  } catch {
    return noc;
  }
}



export default function NOCVerify() {
  const [sourceLabel, setSourceLabel] = useState<string>('');

  const [state, setState] = useState<NocVerifyState | null>(null);
  const [busy, setBusy] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [noteEditId, setNoteEditId] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportForm, setExportForm] = useState<ExportForm>({
    
    applicantName: '',
    jobTitle: '',
    employerName: '',
    startDateISO: '',
  });
// Reset rules manifest/cache whenever this screen mounts
useEffect(() => {
  resetNocRulesCache();
}, []);

  useEffect(() => {
    (async () => {
      const cur = await loadState();
      setState(cur);
      setBusy(false);
    })();
  }, []);


  
const progress = useMemo(() => computeProgress(state?.duties || []), [state?.duties]);

  // --- Handlers ---
  const onPickNoc = async (noc: NocBasics) => {
  setBusy(true);
  try {
    // 1) Try Rules-JSON first
    const rules = await fetchNocFromRules(String(noc.code));
    let toSave: NocBasics | null = null;

    if (rules && Array.isArray(rules.mainDuties) && rules.mainDuties.length) {
      toSave = {
        code: rules.code,
        title: (noc.title ?? rules.title ?? '').trim(),
        teer: String(rules.teer ?? teerFromCode(rules.code) ?? ''),
        mainDuties: rules.mainDuties,
      };
      setSourceLabel('Source: Rules snapshot');
      
    } else {
      // 2) Fallback to live (ESDC/Job Bank)
      try {
        const live = await fetchNocFromLive(String(noc.code));
toSave = {
  code: live.code,
  title: (noc.title ?? live.title ?? '').trim(),
  teer: String(live.teer ?? teerFromCode(live.code) ?? ''),
  mainDuties: (live as any).mainDuties ?? (live as any).duties ?? [],
};

const src = String((live as any).source || ''); // ✅ define src
setSourceLabel(
  src.includes('noc.esdc.gc.ca') ? 'Source: ESDC (NOCProfile)'
  : src.includes('jobbank.gc.ca') ? 'Source: Job Bank'
  : 'Source: Live'
);

        
        setSourceLabel(
          src.includes('noc.esdc.gc.ca') ? 'Source: ESDC (NOCProfile)'
          : src.includes('jobbank.gc.ca') ? 'Source: Job Bank'
          : 'Source: Live'
        );
      } catch {
        // ignore and try local fallback next
      }
    }

    // 3) Final fallback: bundled JSON (ensureMainDuties)
    if (!toSave || !toSave.mainDuties?.length) {
      toSave = await ensureMainDuties(noc);
      setSourceLabel('Source: Local (bundled JSON)');
      if (!toSave.mainDuties?.length) {
        throw new Error('No duties available from Rules/Live/Local.');
      }
    }

    // 4) Persist + reflect in UI
    const next = await setSelectedNoc(toSave);

    if (!next?.duties || next.duties.length === 0) {
      const checks = (toSave.mainDuties || []).map((text, i) => ({
        id: `${toSave.code}-${i}`,
        text,
        checked: false,
        note: '',
      }));
      setState({
        ...(next || {}),
        selectedNocCode: toSave.code,
        selectedNocTitle: toSave.title,
        selectedNocTeer: toSave.teer,
        duties: checks,
      } as NocVerifyState);
    } else {
      setState(next);
    }
  } catch (e: any) {
    console.warn('[NOC] fetch failed', e);
    Alert.alert('Could not load NOC duties', String(e?.message || e));
  } finally {
    setBusy(false);
    setPickerOpen(false);
  }
};

  const onToggleDuty = async (d: DutyCheck, checked: boolean) => {
    const next = await toggleDuty(d.id, checked);
    setState(next);
  };

  const onSaveNote = async (dutyId: string, note?: string) => {
    const next = await setDutyNote(dutyId, note);
    setState(next);
    setNoteEditId(null);
  };

  const onOpenExport = () => {
    if (!state?.selectedNocCode) {
      Alert.alert('Pick NOC first', 'Please select a NOC to proceed.');
      return;
    }
    setExportForm(f => ({
      ...f,
      jobTitle: f.jobTitle || state?.selectedNocTitle || '',
      startDateISO: f.startDateISO || '',
    }));
    setExportOpen(true);
  };

  const onExport = async () => {
  if (!state) return;

  const hoursPerWeekNum = exportForm.hoursPerWeek
    ? parseInt(exportForm.hoursPerWeek, 10)
    : undefined;

  // 1) Load template (Remote→Cache→Local with validators)
  let templateData: string;
  try {
    const res = await loadRefLetterTemplate();
    templateData = res.data;
  } catch {
    // ultra-safe fallback (shouldn’t hit often)
    templateData = '';
  }

  // 2) Build input from current form + state
  const input: RefLetterInput = {
    applicantName: exportForm.applicantName || '(Applicant Name)',
    jobTitle: exportForm.jobTitle || state.selectedNocTitle || '(Job Title)',
    employerName: exportForm.employerName || '(Employer)',
    employerAddress: exportForm.employerAddress || '(Address)',
    startDateISO: exportForm.startDateISO || 'YYYY-MM-DD',
    endDateISO: exportForm.endDateISO,
    hoursPerWeek: hoursPerWeekNum,
    salaryPerYear: exportForm.salaryPerYear,
    supervisorName: exportForm.supervisorName,
    supervisorTitle: exportForm.supervisorTitle,
    contactEmail: exportForm.contactEmail,
    contactPhone: exportForm.contactPhone,
    nocCode: state.selectedNocCode || '(NOC)',
    nocTitle: state.selectedNocTitle || '(Title)',
    duties: state.duties || [],
  };

  // 3) Render markdown using the remote template;
  // if templateData empty, fallback to inline generator you already have
  let md: string;
  if (templateData && templateData.trim().length > 0) {
    md = applyRefLetterTemplate(templateData, input);
  } else {
    md = buildReferenceLetterMarkdown(input);
  }

  // 4) Copy to clipboard
  await Clipboard.setStringAsync(md);

  // 5) Save + share
  try {
    const fileName = `reference_letter_${state.selectedNocCode || 'NOC'}.md`;
    const cacheDir = (FileSystem as any).cacheDirectory as string | null | undefined;
    const docDir = (FileSystem as any).documentDirectory as string | null | undefined;
    const baseDir = cacheDir ?? docDir;
    if (!baseDir) throw new Error('No available filesystem directory (cache/document)');
    const uri = baseDir + fileName;

    await FileSystem.writeAsStringAsync(uri, md, { encoding: 'utf8' });

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        dialogTitle: 'Export reference letter',
        mimeType: 'text/markdown',
      });
    } else {
      Alert.alert('Copied to clipboard', `Saved file at:\n${uri}`);
    }
  } catch (e: any) {
    Alert.alert('Export error', String(e?.message || e));
  }

  setExportOpen(false);
};

  if (busy) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.mono}>Loading…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.h1}>NOC Verification</Text>
          {state?.selectedNocCode ? (
  <>
    <Text style={styles.sub}>
      {state.selectedNocCode} · {state.selectedNocTitle} {state.selectedNocTeer ? `· ${state.selectedNocTeer}` : ''}
    </Text>
    {!!sourceLabel && <Text style={styles.src}>{sourceLabel}</Text>}
  </>
) : (
  <Text style={styles.sub}>Pick your NOC to compare duties and capture evidence.</Text>
)}

        </View>

        <Pressable style={styles.primaryBtn} onPress={() => setPickerOpen(true)}>
          <Text style={styles.primaryBtnText}>{state?.selectedNocCode ? 'Change NOC' : 'Pick NOC'}</Text>
        </Pressable>
      </View>

      {/* Progress */}
      <View style={styles.progressRow}>
        <Text style={styles.progressText}>
          Matched {progress.matched} / {progress.total}
        </Text>
        <Pressable style={styles.secondaryBtn} onPress={onOpenExport}>
          <Text style={styles.secondaryBtnText}>Export letter</Text>
        </Pressable>
      </View>

      {/* Duties */}
      {state?.duties?.length ? (
        <FlatList
          data={state.duties}
          keyExtractor={(d) => d.id}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.row}>
                <Switch value={!!item.checked} onValueChange={(v) => onToggleDuty(item, v)} />
                <Text style={styles.dutyText}>{item.text}</Text>
              </View>

              {/* Evidence hints */}
              <View style={styles.hintBox}>
                <Text style={styles.hintTitle}>Suggested evidence</Text>
                {suggestEvidenceForDuty(item.text).map((h, idx) => (
                  <Text key={idx} style={styles.hintItem}>• {h}</Text>
                ))}
              </View>

              {/* Note */}
              {noteEditId === item.id ? (
                <View style={{ marginTop: 8 }}>
                  <TextInput
                    style={styles.noteInput}
                    placeholder="Add a note/evidence detail…"
                    defaultValue={item.note}
                    multiline
                  />
                  <View style={styles.noteBtns}>
                    <Pressable
                      style={styles.secondaryBtn}
                      onPress={() => setNoteEditId(null)}
                    >
                      <Text style={styles.secondaryBtnText}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      style={styles.primaryBtn}
                      onPress={async () => {
                        const text = (document?.activeElement as any)?.value; // web fallback
                        // On native, we’ll grab value via ref; simpler approach:
                        const node = (global as any).__lastNoteText || '';
                        await onSaveNote(item.id, node || text || item.note || '');
                      }}
                    >
                      <Text style={styles.primaryBtnText}>Save note</Text>
                    </Pressable>
                  </View>
                  {/* Hidden capture of text for native: store last typed value globally */}
                  <TextInput
                    style={{ height: 0, width: 0, padding: 0, margin: 0 }}
                    onChangeText={(t) => ((global as any).__lastNoteText = t)}
                    defaultValue={item.note}
                  />
                </View>
              ) : (
                <View style={styles.noteRow}>
                  <Text style={styles.noteText}>
                    {item.note ? `Note: ${item.note}` : 'No note'}
                  </Text>
                  <Pressable onPress={() => setNoteEditId(item.id)}>
                    <Text style={styles.link}>Edit</Text>
                  </Pressable>
                </View>
              )}
            </View>
          )}
          contentContainerStyle={{ paddingBottom: 32 }}
        />
      ) : (
        <View style={styles.centerPad}>
          <Text>No duties loaded yet. Pick a NOC.</Text>
        </View>
      )}

      {/* NOC picker modal */}
<Modal visible={pickerOpen} animationType="slide">
  <View style={{ flex: 1, backgroundColor: 'white' }}>
    <View style={styles.modalHeader}>
      <Text style={styles.h2}>Select NOC</Text>
      <Pressable onPress={() => setPickerOpen(false)}>
        <Text style={styles.link}>Close</Text>
      </Pressable>
    </View>

    <NocPicker
  value={
    state?.selectedNocCode
      ? { code: state.selectedNocCode, title: state.selectedNocTitle ?? '' }
      : null
  }
  onChange={async (item) => {
    if (!item) return;
    // TEER & duties will be hydrated from nocDb inside ensureMainDuties(...)
    await onPickNoc({
      code: String(item.code),
      title: String(item.title),
      teer: undefined,
      mainDuties: [],
    });
  }}
/>

  </View>
</Modal>

      {/* Export modal */}
      <Modal visible={exportOpen} animationType="slide">
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32, backgroundColor: 'white' }}>
          <View style={styles.modalHeader}>
            <Text style={styles.h2}>Export Reference Letter</Text>
            <Pressable onPress={() => setExportOpen(false)}>
              <Text style={styles.link}>Close</Text>
            </Pressable>
          </View>

          {renderField('Applicant name', 'applicantName')}
          {renderField('Job title', 'jobTitle')}
          {renderField('Employer name', 'employerName')}
          {renderField('Employer address', 'employerAddress')}
          {renderField('Start date (YYYY-MM-DD)', 'startDateISO')}
          {renderField('End date (YYYY-MM-DD, optional)', 'endDateISO')}
          {renderField('Hours per week (e.g., 40)', 'hoursPerWeek')}
          {renderField('Salary per year (e.g., PKR 3,600,000)', 'salaryPerYear')}
          {renderField('Supervisor name', 'supervisorName')}
          {renderField('Supervisor title', 'supervisorTitle')}
          {renderField('Contact email', 'contactEmail')}
          {renderField('Contact phone', 'contactPhone')}

          <Pressable style={[styles.primaryBtn, { marginTop: 16 }]} onPress={onExport}>
            <Text style={styles.primaryBtnText}>Generate & Share</Text>
          </Pressable>
          <Text style={styles.helpText}>
            Tip: The full markdown is also copied to clipboard for quick paste.
          </Text>
        </ScrollView>
      </Modal>
    </View>
  );

  function renderField(label: string, key: keyof ExportForm) {
    return (
      <View style={{ marginBottom: 12 }}>
        <Text style={styles.label}>{label}</Text>
        <TextInput
          style={styles.input}
          value={(exportForm[key] as any) || ''}
          onChangeText={(t) => setExportForm((f) => ({ ...f, [key]: t }))}
          placeholder=""
        />
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'white' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  h1: { fontSize: 20, fontWeight: '700' },
  h2: { fontSize: 18, fontWeight: '700' },
  sub: { color: '#555', marginTop: 2 },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 8 },
  progressText: { fontSize: 14, color: '#333' },
  primaryBtn: { backgroundColor: '#1f6feb', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  primaryBtnText: { color: 'white', fontWeight: '600' },
  secondaryBtn: { borderWidth: StyleSheet.hairlineWidth, borderColor: '#999', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  secondaryBtnText: { color: '#333', fontWeight: '600' },
  card: { marginHorizontal: 16, marginVertical: 8, padding: 12, borderRadius: 12, backgroundColor: '#fafafa', borderWidth: StyleSheet.hairlineWidth, borderColor: '#eee' },
  row: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  dutyText: { flex: 1, fontSize: 15, color: '#222' },
  hintBox: { marginTop: 8, padding: 8, backgroundColor: '#fff', borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: '#eee' },
  hintTitle: { fontWeight: '600', marginBottom: 4, color: '#444' },
  hintItem: { color: '#444' },
  noteRow: { marginTop: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  noteText: { color: '#444', flex: 1, marginRight: 12 },
  link: { color: '#1f6feb', fontWeight: '600' },
  noteInput: { minHeight: 80, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 8, backgroundColor: 'white' },
  noteBtns: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 8 },
  label: { fontSize: 12, color: '#555', marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, backgroundColor: 'white' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  centerPad: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  mono: { fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }), color: '#777', marginTop: 8 },
  helpText: { color: '#666', marginTop: 8 },
  src: { color: '#666', fontSize: 12, marginTop: 2 },

});

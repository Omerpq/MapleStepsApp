// src/screens/ScoreScreen.tsx

import React, { useEffect, useState, useMemo } from "react";
import { View, Text, TextInput, StyleSheet, Switch, Pressable, Platform, ScrollView, KeyboardAvoidingView } from "react-native";
import PrimaryButton from "../components/PrimaryButton";
import { colors } from "../theme/colors";
import { getRulesVersion } from "../services/rules";
import { calculateCrs, getCrsVersion, primeCrsParams, getCrsLastSynced, loadCRSSessionExtras, saveCRSSessionExtras, computeAdditionalCRS, withAdditionalCRS, type CRSAdditionalInputs,} from "../services/crs";
import { calculateFsw67, getFswVersion, primeFswParams, getFswLastSynced } from "../services/fsw67";
import RulesBadge from "../components/RulesBadge";
import { Picker } from "@react-native-picker/picker";
import { useNavigation } from "@react-navigation/native";
import { FSW_EDUCATION_OPTIONS, type FswEducationValue } from "../constants/education";

import NocBadge from "../components/NocBadge"; // adjust to "@/components/NocBadge" if you use path aliases
import NocPicker from "../components/NocPicker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useNoc } from "../hooks/useNoc";


import { readAndClearLanguageClbForScore } from "../services/language"; // NEW (S2-02)

// S3-02 (CRS Optimizer + Draw Proximity)
import { runOptimizer } from "../services/crsOptimizer";
import { computeProximity } from "../services/draws";
import CRSOptimizerCard from "../components/CRSOptimizerCard";
import DrawProximityCard from "../components/DrawProximityCard";
import WhatIfCLBCard from "../components/WhatIfCLBCard";



type FswEducationKey = Parameters<typeof calculateFsw67>[0]["education"];

// ------- FSW warnings (non-blocking, accessible) -------
type FswWarningsProps = {
  showEca: boolean;
  showPof: boolean;
};



const FswWarnings: React.FC<FswWarningsProps> = ({ showEca, showPof }) => {
  if (!showEca && !showPof) return null;



  return (
    <View
      style={warnStyles.wrap}
      accessible
      accessibilityRole="summary"
      accessibilityLabel="Important notes for Federal Skilled Worker eligibility"
    >
      <Text style={warnStyles.title}>Heads-up</Text>

      {showEca && (
        <View
          style={warnStyles.card}
          accessibilityRole="text"
          accessibilityLiveRegion="polite"
          testID="fsw-warning-eca"
        >
          <Text style={warnStyles.text}>ECA required for foreign education.</Text>
        </View>
      )}

      {showPof && (
        <View
          style={warnStyles.card}
          accessibilityRole="text"
          accessibilityLiveRegion="polite"
          testID="fsw-warning-pof"
        >
          <Text style={warnStyles.text}>
            Proof of funds required unless you have a valid job offer.
          </Text>
        </View>
      )}
    </View>
  );
};

const warnStyles = StyleSheet.create({
  wrap: { marginTop: 8, marginBottom: 8, gap: 8 },
  title: { fontWeight: "600", fontSize: 14, color: colors.text },
  card: {
    backgroundColor: "#FFF7E6",     // soft amber
    borderLeftWidth: 4,
    borderLeftColor: "#F59E0B",     // amber-500
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  text: { fontSize: 13, color: colors.text },
});
// ------- end FSW warnings -------

type Props = { navigation?: any };

export default function ScoreScreen({ navigation: navProp }: Props) {
  const navigation = navProp ?? useNavigation();

useEffect(() => {
  const unsubFocus = navigation?.addListener?.("focus", () => {
    // Pick up a CLB pushed by the Language Planner (one-shot handoff)
    (async () => {
      const handed = await readAndClearLanguageClbForScore();
      if (handed != null) {
        setClb(String(handed));
      }
    })();
  });
  const unsubBlur = navigation?.addListener?.("blur", () => {});

  return () => {
    try { unsubFocus && unsubFocus(); } catch {}
    try { unsubBlur && unsubBlur(); } catch {}
  };
}, [navigation]);

  // Shared inputs
  const [age, setAge] = useState("29");
  const [clb, setClb] = useState("9");
  const [education, setEducation] = useState<FswEducationKey>("bachelor");
  const [eduFocused, setEduFocused] = useState(false);
  const [noc, setNoc] = useState<{ code: string; title: string } | null>(null);
  const { categories } = useNoc();
const teer = useMemo(
  () => (noc?.code && /^\d{5}$/.test(noc.code) ? Number(noc.code[1]) : undefined),
  [noc?.code]
);
const nocCats = useMemo(
  () => (noc?.code ? categories.filter((c) => c.noc_codes.includes(noc.code)) : []),
  [categories, noc?.code]
);
// S3-02 state
const [opt, setOpt] = useState<{
  base: number; additional: number; total: number;
  suggestions: { id: string; title: string; estGain: number; details: string }[];
} | null>(null);

const [prox, setProx] = useState<{
  freshness: { source: "remote" | "cache" | "local"; cachedAt: number | null; meta?: any };
  items: { label: string; cutoff: number; delta: number; date?: string; sourceUrl?: string }[];
} | null>(null);

  







// Save whenever NOC changes
useEffect(() => {
  (async () => {
    try {
      if (noc) {
        const teer = /^\d{5}$/.test(noc.code) ? Number(noc.code[1]) : undefined;
        await AsyncStorage.setItem(
          "ms_selected_noc_v1",
          JSON.stringify({ code: noc.code, title: noc.title, teer })
        );
      } else {
        await AsyncStorage.removeItem("ms_selected_noc_v1");
      }
    } catch {}
  })();
}, [noc]);



  const [fswSynced, setFswSynced] = useState<string>("local");

  // Re‑prime rules whenever this screen gains focus
  React.useEffect(() => {
    const unsub = navigation.addListener("focus", () => {
      primeCrsParams();
      primeFswParams();
    });
    return unsub;
  }, [navigation]);

  // CRS output
  const [crsScore, setCrsScore] = useState<number | null>(null);
  const [crsSynced, setCrsSynced] = useState<string>("local");

  // B6 — additional CRS (session)
  const [extras, setExtras] = useState<CRSAdditionalInputs>(loadCRSSessionExtras());
  useEffect(() => { saveCRSSessionExtras(extras); }, [extras]);
  const additionalCRS = computeAdditionalCRS(extras);

  // S3-02 — compute Optimizer + Draw Proximity whenever inputs change
useEffect(() => {
  // Map screen fields → numbers the calculators expect
  const AGE = Number(age) || 0;
  const PRIMARY_CLB = Number(clb) || 0;
  const EDUCATION_ANY = education as any;


  // Use your existing calculators (already imported in this file)
  const baseNow = calculateCrs({ age: AGE, clb: PRIMARY_CLB, education: EDUCATION_ANY });
  const addNow  = computeAdditionalCRS(extras);
  const totalNow = baseNow + addNow;

  // 1) Optimizer — inject your calculators
  const result = runOptimizer(
    { age: AGE, clb: PRIMARY_CLB, education: EDUCATION_ANY, extras },
    {
      crsCore: ({ age, clb, education }) => calculateCrs({ age, clb, education: education as any }),
      additional: (x) => computeAdditionalCRS(x),
    }
  );
  setOpt(result);

  // 2) Draw proximity — uses your rounds loader under the hood
  computeProximity(totalNow)
    .then((r) => {
      setProx({
        freshness: { source: r.rounds.source, cachedAt: r.rounds.cachedAt ?? null, meta: r.rounds.meta },
        items: r.items,
      });
    })
    .catch(() => setProx(null));
}, [age, clb, education, extras]);


  // FSW-67 inputs
  const [fswYears, setFswYears] = useState("3");
  const [fswArranged, setFswArranged] = useState(false);

  // Adaptability toggles
  const [adSpouseCLB4, setAdSpouseCLB4] = useState(false);
  const [adRelativeCA, setAdRelativeCA] = useState(false);
  const [adCanadianStudy, setAdCanadianStudy] = useState(false);
  const [adArranged, setAdArranged] = useState(false);
  const [adCanadianWork1yr, setAdCanadianWork1yr] = useState(false);
  
  useEffect(() => {
    if (fswArranged) setAdArranged(true);
  }, [fswArranged]);

  // B7 — contextual warnings (derived)
  // Show ECA warning only if user is claiming any (secondary or higher) education AND it's likely foreign
  const educationRequiresEca = [
    "secondary",
    "diploma-1yr",
    "diploma-2yr",
    "twoOrMore",
    "bachelor",
    "master",
    "phd",
  ].includes(String(education));

  const showEcaWarning = educationRequiresEca && !adCanadianStudy; // likely foreign if no Canadian study toggle
  const showPofWarning = !fswArranged;                              // PoF needed unless there’s a valid job offer


  // FSW-67 output
  const [fswResult, setFswResult] = useState<null | {
    total: number;
    pass: boolean;
    passMark: number;
    classification: "Likely" | "Borderline" | "Unlikely";
    version: string;
    breakdown: Record<string, number>;
  }>(null);

  const rulesVersion = getRulesVersion();
  const crsVersion = getCrsVersion();
  const fswVersion = getFswVersion();

  // 🔌 Load CRS/FSW params (remote-first) once on mount
  useEffect(() => {
    primeCrsParams().then(() => setCrsSynced(getCrsLastSynced()));
    primeFswParams().then(() => setFswSynced(getFswLastSynced()));
  }, []);

  const runCrs = () => {
  const s = calculateCrs({
    age: Number(age) || 0,
    clb: Number(clb) || 0,
education,
  });

  // B6 — combine base with extras
  const baseTotal = Number(s) || 0;
  const { total: totalWithExtras } = withAdditionalCRS(baseTotal, extras);

  setCrsScore(totalWithExtras);
};


  const runFsw = () => {
    const res = calculateFsw67({
      age: Number(age) || 0,
      clb: Number(clb) || 0,
      education,
      experienceYears: Number(fswYears) || 0,
      arrangedEmployment: fswArranged,
      adaptability: {
        spouse_language_clb4: adSpouseCLB4,
        relative_in_canada: adRelativeCA,
        canadian_study: adCanadianStudy,
        arranged_employment: adArranged,
        canadian_work_1yr: adCanadianWork1yr,
      },
    });
    setFswResult(res);
  };

  return (
    <KeyboardAvoidingView
  style={{ flex: 1 }}
  behavior={Platform.OS === "ios" ? "padding" : undefined}
>
  <ScrollView
    style={styles.scroll}
    contentContainerStyle={styles.content}
    keyboardShouldPersistTaps="handled"
    keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
  >

      <Text style={styles.h1}>Eligibility Score — v2</Text>
      <RulesBadge />
      <NocBadge />
      
{/* NOC 2021 — picker */}
<View style={{ marginVertical: 12 }}>
  <Text style={[styles.label, { width: "100%", paddingTop: 0, marginBottom: 6 }]}>
    Your NOC (2021)
  </Text>

  <NocPicker value={noc} onChange={setNoc} />

  {noc && (
  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 }}>
    <Text style={styles.subtleLine}>
      Selected: {noc.code} — {noc.title}
    </Text>
    <Pressable
      onPress={() => setNoc(null)}
      style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: "#eee" }}
      accessibilityRole="button"
      accessibilityLabel="Clear selected NOC"
    >
      <Text style={{ color: "#333", fontWeight: "600" }}>Clear</Text>
    </Pressable>
  </View>
)}

</View>
      {/* Shared inputs */}
      <View style={styles.row}>
        <Text style={styles.label}>Age</Text>
        <TextInput
  keyboardType="number-pad"
  value={age}
  onChangeText={setAge}
  style={styles.input}
  testID="sc-age"
/>

      </View>
      <View style={styles.row}>
  <Text style={styles.label}>Primary language CLB</Text>
  <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8 }}>
    <TextInput
      keyboardType="number-pad"
      value={clb}
      onChangeText={setClb}
      style={[styles.input, { flex: 1 }]}
      testID="sc-clb"
    />
    <Pressable
      onPress={() => navigation.navigate("LanguagePlanner" as never)}
      accessibilityRole="button"
      style={styles.pillLink}
      testID="sc-open-language-planner"
    >
      <Text style={styles.pillLinkText}>Planner</Text>
    </Pressable>
  </View>
</View>

      <View style={styles.row}>
  <Text style={styles.label}>Education</Text>

  {/* Same structure as QuickCheck: a plain flex container with a bordered box */}
  <View style={styles.pickerPlain}>
    <Picker<FswEducationKey>
      selectedValue={education}
      onValueChange={(v: FswEducationKey) => setEducation(v)}
      testID="sc-education"
      style={Platform.OS === 'android' ? { height: 50 } : undefined}
    >
      {FSW_EDUCATION_OPTIONS.map(o => (
        <Picker.Item key={o.value} label={o.label} value={o.value} />
      ))}
    </Picker>
  </View>
</View>


 {/* FSW-67 (demo) */}
 <Text style={styles.h2}>FSW-67 — Eligibility Check</Text>
 <Text style={styles.subtleLine}>Uses Age, CLB, Education from above (FSW only)</Text>
 <View style={{ height: 8 }} />

{/* B7 — contextual warnings */}
<FswWarnings showEca={showEcaWarning} showPof={showPofWarning} />


      <View style={styles.row}>
  <Text style={styles.label}>Skilled experience years</Text>
  <TextInput
    keyboardType="number-pad"
    value={fswYears}
    onChangeText={setFswYears}
    style={styles.input}
    testID="sc-fsw-years"
  />
</View>

<View style={styles.row}>
  <Text style={styles.label}>Arranged employment — 10 points (FSW factor)</Text>
  <Switch value={fswArranged} onValueChange={setFswArranged} testID="sc-fsw-arranged" />
</View>


<Text style={[styles.h2, { marginTop: 10 }]}>Adaptability (max 10)</Text>
<Text style={styles.subtleLine}>These items add up but the total is capped at 10 points.</Text>

<View style={[styles.row, { alignItems: "center" }]}>
  <Text style={styles.label}>Spouse language ≥ CLB4 (+5)</Text>
  <Switch value={adSpouseCLB4} onValueChange={setAdSpouseCLB4} testID="sc-ad-spouse" />
</View>

<View style={[styles.row, { alignItems: "center" }]}>
  <Text style={styles.label}>Relative in Canada (+5)</Text>
  <Switch value={adRelativeCA} onValueChange={setAdRelativeCA} testID="sc-ad-relative" />
</View>

<View style={[styles.row, { alignItems: "center" }]}>
  <Text style={styles.label}>Canadian study (+5)</Text>
  <Switch value={adCanadianStudy} onValueChange={setAdCanadianStudy} testID="sc-ad-study" />
</View>

<View style={[styles.row, { alignItems: "center" }]}>
  <Text style={styles.label}>Adaptability: arranged employment — +5 (counts toward max 10)</Text>
  <Switch value={adArranged} onValueChange={setAdArranged} testID="sc-ad-arranged" />
</View>

<View style={[styles.row, { alignItems: "center" }]}>
  <Text style={styles.label}>Canadian skilled work (1+ year) (+10)</Text>
  <Switch value={adCanadianWork1yr} onValueChange={setAdCanadianWork1yr} testID="sc-ad-work1yr" />
</View>

<PrimaryButton title="FSW-67 Check" onPress={runFsw} testID="sc-fsw-check" />


      {fswResult && (
  <Text style={styles.cardMeta} testID="sc-fsw-result">
    Score {fswResult.total} / {fswResult.passMark}
  </Text>
)}


      {/* B6 — Additional CRS */}
        <View style={styles.card}>
        <Text style={styles.cardTitle}>Additional CRS</Text>
        <Text style={styles.cardMeta}>PNP, sibling, French, Canadian study</Text>
        
        {/* PNP */}
<View style={[styles.row, { alignItems: "center" }]}>
  <Text style={styles.label}>Provincial Nomination (PNP)</Text>
  <Switch
    value={extras.hasPNP}
    onValueChange={(v) => setExtras((e) => ({ ...e, hasPNP: v }))}
    testID="sc-b6-pnp"
  />
</View>


        {/* Sibling */}
        <View style={[styles.row, { alignItems: "center" }]}>
          <Text style={styles.label}>Sibling in Canada</Text>
          <Switch
          value={extras.hasSibling}
          onValueChange={(v) => setExtras((e) => ({ ...e, hasSibling: v }))}
          testID="sc-b6-sibling"
        />

        </View>

        {/* French CLB */}
        <View style={styles.row}>
          <Text style={styles.label}>French CLB (0–10)</Text>
          <TextInput
            style={styles.input}
            keyboardType="number-pad"
            placeholder="0–10"
            value={String(extras.frenchCLB ?? 0)}
            onChangeText={(t) => {
              const n = Math.max(0, Math.min(10, Number(t.replace(/[^0-9]/g, "")) || 0));
              setExtras((e) => ({ ...e, frenchCLB: n }));
            }}
            maxLength={2}
            testID="sc-b6-french-clb"

          />
        </View>
        <Text style={styles.hint}>French bonus: CLB 5–6 +25; 7–10 +50 (not cumulative).</Text>

        {/* Canadian Study */}
        <View style={{ marginTop: 4 }}>
          <Text style={[styles.cardMeta, { marginBottom: 6 }]}>Canadian Study</Text>
          <View style={styles.pills}>
            {[
              { key: 'none', label: 'None' },
              { key: '1-2', label: '1–2 years' },
              { key: '2+', label: '2+ years' },
            ].map((opt) => {
              const active = extras.study === (opt.key as typeof extras.study);
              return (
                <Pressable
                  key={opt.key}
                  onPress={() => setExtras((e) => ({ ...e, study: opt.key as typeof e.study }))}
                  style={[styles.pill, active && styles.pillActive]}
                >
                  <Text style={[styles.pillText, active && styles.pillTextActive]}>{opt.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        {/* Totals preview for this section */}
        <View style={[styles.row, { alignItems: "center", justifyContent: "space-between", marginTop: 8 }]}>
          <Text style={styles.cardMeta}>Additional points</Text>
          <Text style={styles.addVal}>+{additionalCRS}</Text>
        </View>
      </View>

      {/* Divider */}
      
{/* CRS (demo) */}
<Text style={styles.h2}>CRS — Estimate</Text>
<Text style={styles.subtleLine}>Uses Age, CLB, Education and “Additional CRS” (B6) above</Text>
<View style={{ height: 8 }} />

<View style={{ marginBottom: 6 }}>
  <PrimaryButton title="Calculate CRS" onPress={runCrs} />
</View>

{crsScore !== null && (
  <View style={{ marginTop: 0, marginBottom: 20 }}>
    <Text style={styles.result}>
      CRS estimate: <Text style={{ fontWeight: "800" }}>{crsScore}</Text>
    </Text>
    <Text style={styles.subtleLine}>Includes +{additionalCRS} from PNP/Sibling/French/Study</Text>
  </View>
)}

      <View style={{ height: 16 }} />

    {/* S3-02 — What-if slider (CLB) */}
<View style={{ marginTop: 16 }}>
  <WhatIfCLBCard
    age={Number(age) || 0}
    educationAny={education as any}
    extras={extras}
    currentCLB={Number(clb) || 0}
    currentTotal={calculateCrs({ age: Number(age) || 0, clb: Number(clb) || 0, education: education as any }) + additionalCRS}
  />
</View>



    {/* S3-02 — CRS Optimizer */}
      {opt && (
        <View style={{ marginTop: 16 }}>
          <CRSOptimizerCard
            base={opt.base}
            additional={opt.additional}
            total={opt.total}
            suggestions={opt.suggestions}
          />
        </View>
      )}

{/* S3-02 — Draw Proximity */}
{prox && (
  <View style={{ marginTop: 12 }}>
    <DrawProximityCard freshness={prox.freshness} items={prox.items} />
  </View>
)}

{/* S3-03 --- PNP Mapper quick entry (canonical) --- */}
<View style={styles.pnpCard}>
  <Text style={styles.pnpTitle}>Provincial Nominee Programs (PNP)</Text>
  <Text style={styles.pnpSub}>
    Map your profile to suggested provincial streams and open the official pages.
  </Text>
  <Pressable
    onPress={() => navigation.navigate("PNPMapper" as never)}
    style={({ pressed }) => [styles.pnpBtn, pressed && { opacity: 0.85 }]}
    accessibilityRole="button"
    testID="sc-open-pnp-mapper"
  >
    <Text style={styles.pnpBtnText}>Open PNP Mapper</Text>
  </Pressable>
</View>


{/* EE Profile Checklist — maple red button (outside the Provincial options card) */}
<View style={{ height: 10 }} />
<Pressable
  onPress={() => navigation.navigate("EEProfileChecklist")}
  accessibilityRole="button"
  testID="sc-open-ee-checklist"
  style={{
    alignSelf: "stretch",
    paddingVertical: 12,
    borderRadius: 10,           // button (not pill)
    backgroundColor: "#B91C1C", // maple red
    borderWidth: 1,
    borderColor: "#991B1B",
    justifyContent: "center",
    alignItems: "center",
  }}
>
  <Text style={{ fontSize: 15, fontWeight: "800", color: "#FFFFFF" }}>
    EE Profile Checklist
  </Text>
</Pressable>

      </ScrollView>
</KeyboardAvoidingView>

  );

  
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 16, backgroundColor: "#fff" },
  h1: { fontSize: 22, fontWeight: "700", color: colors.text, marginBottom: 4 },
  h2: { fontSize: 18, fontWeight: "700", color: colors.text, marginBottom: 8, marginTop: 4 },
  meta: { color: "#666", marginBottom: 2 },
  metaSmall: { color: "#888", marginBottom: 12, fontSize: 12 },

  row: { flexDirection: "row", marginBottom: 8 },
  label: { width: 240, color: colors.text, paddingTop: 10 },

  input: { flex: 1, borderWidth: 1, borderColor: "#ddd", borderRadius: 6, padding: 10, backgroundColor: "#fafafa" },
  scroll: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 16 },

  // Picker outer ring + container
  pickerFocusWrap: { flex: 1, borderRadius: 8, padding: 2, borderWidth: 0, width: '100%' }, // give it width
  pickerFocusWrapActive: { borderWidth: 2, borderColor: "#2563eb" },                  // blue outer ring
  pickerContainer: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 6,
    overflow: "hidden",
    minHeight: 44,
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  pickerBase: {},
  pickerBaseAndroid: { height: 44 },   // NEW

  result: { marginTop: 12, fontWeight: "600", color: colors.mapleRed },

  card: { marginTop: 12, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: "#eee", backgroundColor: "#fafafa" },
  cardTitle: { fontSize: 16, fontWeight: "700", marginBottom: 4 },
  cardMeta: { color: "#666" },
  subtleLine: { fontSize: 12, color: "#666", marginTop: 4 },
  hint: { fontSize: 12, color: "#666", marginTop: 4 },

  // B6 pills
  pills: { flexDirection: "row", gap: 8 },
  pill: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: "#ddd" },
  pillActive: { backgroundColor: "#111", borderColor: "#111" },
  pillText: { fontSize: 13 },
  pillTextActive: { color: "#fff", fontWeight: "600" },
  addVal: { fontSize: 14, fontWeight: "700" },

  breakdown: { marginTop: 8, gap: 2 },
  pillLink: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#ddd",
    backgroundColor: "#fff",
  },
  pillLinkText: { color: colors.mapleRed, fontWeight: "700" },

  pickerPlain: {
  flex: 1,
  borderWidth: 1,
  borderColor: '#ddd',
  borderRadius: 6,
  backgroundColor: '#fff',
  minHeight: 50,
  paddingVertical: 2,     // avoids visual clipping on some Android fonts
  justifyContent: 'center',
  alignItems: 'stretch',
},
  pnpCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#ddd",
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
    backgroundColor: "#fff",
  },
  pnpTitle: { fontSize: 16, fontWeight: "600", color: colors.text },
  pnpSub: { color: "#666", marginTop: 6 },
  pnpBtn: {
    marginTop: 10,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#333",
  },
  pnpBtnText: { fontWeight: "700", color: colors.text },

});
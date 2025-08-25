import React, { useEffect, useState } from "react";
import { View, Text, TextInput, StyleSheet, Switch, Pressable } from "react-native";
import PrimaryButton from "../components/PrimaryButton";
import { colors } from "../theme/colors";
import { getRulesVersion } from "../services/rules";
import { calculateCrs, getCrsVersion, primeCrsParams, getCrsLastSynced, loadCRSSessionExtras, saveCRSSessionExtras, computeAdditionalCRS, withAdditionalCRS, type CRSAdditionalInputs,} from "../services/crs";
import { calculateFsw67, getFswVersion, primeFswParams, getFswLastSynced } from "../services/fsw67";
import RulesBadge from "../components/RulesBadge";
import { Picker } from "@react-native-picker/picker";
import { useNavigation } from "@react-navigation/native";
import { FSW_EDUCATION_OPTIONS, type FswEducationValue } from "../constants/education";

type FswEducationKey = Parameters<typeof calculateFsw67>[0]["education"];


type Props = { navigation?: any };

export default function ScoreScreen({ navigation: navProp }: Props) {
  const navigation = navProp ?? useNavigation();

useEffect(() => {
  const unsubFocus = navigation?.addListener?.("focus", () => {
    // optionally trigger a recompute/refresh here
    // runRecalc?.();
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
    <View style={styles.wrap}>
      <Text style={styles.h1}>Eligibility Score — v2</Text>
      <RulesBadge />

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
        <TextInput
  keyboardType="number-pad"
  value={clb}
  onChangeText={setClb}
  style={styles.input}
  testID="sc-clb"
/>

      </View>
      <View style={styles.row}>
  <Text style={styles.label}>Education</Text>
  <View style={{ flex: 1, borderWidth: 1, borderColor: "#ddd", borderRadius: 6 }}>
    <Picker
      selectedValue={education}
      onValueChange={(v) => setEducation(v as any)}
      testID="sc-education"

    >
      <Picker<FswEducationKey>
  selectedValue={education}
  onValueChange={(v: FswEducationKey) => setEducation(v)}
  testID="sc-education-2"
>
  {FSW_EDUCATION_OPTIONS.map(o => (
    <Picker.Item key={o.value} label={o.label} value={o.value} />
  ))}
</Picker>

    </Picker>
  </View>
</View>



         {/* FSW-67 (demo) */}
      <Text style={styles.h2}>FSW-67 — Eligibility Check</Text>
      <Text style={styles.subtleLine}>Uses Age, CLB, Education from above (FSW only)</Text>
      <View style={{ height: 8 }} />

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

      
    </View>
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
  result: { marginTop: 12, fontWeight: "600", color: colors.mapleRed },
  card: { marginTop: 12, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: "#eee", backgroundColor: "#fafafa" },
  cardTitle: { fontSize: 16, fontWeight: "700", marginBottom: 4 },
  cardMeta: { color: "#666" },
  subtleLine: { fontSize: 12, color: "#666", marginTop: 4 },
  hint: { fontSize: 12, color: "#666", marginTop: 4 },

  // B6
  pills: { flexDirection: "row", gap: 8 },
  pill: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: "#ddd" },
  pillActive: { backgroundColor: "#111", borderColor: "#111" },
  pillText: { fontSize: 13 },
  pillTextActive: { color: "#fff", fontWeight: "600" },
  addVal: { fontSize: 14, fontWeight: "700" },

  breakdown: { marginTop: 8, gap: 2 },
});

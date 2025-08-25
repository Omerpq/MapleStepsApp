import React, { useEffect, useState } from "react";
import { View, Text, TextInput, StyleSheet, Switch } from "react-native";
import PrimaryButton from "../components/PrimaryButton";
import { colors } from "../theme/colors";
import { calculateFsw67, primeFswParams, getFswVersion, getFswLastSynced } from "../services/fsw67";
type FswEducationKey = Parameters<typeof calculateFsw67>[0]["education"];

import RulesBadge from "../components/RulesBadge"; // (add with other imports)

import { clearAllRulesCaches } from "../services/rules";
import { primeCrsParams } from "../services/crs";
import { Picker } from "@react-native-picker/picker";
import { FSW_EDUCATION_OPTIONS, type FswEducationValue } from "../constants/education";



export default function QuickCheckScreen() {
  const [age, setAge] = useState("29");
  const [clb, setClb] = useState("9");
  const [years, setYears] = useState("3");
  const [education, setEducation] = useState<FswEducationKey>("bachelor");




  const [arranged, setArranged] = useState(false);

  const [synced, setSynced] = useState<string>("local");
  const [version, setVersion] = useState<string>("unknown");
  const [result, setResult] = useState<null | {
    classification: "Likely" | "Borderline" | "Unlikely";
    total: number;
    passMark: number;
  }>(null);

  useEffect(() => {
    // Load remote FSW params (or fallback to local)
    primeFswParams().then(() => {
      setSynced(getFswLastSynced());
      setVersion(getFswVersion());
    });
  }, []);

  const runCheck = () => {
    const r = calculateFsw67({
      age: Number(age) || 0,
      clb: Number(clb) || 0,
      education,
      experienceYears: Number(years) || 0,
      arrangedEmployment: arranged,
      adaptability: {}
    });
    setResult({ classification: r.classification, total: r.total, passMark: r.passMark });
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.h1}>QuickCheck (FSW-67)</Text>
      <RulesBadge />

      <View style={styles.row}>
        <Text style={styles.label}>Age</Text>
        <TextInput keyboardType="number-pad" value={age} onChangeText={setAge} style={styles.input} testID="qc-age" />

      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Primary language CLB</Text>
        <TextInput keyboardType="number-pad" value={clb} onChangeText={setClb} style={styles.input} testID="qc-clb" />

      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Skilled experience years</Text>
        <TextInput keyboardType="number-pad" value={years} onChangeText={setYears} style={styles.input} testID="qc-years" />

      </View>
      <View style={styles.row}>
  <Text style={styles.label}>Education</Text>
  <View style={{ flex: 1, borderWidth: 1, borderColor: "#ddd", borderRadius: 6 }}>
    <Picker<FswEducationKey>
  selectedValue={education}
  onValueChange={(v: FswEducationKey) => setEducation(v)}
  testID="qc-education"
>




      {FSW_EDUCATION_OPTIONS.map(o => (
  <Picker.Item key={o.value} label={o.label} value={o.value} />
))}
</Picker>

  </View>
</View>

      <View style={[styles.row, { alignItems: "center" }]}>
<Text style={styles.label}>Arranged employment — 10 points (FSW factor)</Text>
        <Switch value={arranged} onValueChange={setArranged} testID="qc-arranged" />

      </View>

      <PrimaryButton title="Check" onPress={runCheck} testID="qc-fsw-check" />


    {result && (
  <View style={styles.card}>
    <Text style={styles.cardTitle} testID="qc-fsw-classification">{result.classification}</Text>
    <Text style={styles.cardMeta} testID="qc-fsw-result">FSW score {result.total} / {result.passMark}</Text>
    <Text style={styles.disclaimer}>Educational tool — not legal advice. See Score tab for full breakdown.</Text>
  </View>
)}

    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 16, backgroundColor: "#fff" },
  h1: { fontSize: 22, fontWeight: "700", color: colors.text, marginBottom: 4 },
  meta: { color: "#666" },
  metaSmall: { color: "#888", marginBottom: 12, fontSize: 12 },
  row: { flexDirection: "row", marginBottom: 8 },
  label: { width: 240, color: colors.text, paddingTop: 10 },
  input: { flex: 1, borderWidth: 1, borderColor: "#ddd", borderRadius: 6, padding: 10, backgroundColor: "#fafafa" },
  card: { marginTop: 12, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: "#eee", backgroundColor: "#fafafa" },
  cardTitle: { fontSize: 16, fontWeight: "700", marginBottom: 4 },
  cardMeta: { color: "#666" },
  disclaimer: { color: "#666", marginTop: 6, fontSize: 12 }
});

import React, { useEffect, useState } from "react";
import { View, Text, TextInput, StyleSheet, Switch, ScrollView, Modal, Pressable, TouchableOpacity } from "react-native";
import PrimaryButton from "../components/PrimaryButton";
import { colors } from "../theme/colors";
import { calculateFsw67, primeFswParams, getFswVersion, getFswLastSynced } from "../services/fsw67";
type FswEducationKey = Parameters<typeof calculateFsw67>[0]["education"];

import RulesBadge from "../components/RulesBadge"; // (add with other imports)

import { clearAllRulesCaches } from "../services/rules";
import { primeCrsParams } from "../services/crs";
import { Picker } from "@react-native-picker/picker";
import { FSW_EDUCATION_OPTIONS, type FswEducationValue } from "../constants/education";

import NocBadge from "../components/NocBadge";
import WelcomeHeader from "../components/WelcomeHeader";

import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';
import { getName } from '../services/profile';


export default function QuickCheckScreen() {
  const [age, setAge] = useState("29");
  const [clb, setClb] = useState("9");
  const [years, setYears] = useState("3");
  const [education, setEducation] = useState<FswEducationKey>("bachelor");
  const [showHelp, setShowHelp] = useState(false);

    const [displayName, setDisplayName] = React.useState<string | null>(null);

function getGreeting(now = new Date()) {
  const h = now.getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}
useFocusEffect(
  useCallback(() => {
    let mounted = true;
    (async () => {
      const saved = (await getName())?.trim() || null;
      if (mounted) setDisplayName(saved);
    })();
    return () => { mounted = false; };
  }, [])
);

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
  <ScrollView
    style={{ backgroundColor: "#fff" }}
    contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
  >
        {/* Welcome header card with inline link */}
    <WelcomeHeader>
      <TouchableOpacity
  onPress={() => setShowHelp(true)}
  activeOpacity={0.7}
  accessibilityRole="link"
  style={{ alignSelf: "flex-start" }}
>
  <Text style={styles.link}>How MapleSteps works</Text>
</TouchableOpacity>

    </WelcomeHeader>


          <Text style={styles.h1}>Eligibility check</Text>
    <Text style={{ color: "#6B7280", marginTop: 2, marginBottom: 6, fontSize: 12 }}>
      Based on Federal Skilled Worker (FSW-67) pass mark
    </Text>

      <RulesBadge />
      <NocBadge />
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
    {/* How-it-works modal */}
    <Modal visible={showHelp} transparent={false} animationType="slide" onRequestClose={() => setShowHelp(false)}>
  <View style={{ flex: 1, backgroundColor: "#fff" }}>
    <View style={{ paddingHorizontal: 16, paddingTop: 18, paddingBottom: 8 }}>
      <Text style={{ fontSize: 18, fontWeight: "700", color: "#271111ff" }}>How MapleSteps Works</Text>
      <Text style={{ fontSize: 13, color: "#6B7280", marginTop: 2 }}>
        Your digital immigration consultant — plan your PR with confidence.
      </Text>
    </View>

    <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}>
      <Text style={{ color: "#111827", lineHeight: 20 }}>
        MapleSteps guides you through Canadian permanent residence step by step:
        {"\n"}1) Verify your NOC (National Occupation Classification) and job duties with ESDC.
        {"\n"}2) Get your ECA (Educational Credential Assessment) from WES / IQAS / ICES.
        {"\n"}3) Plan language tests — IELTS or CELPIP (English), TEF or TCF (French) — and target CLB (Canadian Language Benchmark) levels.
        {"\n"}4) Gather work evidence and Proof of Funds with checklists.
        {"\n"}5) Create your Express Entry profile and track CRS (Comprehensive Ranking System) and category-based draws.
        {"\n"}6) Explore PNP (Provincial Nominee Program) options where you qualify.
        {"\n"}7) After ITA (Invitation to Apply): follow the e-APR (electronic Application for Permanent Residence) checklist to submit.
        {"\n"}8) Track post-submission → medicals → PR confirmation portal → landing, then use province-specific post-landing checklists.
        {"\n"}{"\n"}⭐ <Text style={{ fontWeight: "700" }}>Plan screen</Text>: this is your main guide. It shows your next best step, required documents, due dates, and links to forms. Mark items done and the plan updates automatically.
        {"\n"}{"\n"}🔎 Data sources: wherever possible, we fetch fees, draw schedules, document lists and NOC info from official Government of Canada and provincial sites, show freshness, and cache for offline use.
      </Text>
    </ScrollView>

    <View style={{ paddingHorizontal: 16, paddingBottom: 20 }}>
      <Pressable
        onPress={() => setShowHelp(false)}
        style={{ alignSelf: "flex-end", paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, backgroundColor: "#6b1010" }}
      >
        <Text style={{ color: "#fff", fontWeight: "700" }}>Got it</Text>
      </Pressable>
    </View>
  </View>
</Modal>



      </ScrollView>
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
  disclaimer: { color: "#666", marginTop: 6, fontSize: 12 },
  link: { color: "#f24242ff", textDecorationLine: "underline", fontSize: 14 },

});

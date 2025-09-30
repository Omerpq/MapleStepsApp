// src/components/WhatIfCLBCard.tsx
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { calculateCrs, computeAdditionalCRS, type CRSAdditionalInputs } from "../services/crs";
import { computeProximity } from "../services/draws";

type Props = {
  age: number;
  educationAny: any;                // we keep 'any' to match your screen's education value
  extras: CRSAdditionalInputs;
  currentCLB: number;               // 0–10
  currentTotal: number;             // base + additional (current)
};

export default function WhatIfCLBCard({
  age,
  educationAny,
  extras,
  currentCLB,
  currentTotal,
}: Props) {
  const [whatIfCLB, setWhatIfCLB] = useState<number>(Number(currentCLB) || 0);
  const [projTotal, setProjTotal] = useState<number>(currentTotal);
  const [prox, setProx] = useState<{ label: string; delta: number }[] | null>(null);

  // recompute projected total as user moves
  useEffect(() => {
    const base = calculateCrs({ age: Number(age) || 0, clb: Number(whatIfCLB) || 0, education: educationAny });
    const add  = computeAdditionalCRS(extras);
    const tot  = base + add;
    setProjTotal(tot);
  }, [age, educationAny, extras, whatIfCLB]);

  // recompute proximity for the projected total
  useEffect(() => {
    computeProximity(projTotal)
      .then((r) => {
        const items = (r.items || []).slice(0, 2).map((x) => ({ label: x.label, delta: x.delta }));
        setProx(items);
      })
      .catch(() => setProx(null));
  }, [projTotal]);

  const delta = useMemo(() => projTotal - currentTotal, [projTotal, currentTotal]);

  const setCLB = (v: number) => setWhatIfCLB(Math.max(0, Math.min(10, Math.floor(v))));

  return (
    <View style={s.wrap} accessible accessibilityLabel="What-if primary CLB">
      <Text style={s.h1}>What-if: Primary CLB</Text>
      <Text style={s.sub}>Drag or tap to simulate a different CLB and see projected CRS & proximity.</Text>

      {/* Slider made of 11 tappable ticks (0–10) */}
      <View style={s.slider}>
        <Pressable onPress={() => setCLB(whatIfCLB - 1)} style={s.stepBtn} accessibilityLabel="Decrease CLB">
          <Text style={s.stepTxt}>−</Text>
        </Pressable>

        <View style={s.ticksWrap}>
          {Array.from({ length: 11 }).map((_, i) => {
            const active = i <= whatIfCLB;
            return (
              <Pressable key={i} onPress={() => setCLB(i)} style={[s.tick, active && s.tickActive]}>
                <Text style={[s.tickLbl, active && s.tickLblActive]}>{i}</Text>
              </Pressable>
            );
          })}
        </View>

        <Pressable onPress={() => setCLB(whatIfCLB + 1)} style={s.stepBtn} accessibilityLabel="Increase CLB">
          <Text style={s.stepTxt}>+</Text>
        </Pressable>
      </View>

      <View style={s.row}>
        <Text style={s.title}>Projected</Text>
        <Text style={s.val}>
          {projTotal} <Text style={delta >= 0 ? s.gain : s.loss}>({delta >= 0 ? "+" : ""}{delta})</Text>
        </Text>
      </View>

      {prox && prox.length > 0 ? (
        <View style={{ marginTop: 6, gap: 4 }}>
          {prox.map((p, idx) => (
            <View key={idx} style={s.proxRow}>
              <Text style={s.proxLbl}>{p.label}</Text>
              <Text style={[s.badge, p.delta >= 0 ? s.ok : s.warn]}>
                {p.delta >= 0 ? `+${p.delta}` : `${p.delta}`}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={s.dim}>Proximity preview not available yet.</Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { borderWidth: 1, borderColor: "#ddd", borderRadius: 12, padding: 12, backgroundColor: "#fff", gap: 8 },
  h1: { fontSize: 18, fontWeight: "700" },
  sub: { fontSize: 12, color: "#666" },
  slider: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  ticksWrap: { flexDirection: "row", flex: 1, justifyContent: "space-between", alignItems: "center" },
  tick: { alignItems: "center", justifyContent: "center", width: 26, height: 28, borderRadius: 6, borderWidth: 1, borderColor: "#e5e7eb" },
  tickActive: { backgroundColor: "#eef2ff", borderColor: "#c7d2fe" },
  tickLbl: { fontSize: 12, color: "#6b7280" },
  tickLblActive: { color: "#1d4ed8", fontWeight: "700" },
  stepBtn: { width: 28, height: 28, borderRadius: 6, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#e5e7eb" },
  stepTxt: { fontSize: 16, fontWeight: "700" },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 6 },
  title: { fontSize: 14, fontWeight: "600" },
  val: { fontSize: 16, fontWeight: "800" },
  gain: { color: "#065F46" },
  loss: { color: "#991B1B" },
  proxRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  proxLbl: { fontSize: 12, color: "#374151" },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, fontWeight: "800", overflow: "hidden" },
  ok: { backgroundColor: "#ECFDF5", color: "#065F46" },
  warn: { backgroundColor: "#FEF2F2", color: "#991B1B" },
  dim: { fontSize: 12, color: "#888" },
});

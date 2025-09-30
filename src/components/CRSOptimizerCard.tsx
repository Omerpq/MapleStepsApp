// src/components/CRSOptimizerCard.tsx
import React from "react";
import { View, Text, StyleSheet } from "react-native";

type Props = {
  base: number;
  additional: number;
  total: number;
  suggestions: { id: string; title: string; estGain: number; details: string }[];
};

export default function CRSOptimizerCard({ base, additional, total, suggestions }: Props) {
  return (
    <View style={s.wrap} accessible accessibilityLabel="CRS optimizer suggestions">
      <Text style={s.h1}>CRS Optimizer</Text>
      <Text style={s.sub}>Current: {total} (base {base} + additional {additional})</Text>

      {suggestions.length === 0 ? (
        <Text style={s.dim}>No higher-impact moves detected based on current inputs.</Text>
      ) : (
        suggestions.slice(0, 6).map(sug => (
          <View key={sug.id} style={s.row} accessibilityRole="summary">
            <Text style={s.title}>{sug.title}</Text>
            <Text style={s.badge}>+{sug.estGain}</Text>
            <Text style={s.details}>{sug.details}</Text>
          </View>
        ))
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { borderWidth: 1, borderColor: "#ddd", borderRadius: 12, padding: 12, gap: 8, backgroundColor: "#fff" },
  h1: { fontSize: 18, fontWeight: "700" },
  sub: { fontSize: 13, color: "#666" },
  dim: { fontSize: 13, color: "#888" },
  row: { borderTopWidth: 1, borderTopColor: "#eee", paddingTop: 8, marginTop: 8 },
  title: { fontSize: 15, fontWeight: "600" },
  badge: { alignSelf: "flex-start", marginTop: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, backgroundColor: "#F1F5FF", color: "#1D4ED8", fontWeight: "700" },
  details: { fontSize: 13, color: "#555", marginTop: 4 }
});

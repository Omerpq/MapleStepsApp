// src/components/NocPicker.tsx
import React, { useMemo, useState, useEffect } from "react";

import { View, Text, TextInput, Pressable, ActivityIndicator, ScrollView, Modal, Platform } from "react-native";
import { useNoc } from "../hooks/useNoc";


type Props = {
  value?: { code: string; title: string } | null;
  onChange?: (val: { code: string; title: string } | null) => void;
  placeholder?: string;
};

function teerFromCode(code?: string) {
  const c = String(code || "");
  return /^\d{5}$/.test(c) ? Number(c[1]) : undefined; // NOC 2021: 2nd digit encodes TEER
}

export default function NocPicker({
  value = null,
  onChange,
  placeholder = "Search NOC (code or title)...",
}: Props) {
  const { status, items, categories } = useNoc();   // ← keep only this one
 const [qInput, setQInput] = useState("");
 const [q, setQ] = useState("");
 useEffect(() => {
   const t = setTimeout(() => setQ(qInput.trim()), 200); // 200ms debounce
   return () => clearTimeout(t);
 }, [qInput]);
  const [showTeerInfo, setShowTeerInfo] = useState(false);
  const [qFocused, setQFocused] = useState(false);

  const suggestions = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return items.slice(0, 25);
    return items
      .filter((i) =>
        i.code.startsWith(query) ||
        i.title.toLowerCase().includes(query)
      )
      .slice(0, 25);
  }, [q, items]);

  const pickedTeer = teerFromCode(value?.code);
  const pickedCats = useMemo(() => {
    if (!value?.code) return [];
    return categories
      .filter((c) => c.noc_codes.includes(value.code))
      .map((c) => ({ key: c.key, label: c.label }));
  }, [categories, value?.code]);

  if (status === "loading") {
    return (
      <View style={{ padding: 12, borderRadius: 12, backgroundColor: "#111", borderWidth: 1, borderColor: "#333" }}>
        <Text style={{ color: "#aaa", marginBottom: 8 }}>Loading NOC…</Text>
        <ActivityIndicator />
      </View>
    );
  }

  if (status === "error") {
    return (
      <View style={{ padding: 12, borderRadius: 12, backgroundColor: "#2a1010", borderWidth: 1, borderColor: "#5a3030" }}>
        <Text style={{ color: "#f88" }}>Failed to load NOC. Check internet and try again.</Text>
      </View>
    );
  }

  return (
    <View style={{ gap: 8 }}>
      {/* Input */}
      {/* Outer focus ring */}
      <View style={{ borderRadius: 14, padding: 2, borderWidth: qFocused ? 2 : 0, borderColor: "#2563eb" }}>
        <View style={{ padding: 10, borderRadius: 12, backgroundColor: "#111", borderWidth: 1, borderColor: "#333" }}>
          <TextInput
            value={qInput}
            onChangeText={setQInput}
            placeholder={placeholder}
            placeholderTextColor="#777"
            onFocus={() => setQFocused(true)}
            onBlur={() => setQFocused(false)}
            style={[
              { color: "#fff", fontSize: 16 },
              Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : null
            ]}
            autoCorrect={false}
            autoCapitalize="none"
          />
        </View>
      </View>
      {/* Current selection badges */}
      {value && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <View style={{ backgroundColor: "#1e293b", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 }}>
            <Text style={{ color: "#cbd5e1", fontWeight: "600" }}>NOC {value.code}</Text>
          </View>
          {pickedTeer !== undefined && (
   <Pressable
     onPress={() => setShowTeerInfo(true)}
     style={{ backgroundColor: "#0f172a", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 }}
     accessibilityRole="button"
     accessibilityLabel={`TEER ${pickedTeer}. Tap for details about TEER levels.`}
   >
     <Text style={{ color: "#93c5fd", fontWeight: "600" }}>TEER {pickedTeer} ⓘ</Text>
   </Pressable>
 )}
          {pickedCats.map((c) => (
            <View key={c.key} style={{ backgroundColor: "#052e16", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 }}>
              <Text style={{ color: "#86efac" }}>{c.label}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Suggestions */}
<View
  style={{
    maxHeight: 260,
    borderWidth: 1,
    borderColor: "#333",
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#0b1220",   // ← darker background for contrast
  }}
>
  <ScrollView contentContainerStyle={{ paddingVertical: 4 }}>
    {suggestions.map((i) => (
      <Pressable
        key={i.code}
        onPress={() => {
          onChange?.({ code: i.code, title: i.title });
          setQInput(`${i.code} — ${i.title}`);
          setQ(`${i.code} — ${i.title}`);
        }}
        style={({ pressed }) => ({
          paddingHorizontal: 12,
          paddingVertical: 10,
          backgroundColor: pressed ? "#0a1628" : "transparent",
        })}
      >
        <Text style={{ color: "#ffffff", fontWeight: "600" }}>
          {i.code} · {i.title}
        </Text>
      </Pressable>
    ))}
    {suggestions.length === 0 && (
      <Text style={{ color: "#cbd5e1", padding: 12 }}>No matches.</Text>
    )}
  </ScrollView>
</View>

{/* TEER info modal */}
<Modal
  visible={showTeerInfo}
  animationType="slide"
  transparent
  onRequestClose={() => setShowTeerInfo(false)}
>
  <Pressable
    style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }}
    onPress={() => setShowTeerInfo(false)}
    accessibilityRole="button"
    accessibilityLabel="Dismiss TEER info"
  >
    <View style={{ marginTop: "auto", backgroundColor: "#111", padding: 16, borderTopLeftRadius: 16, borderTopRightRadius: 16 }}>
      <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700", marginBottom: 8 }}>TEER levels (NOC 2021)</Text>

      <Text style={{ color: "#cbd5e1", marginBottom: 6 }}>TEER 0 — Management occupations.</Text>
      <Text style={{ color: "#cbd5e1", marginBottom: 6 }}>TEER 1 — Professional roles (usually require a university degree).</Text>
      <Text style={{ color: "#cbd5e1", marginBottom: 6 }}>TEER 2 — Technical/supervisory; college diploma or 2+ year apprenticeship.</Text>
      <Text style={{ color: "#cbd5e1", marginBottom: 6 }}>TEER 3 — Skilled/technical; &lt;2-year diploma or &lt;2-year apprenticeship.</Text>
      <Text style={{ color: "#cbd5e1", marginBottom: 6 }}>TEER 4 — Intermediate; secondary school and/or specific training.</Text>
      <Text style={{ color: "#cbd5e1", marginBottom: 10 }}>TEER 5 — Entry-level; short work demonstration, no formal education requirement.</Text>

      <View style={{ backgroundColor: "#0b1220", borderRadius: 8, padding: 10, marginBottom: 10 }}>
        <Text style={{ color: "#93c5fd" }}>
          Express Entry usually requires work experience in TEER 0–3. TEER 4–5 are typically not eligible for EE, though some provincial programs may accept them.
        </Text>
      </View>

      <Pressable
        onPress={() => setShowTeerInfo(false)}
        style={{ alignSelf: "flex-end", paddingVertical: 8, paddingHorizontal: 12, backgroundColor: "#1e293b", borderRadius: 8 }}
      >
        <Text style={{ color: "#fff", fontWeight: "600" }}>Close</Text>
      </Pressable>
    </View>
  </Pressable>
</Modal>

    </View>
  );
}
// src/screens/EAPRBuilder.tsx
import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, TextInput, Alert, Linking } from "react-native";
import { colors } from "../theme/colors";
import { loadEaprGuides, getPackState, markProvided, updateDocInfo, validatePack, type EAPRGuide, type EAPRPackState } from "../services/eapr";
import { fmtDateTimeLocal } from "../utils/freshness";

export default function EAPRBuilder() {
  const [guide, setGuide] = useState<EAPRGuide | null>(null);
  const [state, setState] = useState<EAPRPackState | null>(null);
  const [metaLabel, setMetaLabel] = useState<string>("");

  useEffect(() => {
    (async () => {
      const res = await loadEaprGuides();
      setGuide(res.guide);
      setMetaLabel(makeMetaLabel(res.meta.source, res.meta.status, res.meta.fetchedAtISO, res.meta.__cachedAt));
      const s = await getPackState();
      setState(s);
    })();
  }, []);

  const onToggle = async (sectionId: string, docId: string, nextVal: boolean) => {
    const s = await markProvided(sectionId, docId, nextVal);
    setState(s);
  };

  const onUpdate = async (sectionId: string, docId: string, field: "filename" | "sizeBytes" | "notes", val: string) => {
    const patch: any = {};
    if (field === "sizeBytes") {
      const n = Number(val);
      patch.sizeBytes = isNaN(n) ? undefined : n;
    } else {
      patch[field] = val;
    }
    const s = await updateDocInfo(sectionId, docId, patch);
    setState(s);
  };

  const runValidation = () => {
    if (!guide || !state) return;
    const issues = validatePack(guide, state);
    if (!issues.length) {
      Alert.alert("All good", "All required documents are marked as provided.");
    } else {
      const msg = issues.map(i => `• [${i.sectionId}] ${i.title} — ${i.message}`).join("\n");
      Alert.alert("Missing items", msg);
    }
  };

  if (!guide || !state) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Text>Loading e-APR checklist…</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
        <Text style={{ fontSize: 22, fontWeight: "700", marginBottom: 4 }}>e-APR Document Pack</Text>
        <Text style={{ color: "#666", marginBottom: 12 }}>{metaLabel}</Text>

        {guide.sections.map(section => (
          <View key={section.id} style={{ borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 12, marginBottom: 14 }}>
            <View style={{ padding: 12, backgroundColor: "#f9fafb", borderTopLeftRadius: 12, borderTopRightRadius: 12 }}>
              <Text style={{ fontWeight: "700" }}>{section.title}</Text>
            </View>

            {section.docs.map(doc => {
              const st = state.items?.[section.id]?.[doc.id] ?? {};
              return (
                <View key={doc.id} style={{ padding: 12, borderTopWidth: 1, borderTopColor: "#f0f0f0" }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <Text style={{ fontWeight: "600", flex: 1, paddingRight: 8 }}>
                      {doc.title} {doc.required ? "• REQUIRED" : "• Optional"}
                    </Text>
                    <Pressable
                      onPress={() => onToggle(section.id, doc.id, !(st.provided === true))}
                      style={{
                        paddingVertical: 6,
                        paddingHorizontal: 10,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: st.provided ? "#16a34a" : "#9ca3af",
                        backgroundColor: st.provided ? "rgba(22,163,74,0.08)" : "transparent",
                      }}
                    >
                      <Text style={{ fontWeight: "700", color: st.provided ? "#16a34a" : "#444" }}>
                        {st.provided ? "Provided" : "Mark provided"}
                      </Text>
                    </Pressable>
                  </View>

                  {!!doc.description && (
                    <Text style={{ color: "#444", marginBottom: 8 }}>{doc.description}</Text>
                  )}

                  {doc.officialLink && (
                    <Pressable onPress={() => Linking.openURL(doc.officialLink)}>
                      <Text style={{ color: "#2563eb", textDecorationLine: "underline", marginBottom: 8 }}>
                        Open official guidance
                      </Text>
                    </Pressable>
                  )}

                  <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 12, color: "#666" }}>Filename</Text>
                      <TextInput
                        placeholder="e.g., passport.pdf"
                        value={st.filename ?? ""}
                        onChangeText={(t) => onUpdate(section.id, doc.id, "filename", t)}
                        style={{
                          borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 10, backgroundColor: "#fff",
                        }}
                      />
                    </View>
                    <View style={{ width: 120 }}>
                      <Text style={{ fontSize: 12, color: "#666" }}>Size (bytes)</Text>
                      <TextInput
                        placeholder="e.g., 524288"
                        keyboardType="numeric"
                        value={st.sizeBytes != null ? String(st.sizeBytes) : ""}
                        onChangeText={(t) => onUpdate(section.id, doc.id, "sizeBytes", t)}
                        style={{
                          borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 10, backgroundColor: "#fff",
                        }}
                      />
                    </View>
                  </View>

                  <Text style={{ fontSize: 12, color: "#666" }}>Notes</Text>
                  <TextInput
                    placeholder="Any notes (e.g., combined PDFs, translations, affidavits)…"
                    value={st.notes ?? ""}
                    onChangeText={(t) => onUpdate(section.id, doc.id, "notes", t)}
                    style={{
                      borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 10, backgroundColor: "#fff",
                      minHeight: 44,
                    }}
                    multiline
                  />
                </View>
              );
            })}
          </View>
        ))}

        {!!guide.tips?.length && (
          <View style={{ borderWidth: 1, borderColor: "#fde68a", backgroundColor: "#fffbeb", borderRadius: 12, padding: 12 }}>
            <Text style={{ fontWeight: "700", marginBottom: 6 }}>Compression & upload tips</Text>
            {guide.tips.map((t, i) => (
              <Text key={i} style={{ marginBottom: 4 }}>• {t}</Text>
            ))}
          </View>
        )}

        <Pressable
          onPress={runValidation}
          style={{ marginTop: 16, alignSelf: "flex-start", backgroundColor: "#111827", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 }}
        >
          <Text style={{ color: "#fff", fontWeight: "700" }}>Validate required documents</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function makeMetaLabel(source: "remote" | "cache", status: 200 | 304, fetchedAtISO: string, cachedAt?: string | null) {
  const ts = fmtDateTimeLocal(fetchedAtISO);
  const where = source === "remote" ? "Remote" : "Cache";
  return `Source: ${where} — ${status === 200 ? "updated" : "validated"} • last checked ${ts}${source === "cache" ? " (cached)" : ""}`;
}

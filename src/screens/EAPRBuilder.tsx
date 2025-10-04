// src/screens/EAPRBuilder.tsx
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  Linking,
  Platform,
  Share,
} from "react-native";
import { colors } from "../theme/colors";
import {
  loadEaprGuides,
  getPackState,
  markProvided,
  updateDocInfo,
  validatePack,
  type EAPRGuide,
  type EAPRPackState,
} from "../services/eapr";
import { fmtDateTimeLocal } from "../utils/freshness";

import { loadIrccLiveMeta } from "../services/irccLive";

import { ActivityIndicator } from "react-native";


import { clearEaprCaches, forceEaprRevalidate } from "../services/eapr";

import AsyncStorage from "@react-native-async-storage/async-storage";




function notify(title: string, message: string) {
  if (Platform.OS === "web") {
    console.log(`[EAPRBuilder] ${title}: ${message}`);
    (globalThis as any)?.alert?.(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}

function humanBytes(n?: number) {
  if (n == null || isNaN(n)) return "";
  const units = ["B", "KB", "MB", "GB"];
  let val = n;
  let i = 0;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i++;
  }
  return `${val.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function buildSummary(guide: EAPRGuide, state: EAPRPackState) {
  const lines: string[] = [];
  lines.push(`e-APR Document Pack — summary`);
  lines.push(`Updated: ${new Date().toISOString()}`);
  lines.push("");

  let providedCount = 0;
  let requiredCount = 0;

  for (const section of guide.sections) {
    lines.push(`[${section.title}]`);
    for (const d of section.docs) {
      const st = state.items?.[section.id]?.[d.id];
      const isProvided = st?.provided === true;
      if (d.required) requiredCount++;
      if (isProvided) providedCount++;
      const sizeTxt = st?.sizeBytes != null ? ` • ${humanBytes(st.sizeBytes)}` : "";
      const fnTxt = st?.filename ? ` • ${st.filename}` : "";
      const mark = isProvided ? "✅" : d.required ? "⛔" : "▫️";
      lines.push(`${mark} ${d.title}${fnTxt}${sizeTxt}`);
    }
    lines.push("");
  }

  const missing = validatePack(guide, state);
  if (missing.length === 0) {
    lines.push("All required documents are marked as provided.");
  } else {
    lines.push("Missing required:");
    for (const m of missing) lines.push(`• ${m.title} (${m.sectionId})`);
  }
  lines.push("");
  lines.push(`Progress: ${providedCount}/${guide.sections.flatMap(s => s.docs).length} items marked provided`);
  lines.push(`Required complete: ${requiredCount - missing.length}/${requiredCount}`);
  return lines.join("\n");
}

function makeMetaLabel(
  source: "remote" | "cache",
  status: 200 | 304,
  fetchedAtISO: string,
  cachedAt?: string | null
) {
  const ts = fmtDateTimeLocal(new Date(fetchedAtISO).getTime());
  const where = source === "remote" ? "Remote" : "Cache";
  // Locked wording: no “(cached)” here
  return `Source: ${where} — ${status === 200 ? "updated" : "validated"} • last checked ${ts}`;
}



function copyTextWeb(text: string): boolean {
  try {
    const doc = (globalThis as any)?.document;
    if (!doc?.body) return false;
    const ta = doc.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "true");
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    ta.style.opacity = "0";
    doc.body.appendChild(ta);
    ta.select();
    const ok = doc.execCommand && doc.execCommand("copy");
    doc.body.removeChild(ta);
    return !!ok;
  } catch (e) {
    console.warn("[EAPRBuilder] textarea copy failed:", e);
    return false;
  }
}

// Strip seconds from our standard timestamp, e.g. "10/3/2025, 4:03 PM"
function shortTs(tsMs: number) {
  const full = fmtDateTimeLocal(tsMs);
  return full.replace(/:\d{2}(?=\s[AP]M)/, ""); // remove :ss before AM/PM
}

const sectionNotesId = (sectionId: string) => `__section_notes__:${sectionId}`;
const isCompactSection = (section: { id: string; docs: any[] }) => section.docs.length <= 4;



export default function EAPRBuilder() {
  // >>> S4-02 LABEL BLOCK — START
  type EaprGuidesMeta = {
    status?: number;          // 200 or 304 (from our A4 loader)
    etag?: string | null;
    last_modified?: string | null;
    cachedAt?: string;        // ISO when we stored/validated
  };

  // <<< S4-02 LABEL BLOCK — END
  
  const [guide, setGuide] = useState<EAPRGuide | null>(null);
  const [state, setState] = useState<EAPRPackState | null>(null);
  const [metaLabel, setMetaLabel] = useState<string>("");
  const [irccMetaLabel, setIrccMetaLabel] = useState<string>("");
  // NEW — IRCC section collapsed state (true = collapsed)
const [collapsedIrcc, setCollapsedIrcc] = useState<boolean>(true);

  // NEW — collapsible state per section (true = collapsed)
const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

// NEW — section progress for header (provided/total)
function sectionProgress(sectionId: string) {
  if (!guide) return { provided: 0, total: 0 };
  const sec = guide.sections.find(s => s.id === sectionId);
  if (!sec) return { provided: 0, total: 0 };
  let provided = 0;
  for (const d of sec.docs) {
    const st = state?.items?.[sectionId]?.[d.id];
    if (st?.provided === true) provided++;
  }
  return { provided, total: sec.docs.length };
}

  
  const [irccLinks, setIrccLinks] = useState<Array<{ id: string; title: string; url: string; status: number | null; lastModified?: string | null }>>([]);
  const [irccVerifiedAtISO, setIrccVerifiedAtISO] = useState<string | null>(null);
  const [irccLoading, setIrccLoading] = useState(false);
  const [openDocDetails, setOpenDocDetails] = useState<Record<string, boolean>>({});
  const [irccRefreshing, setIrccRefreshing] = useState(false);

  

  useEffect(() => {
  (async () => {
    try {
      const res = await loadEaprGuides();
      setGuide(res.guide);
      // NEW — collapse ALL sections by default
const initCollapsed: Record<string, boolean> = {};
for (const s of res.guide.sections) {
  initCollapsed[s.id] = true;
}
setCollapsed(initCollapsed);


      setMetaLabel(
        makeMetaLabel(res.meta.source, res.meta.status, res.meta.fetchedAtISO, res.meta.__cachedAt)
      );
      const s = await getPackState();
      setState(s);
    } catch (e) {
      notify("e-APR load failed", String(e));
    }
  })();
}, []);

  // Heals any corrupted JSON under the ms.eapr.* namespace
// Heals any corrupted JSON under the ms.eapr.* namespace — logs what it fixes
async function healCorruptEaprKeys() {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const eaprKeys = allKeys.filter((k) => k.startsWith("ms.eapr."));
    if (eaprKeys.length === 0) return;

    const pairs = await AsyncStorage.multiGet(eaprKeys);
    for (const [k, v] of pairs) {
      if (v == null) continue;
      try {
        JSON.parse(v);
      } catch {
        // log and remove the bad key
        console.warn("[EAPRBuilder] healing bad JSON key:", k, "valueHead:", v.slice(0, 60));
        await AsyncStorage.removeItem(k);
      }
    }
  } catch (e) {
    console.warn("[EAPRBuilder] healer error:", e);
  }
}



  useEffect(() => {
  let alive = true;
  (async () => {
    setIrccLoading(true);
    try {
      const live = await loadIrccLiveMeta(false); // don’t force; respects 24h TTL
      if (!alive) return;
      setIrccMetaLabel(
        `IRCC (Live) — verified ${fmtDateTimeLocal(new Date(live.verifiedAtISO).getTime())}${live.source === "cache" ? " (cached)" : ""}`
      );
      setIrccLinks(live.links);
      setIrccVerifiedAtISO(live.verifiedAtISO);
    } catch (e) {
      if (!alive) return;
      // show a graceful fallback instead of spinning forever
      setIrccMetaLabel("IRCC (Live) — unable to verify");
      setIrccLinks([]); // or keep previous
    } finally {
      if (alive) setIrccLoading(false); // ← ensures the “Loading live references…” stops
    }
  })();
  return () => { alive = false; };
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
    if (!guide || !state) {
      console.log("[EAPRBuilder] validate clicked but guide/state not ready");
      notify("Please wait", "Still loading the e-APR checklist. Try again in a moment.");
      return;
    }
    const issues = validatePack(guide, state);
    if (!issues.length) {
      notify("All good", "All required documents are marked as provided.");
    } else {
      const msg = issues.map(i => `• [${i.sectionId}] ${i.title} — ${i.message}`).join("\n");
      notify("Missing items", msg);
    }
  };

  const exportSummary = async () => {
  if (!guide || !state) {
    notify("Please wait", "Still loading the e-APR checklist.");
    return;
  }
  const text = buildSummary(guide, state);

  if (Platform.OS === "web") {
    // Try modern API first
    try {
      const wrote = await (navigator as any)?.clipboard?.writeText?.(text);
      // Some browsers return void, so we don't rely on `wrote`
      notify("Copied", "Summary copied to clipboard.");
      return;
    } catch (e) {
      console.warn("[EAPRBuilder] navigator.clipboard failed; falling back:", e);
    }
    // Fallback: hidden textarea copy
    const ok = copyTextWeb(text);
    if (ok) {
      notify("Copied", "Summary copied to clipboard.");
      return;
    }
    // Last resort: show the text so user can Ctrl+C
    (globalThis as any)?.alert?.(text);
    return;
  }

  // Native share (Android/iOS)
  try {
    await Share.share({ message: text });
  } catch (e) {
    console.error("Share failed", e);
    notify("Share failed", String(e));
  }
};


  if (!guide || !state) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Text>Loading e-APR checklist…</Text>
      </View>
    );
  }

  // warn at > 4 MB (4 * 1024 * 1024 bytes)
  const LARGE_BYTES = 4 * 1024 * 1024;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
<ScrollView contentContainerStyle={{ padding: 16, paddingBottom: Platform.OS === "ios" ? 140 : 120 }}>
        <Text style={{ fontSize: 22, fontWeight: "700", marginBottom: 4 }}>e-APR Document Pack</Text>
        <Text style={{ color: "#666", marginBottom: 12 }}>{metaLabel}</Text>
        {/* DEV — QA chips */}
{__DEV__ && (
  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
    <Pressable
      onPress={async () => {
  try {
    await clearEaprCaches();
    // After wipe, fetch fresh guide + meta, then re-seed state
    const res = await loadEaprGuides();
    setGuide(res.guide);
    setMetaLabel(makeMetaLabel(res.meta.source, res.meta.status, res.meta.fetchedAtISO, res.meta.__cachedAt));
    const s = await getPackState();
    setState(s);
    notify("Cleared", "Caches wiped and fresh data loaded.");
  } catch (e) {
    notify("Clear failed", String(e));
  }
}}

      style={{
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 12,
        backgroundColor: "#EEE",
        marginRight: 8,
        marginBottom: 8,
        ...(Platform.OS === "web" ? ({ boxShadow: "0 1px 2px rgba(0,0,0,0.08)" } as any) : null),
      }}
    >
      <Text style={{ fontSize: 12, fontWeight: "700" }}>Clear caches</Text>
    </Pressable>

    <Pressable
      onPress={async () => {
  try {
    await forceEaprRevalidate();
    const res = await loadEaprGuides();
    setGuide(res.guide);
    setMetaLabel(makeMetaLabel(res.meta.source, res.meta.status, res.meta.fetchedAtISO, res.meta.__cachedAt));
    const s = await getPackState();
    setState(s);
    notify("Ready", "Fetched latest from Rules.");
  } catch (e) {
    notify("Refresh failed", String(e));
  }
}}

      style={{
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 12,
        backgroundColor: "#EEE",
        marginRight: 8,
        marginBottom: 8,
        ...(Platform.OS === "web" ? ({ boxShadow: "0 1px 2px rgba(0,0,0,0.08)" } as any) : null),
      }}
    >
      <Text style={{ fontSize: 12, fontWeight: "700" }}>Refresh from Rules</Text>
    </Pressable>
  </View>
)}

      {/* IRCC Live verification (collapsible) */}
<View style={{ borderWidth: 1, borderColor: "#d1fae5", backgroundColor: "#ecfdf5", borderRadius: 12, marginBottom: 12, overflow: "hidden" }}>
  {/* Header — tap to toggle */}
  <Pressable
    onPress={() => setCollapsedIrcc(v => !v)}
    style={{ padding: 12, backgroundColor: "#ecfdf5", flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
    accessibilityRole="button"
    accessibilityLabel={`${collapsedIrcc ? "Expand" : "Collapse"} IRCC live verification`}
  >
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 }}>
      <Text style={{ fontWeight: "700" }}>IRCC (Live)</Text>
      {/* Short summary inline when collapsed */}
      <Text style={{ fontSize: 12, color: "#065f46" }}>
        {(() => {
          const cnt = irccLinks?.length ?? 0;
          const checkedTs = irccVerifiedAtISO ? fmtDateTimeLocal(new Date(irccVerifiedAtISO).getTime()) : null;
          if (irccLoading) return "• checking…";
          if (!cnt) return "• no links yet";
          return `• ${cnt} link${cnt > 1 ? "s" : ""}${checkedTs ? ` • checked ${checkedTs}` : ""}`;
        })()}
      </Text>
    </View>
    <Text style={{ fontSize: 16, color: "#065f46" }}>
      {collapsedIrcc ? "▸" : "▾"}
    </Text>
  </Pressable>

  {/* Body — hidden when collapsed */}
  {!collapsedIrcc && (
    <View style={{ padding: 12, paddingTop: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 6 }}>
        <Text style={{ fontWeight: "700" }}>{irccMetaLabel || "IRCC (Live) — verifying…"}</Text>

        <Pressable
          disabled={irccLoading}
          onPress={async () => {
            setIrccRefreshing(true);
            try {
              setIrccLoading(true);
              const live = await loadIrccLiveMeta(true);
              setIrccMetaLabel(
                `IRCC (Live) — verified ${fmtDateTimeLocal(new Date(live.verifiedAtISO).getTime())}${live.source === "cache" ? " (cached)" : ""}`
              );
              setIrccLinks(live.links);
              setIrccVerifiedAtISO(live.verifiedAtISO);
            } finally {
              setIrccRefreshing(false);
              setIrccLoading(false);
            }
          }}
          style={{
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 8,
            backgroundColor: "#10b981",
            opacity: irccLoading ? 0.7 : 1,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
          }}
        >
          {irccLoading ? <ActivityIndicator size="small" color="#ffffff" /> : null}
          <Text style={{ fontSize: 12, fontWeight: "700", color: "#fff" }}>
            {irccRefreshing ? "Refreshing…" : "Refresh from IRCC"}
          </Text>
        </Pressable>
      </View>

      {irccLinks?.length ? (
        irccLinks.slice(0, 4).map(link => {
          const checkedTs = irccVerifiedAtISO ? fmtDateTimeLocal(new Date(irccVerifiedAtISO).getTime()) : null;
          const lastModTs = link.lastModified ? shortTs(new Date(link.lastModified).getTime()) : null;
          const ok = typeof link.status === "number" && link.status >= 200 && link.status < 400;

          return (
            <Pressable key={link.id} onPress={() => Linking.openURL(link.url)} style={{ paddingVertical: 6 }}>
              {/* Line 1 — title + status + checked */}
              <Text style={{ color: "#065f46" }}>
                <Text style={{ textDecorationLine: "underline", fontWeight: "700" }}>
                  {link.title}
                </Text>
                {" • "}
                <Text style={{ fontWeight: "700", color: ok ? "#059669" : "#b91c1c" }}>
                  <Text style={{ color: ok ? "#16a34a" : "#dc2626" }}>●</Text>
                  {ok
                    ? "Live"
                    : (Platform.OS === "web" && link.status === 0 ? "Unreachable (web/CORS)" : "Unreachable")}
                </Text>
                {checkedTs ? (
                  <>
                    {" • "}
                    <Text style={{ fontWeight: "700", color: "#0f766e" }}>Checked:</Text>{" "}
                    <Text style={{ color: "#0ea5e9" }}>{checkedTs}</Text>
                  </>
                ) : null}
              </Text>

              {/* Line 2 — smaller, gray Last-Modified */}
              {lastModTs ? (
                <Text style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                  IRCC page updated: {lastModTs}
                </Text>
              ) : null}
            </Pressable>
          );
        })
      ) : (
        <Text style={{ color: "#065f46" }}>{irccLoading ? "Loading live references…" : "No links found."}</Text>
      )}
    </View>
  )}
</View>


  
{/* Simple file-size guidance banner (global, above sections) */}
<View
  style={{
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  }}
>
  <Text style={{ fontWeight: "700", marginBottom: 4, color: "#0f172a" }}>
    File size reminder
  </Text>
  <Text style={{ color: "#334155" }}>
  Most IRCC portals only accept files that are about <Text style={{ fontWeight: "700" }}>2–4&nbsp;MB</Text> each.
  If your file is larger, combine pages into a single PDF and use “Save as reduced size” or a PDF compressor before uploading.
  <Text>{" "}</Text>
  <Text style={{ fontWeight: "700" }}>
    Tip: For the exact limit you must follow, tap “Open official guidance” for the relevant document and check the file size requirement on the IRCC page.
  </Text>
</Text>

</View>
{/* NEW — Expand/Collapse all */}
<View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
  <Pressable
    onPress={() => {
      if (!guide) return;
      const next: Record<string, boolean> = {};
      for (const s of guide.sections) next[s.id] = false;
      setCollapsed(next);
      setCollapsedIrcc(false); // also expand IRCC


    }}
    style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: "#eef2ff", borderWidth: 1, borderColor: "#c7d2fe" }}
  >
    <Text style={{ fontWeight: "700", color: "#3730a3" }}>Expand all</Text>
  </Pressable>

  <Pressable
    onPress={() => {
      if (!guide) return;
      const next: Record<string, boolean> = {};
      for (const s of guide.sections) next[s.id] = true;
setCollapsed(next);
setCollapsedIrcc(true); // also collapse IRCC

    }}
    style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: "#f1f5f9", borderWidth: 1, borderColor: "#e2e8f0" }}
  >
    <Text style={{ fontWeight: "700", color: "#0f172a" }}>Collapse all</Text>
  </Pressable>
</View>



        {guide.sections.map(section => {
  if (isCompactSection(section)) {

    // --- COMPACT: Identity & Forms
    const secNotes = state.items?.[section.id]?.[sectionNotesId(section.id)]?.notes ?? "";

    return (
  <View key={section.id} style={{ borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 12, marginBottom: 14 }}>
    <Pressable
      onPress={() => setCollapsed(prev => ({ ...prev, [section.id]: !prev[section.id] }))}
      style={{ padding: 12, backgroundColor: "#f9fafb", borderTopLeftRadius: 12, borderTopRightRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
      accessibilityRole="button"
      accessibilityLabel={`${collapsed[section.id] ? "Expand" : "Collapse"} ${section.title}`}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={{ fontWeight: "700" }}>{section.title}</Text>
        {(() => {
          const p = sectionProgress(section.id);
          return <Text style={{ fontSize: 12, color: "#6b7280" }}>• {p.provided}/{p.total} provided</Text>;
        })()}
      </View>
      <Text style={{ fontSize: 16, color: "#6b7280" }}>
        {collapsed[section.id] ? "▸" : "▾"}
      </Text>
    </Pressable>

    {/* START GUARD */}
    {!collapsed[section.id] && (
      <>
        {/* Pills row (wrap) */}
        <View style={{ padding: 12, paddingBottom: 4, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {section.docs.map(doc => {
            const st = state.items?.[section.id]?.[doc.id] ?? {};
            const provided = st.provided === true;
            return (
              <View key={doc.id} style={{ flexDirection: "row", alignItems: "center" }}>
                <Pressable
                  onPress={() => onToggle(section.id, doc.id, !provided)}
                  accessibilityRole="button"
                  accessibilityLabel={`${provided ? "Unmark" : "Mark"} ${doc.title} as provided`}
                  style={[
                    {
                      borderWidth: 1,
                      borderColor: provided ? "#16a34a" : "#cbd5e1",
                      backgroundColor: provided ? "rgba(22,163,74,0.08)" : "#fff",
                      paddingVertical: 6,
                      paddingHorizontal: 10,
                      borderRadius: 999,
                    },
                    Platform.OS === "web"
                      ? ({
                          outlineStyle: "auto",
                          outlineColor: provided ? "#16a34a" : "#94a3b8",
                        } as any)
                      : null,
                  ]}
                >
                  <Text style={{ fontWeight: "700", color: provided ? "#16a34a" : "#111827" }}>
                    {provided ? "✔ " : "◻ "}{doc.title}
                  </Text>
                </Pressable>

                {/* tiny Edit link */}
                <Pressable
                  onPress={() => setOpenDocDetails(prev => ({ ...prev, [section.id + "::" + doc.id]: !prev[section.id + "::" + doc.id] }))}
                  style={{ marginLeft: 6, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999, ...(Platform.OS === "web" ? { cursor: "pointer" } : {}) }}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit details for ${doc.title}`}
                >
                  <Text style={{ color: "#2563eb", fontWeight: "600" }}>✎ Edit</Text>
                </Pressable>
              </View>
            );
          })}
        </View>

        {/* Inline details only when Edit is opened for a pill */}
        {section.docs.map(doc => {
          const key = section.id + "::" + doc.id;
          if (!openDocDetails[key]) return null;
          const st = state.items?.[section.id]?.[doc.id] ?? {};
          return (
            <View key={doc.id} style={{ padding: 12, paddingTop: 6, borderTopWidth: 1, borderTopColor: "#f0f0f0" }}>
              <Text style={{ fontWeight: "600", marginBottom: 8 }}>
                {doc.title} {doc.required ? "• REQUIRED" : "• Optional"}
              </Text>

              {doc.officialLink && (
                <Pressable onPress={() => { if (doc.officialLink) Linking.openURL(doc.officialLink); }}>
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
                    style={{ borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 10, backgroundColor: "#fff" }}
                  />
                </View>
                <View style={{ width: 140 }}>
                  <Text style={{ fontSize: 12, color: "#666" }}>Size (bytes)</Text>
                  <TextInput
                    placeholder="e.g., 524288"
                    keyboardType="numeric"
                    value={st.sizeBytes != null ? String(st.sizeBytes) : ""}
                    onChangeText={(t) => onUpdate(section.id, doc.id, "sizeBytes", t)}
                    style={{ borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 10, backgroundColor: "#fff" }}
                  />
                  {!!st.sizeBytes && (
                    <Text style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                      {humanBytes(st.sizeBytes)}
                    </Text>
                  )}
                </View>
              </View>

              <Text style={{ fontSize: 12, color: "#666" }}>Notes (optional)</Text>
              <TextInput
                placeholder={`Notes about ${doc.title}…`}
                value={st.notes ?? ""}
                onChangeText={(t) => onUpdate(section.id, doc.id, "notes", t)}
                style={{ borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 10, backgroundColor: "#fff", minHeight: 44 }}
                multiline
              />
            </View>
          );
        })}

        {/* Section-level notes */}
        <View style={{ padding: 12, borderTopWidth: 1, borderTopColor: "#eef2f7" }}>
          <Text style={{ fontWeight: "600", color: "#374151", marginBottom: 4 }}>Section notes</Text>
          <TextInput
            placeholder="Overall notes for Identity & Forms…"
            value={secNotes}
            onChangeText={(t) => onUpdate(section.id, sectionNotesId(section.id), "notes", t)}
            style={{ borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 10, backgroundColor: "#fff", minHeight: 44 }}
            multiline
          />
        </View>
      </>
    )}
    {/* END GUARD */}
  </View>
);

  }

  // --- DEFAULT: all other sections unchanged
  return (
  <View key={section.id} style={{ borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 12, marginBottom: 14 }}>
    <Pressable
      onPress={() => setCollapsed(prev => ({ ...prev, [section.id]: !prev[section.id] }))}
      style={{ padding: 12, backgroundColor: "#f9fafb", borderTopLeftRadius: 12, borderTopRightRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
      accessibilityRole="button"
      accessibilityLabel={`${collapsed[section.id] ? "Expand" : "Collapse"} ${section.title}`}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={{ fontWeight: "700" }}>{section.title}</Text>
        {(() => {
          const p = sectionProgress(section.id);
          return <Text style={{ fontSize: 12, color: "#6b7280" }}>• {p.provided}/{p.total} provided</Text>;
        })()}
      </View>
      <Text style={{ fontSize: 16, color: "#6b7280" }}>
        {collapsed[section.id] ? "▸" : "▾"}
      </Text>
    </Pressable>

    {/* START GUARD */}
    {!collapsed[section.id] && (
      <>
        {section.docs.map(doc => {
          const st = state.items?.[section.id]?.[doc.id] ?? {};
          const tooLarge = st.sizeBytes != null && st.sizeBytes > LARGE_BYTES;

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

              {!!doc.description && <Text style={{ color: "#444", marginBottom: 8 }}>{doc.description}</Text>}

              {doc.officialLink && (
                <Pressable onPress={() => { if (doc.officialLink) Linking.openURL(doc.officialLink); }}>
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
                    style={{ borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 10, backgroundColor: "#fff" }}
                  />
                </View>
                <View style={{ width: 140 }}>
                  <Text style={{ fontSize: 12, color: "#666" }}>Size (bytes)</Text>
                  <TextInput
                    placeholder="e.g., 524288"
                    keyboardType="numeric"
                    value={st.sizeBytes != null ? String(st.sizeBytes) : ""}
                    onChangeText={(t) => onUpdate(section.id, doc.id, "sizeBytes", t)}
                    style={{ borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 10, backgroundColor: "#fff" }}
                  />
                  {!!st.sizeBytes && (
                    <Text style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                      {humanBytes(st.sizeBytes)}
                    </Text>
                  )}
                </View>
              </View>

              {tooLarge && (
                <View style={{ backgroundColor: "#fffbeb", borderColor: "#fbbf24", borderWidth: 1, borderRadius: 8, padding: 8, marginBottom: 8 }}>
                  <Text style={{ color: "#92400e" }}>
                    File looks large ({humanBytes(st.sizeBytes)}). Consider compressing (see tips below).
                  </Text>
                </View>
              )}

              <Text style={{ fontSize: 12, color: "#666" }}>Notes</Text>
              <TextInput
                placeholder="Any notes (e.g., combined PDFs, translations, affidavits)…"
                value={st.notes ?? ""}
                onChangeText={(t) => onUpdate(section.id, doc.id, "notes", t)}
                style={{
                  borderWidth: 1,
                  borderColor: "#e5e7eb",
                  borderRadius: 8,
                  padding: 10,
                  backgroundColor: "#fff",
                  minHeight: 44,
                }}
                multiline
              />
            </View>
          );
        })}
      </>
    )}
    {/* END GUARD */}
  </View>
);

})}


        {!!guide.tips?.length && (
          <View style={{ borderWidth: 1, borderColor: "#fde68a", backgroundColor: "#fffbeb", borderRadius: 12, padding: 12, marginTop: 4 }}>
            <Text style={{ fontWeight: "700", marginBottom: 6 }}>Compression & upload tips</Text>
            {guide.tips.map((t, i) => (
              <Text key={i} style={{ marginBottom: 4 }}>• {t}</Text>
            ))}
          </View>
        )}

        {/* Sticky bottom bar — mobile friendly */}
<View
  style={{
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 12,
    paddingTop: 4,
paddingBottom: Platform.OS === "ios" ? 16 : 12,

    backgroundColor: "#ffffff",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    // Subtle shadow
    ...(Platform.OS === "android"
      ? { elevation: 10 }
      : {
          shadowColor: "#000",
          shadowOpacity: 0.08,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: -2 },
        }),
  }}
>
  <View
    style={{
      // Stack on mobile, row on web
      flexDirection: Platform.OS === "web" ? "row" : "column",
      gap: 8,
      width: "100%",
    }}
  >
    <Pressable
      onPress={runValidation}
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 14,
        paddingVertical: 14, // taller target
        backgroundColor: "#111827",
      }}
    >
      <Text style={{ color: "#fff", fontWeight: "700" }} numberOfLines={1} ellipsizeMode="tail">
        Validate required documents
      </Text>
    </Pressable>

    <Pressable
      onPress={exportSummary}
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 14,
        paddingVertical: 14,
        backgroundColor: "#1f2937",
      }}
    >
      <Text style={{ color: "#fff", fontWeight: "700" }} numberOfLines={1} ellipsizeMode="tail">
        Export summary (copy/share)
      </Text>
    </Pressable>
  </View>
</View>


      </ScrollView>
    </View>
  );
}

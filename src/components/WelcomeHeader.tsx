// src/components/WelcomeHeader.tsx
import React, { useEffect, useState } from "react";
import { View, Text, Pressable, TextInput } from "react-native";
import { getName, setName, onNameChanged, clearName } from "../services/profile";
import { LinearGradient } from "expo-linear-gradient";
import { FontAwesome5 } from "@expo/vector-icons";

function caHourToronto() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  return Number(parts.find(p => p.type === "hour")?.value ?? "0") || 0;
}

type Phase = "night" | "dawn" | "day" | "evening";
function phaseForHour(h: number): Phase {
  if (h >= 22 || h < 5) return "night";
  if (h >= 5 && h < 8) return "dawn";
  if (h >= 8 && h < 17) return "day";
  return "evening";
}

// Always return exactly two color stops
function gradientForPhase(p: Phase): [string, string] {
  switch (p) {
    case "night":   return ["#0B1220", "#16223A"]; // deep navy → ink
    case "dawn":    return ["#1B2A3A", "#2B2A3F"]; // slate → muted plum
    case "day":     return ["#0F172A", "#1E293B"]; // navy → steel
    case "evening": return ["#24122E", "#3B1D4A"]; // aubergine → plum
    default:        return ["#0F172A", "#1E293B"]; // fallback (satisfy TS)
  }
}



export default function WelcomeHeader({ children }: { children?: React.ReactNode }) {
  const [editing, setEditing] = useState(false);
  const [name, setNameState] = useState<string>("");
  const [draft, setDraft] = useState<string>("");

  function getGreeting(now = new Date()) {
    const h = now.getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  }

  // Load saved name once when header mounts
  useEffect(() => {
    (async () => {
      const saved = (await getName())?.trim() || "";
      setNameState(saved);
    })();
  }, []);
useEffect(() => {
  const off = onNameChanged((n) => setNameState(n.trim()));
  return off; // unsubscribe on unmount
}, []);
const phase = phaseForHour(caHourToronto());
const grad = React.useMemo(() => gradientForPhase(phase), [phase]);


  return (
  <View
    style={{
      borderRadius: 16,
      overflow: "hidden",
      marginBottom: 10,
      shadowColor: "#000",
      shadowOpacity: 0.18,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 5,
    }}
  >
    <LinearGradient
      colors={grad}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ padding: 14, borderRadius: 16 }}
    >
      {/* subtle glassy border */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: 0, right: 0, top: 0, bottom: 0,
          borderColor: "rgba(255,255,255,0.08)",
          borderWidth: 1,
          borderRadius: 16,
        }}
      />
      {/* oversized, cropped maple watermark (very subtle) */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          right: -28,          // push off the edge so only a slice shows
          top: -18,
          opacity: 0.030,      // whisper-quiet
          transform: [{ rotate: "-28deg" }],
        }}
      >
  <FontAwesome5 name="canadian-maple-leaf" size={160} color="#ffffff" />
</View>



      <Text style={{ fontSize: 16, fontWeight: "600", color: "#FFFFFF" }}>
        {getGreeting()}, {name ? name : "there"}
      </Text>

      {/* tagline — note the em-dash character below */}
      <Text style={{ color: "#CBD5E1", marginTop: 2 }}>
        Your digital immigration consultant — plan your PR with confidence.
      </Text>

      {/* name edit + inline slot */}
      <Pressable
    onPress={() => { setDraft(name || ""); setEditing(true); }}
    onLongPress={async () => {
      await clearName();         // wipe saved name
      setNameState("");          // reflect immediately
      // dev: reload so App.tsx first-launch effect shows the name modal
      const { DevSettings } = require("react-native");
      DevSettings.reload();
    }}
        accessibilityRole="button"
        style={{ marginTop: 6, alignSelf: "flex-start" }}
      >
        <Text style={{ color: "#93C5FD", textDecorationLine: "underline", fontSize: 14 }}>
          Change how we address you
        </Text>

        {/* The inline extras slot. Make sure children are not adding margins. */}
        <View style={{ marginTop: 6, alignSelf: "flex-start" }}>
          {children}
        </View>
      </Pressable>

      {editing && (
        <View style={{ marginTop: 10, flexDirection: "row" }}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Your name"
            placeholderTextColor="#94A3B8"
            style={{
              flex: 1,
              color: "#FFFFFF",
              borderWidth: 1, borderColor: "#334155",
              backgroundColor: "#0B1220",
              borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8
            }}
          />
          <Pressable
            onPress={async () => {
              const next = draft.trim();
              await setName(next);       // persist
              setNameState(next);        // reflect immediately
              setEditing(false);
            }}
          >
            <Text style={{ color: "#60A5FA", padding: 8, marginLeft: 8 }}>Save</Text>
          </Pressable>
        </View>
      )}
        </LinearGradient>
  </View>
);

}

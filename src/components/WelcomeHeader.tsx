// src/components/WelcomeHeader.tsx
import React, { useEffect, useState } from "react";
import { View, Text, Pressable, TextInput } from "react-native";
import { getName, setName, onNameChanged, clearName } from "../services/profile";
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

  return (
    <View style={{ backgroundColor: "#0F172A", borderRadius: 12, padding: 12, marginBottom: 12 }}>
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
    </View>
  );
}

// src/screens/TimelineScreen.tsx
import React from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { colors } from "../theme/colors";

// If you have a typed RootStackParamList, replace `any` below with it.
type Nav = NativeStackNavigationProp<any>;

export default function TimelineScreen() {
  const navigation = useNavigation<Nav>();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#fff" }}
      contentContainerStyle={{ padding: 16 }}
    >
      <Text style={{ fontSize: 22, fontWeight: "700", color: colors.text, marginBottom: 8 }}>
  Your immigration timeline
</Text>
<Text style={{ color: "#6b7280", marginBottom: 16 }}>
  Track your immigration journey milestones in one place. Use the PR Tracker to log dates and notes.
</Text>


      <Pressable
        onPress={() => navigation.navigate("PRTracker")}
        style={{
          backgroundColor: colors.navy,
          paddingVertical: 12,
          paddingHorizontal: 14,
          borderRadius: 12,
        }}
      >
        <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700", textAlign: "center" }}>
          Open PR Tracker
        </Text>
      </Pressable>

      {/* --- Placeholder content area (keep your existing stub/features here) --- */}
      <View
        style={{
          marginTop: 20,
          padding: 14,
          borderWidth: 1,
          borderColor: "#eef2f7",
          borderRadius: 12,
          backgroundColor: "#fafafa",
        }}
      >
        <Text style={{ color: "#374151", fontWeight: "600", marginBottom: 6 }}>
          What’s here next?
        </Text>
        <Text style={{ color: "#6b7280" }}>
          This screen will evolve into a richer timeline. For now, use the PR Tracker to log official post-submission events.
        </Text>
      </View>
    </ScrollView>
  );
}

// src/screens/Feedback.tsx
import React, { useMemo, useState } from "react";
import { View, Text, TextInput, ScrollView, Pressable, Alert, Switch, KeyboardAvoidingView, Platform } from "react-native";
import { colors } from "../theme/colors";
import type { FeedbackCategory, FeedbackForm } from "../services/feedback";
import { submitFeedback, collectDiagnostics } from "../services/feedback";
import { useNavigation } from '@react-navigation/native';

import { trackEvent } from '../services/analytics';

const CATEGORIES: { id: FeedbackCategory; label: string }[] = [
  { id: "bug", label: "Bug" },
  { id: "data-accuracy", label: "Data accuracy" },
  { id: "feature-request", label: "Feature request" },
  { id: "payment-subscription", label: "Payment/Subscription" },
  { id: "other", label: "Other" },
];

export default function Feedback() {
  const navigation = useNavigation<any>();

  const [category, setCategory] = useState<FeedbackCategory>("bug");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [includeDiagnostics, setIncludeDiagnostics] = useState(true);
  const [diagPreview, setDiagPreview] = useState<string>("(will include device/app/rules-cache basics)");
  const [busy, setBusy] = useState(false);

  // Build a light preview when toggle is on
  React.useEffect(() => {
    let active = true;
    if (includeDiagnostics) {
      collectDiagnostics().then((d) => {
        if (!active) return;
        const txt =
          `Platform: ${d.platform}\n` +
          (d.version ? `App version: ${d.version}\n` : "") +
          `Analytics: optedIn=${d.analytics?.optedIn} bufferSize=${d.analytics?.bufferSize}\n` +
          `Background: optedIn=${d.background?.optedIn} lastRun=${d.background?.lastRunISO ?? "(n/a)"}\n` +
          `Rounds cachedAt: ${d.rulesCache?.rounds?.cachedAt ?? "(n/a)"}\n` +
          `Fees cachedAt: ${d.rulesCache?.fees?.cachedAt ?? "(n/a)"}\n`;
        setDiagPreview(txt);
      });
    } else {
      setDiagPreview("(diagnostics not included)");
    }
    return () => { active = false; };
  }, [includeDiagnostics]);

  const canSubmit = useMemo(() => message.trim().length >= 10 && !busy, [message, busy]);

  async function onSubmit() {
    if (!canSubmit) return;
    setBusy(true);
    try {
      const form: FeedbackForm = {
        category,
        message: message.trim(),
        email: email.trim() || undefined,
        includeDiagnostics,
      };
      const res = await submitFeedback(form);
      if (res.ok) {
        Alert.alert("Thanks!", res.via === "webhook"
          ? "Your feedback was submitted. We’ve recorded the details."
          : "Your email composer should open with a pre-filled report. Send it to complete.");
      } else {
        Alert.alert("Couldn’t submit", "Please try again in a moment.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 16, backgroundColor: colors.background }}>
        <Text style={{ fontSize: 22, fontWeight: "700", color: colors.text, marginBottom: 12 }}>Help & Feedback</Text>
        {/* [capabilities] What MapleSteps can do — compact card */}
<View style={{
  borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 12, backgroundColor: "#FFFFFF",
  padding: 16, marginBottom: 16
}}>

  <Text style={{ fontWeight: "700", color: colors.text, marginBottom: 6 }}>
    What MapleSteps can do
  </Text>
<View style={{ gap: 8 }}>
<Text style={{ color: colors.text, lineHeight: 20 }}>
    • Step-by-step plan from your job category (NOC) to final application (e-APR).
  </Text>
<Text style={{ color: colors.text, lineHeight: 20 }}>
    • Clear “What’s next” tasks on the Plan screen with links to the right forms and pages.
  </Text>
<Text style={{ color: colors.text, lineHeight: 20 }}>
    • Live official info: fees, Proof of Funds, and draw updates — with a freshness label.
  </Text>
<Text style={{ color: colors.text, lineHeight: 20 }}>
    • Understand your eligibility and scores: Federal Skilled Worker (FSW-67) and CRS.
  </Text>
<Text style={{ color: colors.text, lineHeight: 20 }}>
    • Provincial options (PNP): see programs that fit you and open the official page.
  </Text>
<Text style={{ color: colors.text, lineHeight: 20 }}>
    • Keep documents safe: on-device encrypted Vault (nothing uploaded by the app).
  </Text>
</View>


  {/* Open Plan CTA */}
 <Pressable
  onPress={() => {
  trackEvent('help_capabilities_open_plan_clicked');
  navigation.navigate('ActionPlan');
}}

  style={{ marginTop: 10, alignSelf: "stretch", paddingVertical: 14, borderRadius: 10, backgroundColor: "#6b1010" }}
  accessibilityRole="button"
>

    <Text style={{ color: "#fff", fontWeight: "700", textAlign: "center" }}>Open Plan</Text>
  </Pressable>
</View>

        {/* Category chips */}
        <Text style={{ color: colors.text, fontWeight: "600", marginBottom: 8 }}>Type</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          {CATEGORIES.map((c) => {
            const active = c.id === category;
            return (
              <Pressable key={c.id} onPress={() => setCategory(c.id)} style={{
                paddingVertical: 8, paddingHorizontal: 12,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: active ? colors.mapleRed : "#D1D5DB",
                backgroundColor: active ? "#fff5f5" : "#FFFFFF"
              }}>
                <Text style={{ color: active ? colors.mapleRed : colors.text, fontWeight: "600" }}>{c.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Message */}
        <Text style={{ color: colors.text, fontWeight: "600", marginBottom: 8 }}>What happened?</Text>
        <TextInput
          placeholder="Describe the issue or idea (10+ chars)…"
          value={message}
          onChangeText={setMessage}
          multiline
          style={{
            minHeight: 120,
            borderWidth: 1,
            borderColor: "#E5E7EB",
            borderRadius: 8,
            padding: 12,
            backgroundColor: "#FFFFFF",
            color: colors.text,
            marginBottom: 12,
            textAlignVertical: "top",
          }}
        />

        {/* Email (optional) */}
        <Text style={{ color: colors.text, fontWeight: "600", marginBottom: 8 }}>Email (optional)</Text>
        <TextInput
          placeholder="you@example.com (optional)"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          style={{
            height: 44,
            borderWidth: 1,
            borderColor: "#E5E7EB",
            borderRadius: 8,
            paddingHorizontal: 12,
            backgroundColor: "#FFFFFF",
            color: colors.text,
            marginBottom: 16,
          }}
        />

        {/* Diagnostics toggle */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <Text style={{ color: colors.text, fontWeight: "600" }}>Include basic diagnostics</Text>
          <Switch value={includeDiagnostics} onValueChange={setIncludeDiagnostics} />
        </View>
        <Text style={{ fontSize: 12, color: "#6B7280", marginBottom: 16 }}>{diagPreview}</Text>

        {/* Submit */}
        <Pressable
          disabled={!canSubmit}
          onPress={onSubmit}
          style={{
            opacity: canSubmit ? 1 : 0.6,
            backgroundColor: colors.mapleRed,
            paddingVertical: 12,
            borderRadius: 10,
            alignItems: "center",
          }}
        >
          <Text style={{ color: "white", fontWeight: "700" }}>{busy ? "Submitting…" : "Submit feedback"}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

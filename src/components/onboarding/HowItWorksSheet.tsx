// src/components/onboarding/HowItWorksSheet.tsx
import React from 'react';
import { Modal, View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';


type Props = {
visible?: boolean;
onStart: () => void;
onSkip: () => void;
};


export default function HowItWorksSheet({ visible = true, onStart, onSkip }: Props) {
return (
<Modal visible={visible} transparent animationType="slide">
<View style={S.backdrop}>
<View style={S.sheet}>
<Text style={S.title}>How MapleSteps works</Text>
<ScrollView contentContainerStyle={S.cards}>
<Card title="1. Start in Plan" body="Your ‘What’s next’ lives here. It opens the right screen." />
<Card title="2. Verify NOC → Book tests & ECA" body="Your CLB/ECA feed your scores automatically." />
<Card title="3. Check Eligibility & Score" body="When green‑lit, we’ll gate you into e‑APR." />
</ScrollView>
<Pressable style={[S.btn, S.primary]} onPress={onStart}>
<Text style={S.btnText}>Take the 3‑min Guided Start</Text>
</Pressable>
<Pressable style={S.btn} onPress={onSkip}>
<Text style={S.btnText}>Skip for now</Text>
</Pressable>
</View>
</View>
</Modal>
);
}


function Card({ title, body }: { title: string; body: string }) {
return (
<View style={S.card}>
<Text style={S.cardTitle}>{title}</Text>
<Text style={S.cardBody}>{body}</Text>
</View>
);
}


const S = StyleSheet.create({
backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
sheet: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20 },
title: { fontSize: 20, fontWeight: '700', marginBottom: 12 },
cards: { gap: 12 },
card: { borderWidth: 1, borderColor: '#eee', borderRadius: 12, padding: 12 },
cardTitle: { fontSize: 16, fontWeight: '600', marginBottom: 6 },
cardBody: { fontSize: 14, lineHeight: 18 },
btn: { paddingVertical: 12, alignItems: 'center' },
primary: { backgroundColor: '#e03131', borderRadius: 10, marginTop: 8 },
btnText: { color: '#111', fontWeight: '600' },
});
import React from "react";
import { View, Text, Platform, Animated, Easing, StyleSheet } from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

// ---------- Time + theming ----------
type Phase = "night" | "dawn" | "day" | "evening";

function caTimeParts() {
  const d = new Date();

  // 12-hour time (no seconds) in Canada (Ottawa TZ)
  const time = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(d);

  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    weekday: "short",
    month: "short",
    day: "2-digit",
  }).format(d);

  // Hour for theming (0–23) without parsing strings back to Date
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const hourStr = parts.find(p => p.type === "hour")?.value ?? "0";
  const hour = Number(hourStr);

  return { time, date, hour: Number.isFinite(hour) ? hour : 0 };
}

function phaseForHour(h: number): Phase {
  if (h >= 22 || h < 5) return "night";     // 10pm–4:59am
  if (h >= 5 && h < 8) return "dawn";       // 5am–7:59am
  if (h >= 8 && h < 17) return "day";       // 8am–4:59pm
  return "evening";                         // 5pm–9:59pm
}

function themeForPhase(p: Phase) {
  switch (p) {
    case "night":   return { tint: "#0b1220", accent: "#91b4ff" };
    case "dawn":    return { tint: "#1b2a3a", accent: "#ffd18a" };
    case "day":     return { tint: "#0ea5e9", accent: "#fff59d" };
    case "evening": return { tint: "#3b1d4a", accent: "#ffb3ae" };
  }
}

// ---------- Stars helper ----------
function getStarsForPhase(phase: Phase, width: number) {
  const count = phase === "night" ? 28 : phase === "dawn" ? 14 : 6; // evening=6
  const w = Math.max(280, width || 360);
  const h = 84; // keep stars toward the top band

  const stars = [];
  let seed = 42;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;

  for (let i = 0; i < count; i++) {
    const size = rnd() < 0.75 ? 1 : 2; // mostly 1px
    const x = Math.floor(rnd() * (w - 8)) + 4;
    const y = Math.floor(rnd() * Math.min(h, 100));
    const opacityBase = phase === "night" ? 0.22 : phase === "dawn" ? 0.16 : 0.10;
    const opacity = opacityBase * (0.7 + rnd() * 0.6);
    stars.push({ x, y, size, opacity });
  }
  return stars;
}

// ---------- Component ----------
type Props = { displayName?: string | null };

export default function WelcomeTimeCard(_: Props) {
  const [{ time, date, hour }, setNow] = React.useState(caTimeParts());
  const phase = phaseForHour(hour);
  const theme = themeForPhase(phase);

  // tick once per minute (no seconds)
  React.useEffect(() => {
    const id = setInterval(() => setNow(caTimeParts()), 60_000);
    return () => clearInterval(id);
  }, []);

  // tiny float animation for the icon
  const bob = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: -4, duration: 1200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0,  duration: 1200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    ).start();
  }, [bob]);

  // animated sheen across the card
  const [cardW, setCardW] = React.useState(0);
  const sheenX = React.useRef(new Animated.Value(-120)).current;
  React.useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(sheenX, { toValue: cardW + 120, duration: 2800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(sheenX, { toValue: -120, duration: 0, useNativeDriver: true }),
        Animated.delay(1200),
      ])
    ).start();
  }, [sheenX, cardW]);

  // memoize stars (recompute only on phase/width change)
  const stars = React.useMemo(() => getStarsForPhase(phase, cardW), [phase, cardW]);

  return (
    <View
      style={[styles.cardShell, { backgroundColor: theme.tint }]}
      onLayout={(e) => setCardW(e.nativeEvent.layout.width)}
    >
      {/* Decorative back-orb */}
      <View style={[styles.backOrb, { backgroundColor: theme.accent }]} />

      {/* Glass layer */}
      {Platform.OS !== "web" ? (
        <BlurView intensity={30} tint="default" style={styles.glass} />
      ) : (
        <View style={[styles.glass, { backgroundColor: "rgba(255,255,255,0.06)" }]} />
      )}

      {/* Scattered stars (subtle) */}
      {(phase === "night" || phase === "dawn" || phase === "evening") && (
        <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
          {stars.map((s, i) => (
            <View
              key={i}
              style={{
                position: "absolute",
                left: s.x, top: s.y,
                width: s.size, height: s.size,
                borderRadius: 2,
                backgroundColor: "white",
                opacity: s.opacity,
              }}
            />
          ))}
        </View>
      )}

      {/* Animated gloss sweep */}
      <Animated.View
        pointerEvents="none"
        style={[styles.sheenWrap, { transform: [{ translateX: sheenX }, { rotate: "20deg" }] }]}
      >
        <LinearGradient
          colors={["transparent", "rgba(255,255,255,0.28)", "transparent"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFillObject}
        />
      </Animated.View>

      {/* Content */}
      <View style={styles.row}>
        {/* Left: label */}
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Canada current time:</Text>
          <Text style={styles.place}>Ottawa</Text>
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Right: time + date */}
        <View style={{ alignItems: "flex-end" }}>
          <Text style={styles.time}>{time}</Text>
          <Text style={styles.date}>{date}</Text>
        </View>

        {/* Vector icon (top-right) */}
        <Animated.View style={[styles.iconWrap, { transform: [{ translateY: bob }] }]}>
          {phase === "day" && <Ionicons name="sunny" size={20} color="white" />}
          {phase === "dawn" && <Ionicons name="sunny-outline" size={20} color="white" />}
          {phase === "evening" && <Ionicons name="partly-sunny" size={20} color="white" />}
          {phase === "night" && <Ionicons name="moon" size={20} color="white" />}
        </Animated.View>
      </View>
    </View>
  );
}

// ---------- Styles ----------
const styles = StyleSheet.create({
  cardShell: {
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 12,
    // depth
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
    padding: 0,
  },
  glass: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
  },
  backOrb: {
    position: "absolute",
    right: -40,
    top: -30,
    width: 180,
    height: 180,
    borderRadius: 999,
    opacity: 0.18,
  },
  sheenWrap: {
    position: "absolute",
    top: -20,
    left: -120,
    width: 160,
    height: "160%",
    borderRadius: 24,
    opacity: 0.55,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  label: { color: "#ffffff", fontSize: 14, fontWeight: "700" },
  place: { color: "rgba(255,255,255,0.95)", fontSize: 12, marginTop: 2 },
  divider: { width: 1, height: 48, marginHorizontal: 14, backgroundColor: "rgba(255,255,255,0.22)" },
  time: { color: "#ffffff", fontSize: 25, fontWeight: "600", lineHeight: 34 },
  date: { color: "rgba(255,255,255,0.95)", fontSize: 12, marginTop: 4 },
  iconWrap: {
    position: "absolute",
    right: 12,
    top: 6,
    alignItems: "flex-end",
  },
});

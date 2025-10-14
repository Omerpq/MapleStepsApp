// App.tsx
import 'react-native-get-random-values';
// S5-02 Background refresh
import { getBackgroundState } from "./src/services/background";
// S5-02 Analytics
import { trackScreenView, getAnalyticsState } from "./src/services/analytics";

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { LogBox, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DefaultTheme, Theme } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';

import RootNavigator from './src/navigation/RootNavigator';
import { colors } from './src/theme/colors';
import NocDevScreen from './src/dev/NocDevScreen';

import { migrateUpdatesCachesOnce } from './src/services/updates';
import { notifications } from './src/services/notifications';
import { initIAP, endIAP } from './src/services/payments';

// 🔸 NEW: preload icons/fonts + hold native splash
import * as SplashScreen from 'expo-splash-screen';
import * as Font from 'expo-font';
import { Ionicons, MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';

import { Modal, Text, TextInput, Pressable } from 'react-native';
import { getName, setName } from './src/services/profile';

// Keep native splash visible while we load critical assets
SplashScreen.preventAutoHideAsync().catch(() => { /* no-op if already prevented */ });

// ---- RNG (web/native-safe) -------------------------------------
function getSecureRandomBytes(len: number): Uint8Array {
  const g: any = globalThis as any;
  if (g.crypto && typeof g.crypto.getRandomValues === "function") {
    const out = new Uint8Array(len);
    g.crypto.getRandomValues(out);
    return out;
  }
  // Dev fallback (NOT cryptographically strong) — acceptable only in local dev
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) out[i] = Math.floor(Math.random() * 256);
  return out;
}

// Silence Expo Go remote-push warning + known dev log
LogBox.ignoreLogs([
  'expo-notifications: Android Push notifications (remote notifications)',
  '`expo-notifications` functionality is not fully supported in Expo Go',
  '[nextTasks] Dropped',
]);

const SHOW_NOC_DEV = false;
const queryClient = new QueryClient();

const navTheme: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.mapleRed,
    background: colors.background,
    card: '#fff',
    text: colors.text,
    border: '#e6e6e6',
    notification: colors.mapleRed,
  },
};

const expoPrefix = Linking.createURL('/');
const linking = {
  prefixes: [expoPrefix, 'maplesteps://', 'http://localhost:8081', 'http://127.0.0.1:8081'],
  config: {
    screens: {
      PNPMapper: 'pnp',
      EEProfileChecklist: 'ee',
      NocDev: 'dev/noc',
    },
  },
};

export default function App() {
  // 🔸 NEW: splash/asset gate
  const [appReady, setAppReady] = useState(false);
  const onRootLayout = useCallback(async () => {
    if (appReady) {
      await SplashScreen.hideAsync();
    }
  }, [appReady]);

  // S5-02 Analytics — nav refs to detect active route changes
  const navigationRef = useRef<any>(null);
  const routeNameRef = useRef<string | null>(null);

  useEffect(() => {
    // one-time app bootstraps
    migrateUpdatesCachesOnce();
    void notifications.init(); // permissions + channel + orphan cleanup
    void initIAP();            // initialize store-native IAP

    // cleanup on unmount / reload
    return () => {
      endIAP();                // remove listeners + end IAP connection
    };
  }, []);

  // S5-02 Background — ensure task module is loaded & log state (DEV only)
  useEffect(() => {
    getBackgroundState().then((s) => {
      if (__DEV__) console.log("[S5-02] Background state", s);
    });
  }, []);

  // 🔸 NEW: preload icon fonts (and space for your custom fonts if any)
  useEffect(() => {
    (async () => {
      try {
        await Font.loadAsync({
          ...Ionicons.font,
          ...MaterialIcons.font,
          ...MaterialCommunityIcons.font,
          // If you use custom fonts, add them here, e.g.:
          // "Inter-Regular": require("./assets/fonts/Inter-Regular.ttf"),
          // "Inter-Medium": require("./assets/fonts/Inter-Medium.ttf"),
          // "Inter-Bold": require("./assets/fonts/Inter-Bold.ttf"),
        });
      } finally {
        setAppReady(true);
      }
    })();
  }, []);
const [needName, setNeedName] = useState(false);
const [tempName, setTempName] = useState('');

useEffect(() => {
  (async () => {
    try {
      const saved = (await getName())?.trim() || '';
      if (!saved) {
        setTempName('');
        setNeedName(true);   // show the modal on first-ever launch
      } else {
        setTempName(saved);  // keep input prefilled if user reopens the modal
        setNeedName(false);  // name already present → don’t show the modal
      }
    } catch {
      // On any read error, ask for name once
      setTempName('');
      setNeedName(true);
    }
  })();
}, []);


  if (SHOW_NOC_DEV) {
    // Minimal wrapper; no nav/rq needed for this test
    return <NocDevScreen />;
  }

  // Keep native splash on while assets load (prevents “blank labels / missing icons” in release)
  if (!appReady) return null;

  return (
    // The outer View allows SplashScreen to hide exactly when first layout is ready
    <View style={{ flex: 1 }} onLayout={onRootLayout}>
            <Modal visible={needName} transparent animationType="fade" onRequestClose={() => {}}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center" }}>
          <View style={{ width: "88%", borderRadius: 12, backgroundColor: "white", padding: 18 }}>
            <Text style={{ fontSize: 18, fontWeight: "700", marginBottom: 8 }}>How should we address you?</Text>
            <Text style={{ color: "#374151", marginBottom: 12 }}>
              Enter your name. You can change this later from “Change how we address you”.
            </Text>
            <TextInput
              value={tempName}
              onChangeText={setTempName}
              placeholder="Your name"
              autoFocus
              style={{ borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 14 }}
            />
            <Pressable
              disabled={!tempName.trim()}
              onPress={async () => {
  await setName(tempName.trim()); // persists and notifies header via onNameChanged
  setNeedName(false);             // close modal; UI updates immediately
}}


              style={{
                alignSelf: "flex-end",
                backgroundColor: tempName.trim() ? "#6b1010" : "#d1d5db",
                paddingVertical: 10,
                paddingHorizontal: 16,
                borderRadius: 8,
              }}
            >
              <Text style={{ color: "white", fontWeight: "700" }}>Save</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <NavigationContainer
            ref={navigationRef}
            theme={navTheme}
            linking={linking}
            onReady={() => {
              const current = navigationRef.current?.getCurrentRoute()?.name as string | undefined;
              routeNameRef.current = current ?? null;
              // fire initial screen view only if opted in
              getAnalyticsState().then((s) => {
                if (s.optedIn && current) trackScreenView(current);
              });
            }}
            onStateChange={() => {
              const current = navigationRef.current?.getCurrentRoute()?.name as string | undefined;
              if (!current) return;
              if (routeNameRef.current !== current) {
                routeNameRef.current = current;
                // fire screen view only if opted in
                getAnalyticsState().then((s) => {
                  if (s.optedIn) trackScreenView(current);
                });
              }
            }}
          >
            <StatusBar style="light" />
            <RootNavigator />
          </NavigationContainer>
        </QueryClientProvider>
      </SafeAreaProvider>
    </View>
  );
}

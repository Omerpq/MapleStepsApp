// App.tsx
import 'react-native-get-random-values';
// S5-02 Background refresh
import { getBackgroundState } from "./src/services/background";
// S5-02 Analytics
import { trackScreenView, getAnalyticsState } from "./src/services/analytics";


import React, { useEffect, useRef } from 'react';
import { LogBox } from 'react-native';
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
// S5-02 Analytics — nav refs to detect active route changes
const navigationRef = useRef<any>(null);
const routeNameRef = useRef<string | null>(null);

  React.useEffect(() => {
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

  if (SHOW_NOC_DEV) {
    // Minimal wrapper; no nav/rq needed for this test
    return <NocDevScreen />;
  }

  return (
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
  );
}

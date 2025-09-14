//App.tsx
import React from "react";
import { LogBox } from 'react-native';

// Silence Expo Go remote-push error (we only use local scheduling),
// and the known seed warning from nextTasks in dev.
LogBox.ignoreLogs([
  'expo-notifications: Android Push notifications (remote notifications)',
  '`expo-notifications` functionality is not fully supported in Expo Go',
  '[nextTasks] Dropped',
]);

import { StatusBar } from "expo-status-bar";
import { NavigationContainer, DefaultTheme, Theme } from "@react-navigation/native";
import RootNavigator from "./src/navigation/RootNavigator";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { colors } from "./src/theme/colors";
import NocDevScreen from "./src/dev/NocDevScreen";
import * as Linking from "expo-linking";

import { migrateUpdatesCachesOnce } from "./src/services/updates"; // ADD
import { notifications } from "./src/services/notifications";

const SHOW_NOC_DEV = false;


const queryClient = new QueryClient();

const navTheme: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.mapleRed,
    background: colors.background,
    card: "#fff",
    text: colors.text,
    border: "#e6e6e6",
    notification: colors.mapleRed
  }
};

const expoPrefix = Linking.createURL("/");
const linking = {
  prefixes: [expoPrefix, "maplesteps://", "http://localhost:8081", "http://127.0.0.1:8081"],
  config: { screens: { NocDev: "dev/noc" } },
};




export default function App() {
    React.useEffect(() => {
    migrateUpdatesCachesOnce();
    void notifications.init();  // ADD: permissions + channel + orphan cleanup (no-op on web)
  }, []); // ADD: clear legacy ms_rounds_cache_v1 once

    if (SHOW_NOC_DEV) {
    // Minimal wrapper; no nav/rq needed for this test
    return <NocDevScreen />;
  }

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <NavigationContainer theme={navTheme} linking={linking}>

          <StatusBar style="light" />
          <RootNavigator />
        </NavigationContainer>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
// src/services/devFlag.ts
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "ms_dev_tools_enabled";

export async function isDevToolsEnabled() {
  if (__DEV__) return true; // always on in dev builds
  const v = await AsyncStorage.getItem(KEY);
  return v === "1";
}
export async function toggleDevTools() {
  const on = await isDevToolsEnabled();
  await AsyncStorage.setItem(KEY, on ? "0" : "1");
  return !on;
}

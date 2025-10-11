// src/services/background.ts
// S5-02 — Background refresh for rounds/fees (A4 loaders)
// Expo: requires expo-background-fetch + expo-task-manager (installed in Step 1)

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as BackgroundFetch from "expo-background-fetch";
import * as TaskManager from "expo-task-manager";
import { loadRounds, loadFees } from "./updates";
import { Platform } from "react-native";

const TASK_NAME = "ms.background.refresh.v1";
const META_LAST_RUN_KEY = "ms.background.last_run_iso.v1";
const META_LAST_RESULT_KEY = "ms.background.last_result.v1";
const OPT_IN_KEY = "ms.background.opt_in.v1"; // boolean string "1" or null

export type BackgroundOptState = {
  optedIn: boolean;
  isRegistered: boolean;
  status: BackgroundFetch.BackgroundFetchStatus;
  lastRunISO: string | null;
  lastResult?: {
    rounds?: { source: string; status?: number };
    fees?: { source: string; status?: number };
    atISO: string;
  } | null;
};

/** Internal: perform refresh now (used by the background task and dev/manual trigger) */
async function performRefreshOnce(): Promise<BackgroundFetch.BackgroundFetchResult> {
  try {
    // Revalidate rounds (IRCC draws mirror via rules repo with validators)
    const rounds = await loadRounds().catch(() => null);
    // Revalidate fees (IRCC fee table via rules repo with validators)
    const fees = await loadFees().catch(() => null);

    const nowISO = new Date().toISOString();
    await AsyncStorage.setItem(META_LAST_RUN_KEY, nowISO);
    await AsyncStorage.setItem(
      META_LAST_RESULT_KEY,
      JSON.stringify({
        rounds: rounds ? { source: rounds.source, status: rounds.meta?.status } : undefined,
        fees: fees ? { source: fees.source, status: fees.meta?.status } : undefined,
        atISO: nowISO,
      })
    );

    // Decide result based on any fresh remote; otherwise say no data.
    const anyRemote =
      (rounds?.source === "remote") ||
      (fees?.source === "remote");
    return anyRemote
      ? BackgroundFetch.BackgroundFetchResult.NewData
      : BackgroundFetch.BackgroundFetchResult.NoData;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
}

// Define the background task once (guard Fast Refresh without ts-expect-error)
const __alreadyDefined =
  (global as any).__MS_BG_TASK_DEFINED__ === true;

if (!__alreadyDefined) {
  try {
    TaskManager.defineTask(TASK_NAME, async () => {
      const opted = (await AsyncStorage.getItem(OPT_IN_KEY)) === "1";
      if (!opted) return BackgroundFetch.BackgroundFetchResult.NoData;
      return performRefreshOnce();
    });
  } catch {
    // If it was already defined by a prior refresh, ignore.
  } finally {
    (global as any).__MS_BG_TASK_DEFINED__ = true;
  }
}



/** Enable background refresh (persists opt-in and registers task if possible) */
export async function enableBackgroundRefresh(options?: {
  /** Minimum interval in seconds (OS may exceed). Default: 3600 (1h). */
  minimumInterval?: number;
  /** Stop task when app process is killed on Android. Default: false (keep running). */
  stopOnTerminate?: boolean;
  /** Start task only when device is charging on Android. Default: false. */
  startOnBoot?: boolean;
}): Promise<BackgroundOptState> {
  await AsyncStorage.setItem(OPT_IN_KEY, "1");

const statusNow = (await BackgroundFetch.getStatusAsync()) as BackgroundFetch.BackgroundFetchStatus;
if (Platform.OS !== "web") {
  const statusNow = (await BackgroundFetch.getStatusAsync()) as BackgroundFetch.BackgroundFetchStatus;
  if (statusNow === BackgroundFetch.BackgroundFetchStatus.Available) {
    const isRegistered = await isTaskRegisteredAsync(TASK_NAME);
    if (!isRegistered) {
      await BackgroundFetch.registerTaskAsync(TASK_NAME, {
        minimumInterval: options?.minimumInterval ?? 3600,
        stopOnTerminate: options?.stopOnTerminate ?? false,
        startOnBoot: options?.startOnBoot ?? true,
      });
    }
  }
}
  return getBackgroundState();
}

/** Disable background refresh (persists opt-out and unregisters task) */
export async function disableBackgroundRefresh(): Promise<BackgroundOptState> {
  await AsyncStorage.removeItem(OPT_IN_KEY);
  if (Platform.OS !== "web") {
  const isRegistered = await isTaskRegisteredAsync(TASK_NAME);
  if (isRegistered) {
    try {
      await BackgroundFetch.unregisterTaskAsync(TASK_NAME);
    } catch {
      // ignore
    }
  }
}

  return getBackgroundState();
}

/** Read current background settings + last run/result */
export async function getBackgroundState(): Promise<BackgroundOptState> {
  const optedIn = (await AsyncStorage.getItem(OPT_IN_KEY)) === "1";
  const lastRunISO = (await AsyncStorage.getItem(META_LAST_RUN_KEY)) || null;
  const lastResultRaw = await AsyncStorage.getItem(META_LAST_RESULT_KEY);
  const lastResult = lastResultRaw ? JSON.parse(lastResultRaw) : null;

  if (Platform.OS === "web") {
    return {
      optedIn,
      isRegistered: false,
      status: BackgroundFetch.BackgroundFetchStatus.Denied,
      lastRunISO,
      lastResult,
    };
  }

  const statusNow =
    (await BackgroundFetch.getStatusAsync()) ?? BackgroundFetch.BackgroundFetchStatus.Denied;
  const isRegistered = await isTaskRegisteredAsync(TASK_NAME);
  return { optedIn, isRegistered, status: statusNow, lastRunISO, lastResult };
}


/** Manually trigger a one-off refresh (useful for a Dev button) */
export async function runBackgroundRefreshNow(): Promise<BackgroundFetch.BackgroundFetchResult> {
  return performRefreshOnce();
}

/** Internal helper: is task registered */
async function isTaskRegisteredAsync(taskName: string): Promise<boolean> {
  if (Platform.OS === "web") return false; // web: TaskManager not available
  const tasks = await TaskManager.getRegisteredTasksAsync();
  return tasks.some((t) => t.taskName === taskName);
}

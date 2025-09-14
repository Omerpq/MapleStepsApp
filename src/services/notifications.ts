// src/services/notifications.ts
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const MAP_KEY = 'ms.notifications.map.v1';             // taskId -> notifId
const PERM_KEY = 'ms.notifications.permission_v1';     // "granted" | "denied" | "prompted"
const MIGRATE_KEY = 'ms.notifications.migrated_v1';   // ADD
const isWeb = Platform.OS === 'web';

type NotifMap = Record<string, string>;
export type ScheduleOpts = { title?: string; body?: string };

// Public API shape
type API = {
  init: () => Promise<void>;
  ensurePermissionOnce: () => Promise<boolean>;
  schedule: (taskId: string, dueISO: string, opts?: ScheduleOpts) => Promise<string | null>;
  reschedule: (taskId: string, dueISO: string, opts?: ScheduleOpts) => Promise<string | null>;
  cancel: (taskId: string) => Promise<void>;
  cancelAllDev: () => Promise<void>;
  __keys: { MAP_KEY: string; PERM_KEY: string };
};

let notifications: API;

// --------------------- Web (no-op) ---------------------
if (isWeb) {
  notifications = {
    init: async () => {},
    ensurePermissionOnce: async () => false,
    schedule: async () => null,
    reschedule: async () => null,
    cancel: async () => {},
    cancelAllDev: async () => { await AsyncStorage.multiRemove([MAP_KEY, PERM_KEY]); },
    __keys: { MAP_KEY, PERM_KEY },
  };
} else {
  // ------------------- Mobile impl -------------------
  async function readMap(): Promise<NotifMap> {
    try {
      const raw = await AsyncStorage.getItem(MAP_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }
  async function writeMap(map: NotifMap) {
    await AsyncStorage.setItem(MAP_KEY, JSON.stringify(map));
  }
  function normalizeToNineAM(dueISO: string): Date {
    const d = new Date(dueISO);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9, 0, 0, 0);
  }
  async function ensurePermissionOnce(): Promise<boolean> {
    const cached = await AsyncStorage.getItem(PERM_KEY);
    if (cached === 'granted') return true;
    if (cached === 'denied') return false;

    await AsyncStorage.setItem(PERM_KEY, 'prompted');

    const current = await Notifications.getPermissionsAsync();
    let status = current.status;
    if (status !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    const ok = status === 'granted';
    await AsyncStorage.setItem(PERM_KEY, ok ? 'granted' : 'denied');
    return ok;
  }
  async function configureChannels() {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
  name: 'General',
  importance: Notifications.AndroidImportance.DEFAULT,
  vibrationPattern: [0, 250, 250, 250],
});

    }
    Notifications.setNotificationHandler({
  handleNotification: async (): Promise<Notifications.NotificationBehavior> => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});


  }
  async function cleanupOrphans() {
    const map = await readMap();
    if (!Object.keys(map).length) return;
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const liveIds = new Set(scheduled.map(s => s.identifier));
    let changed = false;
    for (const [taskId, notifId] of Object.entries(map)) {
      if (!liveIds.has(notifId)) {
        delete map[taskId];
        changed = true;
      }
    }
    if (changed) await writeMap(map);
  }
async function migrateOnce() {
  const done = await AsyncStorage.getItem(MIGRATE_KEY);
  if (done) return;
  // Nuke any previously scheduled notifications we don't have in the map
  await Notifications.cancelAllScheduledNotificationsAsync();
  await AsyncStorage.removeItem(MAP_KEY);
  await AsyncStorage.setItem(MIGRATE_KEY, '1');
}

  async function init() {
    await configureChannels();
    await ensurePermissionOnce();
    await migrateOnce();      // ADD: wipe legacy schedules once
    await cleanupOrphans();
  }
  async function schedule(taskId: string, dueISO: string, opts?: ScheduleOpts): Promise<string | null> {
    const granted = await ensurePermissionOnce();
    if (!granted) return null;

    const when = normalizeToNineAM(dueISO);
    if (when.getTime() <= Date.now()) return null;

    const identifier = await Notifications.scheduleNotificationAsync({
      content: {
        title: opts?.title ?? 'MapleSteps — Due today',
        body: opts?.body ?? 'You have a MapleSteps task due today.',
      },
      trigger: {
  type: Notifications.SchedulableTriggerInputTypes.DATE,
  date: when,
},


    });

    const map = await readMap();
    map[taskId] = identifier;
    await writeMap(map);
    return identifier;
  }
  async function cancel(taskId: string): Promise<void> {
    const map = await readMap();
    const id = map[taskId];
    if (id) {
      try { await Notifications.cancelScheduledNotificationAsync(id); } catch {}
      delete map[taskId];
      await writeMap(map);
    }
  }
  async function reschedule(taskId: string, dueISO: string, opts?: ScheduleOpts): Promise<string | null> {
    await cancel(taskId);
    return schedule(taskId, dueISO, opts);
  }
  async function cancelAllDev(): Promise<void> {
    await Notifications.cancelAllScheduledNotificationsAsync();
    await AsyncStorage.multiRemove([MAP_KEY, PERM_KEY]);
  }

  notifications = {
    init,
    ensurePermissionOnce,
    schedule,
    reschedule,
    cancel,
    cancelAllDev,
    __keys: { MAP_KEY, PERM_KEY },
  };
}

export { notifications };
export default notifications;

import AsyncStorage from "@react-native-async-storage/async-storage";

const NAME_KEY = "ms.profile.name";

// --- ultra-light event system for instant UI updates ---
type NameListener = (name: string) => void;
const listeners = new Set<NameListener>();

export function onNameChanged(fn: NameListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit(name: string) {
  for (const fn of listeners) fn(name);
}

// --- public API ---
export async function getName(): Promise<string | null> {
  try {
    const v = await AsyncStorage.getItem(NAME_KEY);
    return v ?? null;
  } catch {
    return null;
  }
}

export async function setName(name: string): Promise<void> {
  const clean = name.trim();
  try {
    await AsyncStorage.setItem(NAME_KEY, clean);
  } finally {
    emit(clean); // notify all subscribers immediately
  }
}

export async function clearName(): Promise<void> {
  try {
    await AsyncStorage.removeItem(NAME_KEY);
  } finally {
    emit(""); // notify subscribers that it's cleared
  }
}

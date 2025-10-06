// src/services/vault.ts
// Vault v1 — AsyncStorage + SecureStore + FileSystem + DocumentPicker + CryptoJS (AES-256-CBC)
// Works on Web + Expo Go (device) without expo-random/crypto. Requires:
//   1) App.tsx: `import 'react-native-get-random-values';` FIRST import.
//   2) npm i crypto-js @react-native-async-storage/async-storage expo-secure-store expo-file-system expo-document-picker

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import * as FileSystem from "expo-file-system/legacy";
import * as DocumentPicker from "expo-document-picker";
import CryptoJS from "crypto-js";
import { Platform } from "react-native";


// ------------------- Types -------------------
export type VaultItemMeta = {
  id: string; // uuid (string)
  name: string;
  mime: string;
  size: number;
  createdAtISO: string;
};

export type VaultIndex = { version: 1; items: VaultItemMeta[] };
export type VaultListItem = VaultItemMeta;

type VaultDecryptedItem = { meta: VaultItemMeta; contentBase64: string };

// ------------------- Constants -------------------
const SECURE_KEY_ID = "ms_vault_master_key_v1";
const LEGACY_KEY_IDS = [
  "ms.vault.master.key",
  "maplesteps:vault/master-key",
  "vault/master-key",
];

const INDEX_KEY = "@ms.vault.index";
const ITEM_KEY_PREFIX = "@ms.vault.item.";

const EXPORT_FILENAME = "MapleSteps-Vault-Export.json";

// ------------------- RNG (web/native-safe) -------------------
function getSecureRandomBytes(len: number): Uint8Array {
  const g: any = globalThis as any;
  if (g.crypto && typeof g.crypto.getRandomValues === "function") {
    const out = new Uint8Array(len);
    g.crypto.getRandomValues(out);
    return out;
  }
  // Dev fallback (not crypto-strong) — acceptable only for local dev
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) out[i] = Math.floor(Math.random() * 256);
  return out;
}

// ------------------- Small helpers -------------------
function nowISO() {
  return new Date().toISOString();
}

function makeUUID(): string {
  // RFC4122-ish v4 built from our RNG (no external deps)
  const b = getSecureRandomBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const toHex = (n: number) => n.toString(16).padStart(2, "0");
  const hex = Array.from(b).map(toHex).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(
    16,
    20
  )}-${hex.slice(20)}`;
}
function getWritableDir(): string {
  // Some Expo type defs omit these properties; access via 'any' to appease TS
  const fsAny: any = FileSystem as any;
  const dir: string | undefined =
    fsAny?.documentDirectory || fsAny?.cacheDirectory;
  if (!dir) throw new Error("No writable directory available");
  return dir.endsWith("/") ? dir : dir + "/";
}

function u8ToWordArray(u8: Uint8Array) {
  const words: number[] = [];
  for (let i = 0; i < u8.length; i += 4) {
    words.push(
      ((u8[i] || 0) << 24) |
        ((u8[i + 1] || 0) << 16) |
        ((u8[i + 2] || 0) << 8) |
        (u8[i + 3] || 0)
    );
  }
  return CryptoJS.lib.WordArray.create(words, u8.length);
}

function wordArrayToB64(wa: CryptoJS.lib.WordArray) {
  return CryptoJS.enc.Base64.stringify(wa);
}

function u8ToB64(u8: Uint8Array) {
  // RN’s Buffer may not exist; use CryptoJS for consistent b64
  return CryptoJS.enc.Base64.stringify(u8ToWordArray(u8));
}

function b64ToWordArray(b64: string) {
  return CryptoJS.enc.Base64.parse(b64);
}

// ------------------- Master key management -------------------
async function readSecureKey(id: string) {
  try {
    return await SecureStore.getItemAsync(id);
  } catch {
    return null;
  }
}

async function writeSecureKey(id: string, value: string) {
  await SecureStore.setItemAsync(id, value, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED,
  });
}

async function deleteSecureKey(id: string) {
  try {
    await SecureStore.deleteItemAsync(id);
  } catch {
    // ignore
  }
}

export async function ensureMasterKey(): Promise<string> {
  // 1) Try current
  let keyB64 = await readSecureKey(SECURE_KEY_ID);
  if (keyB64) return keyB64;

  // 2) Try legacy and migrate
  for (const old of LEGACY_KEY_IDS) {
    const v = await readSecureKey(old);
    if (v) {
      await writeSecureKey(SECURE_KEY_ID, v);
      // best-effort cleanup of legacy
      for (const l of LEGACY_KEY_IDS) await deleteSecureKey(l);
      return v;
    }
  }

  // 3) Create new 32-byte key
  const raw = getSecureRandomBytes(32);
  keyB64 = u8ToB64(raw);
  await writeSecureKey(SECURE_KEY_ID, keyB64);
  return keyB64;
}

// ------------------- AES (no internal randomness) -------------------
function encryptWithKey(keyB64: string, plaintextJson: string): string {
  const key = CryptoJS.enc.Base64.parse(keyB64); // 32 bytes expected
  const ivU8 = getSecureRandomBytes(16);
  const saltU8 = getSecureRandomBytes(16); // reserved for future KDF adjustments
  const iv = u8ToWordArray(ivU8);

  const cipher = CryptoJS.AES.encrypt(plaintextJson, key, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  return JSON.stringify({
    v: 1,
    iv: u8ToB64(ivU8),
    salt: u8ToB64(saltU8),
    ct: cipher.ciphertext.toString(CryptoJS.enc.Base64),
  });
}

function decryptWithKey(keyB64: string, encryptedJson: string): string {
  const env = JSON.parse(encryptedJson);
  if (env?.v !== 1) throw new Error("Unsupported vault item version");
  const key = CryptoJS.enc.Base64.parse(keyB64);
  const ivWA = b64ToWordArray(env.iv);
  const ctWA = CryptoJS.enc.Base64.parse(env.ct);

  const res = CryptoJS.AES.decrypt({ ciphertext: ctWA } as any, key, {
    iv: ivWA,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });
  return CryptoJS.enc.Utf8.stringify(res);
}

// ------------------- Index helpers -------------------
async function readIndex(): Promise<VaultIndex> {
  const raw = await AsyncStorage.getItem(INDEX_KEY);
  if (!raw) return { version: 1, items: [] };
  try {
    const ix = JSON.parse(raw) as VaultIndex;
    if (!ix.version) return { version: 1, items: [] };
    return { version: 1, items: ix.items || [] };
  } catch {
    return { version: 1, items: [] };
  }
}

async function writeIndex(ix: VaultIndex) {
  await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(ix));
}

const itemKey = (id: string) => `${ITEM_KEY_PREFIX}${id}`;

// ------------------- Picker helpers -------------------
async function readUriAsBase64(uri: string): Promise<string> {
  // data: URLs (already base64) — strip the header
  if (typeof uri === "string" && uri.startsWith("data:")) {
    const comma = uri.indexOf(",");
    return comma >= 0 ? uri.substring(comma + 1) : "";
  }

  // Web: DocumentPicker often returns blob: URLs — fetch and convert to base64
  if (Platform.OS === "web") {
    const res = await fetch(uri as any);
    if (!res.ok) throw new Error("Failed to read file (fetch)");
    const blob = await res.blob();
    const b64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Failed to read blob"));
      reader.onload = () => {
        const s = reader.result as string; // "data:<mime>;base64,<payload>"
        const comma = s.indexOf(",");
        resolve(comma >= 0 ? s.substring(comma + 1) : "");
      };
      reader.readAsDataURL(blob);
    });
    return b64;
  }

  // Native (Expo): read from file system as base64
  return await FileSystem.readAsStringAsync(uri as any, { encoding: "base64" });
}



function guessName(uri: string, fallback = "document"): string {
  try {
    const last = uri.split("/").pop();
    return last || fallback;
  } catch {
    return fallback;
  }
}
function guessMimeFromName(name: string): string | undefined {
  const lower = name.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".txt")) return "text/plain";
  if (lower.endsWith(".json")) return "application/json";
  if (lower.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (lower.endsWith(".doc")) return "application/msword";
  if (lower.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (lower.endsWith(".xls")) return "application/vnd.ms-excel";
  return undefined;
}

// Web-only: turn a File into base64 (payload only, no data: prefix)
async function fileToBase64Web(file: File): Promise<string> {
  const b64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.onload = () => {
      const s = reader.result as string; // "data:<mime>;base64,<payload>"
      const comma = s.indexOf(",");
      resolve(comma >= 0 ? s.substring(comma + 1) : "");
    };
    reader.readAsDataURL(file);
  });
  return b64;
}

// ------------------- Public API -------------------
export async function importFromPicker(): Promise<VaultItemMeta | null> {
  const pick = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    multiple: false,
    type: "*/*",
  });

  // Cancelled
  if (!pick) return null;
  if ((pick as any).canceled === true) return null;

  // New/modern shape: { assets: [{ uri?, mimeType?, name?, size?, file? }] }
  if ((pick as any).assets?.[0]) {
    const a = (pick as any).assets[0] as {
      uri?: string;
      mimeType?: string;
      name?: string;
      size?: number;
      file?: any; // File on web
    };

    const keyB64 = await ensureMasterKey();
    const id = makeUUID();
    const createdAtISO = nowISO();
    const name = a.name ?? (a.uri ? guessName(a.uri) : "document");
    const mimeGuess = guessMimeFromName ? (guessMimeFromName as any)(name) : undefined;
    const mime = a.mimeType ?? mimeGuess ?? "application/octet-stream";
    const size = a.size ?? 0;

    // ----- Get base64 content (handles web File, blob:, data:, file://) -----
    let contentBase64: string = "";
    if (Platform.OS === "web" && (a as any).file instanceof File) {
      contentBase64 = await fileToBase64Web((a as any).file as File);
    } else if (a.uri) {
      contentBase64 = await readUriAsBase64(a.uri);
    } else {
      throw new Error("No file selected");
    }

    const payload: { meta: VaultItemMeta; contentBase64: string } = {
      meta: { id, name, mime, size, createdAtISO },
      contentBase64,
    };
    const encrypted = encryptWithKey(keyB64, JSON.stringify(payload));

    await AsyncStorage.setItem(`${ITEM_KEY_PREFIX}${id}`, encrypted);

    const ix = await readIndex();
    const next: VaultIndex = {
      version: 1,
      items: [{ id, name, mime, size, createdAtISO }, ...ix.items].sort(
        (a, b) => (a.createdAtISO < b.createdAtISO ? 1 : -1)
      ),
    };
    await writeIndex(next);
    return next.items.find((x) => x.id === id)!;
  }

  // Legacy web shape: { type: "success", uri, name?, mimeType? }
  if ((pick as any)?.type === "success" && (pick as any)?.uri) {
    const a: any = pick;
    const keyB64 = await ensureMasterKey();
    const id = makeUUID();
    const createdAtISO = nowISO();
    const name = a.name ?? guessName(a.uri);
    const mimeGuess = guessMimeFromName ? (guessMimeFromName as any)(name) : undefined;
    const mime = a.mimeType ?? mimeGuess ?? "application/octet-stream";

    const contentBase64 = await readUriAsBase64(a.uri);
    const size = Math.floor((contentBase64.length * 3) / 4);

    const payload = {
      meta: { id, name, mime, size, createdAtISO },
      contentBase64,
    };
    const encrypted = encryptWithKey(keyB64, JSON.stringify(payload));

    await AsyncStorage.setItem(`${ITEM_KEY_PREFIX}${id}`, encrypted);
    const ix = await readIndex();
    const next: VaultIndex = {
      version: 1,
      items: [{ id, name, mime, size, createdAtISO }, ...ix.items].sort(
        (a, b) => (a.createdAtISO < b.createdAtISO ? 1 : -1)
      ),
    };
    await writeIndex(next);
    return next.items.find((x) => x.id === id)!;
  }

  return null;
}
// --- Web-only import path (drop-in) ---
export async function importFromWebFile(file: File): Promise<VaultItemMeta> {
  // 1) Ensure master key
  const masterKeyB64 = await ensureMasterKey();

  // 2) Read file → base64 (web)
  const arrayBuffer = await file.arrayBuffer();
  const contentBase64 = toBase64(arrayBuffer);

  // 3) Compose meta
  const id = makeUUID(); // keep your existing id helper; else use uuid()
  const meta: VaultItemMeta = {
    id,
    name: file.name || "file",
    mime: file.type || "application/octet-stream",
    size: file.size || contentBase64.length * 0.75, // rough fallback
    createdAtISO: new Date().toISOString(),
  };

  // 4) Encrypt { meta, contentBase64 } with AES-CBC (PKCS7), IV from our RNG
  const payload = JSON.stringify({ meta, contentBase64 });
  const { envelope } = encryptWithMasterKey(masterKeyB64, payload);

  // 5) Persist item + index (write-through)
  await AsyncStorage.setItem(`@ms.vault.item.${id}`, JSON.stringify(envelope));
  await upsertVaultIndex(meta);

  return meta;
}

// --- helpers used above (use your existing ones if names match) ---

function toBase64(ab: ArrayBuffer): string {
  const bytes = new Uint8Array(ab);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  // btoa is available on web
  return btoa(binary);
}

async function upsertVaultIndex(meta: VaultItemMeta) {
  const raw = await AsyncStorage.getItem("@ms.vault.index");
  const idx: VaultIndex = raw ? JSON.parse(raw) : { version: 1, items: [] };
  idx.items.unshift(meta); // newest first
  await AsyncStorage.setItem("@ms.vault.index", JSON.stringify(idx));
}

// Uses master key (32-byte Base64) + fresh IV (16 bytes) from secure RNG
function encryptWithMasterKey(masterKeyB64: string, plaintext: string) {
  const keyWA = CryptoJS.enc.Base64.parse(masterKeyB64);
  const ivBytes = getSecureRandomBytes(16);
  const ivWA = CryptoJS.lib.WordArray.create(ivBytes as any);

  const saltBytes = getSecureRandomBytes(16); // future-proof (KDF ready)
  const saltB64 = base64FromBytes(saltBytes);

  const ct = CryptoJS.AES.encrypt(plaintext, keyWA, {
    iv: ivWA,
    padding: CryptoJS.pad.Pkcs7,
    mode: CryptoJS.mode.CBC,
  }).ciphertext.toString(CryptoJS.enc.Base64);

  return {
    envelope: {
      v: 1,
      iv: base64FromBytes(ivBytes),
      salt: saltB64,
      ct,
    },
  };
}

function base64FromBytes(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}




export async function listItems(): Promise<VaultItemMeta[]> {
  const ix = await readIndex();
  return [...ix.items].sort((a, b) => (a.createdAtISO < b.createdAtISO ? 1 : -1));
}

export async function getItemBase64(
  id: string
): Promise<{ meta: VaultItemMeta; contentBase64: string }> {
  const enc = await AsyncStorage.getItem(itemKey(id));
  if (!enc) throw new Error("Item not found");
  const keyB64 = await ensureMasterKey();
  const json = decryptWithKey(keyB64, enc);
  const parsed = JSON.parse(json) as VaultDecryptedItem;
  return parsed;
}

export async function deleteOne(id: string): Promise<void> {
  const ix = await readIndex();
  const next: VaultIndex = { version: 1, items: ix.items.filter((x) => x.id !== id) };
  await AsyncStorage.multiRemove([itemKey(id)]);
  await writeIndex(next);
}

export async function materializeForOpen(
  id: string
): Promise<
  | { kind: "web"; url: string; name: string; mime: string; revoke: () => void }
  | { kind: "native"; uri: string; name: string; mime: string }
> {
  const { meta, contentBase64 } = await getItemBase64(id);
  if (Platform.OS === "web") {
    // Build Blob URL
    const byteChars = atob(contentBase64);
    const byteNumbers = new Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
    const u8 = new Uint8Array(byteNumbers);
    const blob = new Blob([u8], { type: meta.mime || "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    return { kind: "web", url, name: meta.name, mime: meta.mime, revoke: () => URL.revokeObjectURL(url) };
  } else {
  // Write to cache with the real filename so Android/iOS detect the correct mime
  const dir = getWritableDir();

  // --- helper to sanitize & ensure extension ---
  const safeName = (name: string, mime: string) => {
    // strip path bits + illegal chars
    const base = (name || "file").split("/").pop()!.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");
    const hasExt = /\.[A-Za-z0-9]{2,6}$/.test(base);
    if (hasExt) return base;

    // add a best-guess extension from mime if missing
    const ext =
      mime?.startsWith("image/png") ? ".png" :
      mime?.startsWith("image/jpeg") ? ".jpg" :
      mime?.startsWith("application/pdf") ? ".pdf" :
      mime?.startsWith("text/plain") ? ".txt" :
      mime?.startsWith("application/json") ? ".json" :
      ""; // fallback: no ext
    return base + ext;
  };

  const fname = safeName(meta.name, meta.mime);
  const target = `${dir}${fname}`;

  await FileSystem.writeAsStringAsync(target, contentBase64, { encoding: "base64" });

  return { kind: "native", uri: target, name: meta.name, mime: meta.mime };
}

}

export async function exportAllToJson(): Promise<{
  kind: "web" | "native";
  uriOrUrl: string;
  filename: string;
}> {
  const ix = await readIndex();
  const keyB64 = await ensureMasterKey();
  const items: VaultDecryptedItem[] = [];
  for (const it of ix.items) {
    const enc = await AsyncStorage.getItem(itemKey(it.id));
    if (!enc) continue;
    const dec = JSON.parse(decryptWithKey(keyB64, enc)) as VaultDecryptedItem;
    items.push(dec);
  }
  const bundle = JSON.stringify({ version: 1, items }, null, 2);

  if (Platform.OS === "web") {
    const blob = new Blob([bundle], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    return { kind: "web", uriOrUrl: url, filename: EXPORT_FILENAME };
  } else {
    const dir = getWritableDir();

if (!dir) throw new Error("No writable directory available");
const target = `${dir}${EXPORT_FILENAME}`;
await FileSystem.writeAsStringAsync(target, bundle, {
  encoding: "utf8",
});
return { kind: "native", uriOrUrl: target, filename: EXPORT_FILENAME };
  }
}

export async function deleteAll(): Promise<void> {
  // wipe items
  const ix = await readIndex();
  const keys = ix.items.map((x) => itemKey(x.id));
  if (keys.length) await AsyncStorage.multiRemove(keys);
  // wipe index
  await AsyncStorage.removeItem(INDEX_KEY);
  // wipe master key (current + legacy)
  await deleteSecureKey(SECURE_KEY_ID);
  for (const k of LEGACY_KEY_IDS) await deleteSecureKey(k);
}

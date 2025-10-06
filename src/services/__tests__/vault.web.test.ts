/**
 * Vault — web import/list happy path (Jest)
 * - Mocks RN/Expo deps
 * - Uses DocumentPicker modern shape with a data: URL (no FileReader needed)
 */

jest.mock("react-native", () => ({ Platform: { OS: "web" } }));

// In-memory AsyncStorage mock
const mem: Record<string, string> = {};
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: async (k: string) => (k in mem ? mem[k] : null),
    setItem: async (k: string, v: string) => {
      mem[k] = v;
    },
    removeItem: async (k: string) => {
      delete mem[k];
    },
    multiRemove: async (keys: string[]) => {
      for (const k of keys) delete mem[k];
    },
  },
}));

// SecureStore mock
jest.mock("expo-secure-store", () => {
  let key: string | null = null; // stays inside the factory scope (allowed)
  return {
    __esModule: true,
    getItemAsync: jest.fn(async () => key),
    setItemAsync: jest.fn(async (_id: string, v: string) => {
      key = v;
    }),
    deleteItemAsync: jest.fn(async () => {
      key = null;
    }),
    WHEN_UNLOCKED: "WHEN_UNLOCKED",
  };
});


// FileSystem mock (not used in these tests, but kept to avoid accidental calls)
jest.mock("expo-file-system/legacy", () => ({
  __esModule: true,
  readAsStringAsync: async () => {
    throw new Error("FileSystem.readAsStringAsync should not be called in this test");
  },
}));

// DocumentPicker mock — modern shape with assets[0]
jest.mock("expo-document-picker", () => ({
  __esModule: true,
  getDocumentAsync: async () => ({
    canceled: false,
    assets: [
      {
        uri: "data:image/png;base64,QUJD", // "ABC"
        name: "test.png",
        mimeType: "image/png",
        size: 3,
      },
    ],
  }),
}));

// btoa/atob for Node
(global as any).btoa =
  (global as any).btoa ||
  ((str: string) => Buffer.from(str, "binary").toString("base64"));
(global as any).atob =
  (global as any).atob ||
  ((b64: string) => Buffer.from(b64, "base64").toString("binary"));

import { ensureMasterKey, importFromPicker, listItems } from "../vault";
import * as SecureStore from "expo-secure-store";

beforeEach(async () => {
  for (const k of Object.keys(mem)) delete mem[k];
  await (SecureStore as any).deleteItemAsync();
});


describe("Vault (web) — import & list", () => {
  it("generates a 32-byte base64 master key", async () => {
    const k = await ensureMasterKey();
    // 32 bytes -> base64 length 44 (with padding)
    expect(typeof k).toBe("string");
    expect(k.length).toBeGreaterThanOrEqual(44);
  });

  it("imports one PNG via DocumentPicker and lists it", async () => {
    // import
    const meta = await importFromPicker();
    expect(meta).toBeTruthy();
    expect(meta?.name).toBe("test.png");

    // list
    const items = await listItems();
    expect(items.length).toBe(1);
    expect(items[0].name).toBe("test.png");
    expect(items[0].mime).toBe("image/png");
    expect(items[0].size).toBe(3); // comes from DocumentPicker mock
    // ISO timestamp sanity
    expect(new Date(items[0].createdAtISO).toString()).not.toBe("Invalid Date");
  });
});

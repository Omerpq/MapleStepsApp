// src/screens/VaultScreen.tsx
import React, { useCallback, useEffect, useRef, useState } from "react";


import {
  Alert,
  FlatList,
  Platform,
  Pressable,
  Text,
  View,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Sharing from "expo-sharing";
import {
  importFromPicker,
  exportAllToJson,
  deleteAll,
  listItems,
  materializeForOpen,
  deleteOne,
  type VaultListItem,
} from "../services/vault";

import * as IntentLauncher from "expo-intent-launcher";
import * as FileSystem from "expo-file-system/legacy";


import { importFromWebFile } from "../services/vault";


// ---- local tiny UI helpers (self-contained) ----
function Section(props: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ paddingTop: 0, paddingBottom: 8 }}>
      <Text style={{ fontSize: 22, fontWeight: "800", marginBottom: 8 }}>
        {props.title}
      </Text>
      {props.children}
    </View>
  );
}


function Pill(props: { text: string }) {
  return (
    <View
      style={{
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
        backgroundColor: "#F3F4F6",
        borderWidth: 1,
        borderColor: "#E5E7EB",
      }}
    >
      <Text style={{ fontWeight: "700", color: "#374151" }}>{props.text}</Text>
    </View>
  );
}

export default function VaultScreen() {
  const [busy, setBusy] = useState(false);
  const [list, setList] = useState<VaultListItem[]>([]);
  const [filesOpen, setFilesOpen] = useState<boolean>(false);


    // --- Web-only import path (hidden <input type="file">) ---
  const webFileInputRef = useRef<HTMLInputElement | null>(null);

  const onWebFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true);
    try {
      // uses service: importFromWebFile(File)
      await importFromWebFile(f);
const next = await listItems();
setList(next);
    } catch (err: any) {
      Alert.alert("Import failed", err?.message ?? "Unexpected error");
    } finally {
      e.target.value = ""; // allow re-selecting same file
      setBusy(false);
    }
  };

  const refresh = useCallback(async () => {
  const metas = await listItems();
  setList(metas);
  setFilesOpen(metas.length > 0); // collapsed by default when empty; auto-open when there are items
}, []);


  useEffect(() => {
    refresh();
  }, [refresh]);

    const onImport = async () => {
  if (busy) return;
  setBusy(true);
  try {
    const meta = await importFromPicker(); // ← works on web & native
    if (!meta) {
      Alert.alert("No file imported", "Picker was canceled or returned no asset.");
      return;
    }
    const next = await listItems();
    setList(next);
    Alert.alert("Imported", `${meta.name} added to Vault.\nItems now: ${next.length}`);
  } catch (e: any) {
    Alert.alert("Import failed", e?.message ?? "Unexpected error");
  } finally {
    setBusy(false);
  }
};



  const onExport = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await new Promise((r) => setTimeout(r, 0)); // let spinner render
      const res = await exportAllToJson();
      if (res.kind === "web") {
  // Force a real download with a filename (fixes “files not attached”)
  const a = document.createElement("a");
  a.href = res.uriOrUrl;
  a.download = res.filename || "MapleSteps-Vault-Export.json";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  // Revoke later; revoking immediately can cancel the download in some browsers
  setTimeout(() => URL.revokeObjectURL(res.uriOrUrl), 60_000);

  Alert.alert("Export ready", "Your Vault JSON was downloaded.");
  return;
}

    } catch (e: any) {
      Alert.alert("Export failed", e?.message ?? "Unexpected error");
    } finally {
      setBusy(false);
    }
  };

  const onDeleteAll = async () => {
  if (busy) return;
  const proceed = await new Promise<boolean>((resolve) => {
    if (Platform.OS === "web") {
      resolve(window.confirm("Delete all files and the vault key? This cannot be undone."));
    } else {
      Alert.alert(
        "Delete everything",
        "This will delete all files and the Vault key. This cannot be undone.",
        [
          { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
          { text: "Delete all", style: "destructive", onPress: () => resolve(true) },
        ],
        { cancelable: true }
      );
    }
  });
  if (!proceed) return;

  setBusy(true);
  try {
    await deleteAll();
    await refresh();
    Alert.alert("Deleted", "Your Vault is now empty.");
  } catch (e: any) {
    Alert.alert("Delete failed", e?.message ?? "Unexpected error");
  } finally {
    setBusy(false);
  }
};


  const onOpenItem = async (item: VaultListItem) => {
  if (busy) return;
  setBusy(true);
  try {
    await new Promise((r) => setTimeout(r, 0)); // let spinner paint
    const mat = await materializeForOpen(item.id);

    if (mat.kind === "web") {
      // Force a real download with the original filename instead of opening a blank tab
      const a = document.createElement("a");
      a.href = mat.url;
      a.download = item.name || "file";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => mat.revoke(), 60_000);
      return;
    }

    // Native
    if (Platform.OS === "android") {
      try {
        // Convert file:// to a content:// URI so external apps (Photos/Docs) can read it
        const cUri = await FileSystem.getContentUriAsync(mat.uri);
        await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
          data: cUri,
          type: mat.mime || "application/octet-stream",
          flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
        });
        return;
      } catch {
        // Fallback to share sheet if no viewer handles the mime type
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(mat.uri, {
            mimeType: mat.mime,
            dialogTitle: item.name,
          });
          return;
        }
        Alert.alert("Saved to device", mat.uri);
        return;
      }
    }

    // iOS or other native platforms — use share sheet
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(mat.uri, {
        mimeType: mat.mime,
        dialogTitle: item.name,
      });
    } else {
      Alert.alert("Saved to device", mat.uri);
    }
  } catch (e: any) {
    Alert.alert("Open failed", e?.message ?? "Unexpected error");
  } finally {
    setBusy(false);
  }
};



  const onDeleteItem = async (item: VaultListItem) => {
  if (busy) return;
  const proceed = await new Promise<boolean>((resolve) => {
    if (Platform.OS === "web") {
      resolve(window.confirm(`Delete "${item.name}"?`));
    } else {
      Alert.alert(
        "Delete file",
        `Delete "${item.name}" from your Vault?`,
        [
          { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
          { text: "Delete", style: "destructive", onPress: () => resolve(true) },
        ],
        { cancelable: true }
      );
    }
  });
  if (!proceed) return;

  setBusy(true);
  try {
    await deleteOne(item.id);
    await refresh();
  } catch (e: any) {
    Alert.alert("Delete failed", e?.message ?? "Unexpected error");
  } finally {
    setBusy(false);
  }
};
// Save a user-visible copy (explicit, decrypted)
const onSaveCopy = async (item: VaultListItem) => {
  if (busy) return;
  setBusy(true);
  try {
    await new Promise((r) => setTimeout(r, 0)); // let spinner render
    const mat = await materializeForOpen(item.id);

    if (Platform.OS === "web" && mat.kind === "web") {
      // Web: force a download with the original filename
      const a = document.createElement("a");
      a.href = mat.url;
      a.download = item.name || "file";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => mat.revoke(), 60_000);
      return;
    }

    // Native: open system share sheet so user can save to Files/Drive/Photos
    // Native
if (mat.kind === "native") {
  // ANDROID: Save directly to a user-selected folder via Storage Access Framework
  if (Platform.OS === "android" && (FileSystem as any).StorageAccessFramework) {
    const saf = (FileSystem as any).StorageAccessFramework;
    try {
      const perm = await saf.requestDirectoryPermissionsAsync();
      if (!perm.granted) {
        // User cancelled folder picker — fall back to share
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(mat.uri, { mimeType: mat.mime, dialogTitle: `Save a copy — ${item.name}` });
        } else {
          Alert.alert("Cancelled", "No folder selected.");
        }
        return;
      }

      // ensure a safe filename with extension
      const safeName = (name: string, mime: string) => {
        const base = (name || "file").split("/").pop()!.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");
        const hasExt = /\.[A-Za-z0-9]{2,6}$/.test(base);
        if (hasExt) return base;
        const ext =
          mime?.startsWith("image/png") ? ".png" :
          mime?.startsWith("image/jpeg") ? ".jpg" :
          mime?.startsWith("application/pdf") ? ".pdf" :
          mime?.startsWith("text/plain") ? ".txt" :
          mime?.startsWith("application/json") ? ".json" : "";
        return base + ext;
      };

      const fname = safeName(item.name, mat.mime);
      const destUri = await saf.createFileAsync(perm.directoryUri, fname, mat.mime || "application/octet-stream");

      // read cached file (base64) -> write to SAF uri (base64)
      const b64 = await FileSystem.readAsStringAsync(mat.uri, { encoding: FileSystem.EncodingType.Base64 });
      await FileSystem.writeAsStringAsync(destUri, b64, { encoding: FileSystem.EncodingType.Base64 });

      Alert.alert("Saved", `Saved a copy as "${fname}".`);
      return;
    } catch (e: any) {
      // if SAF fails, fall back to share
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(mat.uri, { mimeType: mat.mime, dialogTitle: `Save a copy — ${item.name}` });
      } else {
        Alert.alert("Save failed", e?.message ?? "Unexpected error");
      }
      return;
    }
  }

  // iOS (and other native): use share sheet to let user pick a permanent location
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(mat.uri, { mimeType: mat.mime, dialogTitle: `Save a copy — ${item.name}` });
  } else {
    Alert.alert("Saved to device (cache path)", mat.uri);
  }
  return;
}


    Alert.alert("Could not save", "Unsupported platform/materialization.");
  } catch (e: any) {
    Alert.alert("Save failed", e?.message ?? "Unexpected error");
  } finally {
    setBusy(false);
  }
};


  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#FFFFFF" }} edges={["left", "right"]}>

      {Platform.OS === "web" && (
        <input
          ref={webFileInputRef}
          type="file"
          style={{ display: "none" }}
          onChange={onWebFileChange}
        />
      )}

<FlatList
  data={filesOpen ? list : []}
  keyExtractor={(it) => it.id}
  style={{ flex: 1 }}
  contentContainerStyle={{ padding: 16, paddingBottom: 12 }}
  ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: "#E5E7EB" }} />}
  ListHeaderComponent={
    <View style={{ marginBottom: 0 }}>
      <Section title="Your Vault">
        <Text style={{ color: "#374151", marginBottom: 10 }}>
          Store your PR documents securely on this device. Files are encrypted at rest.
        </Text>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <Pill text={`${list.length} item${list.length === 1 ? "" : "s"}`} />
        </View>
        <Text style={{ color: "#6B7280", marginTop: 8, fontSize: 12 }}>
          Export bundles all files as JSON. Delete wipes files and the master key.
        </Text>
      </Section>

    <View style={{ paddingTop: 0, paddingBottom: 8 }}>
  <Pressable
    onPress={() => setFilesOpen((v) => !v)}
    style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
  >
    <Text style={{ fontSize: 22, fontWeight: "800" }}>Your files</Text>
    <Text style={{ fontSize: 18, fontWeight: "800" }}>{filesOpen ? "▾" : "▸"}</Text>
  </Pressable>

  {/* Show hint only when open and empty */}
  {filesOpen && list.length === 0 && (
    <Text style={{ color: "#6B7280", marginTop: 4 }}>No files yet. Tap “Import file”.</Text>
  )}
</View>

    </View>
  }
  renderItem={({ item, index }) => (
  <View
  style={{
    marginTop: index === 0 && filesOpen ? -4 : 0,
    paddingTop: index === 0 ? 0 : 10,
    paddingBottom: 10,
  }}
>

      <Text style={{ fontWeight: "700", lineHeight: 18 }} numberOfLines={2}>
     {item.name}
    </Text>

       <Text style={{ color: "#6B7280", fontSize: 12 }}>
  {Math.round((item.size ?? 0) / 1024)} KB • added {item.createdAtISO?.slice(0, 10)}
</Text>


      <View style={{ height: 8 }} />

      <View style={{ flexDirection: "row", gap: 8 }}>
  {/* Open / Share */}
  <Pressable
    onPress={() => onOpenItem(item)}
    disabled={busy}
    style={({ pressed }) => [
      {
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "#111827",
        backgroundColor: "#FFFFFF",
        opacity: busy ? 0.6 : 1,
      },
      pressed && !busy && { opacity: 0.85 },
    ]}
  >
    <Text style={{ fontWeight: "800" }}>
      {Platform.OS === "web" ? "Open / Download" : "Open / Share"}
    </Text>
  </Pressable>

  {/* Save a copy (explicit, warns first) */}
  <Pressable
    onPress={async () => {
      if (busy) return;
      const proceed = await new Promise<boolean>((resolve) => {
        if (Platform.OS === "web") {
          resolve(window.confirm("This creates an unencrypted copy outside your Vault. Continue?"));
        } else {
          Alert.alert(
            "Save a copy?",
            "This creates an unencrypted file outside your Vault.",
            [
              { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
              { text: "Save copy", onPress: () => resolve(true) },
            ],
            { cancelable: true }
          );
        }
      });
      if (!proceed) return;
      await onSaveCopy(item);
    }}
    disabled={busy}
    style={({ pressed }) => [
      {
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "#111827",
        backgroundColor: "#FFFFFF",
        opacity: busy ? 0.6 : 1,
      },
      pressed && !busy && { opacity: 0.85 },
    ]}
  >
    <Text style={{ fontWeight: "800" }}>
      {Platform.OS === "web" ? "Download copy" : "Save a copy"}
    </Text>
  </Pressable>

  {/* Delete */}
  <Pressable
    onPress={() => onDeleteItem(item)}
    disabled={busy}
    style={{
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 12,
      backgroundColor: "#B91C1C",
      borderWidth: 1,
      borderColor: "#991B1B",
      opacity: busy ? 0.6 : 1,
    }}
  >
    <Text style={{ fontWeight: "800", color: "#FFFFFF" }}>Delete</Text>
  </Pressable>
</View>

    </View>
  )}
  ListFooterComponent={
    <View style={{ marginTop: 8 }}>
      <Section title="Actions">
        {/* Import */}
        <Pressable
          onPress={onImport}
          disabled={busy}
          style={({ pressed }) => [
            {
              marginBottom: 10,
              paddingVertical: 14,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: "#111827",
              backgroundColor: "#FFFFFF",
              alignItems: "center",
              opacity: busy ? 0.6 : 1,
            },
            pressed && !busy && { opacity: 0.85 },
          ]}
        >
          <Text style={{ fontWeight: "800" }}>Import file</Text>
        </Pressable>

        {/* Export */}
        <Pressable
          onPress={onExport}
          disabled={busy}
          style={({ pressed }) => [
            {
              marginBottom: 10,
              paddingVertical: 14,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: "#111827",
              backgroundColor: "#FFFFFF",
              alignItems: "center",
              opacity: busy ? 0.6 : 1,
            },
            pressed && !busy && { opacity: 0.85 },
          ]}
        >
          <Text style={{ fontWeight: "800" }}>Export all (JSON)</Text>
        </Pressable>

        {/* Delete all */}
        <Pressable
          onPress={onDeleteAll}
          disabled={busy}
          style={{
            marginBottom: 10,
            paddingVertical: 14,
            borderRadius: 14,
            backgroundColor: "#B91C1C",
            borderWidth: 1,
            borderColor: "#991B1B",
            alignItems: "center",
            opacity: busy ? 0.6 : 1,
          }}
        >
          <Text style={{ fontWeight: "800", color: "#FFFFFF" }}>Delete my data</Text>
        </Pressable>
      </Section>
    </View>
  }
/>
      {busy && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.1)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ActivityIndicator size="large" />
        </View>
      )}
    </SafeAreaView>
  );
}
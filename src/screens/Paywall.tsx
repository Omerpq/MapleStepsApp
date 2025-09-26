// src/screens/Paywall.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, ActivityIndicator, Pressable, Alert, StyleSheet } from 'react-native';
import { getSubscriptionProducts, purchaseSubscription, restore, getPersistedState, __devSetSubscribed, type Product } from '../services/payments';



type Row = any; // tolerate RN-IAP v13/v14 shape differences

export default function Paywall() {
  const [loading, setLoading] = useState(true);
  const [subs, setSubs] = useState<Product[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<{ isActive: boolean; updatedAt: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const s = getSubscriptionProducts();
      setSubs(s ?? []);
      const st = await getPersistedState();
      setStatus({ isActive: st.isActive, updatedAt: st.updatedAt });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onBuy = useCallback(async (sku: string) => {
    setBusy(sku);
    try {
      await purchaseSubscription(sku);
      const st = await getPersistedState();
      setStatus({ isActive: st.isActive, updatedAt: st.updatedAt });
      if (st.isActive) Alert.alert('Success', 'Premium unlocked.');
    } catch (e: any) {
      const msg = e?.message ?? 'Purchase failed.';
      Alert.alert('Purchase', msg);
    } finally {
      setBusy(null);
    }
  }, []);

  const onRestore = useCallback(async () => {
    setBusy('restore');
    try {
      const st = await restore();
      setStatus({ isActive: st.isActive, updatedAt: st.updatedAt });
      Alert.alert('Restore', st.isActive ? 'Restored your subscription.' : 'No active subscription found.');
    } catch (e: any) {
      Alert.alert('Restore', e?.message ?? 'Restore failed.');
    } finally {
      setBusy(null);
    }
  }, []);

  const header = useMemo(() => (
    <View style={styles.header}>
      <Text style={styles.h1}>Go Premium</Text>
      <Text style={styles.sub}>Unlock guided journey, notifications, and advanced optimizations.</Text>
      {status && (
        <Text style={styles.status}>
          Status: {status.isActive ? 'Active ✅' : 'Not active'} • updated {new Date(status.updatedAt).toLocaleString()}
        </Text>
      )}
    </View>
  ), [status]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={{ marginTop: 12 }}>Loading paywall…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {header}

      <FlatList<Row>
  data={subs}
  keyExtractor={(item, index) => {
    const pid = String((item as any).productId ?? (item as any).sku ?? index);
    return pid;
  }}
  renderItem={({ item }) => {
  const pid = String((item as any).productId ?? (item as any).sku ?? '');
  const price =
    (item as any).localizedPrice ??
    (item as any).priceString ??
    (item as any).price ??
    '';
  const title = (item as any).title ?? pid;
  const desc =
    (item as any).description ??
    'Premium subscription';

  const isBusy = busy === pid;

  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.desc}>{desc}</Text>
      </View>
      <Pressable
        disabled={!!isBusy || !pid}
        onPress={() => onBuy(pid)}
        style={[styles.cta, (isBusy || !pid) && { opacity: 0.5 }]}
      >
        <Text style={styles.ctaText}>{isBusy ? '…' : (price ? `Get ${price}` : 'Subscribe')}</Text>
      </Pressable>
    </View>
  );
}}

        ListEmptyComponent={<Text style={{ textAlign: 'center', color: '#666' }}>No subscription products configured.</Text>}
        contentContainerStyle={{ paddingBottom: 32 }}
      />

      <Pressable onPress={onRestore} disabled={busy === 'restore'} style={[styles.restore, busy === 'restore' && { opacity: 0.5 }]}>
        <Text style={styles.restoreText}>{busy === 'restore' ? 'Restoring…' : 'Restore purchases'}</Text>
      </Pressable>

      {/* DEV-only helpers: comment out for production */}
      <View style={{ marginTop: 12, flexDirection: 'row', gap: 8, justifyContent: 'center' }}>
  <Pressable
    onPress={async () => {
      await __devSetSubscribed(true);
      load();
      Alert.alert('DEV', 'Premium set to ACTIVE locally.');
    }}
    style={[styles.smallBtn]}
  >
    <Text>DEV: Set Active</Text>
  </Pressable>

  <Pressable
    onPress={async () => {
      await __devSetSubscribed(false);
      load();
      Alert.alert('DEV', 'Premium set to INACTIVE locally.');
    }}
    style={[styles.smallBtn]}
  >
    <Text>DEV: Set Inactive</Text>
  </Pressable>
</View>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { marginBottom: 12 },
  h1: { fontSize: 24, fontWeight: '700' },
  sub: { marginTop: 4, color: '#444' },
  status: { marginTop: 8, color: '#666' },
  row: { paddingVertical: 14, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#ddd', gap: 12 },
  title: { fontSize: 16, fontWeight: '600' },
  desc: { color: '#555', marginTop: 2 },
  cta: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: '#111' },
  ctaText: { color: 'white', fontWeight: '700' },
  restore: { marginTop: 16, alignSelf: 'center', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#111' },
  restoreText: { fontWeight: '600' },
  smallBtn: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 6, borderWidth: 1, borderColor: '#ccc' },
});

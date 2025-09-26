// src/screens/ProofOfFunds.tsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput, Modal, useWindowDimensions
} from 'react-native';

import {
  loadPof, loadPofState, savePofState, summarize, getRequiredAmount,
  fundTypeOptions, type FundTypeId, type PofGuides, type PofState, type LoaderResult, type MonthEntry
} from '../services/pof';

import { forcePofRevalidate, resetPofState } from '../services/pof';
import { sourceTitle, syncQualifier } from '../utils/freshness';

function fmtMoney(n: number | undefined) {
  const v = Math.round(Number(n || 0));
  return v.toLocaleString(undefined, { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 });
}
function parseAmount(s: string): number {
  const n = Number(String(s).replace(/[^0-9.]+/g, '').trim() || '0');
  return Number.isFinite(n) ? n : 0;
}

export default function ProofOfFunds() {
  const [guides, setGuides] = useState<LoaderResult<PofGuides> | null>(null);
  const [state, setState] = useState<PofState | null>(null);
  const [loading, setLoading] = useState(true);
  const [openFor, setOpenFor] = useState<string | null>(null); // yyyyMm of the month whose dropdown is open

  const refreshFromIRCC = async () => {
    setLoading(true);
    try {
      const g = await loadPof(true); // bypass 24h TTL
      setGuides(g);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [g, s] = await Promise.all([loadPof(false), loadPofState()]);
        if (!cancelled) { setGuides(g); setState(s); }
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  const req = useMemo(() => {
    if (!guides || !state) return 0;
    return getRequiredAmount(state.familySize, guides.data);
  }, [guides, state]);

  const sum = useMemo(() => {
    if (!guides || !state) return null;
    return summarize(state, guides.data);
  }, [guides, state]);

  const addEntry = (yyyyMm: string, amount_cad: number, typeId: FundTypeId) => {
    if (!state) return;
    if (!amount_cad || !typeId) return;
    savePofState(prev => ({
      ...prev,
      months: prev.months.map(m =>
        m.yyyyMm === yyyyMm ? { ...m, entries: [...m.entries, { amount_cad, typeId }] } : m
      )
    })).then(setState).catch(() => {});
  };

  const removeEntry = (yyyyMm: string, index: number) => {
    if (!state) return;
    savePofState(prev => ({
      ...prev,
      months: prev.months.map(m =>
        m.yyyyMm === yyyyMm ? { ...m, entries: m.entries.filter((_, i) => i !== index) } : m
      )
    })).then(setState).catch(() => {});
  };

  const setFamily = (n: number) => {
    if (!state) return;
    const size = Math.max(1, Math.min(15, Math.trunc(n || 1)));
    savePofState(prev => ({ ...prev, familySize: size }))
      .then(setState)
      .catch(() => {});
  };

  if (loading || !guides || !state) {
    return (
      <View style={{ flex: 1, padding: 16, gap: 12 }}>
        <Text style={{ fontSize: 18, fontWeight: '600' }}>Proof of Funds</Text>
        <Text>Loading…</Text>
      </View>
    );
  }

  const guide = guides.data as PofGuides;
  const lastSynced =
    (guides.meta?.last_modified && new Date(guides.meta.last_modified).toLocaleString())
    || (guides.cachedAt && new Date(guides.cachedAt).toLocaleString())
    || '—';

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 12 }}>
      {/* Header */}
      <View style={{ padding: 12, borderWidth: 1, borderColor: '#eee', borderRadius: 10, backgroundColor: '#fafafa' }}>
        <Text style={{ fontSize: 18, fontWeight: '700', marginBottom: 4 }}>Proof of Funds</Text>
        <Text style={{ color: '#666' }}>
          {guides.source === 'live-ircc' || guides.source === 'live-cache'
            ? `IRCC (Live) • fetched ${lastSynced}${guides.source === 'live-cache' ? ' (cached)' : ''}`
            : `${sourceTitle(guides.source)} • Last synced ${lastSynced}${syncQualifier(guides.meta) ? ' • ' + syncQualifier(guides.meta) : ''}`
          }
        </Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          <Pressable onPress={refreshFromIRCC} style={{ paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#eee', borderRadius: 8 }}>
            <Text>Refresh from IRCC</Text>
          </Pressable>
        </View>
      </View>

      {__DEV__ && (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          <Pressable
            onPress={async () => {
              await forcePofRevalidate();
              const g = await loadPof(false);
              setGuides(g);
            }}
            style={{ paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#eee', borderRadius: 8 }}
          >
            <Text>Force Remote</Text>
          </Pressable>

          <Pressable
            onPress={async () => {
              await resetPofState();
              const s = await loadPofState();
              setState(s);
            }}
            style={{ paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#eee', borderRadius: 8 }}
          >
            <Text>Reset tracker</Text>
          </Pressable>
        </View>
      )}

      {/* Family size + required */}
      <View style={{ padding: 12, borderWidth: 1, borderColor: '#eee', borderRadius: 10 }}>
        <Text style={{ fontSize: 16, fontWeight: '600' }}>Family size</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
          <Pressable onPress={() => setFamily(state.familySize - 1)} style={{ paddingVertical: 8, paddingHorizontal: 12, backgroundColor: '#efefef', borderRadius: 6 }}>
            <Text style={{ fontSize: 18 }}>−</Text>
          </Pressable>
          <Text style={{ fontSize: 18, fontWeight: '700', width: 40, textAlign: 'center' }}>{state.familySize}</Text>
          <Pressable onPress={() => setFamily(state.familySize + 1)} style={{ paddingVertical: 8, paddingHorizontal: 12, backgroundColor: '#efefef', borderRadius: 6 }}>
            <Text style={{ fontSize: 18 }}>+</Text>
          </Pressable>
          <Text style={{ marginLeft: 8, color: '#666' }}>
            Required PoF: <Text style={{ fontWeight: '700' }}>{fmtMoney(req)}</Text>
          </Text>
        </View>
      </View>

      {/* Months */}
      <View style={{ gap: 10 }}>
        {state.months.map((m, idx) => (
          <MonthCard
            key={m.yyyyMm}
            index={idx}
            month={m}
            options={fundTypeOptions(guide)}
            isOpen={openFor === m.yyyyMm}
            onOpen={() => setOpenFor(m.yyyyMm)}
            onClose={() => setOpenFor(null)}
            onAdd={(amount, type) => addEntry(m.yyyyMm, amount, type)}
            onRemove={(i) => removeEntry(m.yyyyMm, i)}
          />
        ))}
      </View>

      {/* Summary */}
      {sum && (
        <View style={{ padding: 12, borderWidth: 1, borderColor: '#eee', borderRadius: 10, gap: 4 }}>
          <Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 4 }}>Summary</Text>
          <Text>Six-month minimum eligible balance: <Text style={{ fontWeight: '700' }}>{fmtMoney(sum.sixMonthMinEligible)}</Text></Text>
          <Text>Six-month average eligible balance: <Text style={{ fontWeight: '700' }}>{fmtMoney(sum.sixMonthAvgEligible)}</Text></Text>
          <Text>Latest month eligible total: <Text style={{ fontWeight: '700' }}>{fmtMoney(sum.latestMonthEligible)}</Text></Text>
          <Text style={{ marginTop: 6 }}>
            Status: {sum.sixMonthMinEligible >= req ? '✅ Meets or exceeds required PoF' : '⚠️ Shortfall against required PoF'}
          </Text>
          {sum.warnings.map((w, i) => (
            <Text key={i} style={{ color: '#b55300' }}>• {w.message}</Text>
          ))}
          {!!guide.notes?.length && (
            <View style={{ marginTop: 6 }}>
              {guide.notes.map((n, i) => (<Text key={i} style={{ color: '#666' }}>• {n}</Text>))}
            </View>
          )}
        </View>
      )}

      {/* Eligible vs ineligible legend */}
      <View style={{ padding: 12, borderWidth: 1, borderColor: '#eee', borderRadius: 10 }}>
        <Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 6 }}>Fund type legend</Text>
        {guide.fund_types.map(t => (
          <Text key={t.id} style={{ color: t.eligible ? '#0a6b2d' : '#8a0000' }}>
            {t.eligible ? '✅' : '⛔'} {t.label}{t.notes ? ` — ${t.notes}` : ''}
          </Text>
        ))}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function MonthCard(props: {
  index: number;
  month: MonthEntry;
  options: Array<{ id: FundTypeId; label: string; eligible: boolean }>;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onAdd: (amount: number, type: FundTypeId) => void;
  onRemove: (index: number) => void;
}) {
  const { index, month, options, isOpen, onOpen, onClose, onAdd, onRemove } = props;
  const [amount, setAmount] = useState('');
  const [choice, setChoice] = useState<FundTypeId>(options[0]?.id || 'savings');
  const { width } = useWindowDimensions();
  const isNarrow = width < 380;

  const bg = index % 2 === 0 ? '#f9fbff' : '#fffaf9';

  return (
    <View style={{ padding: 12, borderWidth: 1, borderColor: '#eee', borderRadius: 10, backgroundColor: bg }}>
      <Text style={{ fontSize: 15, fontWeight: '600', marginBottom: 8 }}>{month.yyyyMm}</Text>

      {month.entries.map((e, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <Text style={{ flex: 1 }}>{e.typeId}</Text>
          <Text style={{ width: 120, textAlign: 'right', fontWeight: '600' }}>{fmtMoney(e.amount_cad)}</Text>
          <Pressable onPress={() => onRemove(i)} style={{ paddingVertical: 4, paddingHorizontal: 8, backgroundColor: '#fee', borderRadius: 6 }}>
            <Text>Delete</Text>
          </Pressable>
        </View>
      ))}

      {isNarrow ? (
        <>
          <TextInput
            value={amount}
            onChangeText={setAmount}
            placeholder="Amount (CAD)"
            keyboardType="numeric"
            style={{
              width: '100%',
              borderWidth: 1, borderColor: '#ddd', borderRadius: 8,
              paddingHorizontal: 10, paddingVertical: 8
            }}
          />

          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 8 }}>
            <View style={{ flex: 1 }}>
              <Pressable
                onPress={onOpen}
                style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: '#fff' }}
              >
                <Text numberOfLines={1}>
                  {options.find(o => o.id === choice)?.label || choice}
                </Text>
              </Pressable>
            </View>

            <Pressable
              onPress={() => {
                const amt = parseAmount(amount);
                if (!amt) return;
                onAdd(amt, choice);
                setAmount('');
              }}
              style={{ paddingVertical: 10, paddingHorizontal: 14, backgroundColor: '#eee', borderRadius: 8 }}
            >
              <Text>Add</Text>
            </Pressable>
          </View>
        </>
      ) : (
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 6 }}>
          <TextInput
            value={amount}
            onChangeText={setAmount}
            placeholder="Amount (CAD)"
            keyboardType="numeric"
            style={{
              flex: 13,
              borderWidth: 1, borderColor: '#ddd', borderRadius: 8,
              paddingHorizontal: 10, paddingVertical: 8
            }}
          />

          <View style={{ flex: 1, minWidth: 160, maxWidth: 240 }}>
            <Pressable
              onPress={onOpen}
              style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: '#fff' }}
            >
              <Text numberOfLines={1}>
                {options.find(o => o.id === choice)?.label || choice}
              </Text>
            </Pressable>
          </View>

          <Pressable
            onPress={() => {
              const amt = parseAmount(amount);
              if (!amt) return;
              onAdd(amt, choice);
              setAmount('');
            }}
            style={{ paddingVertical: 10, paddingHorizontal: 14, backgroundColor: '#eee', borderRadius: 8 }}
          >
            <Text>Add</Text>
          </Pressable>
        </View>
      )}

      {/* Modal dropdown */}
      <Modal visible={isOpen} transparent animationType="fade" onRequestClose={onClose}>
        <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.2)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ width: 340, maxWidth: '90%', maxHeight: 360, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#ddd' }}>
            <ScrollView>
              {options.map(opt => (
                <Pressable
                  key={opt.id}
                  onPress={() => { setChoice(opt.id); onClose(); }}
                  style={{ paddingHorizontal: 14, paddingVertical: 12 }}
                >
                  <Text style={{ fontWeight: choice === opt.id ? '700' : '400', color: opt.eligible ? '#0a6b2d' : '#8a0000' }}>
                    {opt.eligible ? '✅ ' : '⛔ '}{opt.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      <Text style={{ color: '#888', marginTop: 6, fontSize: 12 }}>
        Tip: pick the correct fund/account type and add separate entries per account.
      </Text>
    </View>
  );
}

import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  Linking, Platform, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import { api, COLORS } from '../src/api';
import { EnergyLayer, EnergyBox } from '../src/Energy';
import { useAuth } from '../src/auth';

export default function Billing() {
  const router = useRouter();
  const { user } = useAuth();
  const [packs, setPacks] = useState<any[]>([]);
  const [buying, setBuying] = useState<string | null>(null);
  const [credits, setCredits] = useState<number>(user?.credits ?? 0);

  useEffect(() => {
    api.packs().then(setPacks as any).catch(() => {});
    api.me().then((u: any) => setCredits(u.credits)).catch(() => {});
  }, []);

  const buy = async (packId: string) => {
    try {
      setBuying(packId);
      const origin = process.env.EXPO_PUBLIC_BACKEND_URL || '';
      const r: any = await api.checkout(packId, origin);
      if (Platform.OS === 'web') {
        Linking.openURL(r.checkout_url);
      } else {
        await WebBrowser.openBrowserAsync(r.checkout_url);
        try {
          const s: any = await api.billingStatus(r.session_id);
          if (s.status === 'completed') {
            const u: any = await api.me(); setCredits(u.credits);
            Alert.alert('Payment complete', `+${s.credits_granted} credits added.`);
          }
        } catch {}
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally { setBuying(null); }
  };

  const PACK_COLORS: Record<string, string> = {
    starter: COLORS.primary, creator: COLORS.energy, pro: COLORS.accent, studio: COLORS.energyAlt,
  };

  return (
    <View style={styles.root}>
      <EnergyLayer>
        <SafeAreaView style={{ flex: 1 }} edges={['top']}>
          <View style={styles.topBar}>
            <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} testID="back-btn">
              <Ionicons name="chevron-back" color={COLORS.text} size={24} />
            </TouchableOpacity>
            <Text style={styles.title}>CREDITS</Text>
            <View style={styles.iconBtn} />
          </View>

          <ScrollView contentContainerStyle={styles.content}>
            <EnergyBox style={styles.balanceBox} color={COLORS.accent} intensity={1}>
              <Ionicons name="flash" size={32} color={COLORS.accent} />
              <Text style={styles.balance}>{credits}</Text>
              <Text style={styles.balanceLbl}>CREDITS REMAINING</Text>
            </EnergyBox>

            <View style={styles.costRow}>
              <CostChip icon="image-outline" lbl="IMAGE" cost="1" />
              <CostChip icon="cube-outline" lbl="3D" cost="2" />
              <CostChip icon="videocam-outline" lbl="VIDEO" cost="5" />
            </View>

            <Text style={styles.dataLabel}>CHOOSE A PACK</Text>

            {packs.length === 0 ? <ActivityIndicator color={COLORS.energy} /> : (
              packs.map((p) => {
                const color = PACK_COLORS[p.id] || COLORS.primary;
                const perCredit = (p.amount / p.credits).toFixed(3);
                return (
                  <TouchableOpacity key={p.id} onPress={() => buy(p.id)} disabled={!!buying}
                    testID={`pack-${p.id}`} activeOpacity={0.85}>
                    <EnergyBox style={styles.pack} color={color} intensity={p.best ? 1.2 : 0.6}>
                      {p.best && (
                        <View style={[styles.bestBadge, { backgroundColor: color }]}>
                          <Text style={styles.bestText}>★ POPULAR</Text>
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.packName, { color }]}>{p.name?.toUpperCase()}</Text>
                        <Text style={styles.packCredits}>{p.credits} <Text style={styles.packCreditsLbl}>credits</Text></Text>
                        <Text style={styles.packTagline}>{p.tagline}  ·  ${perCredit}/cr</Text>
                      </View>
                      <View style={styles.packRight}>
                        <Text style={[styles.packPrice, { color }]}>${p.amount.toFixed(2)}</Text>
                        {buying === p.id ? <ActivityIndicator color={color} /> :
                          <Ionicons name="chevron-forward" color={color} size={20} />}
                      </View>
                    </EnergyBox>
                  </TouchableOpacity>
                );
              })
            )}

            <Text style={styles.note}>
              💳 Test mode · 4242 4242 4242 4242 · any future expiry · any CVC
            </Text>
          </ScrollView>
        </SafeAreaView>
      </EnergyLayer>
    </View>
  );
}

function CostChip({ icon, lbl, cost }: any) {
  return (
    <View style={styles.chip}>
      <Ionicons name={icon} size={14} color={COLORS.textDim} />
      <Text style={styles.chipLbl}>{lbl}</Text>
      <Text style={styles.chipCost}>{cost}cr</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomColor: COLORS.border, borderBottomWidth: 1 },
  title: { color: COLORS.text, letterSpacing: 3, fontWeight: '800', fontSize: 12 },
  iconBtn: { padding: 8, minWidth: 40 },
  content: { padding: 20, paddingBottom: 40 },
  balanceBox: { padding: 28, alignItems: 'center', marginBottom: 16 },
  balance: { color: COLORS.text, fontSize: 52, fontWeight: '900', marginTop: 8 },
  balanceLbl: { color: COLORS.textDim, fontSize: 10, letterSpacing: 3, marginTop: 4 },
  costRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 18 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: COLORS.surface, borderRadius: 3, borderWidth: 1, borderColor: COLORS.border },
  chipLbl: { color: COLORS.textDim, fontSize: 10, letterSpacing: 1.5, fontWeight: '700' },
  chipCost: { color: COLORS.accent, fontSize: 11, fontWeight: '800' },
  dataLabel: { color: COLORS.textDim, fontSize: 10, letterSpacing: 2, marginBottom: 12, marginTop: 6 },
  pack: { padding: 18, marginBottom: 10, flexDirection: 'row', alignItems: 'center', position: 'relative' },
  bestBadge: { position: 'absolute', top: -8, right: 14, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 2 },
  bestText: { color: '#000', fontSize: 9, fontWeight: '900', letterSpacing: 2 },
  packName: { fontSize: 11, fontWeight: '800', letterSpacing: 2.5 },
  packCredits: { color: COLORS.text, fontSize: 22, fontWeight: '800', marginTop: 4 },
  packCreditsLbl: { fontSize: 12, color: COLORS.textDim, fontWeight: '500' },
  packTagline: { color: COLORS.textDim, fontSize: 11, marginTop: 2 },
  packRight: { alignItems: 'flex-end', gap: 8 },
  packPrice: { fontSize: 22, fontWeight: '900' },
  note: { color: COLORS.textMuted, fontSize: 11, marginTop: 16, textAlign: 'center' },
});

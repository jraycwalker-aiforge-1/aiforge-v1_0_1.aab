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
        const result = await WebBrowser.openBrowserAsync(r.checkout_url);
        // Re-check status on return
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

  return (
    <View style={styles.root}>
      <EnergyLayer>
        <SafeAreaView style={{ flex: 1 }} edges={['top']}>
          <View style={styles.topBar}>
            <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} testID="back-btn">
              <Ionicons name="chevron-back" color={COLORS.text} size={24} />
            </TouchableOpacity>
            <Text style={styles.title}>BILLING</Text>
            <View style={styles.iconBtn} />
          </View>

          <ScrollView contentContainerStyle={styles.content}>
            <EnergyBox style={styles.balanceBox} color={COLORS.accent} intensity={1}>
              <Ionicons name="flash" size={32} color={COLORS.accent} />
              <Text style={styles.balance}>{credits}</Text>
              <Text style={styles.balanceLbl}>CREDITS</Text>
            </EnergyBox>

            <Text style={styles.dataLabel}>TOP UP</Text>

            {packs.length === 0 ? <ActivityIndicator color={COLORS.energy} /> : (
              packs.map((p, i) => {
                const color = i === 0 ? COLORS.primary : i === 1 ? COLORS.energy : COLORS.accent;
                return (
                  <TouchableOpacity key={p.id} onPress={() => buy(p.id)} disabled={!!buying} testID={`pack-${p.id}`}>
                    <EnergyBox style={styles.pack} color={color} intensity={0.7}>
                      <View>
                        <Text style={styles.packName}>{p.name}</Text>
                        <Text style={styles.packSub}>{p.credits} credits</Text>
                      </View>
                      <View style={styles.packRight}>
                        <Text style={[styles.packPrice, { color }]}>${(p.amount/100).toFixed(2)}</Text>
                        {buying === p.id ? <ActivityIndicator color={color} /> :
                          <Ionicons name="chevron-forward" color={color} size={20} />}
                      </View>
                    </EnergyBox>
                  </TouchableOpacity>
                );
              })
            )}

            <Text style={styles.note}>
              💳 Test mode: use card 4242 4242 4242 4242, any future expiry, any CVC.
            </Text>
          </ScrollView>
        </SafeAreaView>
      </EnergyLayer>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomColor: COLORS.border, borderBottomWidth: 1 },
  title: { color: COLORS.text, letterSpacing: 3, fontWeight: '800', fontSize: 12 },
  iconBtn: { padding: 8, minWidth: 40 },
  content: { padding: 20, paddingBottom: 40 },
  balanceBox: { padding: 28, alignItems: 'center', marginBottom: 20 },
  balance: { color: COLORS.text, fontSize: 48, fontWeight: '900', marginTop: 8 },
  balanceLbl: { color: COLORS.textDim, fontSize: 11, letterSpacing: 3, marginTop: 4 },
  dataLabel: { color: COLORS.textDim, fontSize: 10, letterSpacing: 2, marginBottom: 12, marginTop: 10 },
  pack: { padding: 18, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  packName: { color: COLORS.text, fontSize: 16, fontWeight: '700' },
  packSub: { color: COLORS.textDim, fontSize: 12, marginTop: 4 },
  packRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  packPrice: { fontSize: 20, fontWeight: '800' },
  note: { color: COLORS.textMuted, fontSize: 11, marginTop: 16, textAlign: 'center' },
});

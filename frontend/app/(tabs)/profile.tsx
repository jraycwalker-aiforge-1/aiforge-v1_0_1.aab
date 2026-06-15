import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/auth';
import { COLORS } from '../../src/api';
import { EnergyLayer, EnergyBox } from '../../src/Energy';

export default function Profile() {
  const { user, logout } = useAuth();
  const router = useRouter();
  return (
    <View style={styles.root}>
      <EnergyLayer>
        <SafeAreaView style={{ flex: 1 }} edges={['top']}>
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.dataLabel}>ACCOUNT</Text>
            <Text style={styles.h1}>Profile</Text>

            <EnergyBox style={styles.card} color={COLORS.energy} intensity={0.9}>
              <View style={styles.avatar}><Text style={styles.avatarText}>{(user?.name || 'M')[0].toUpperCase()}</Text></View>
              <Text style={styles.name}>{user?.name}</Text>
              <Text style={styles.email}>{user?.email}</Text>
              <View style={styles.badge}><Text style={styles.badgeText}>{user?.role?.toUpperCase()}</Text></View>
            </EnergyBox>

            <TouchableOpacity onPress={() => router.push('/billing')} testID="goto-billing" activeOpacity={0.85}>
              <EnergyBox style={styles.creditCard} color={COLORS.accent} intensity={1}>
                <Ionicons name="flash" size={28} color={COLORS.accent} />
                <View style={{ flex: 1, marginLeft: 14 }}>
                  <Text style={styles.creditNum}>{user?.credits ?? 0} <Text style={styles.creditLbl}>CREDITS</Text></Text>
                  <Text style={styles.creditSub}>Tap to top up</Text>
                </View>
                <Ionicons name="chevron-forward" size={22} color={COLORS.accent} />
              </EnergyBox>
            </TouchableOpacity>

            <Text style={styles.dataLabel}>INTEGRATIONS</Text>
            <View style={styles.list}>
              <Row icon="image-outline" title="Gemini Nano Banana" sub="Image generation · 1 credit" color={COLORS.primary} />
              <Row icon="videocam-outline" title="Sora 2" sub="Video generation · 5 credits" color={COLORS.green} />
              <Row icon="cube-outline" title="Claude Sonnet 4.5" sub="3D / SCAD generation · 2 credits" color={COLORS.accent} />
              <Row icon="card-outline" title="Stripe" sub="Payments (test mode)" color={COLORS.energy} />
            </View>

            <Text style={styles.dataLabel}>SLICER DEFAULTS</Text>
            <View style={styles.list}>
              <Row icon="layers-outline" title="Layer Height" sub="0.2 mm" />
              <Row icon="grid-outline" title="Infill" sub="20%" />
              <Row icon="thermometer-outline" title="Nozzle" sub="210°C" />
            </View>

            <TouchableOpacity style={styles.logoutBtn} onPress={logout} testID="logout-btn">
              <Ionicons name="log-out-outline" color={COLORS.danger} size={18} />
              <Text style={styles.logoutText}>SIGN OUT</Text>
            </TouchableOpacity>

            <Text style={styles.footer}>AiForge · v1.0</Text>
          </ScrollView>
        </SafeAreaView>
      </EnergyLayer>
    </View>
  );
}

function Row({ icon, title, sub, color = COLORS.textDim }: any) {
  return (
    <View style={styles.row}>
      <View style={[styles.rowIcon, { backgroundColor: color + '22', borderColor: color + '88' }]}>
        <Ionicons name={icon} size={16} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSub}>{sub}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 20, paddingBottom: 40 },
  dataLabel: { color: COLORS.textDim, fontSize: 10, letterSpacing: 2, marginBottom: 6, marginTop: 16 },
  h1: { color: COLORS.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.5, marginBottom: 20 },
  card: { padding: 24, alignItems: 'center' },
  avatar: { width: 72, height: 72, borderRadius: 4, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  avatarText: { color: '#fff', fontSize: 28, fontWeight: '800' },
  name: { color: COLORS.text, fontSize: 20, fontWeight: '700' },
  email: { color: COLORS.textDim, fontSize: 13, marginTop: 4 },
  badge: { marginTop: 14, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: COLORS.bg, borderWidth: 1, borderColor: COLORS.border, borderRadius: 2 },
  badgeText: { color: COLORS.accent, fontSize: 10, fontWeight: '800', letterSpacing: 2 },
  creditCard: { padding: 18, marginTop: 16, flexDirection: 'row', alignItems: 'center' },
  creditNum: { color: COLORS.text, fontSize: 22, fontWeight: '800' },
  creditLbl: { fontSize: 11, color: COLORS.textDim, letterSpacing: 2, fontWeight: '700' },
  creditSub: { color: COLORS.textDim, fontSize: 12, marginTop: 2 },
  list: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 4 },
  row: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomColor: COLORS.border, borderBottomWidth: 1, gap: 12 },
  rowIcon: { width: 34, height: 34, borderRadius: 3, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { color: COLORS.text, fontSize: 14, fontWeight: '600' },
  rowSub: { color: COLORS.textDim, fontSize: 12, marginTop: 2 },
  logoutBtn: { flexDirection: 'row', gap: 8, marginTop: 24, padding: 16, borderWidth: 1, borderColor: COLORS.danger + '55', borderRadius: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.danger + '10' },
  logoutText: { color: COLORS.danger, fontWeight: '700', letterSpacing: 2, fontSize: 13 },
  footer: { color: COLORS.textMuted, textAlign: 'center', marginTop: 30, fontSize: 11, letterSpacing: 2 },
});

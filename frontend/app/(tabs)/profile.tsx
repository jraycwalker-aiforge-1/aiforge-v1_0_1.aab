import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/auth';
import { COLORS } from '../../src/api';

export default function Profile() {
  const { user, logout } = useAuth();
  return (
    <SafeAreaView style={styles.root} edges={['top']} testID="profile-screen">
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.dataLabel}>ACCOUNT</Text>
        <Text style={styles.h1}>Profile</Text>

        <View style={styles.card}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(user?.name || 'M')[0].toUpperCase()}</Text>
          </View>
          <Text style={styles.name}>{user?.name}</Text>
          <Text style={styles.email}>{user?.email}</Text>
          <View style={styles.badge}><Text style={styles.badgeText}>{user?.role?.toUpperCase()}</Text></View>
        </View>

        <Text style={styles.dataLabel}>INTEGRATIONS</Text>
        <View style={styles.list}>
          <Row icon="image-outline" title="Gemini Nano Banana" sub="Image generation" color={COLORS.primary} />
          <Row icon="videocam-outline" title="Sora 2" sub="Video generation" color={COLORS.success} />
          <Row icon="cube-outline" title="Claude Sonnet 4.5 + OpenSCAD" sub="3D model & SCAD" color={COLORS.accent} />
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

        <Text style={styles.footer}>ForgeAI • v1.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ icon, title, sub, color = COLORS.textDim }: any) {
  return (
    <View style={styles.row}>
      <View style={[styles.rowIcon, { backgroundColor: (color) + '22', borderColor: (color) + '55' }]}>
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
  card: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 4, padding: 24, alignItems: 'center' },
  avatar: { width: 72, height: 72, borderRadius: 2, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  avatarText: { color: '#fff', fontSize: 28, fontWeight: '800' },
  name: { color: COLORS.text, fontSize: 20, fontWeight: '700' },
  email: { color: COLORS.textDim, fontSize: 13, marginTop: 4 },
  badge: { marginTop: 14, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: COLORS.bg, borderWidth: 1, borderColor: COLORS.border, borderRadius: 2 },
  badgeText: { color: COLORS.accent, fontSize: 10, fontWeight: '800', letterSpacing: 2 },
  list: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 4 },
  row: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomColor: COLORS.border, borderBottomWidth: 1, gap: 12 },
  rowIcon: { width: 34, height: 34, borderRadius: 3, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { color: COLORS.text, fontSize: 14, fontWeight: '600' },
  rowSub: { color: COLORS.textDim, fontSize: 12, marginTop: 2 },
  logoutBtn: { flexDirection: 'row', gap: 8, marginTop: 24, padding: 16, borderWidth: 1, borderColor: COLORS.danger + '55', borderRadius: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.danger + '10' },
  logoutText: { color: COLORS.danger, fontWeight: '700', letterSpacing: 2, fontSize: 13 },
  footer: { color: COLORS.textMuted, textAlign: 'center', marginTop: 30, fontSize: 11, letterSpacing: 2 },
});

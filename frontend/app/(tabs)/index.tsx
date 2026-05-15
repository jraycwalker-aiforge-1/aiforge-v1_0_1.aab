import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api, COLORS } from '../../src/api';
import { useAuth } from '../../src/auth';

type Recent = {
  id: string; type: 'image' | 'video' | 'model';
  prompt: string; name?: string; thumb_b64?: string | null; created_at: string;
};

export default function Home() {
  const { user } = useAuth();
  const router = useRouter();
  const [counts, setCounts] = useState({ image: 0, video: 0, model: 0 });
  const [recent, setRecent] = useState<Recent[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const r: any = await api.dashboard();
      setCounts(r.counts);
      setRecent(r.recent);
    } catch {}
  };
  useFocusEffect(useCallback(() => { load(); }, []));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const goCreate = (kind: string) => router.push({ pathname: '/(tabs)/create', params: { kind } });

  const openAsset = (a: Recent) => {
    if (a.type === 'model') router.push(`/model/${a.id}`);
    else router.push(`/asset/${a.id}`);
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']} testID="home-screen">
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl tintColor={COLORS.primary} refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.dataLabel}>WELCOME BACK</Text>
            <Text style={styles.hi}>{user?.name || 'Maker'}</Text>
          </View>
          <View style={styles.logoBox}><Text style={styles.logoMark}>◆</Text></View>
        </View>

        <View style={styles.stats}>
          <StatCard label="IMAGES" value={counts.image} color={COLORS.primary} icon="image-outline" />
          <StatCard label="VIDEOS" value={counts.video} color={COLORS.success} icon="videocam-outline" />
          <StatCard label="MODELS" value={counts.model} color={COLORS.accent} icon="cube-outline" />
        </View>

        <Text style={styles.sectionH}>QUICK FORGE</Text>
        <View style={styles.actions}>
          <ActionTile onPress={() => goCreate('image')} testID="quick-image"
            icon="image-outline" label="Image" sub="Nano Banana" tint={COLORS.primary} />
          <ActionTile onPress={() => goCreate('video')} testID="quick-video"
            icon="videocam-outline" label="Video" sub="Sora 2" tint={COLORS.success} />
          <ActionTile onPress={() => goCreate('model')} testID="quick-model"
            icon="cube-outline" label="3D Model" sub="SCAD → STL" tint={COLORS.accent} />
        </View>

        <Text style={styles.sectionH}>RECENT CREATIONS</Text>
        {recent.length === 0 ? (
          <View style={styles.empty} testID="home-empty">
            <Ionicons name="sparkles-outline" size={28} color={COLORS.textMuted} />
            <Text style={styles.emptyText}>No creations yet. Forge something!</Text>
          </View>
        ) : (
          <View style={styles.bento}>
            {recent.map((r) => (
              <TouchableOpacity key={r.id} style={styles.bentoItem} onPress={() => openAsset(r)} testID={`recent-${r.id}`}>
                {r.type === 'image' && r.thumb_b64 ? (
                  <Image source={{ uri: `data:image/png;base64,${r.thumb_b64}` }} style={styles.bentoThumb} />
                ) : (
                  <View style={[styles.bentoThumb, styles.bentoIcon]}>
                    <Ionicons
                      name={r.type === 'video' ? 'videocam' : r.type === 'model' ? 'cube' : 'image'}
                      size={28}
                      color={r.type === 'video' ? COLORS.success : r.type === 'model' ? COLORS.accent : COLORS.primary}
                    />
                  </View>
                )}
                <Text numberOfLines={2} style={styles.bentoText}>{r.name || r.prompt}</Text>
                <Text style={styles.bentoType}>{r.type.toUpperCase()}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({ label, value, color, icon }: any) {
  return (
    <View style={[styles.stat, { borderColor: COLORS.border }]}>
      <Ionicons name={icon} size={18} color={color} />
      <Text style={styles.statVal}>{value}</Text>
      <Text style={styles.statLbl}>{label}</Text>
    </View>
  );
}

function ActionTile({ icon, label, sub, tint, onPress, testID }: any) {
  return (
    <TouchableOpacity style={styles.action} onPress={onPress} testID={testID}>
      <View style={[styles.actionIcon, { backgroundColor: tint + '22', borderColor: tint + '55' }]}>
        <Ionicons name={icon} size={22} color={tint} />
      </View>
      <Text style={styles.actionLbl}>{label}</Text>
      <Text style={styles.actionSub}>{sub}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 20, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  dataLabel: { color: COLORS.textDim, fontSize: 10, letterSpacing: 2, marginBottom: 4 },
  hi: { color: COLORS.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  logoBox: {
    width: 40, height: 40, backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center', borderRadius: 2,
    transform: [{ rotate: '45deg' }],
  },
  logoMark: { color: '#fff', fontSize: 18, transform: [{ rotate: '-45deg' }] },
  stats: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  stat: { flex: 1, padding: 14, borderWidth: 1, backgroundColor: COLORS.surface, borderRadius: 4 },
  statVal: { color: COLORS.text, fontSize: 24, fontWeight: '800', marginTop: 6 },
  statLbl: { color: COLORS.textDim, fontSize: 10, letterSpacing: 1.5 },
  sectionH: { color: COLORS.textDim, fontSize: 11, letterSpacing: 2, marginBottom: 12, marginTop: 8 },
  actions: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  action: { flex: 1, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, padding: 14, borderRadius: 4, alignItems: 'flex-start' },
  actionIcon: { width: 38, height: 38, borderRadius: 3, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  actionLbl: { color: COLORS.text, fontWeight: '700', fontSize: 15 },
  actionSub: { color: COLORS.textDim, fontSize: 11, marginTop: 2, letterSpacing: 1 },
  empty: { alignItems: 'center', padding: 40, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 4 },
  emptyText: { color: COLORS.textDim, marginTop: 10 },
  bento: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  bentoItem: { width: '48.5%', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 4, padding: 10 },
  bentoThumb: { width: '100%', aspectRatio: 1, borderRadius: 2, marginBottom: 8, backgroundColor: COLORS.bg },
  bentoIcon: { alignItems: 'center', justifyContent: 'center' },
  bentoText: { color: COLORS.text, fontSize: 13, fontWeight: '600' },
  bentoType: { color: COLORS.textDim, fontSize: 9, letterSpacing: 1.5, marginTop: 4 },
});

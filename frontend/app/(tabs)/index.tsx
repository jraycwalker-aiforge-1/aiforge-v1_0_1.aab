import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api, COLORS } from '../../src/api';
import { useAuth } from '../../src/auth';
import { EnergyLayer, EnergyBox } from '../../src/Energy';

type Recent = { id: string; type: 'image' | 'video' | 'model'; prompt: string; name?: string; thumb_b64?: string | null; created_at: string };

export default function Home() {
  const { user } = useAuth();
  const router = useRouter();
  const [counts, setCounts] = useState({ image: 0, video: 0, model: 0 });
  const [credits, setCredits] = useState(user?.credits ?? 0);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const r: any = await api.dashboard();
      setCounts(r.counts); setRecent(r.recent); setCredits(r.credits);
    } catch {}
  };
  useFocusEffect(useCallback(() => { load(); }, []));

  const goCreate = (kind: string) => router.push({ pathname: '/(tabs)/create', params: { kind } });
  const openAsset = (a: Recent) => a.type === 'model' ? router.push(`/model/${a.id}`) : router.push(`/asset/${a.id}`);

  return (
    <View style={styles.root}>
      <EnergyLayer>
        <SafeAreaView style={{ flex: 1 }} edges={['top']}>
          <ScrollView contentContainerStyle={styles.content}
            refreshControl={<RefreshControl tintColor={COLORS.energy} refreshing={refreshing}
              onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>

            <View style={styles.header}>
              <View>
                <Text style={styles.dataLabel}>WELCOME BACK</Text>
                <Text style={styles.hi}>{user?.name || 'Maker'}</Text>
              </View>
              <TouchableOpacity onPress={() => router.push('/billing')} testID="credits-pill">
                <EnergyBox style={styles.creditsPill} color={COLORS.accent}>
                  <Ionicons name="flash" color={COLORS.accent} size={14} />
                  <Text style={styles.creditsText}>{credits}</Text>
                </EnergyBox>
              </TouchableOpacity>
            </View>

            <View style={styles.stats}>
              <Stat label="IMAGES" v={counts.image} c={COLORS.primary} icon="image-outline" />
              <Stat label="VIDEOS" v={counts.video} c={COLORS.green} icon="videocam-outline" />
              <Stat label="MODELS" v={counts.model} c={COLORS.accent} icon="cube-outline" />
            </View>

            <Text style={styles.sectionH}>QUICK FORGE</Text>
            <View style={styles.actions}>
              <ActionTile onPress={() => goCreate('image')} testID="quick-image"
                icon="image-outline" label="Image" sub="Nano Banana · 1 cr" tint={COLORS.primary} />
              <ActionTile onPress={() => goCreate('video')} testID="quick-video"
                icon="videocam-outline" label="Video" sub="Sora 2 · 5 cr" tint={COLORS.green} />
              <ActionTile onPress={() => goCreate('model')} testID="quick-model"
                icon="cube-outline" label="3D Model" sub="STL · 2 cr" tint={COLORS.accent} />
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
                        <Ionicons name={r.type === 'video' ? 'videocam' : 'cube'} size={28}
                          color={r.type === 'video' ? COLORS.green : COLORS.accent} />
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
      </EnergyLayer>
    </View>
  );
}

function Stat({ label, v, c, icon }: any) {
  return (
    <EnergyBox style={styles.stat} color={c} intensity={0.5}>
      <Ionicons name={icon} size={18} color={c} />
      <Text style={styles.statVal}>{v}</Text>
      <Text style={styles.statLbl}>{label}</Text>
    </EnergyBox>
  );
}

function ActionTile({ icon, label, sub, tint, onPress, testID }: any) {
  return (
    <TouchableOpacity onPress={onPress} testID={testID} style={{ flex: 1 }}>
      <EnergyBox style={styles.action} color={tint} intensity={0.6}>
        <View style={[styles.actionIcon, { backgroundColor: tint + '22', borderColor: tint + '88' }]}>
          <Ionicons name={icon} size={22} color={tint} />
        </View>
        <Text style={styles.actionLbl}>{label}</Text>
        <Text style={styles.actionSub}>{sub}</Text>
      </EnergyBox>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 20, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  dataLabel: { color: COLORS.textDim, fontSize: 10, letterSpacing: 2, marginBottom: 4 },
  hi: { color: COLORS.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  creditsPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8 },
  creditsText: { color: COLORS.text, fontWeight: '800', letterSpacing: 1, fontSize: 14 },
  stats: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  stat: { flex: 1, padding: 14 },
  statVal: { color: COLORS.text, fontSize: 24, fontWeight: '800', marginTop: 6 },
  statLbl: { color: COLORS.textDim, fontSize: 10, letterSpacing: 1.5 },
  sectionH: { color: COLORS.textDim, fontSize: 11, letterSpacing: 2, marginBottom: 12, marginTop: 8 },
  actions: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  action: { padding: 14, alignItems: 'flex-start' },
  actionIcon: { width: 38, height: 38, borderRadius: 3, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  actionLbl: { color: COLORS.text, fontWeight: '700', fontSize: 15 },
  actionSub: { color: COLORS.textDim, fontSize: 10, marginTop: 2, letterSpacing: 1 },
  empty: { alignItems: 'center', padding: 40, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 4 },
  emptyText: { color: COLORS.textDim, marginTop: 10 },
  bento: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  bentoItem: { width: '48.5%', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 4, padding: 10 },
  bentoThumb: { width: '100%', aspectRatio: 1, borderRadius: 2, marginBottom: 8, backgroundColor: COLORS.bg },
  bentoIcon: { alignItems: 'center', justifyContent: 'center' },
  bentoText: { color: COLORS.text, fontSize: 13, fontWeight: '600' },
  bentoType: { color: COLORS.textDim, fontSize: 9, letterSpacing: 1.5, marginTop: 4 },
});

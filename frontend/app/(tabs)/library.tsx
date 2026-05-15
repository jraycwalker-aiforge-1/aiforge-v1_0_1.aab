import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api, COLORS } from '../../src/api';

type Kind = 'all' | 'image' | 'video' | 'model';

export default function Library() {
  const router = useRouter();
  const [filter, setFilter] = useState<Kind>('all');
  const [items, setItems] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const r: any = await api.listAssets(filter === 'all' ? undefined : filter);
      setItems(r);
    } catch {}
  };
  useFocusEffect(useCallback(() => { load(); }, [filter]));

  const openAsset = (a: any) => {
    if (a.type === 'model') router.push(`/model/${a.id}`);
    else router.push(`/asset/${a.id}`);
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']} testID="library-screen">
      <View style={styles.header}>
        <Text style={styles.dataLabel}>LIBRARY</Text>
        <Text style={styles.h1}>Your Forge</Text>
      </View>
      <View style={styles.filters}>
        {(['all', 'image', 'video', 'model'] as Kind[]).map((f) => (
          <TouchableOpacity key={f} style={[styles.filter, filter === f && styles.filterActive]}
            onPress={() => setFilter(f)} testID={`filter-${f}`}>
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>{f.toUpperCase()}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl tintColor={COLORS.primary} refreshing={refreshing}
          onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      >
        {items.length === 0 ? (
          <View style={styles.empty} testID="library-empty">
            <Ionicons name="folder-open-outline" size={36} color={COLORS.textMuted} />
            <Text style={styles.emptyText}>No creations in this category yet.</Text>
          </View>
        ) : (
          <View style={styles.grid}>
            {items.map((a) => (
              <TouchableOpacity key={a.id} style={styles.item} onPress={() => openAsset(a)} testID={`library-${a.id}`}>
                {a.type === 'image' && a.thumb_b64 ? (
                  <Image source={{ uri: `data:image/png;base64,${a.thumb_b64}` }} style={styles.thumb} />
                ) : (
                  <View style={[styles.thumb, styles.iconBox,
                    { backgroundColor: a.type === 'video' ? COLORS.success + '15' : COLORS.accent + '15' }]}>
                    <Ionicons
                      name={a.type === 'video' ? 'play-circle' : 'cube'}
                      size={42}
                      color={a.type === 'video' ? COLORS.success : COLORS.accent}
                    />
                  </View>
                )}
                <View style={styles.meta}>
                  <Text style={styles.itemTag}>{a.type.toUpperCase()}</Text>
                  <Text numberOfLines={2} style={styles.itemTitle}>{a.name || a.prompt}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  header: { padding: 20, paddingBottom: 8 },
  dataLabel: { color: COLORS.textDim, fontSize: 10, letterSpacing: 2, marginBottom: 4 },
  h1: { color: COLORS.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  filters: { flexDirection: 'row', paddingHorizontal: 20, gap: 8, marginBottom: 12 },
  filter: { paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: COLORS.border, borderRadius: 3, backgroundColor: COLORS.surface },
  filterActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterText: { color: COLORS.textDim, fontSize: 11, fontWeight: '700', letterSpacing: 1.5 },
  filterTextActive: { color: '#fff' },
  content: { padding: 20 },
  empty: { alignItems: 'center', padding: 60, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 4 },
  emptyText: { color: COLORS.textDim, marginTop: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  item: { width: '48.5%', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 4, overflow: 'hidden' },
  thumb: { width: '100%', aspectRatio: 1, backgroundColor: COLORS.bg },
  iconBox: { alignItems: 'center', justifyContent: 'center' },
  meta: { padding: 10 },
  itemTag: { color: COLORS.accent, fontSize: 9, letterSpacing: 2, fontWeight: '800', marginBottom: 4 },
  itemTitle: { color: COLORS.text, fontSize: 13, fontWeight: '600' },
});

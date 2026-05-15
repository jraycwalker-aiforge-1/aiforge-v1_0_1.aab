import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Image, ActivityIndicator, TouchableOpacity, Alert, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { api, COLORS } from '../../src/api';

export default function AssetDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [asset, setAsset] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r: any = await api.getAsset(String(id));
        setAsset(r);
      } catch (e: any) {
        Alert.alert('Error', e.message || 'Failed to load');
      } finally { setLoading(false); }
    })();
  }, [id]);

  const onDelete = () => {
    Alert.alert('Delete asset?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
          await api.deleteAsset(String(id));
          router.back();
      } },
    ]);
  };

  const copyPrompt = async () => {
    await Clipboard.setStringAsync(asset.prompt || '');
    Alert.alert('Copied', 'Prompt copied to clipboard');
  };

  const shareFile = async () => {
    if (Platform.OS === 'web') return Alert.alert('Unavailable', 'Share works on mobile only');
    try {
      const ext = asset.type === 'image' ? 'png' : 'mp4';
      const b64 = asset.image_b64 || asset.video_b64;
      if (!b64) return;
      const path = FileSystem.cacheDirectory + `forge-${asset.id}.${ext}`;
      await FileSystem.writeAsStringAsync(path, b64, { encoding: FileSystem.EncodingType.Base64 });
      await Sharing.shareAsync(path);
    } catch (e: any) {
      Alert.alert('Share failed', e.message);
    }
  };

  if (loading) {
    return <View style={[styles.root, styles.center]}><ActivityIndicator color={COLORS.primary} size="large" /></View>;
  }
  if (!asset) {
    return <View style={[styles.root, styles.center]}><Text style={{ color: COLORS.textDim }}>Not found</Text></View>;
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']} testID="asset-detail">
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} testID="back-btn">
          <Ionicons name="chevron-back" color={COLORS.text} size={24} />
        </TouchableOpacity>
        <Text style={styles.title}>{asset.type.toUpperCase()}</Text>
        <TouchableOpacity onPress={onDelete} style={styles.iconBtn} testID="delete-btn">
          <Ionicons name="trash-outline" color={COLORS.danger} size={20} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {asset.type === 'image' && asset.image_b64 && (
          <Image source={{ uri: `data:${asset.mime_type || 'image/png'};base64,${asset.image_b64}` }} style={styles.preview} resizeMode="contain" />
        )}
        {asset.type === 'video' && (
          <View style={[styles.preview, styles.videoPlaceholder]}>
            <Ionicons name="play-circle" size={80} color={COLORS.success} />
            <Text style={styles.videoInfo}>{asset.size} • {asset.duration}s</Text>
            <Text style={styles.videoNote}>Tap Share to play in system player</Text>
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.dataLabel}>PROMPT</Text>
          <Text style={styles.prompt}>{asset.prompt}</Text>
        </View>

        <Text style={styles.dataLabel}>METADATA</Text>
        <View style={styles.metaCard}>
          <MetaRow k="ID" v={String(asset.id).slice(0, 8)} />
          <MetaRow k="TYPE" v={asset.type.toUpperCase()} />
          <MetaRow k="CREATED" v={new Date(asset.created_at).toLocaleString()} />
          {asset.size && <MetaRow k="RESOLUTION" v={asset.size} />}
          {asset.duration && <MetaRow k="DURATION" v={`${asset.duration}s`} />}
        </View>

        <View style={styles.actions}>
          <TouchableOpacity style={styles.btnGhost} onPress={copyPrompt} testID="copy-prompt">
            <Ionicons name="copy-outline" color={COLORS.text} size={16} />
            <Text style={styles.btnGhostText}>COPY PROMPT</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btn} onPress={shareFile} testID="share-btn">
            <Ionicons name="share-outline" color="#fff" size={16} />
            <Text style={styles.btnText}>SHARE / EXPORT</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function MetaRow({ k, v }: { k: string; v: string }) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaKey}>{k}</Text>
      <Text style={styles.metaVal}>{v}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  center: { justifyContent: 'center', alignItems: 'center' },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomColor: COLORS.border, borderBottomWidth: 1 },
  title: { color: COLORS.text, letterSpacing: 3, fontWeight: '800', fontSize: 12 },
  iconBtn: { padding: 8 },
  content: { padding: 20, paddingBottom: 40 },
  preview: { width: '100%', aspectRatio: 1, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 4 },
  videoPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  videoInfo: { color: COLORS.text, marginTop: 12, letterSpacing: 2, fontWeight: '700' },
  videoNote: { color: COLORS.textDim, marginTop: 4, fontSize: 12 },
  card: { marginTop: 16, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, padding: 14, borderRadius: 4 },
  dataLabel: { color: COLORS.textDim, fontSize: 10, letterSpacing: 2, marginBottom: 6, marginTop: 14 },
  prompt: { color: COLORS.text, fontSize: 15, lineHeight: 22 },
  metaCard: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 4 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 14, borderBottomColor: COLORS.border, borderBottomWidth: 1 },
  metaKey: { color: COLORS.textDim, fontSize: 11, letterSpacing: 1.5, fontWeight: '700' },
  metaVal: { color: COLORS.text, fontSize: 13, fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }) },
  actions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  btnGhost: { flex: 1, flexDirection: 'row', gap: 8, justifyContent: 'center', padding: 14, borderWidth: 1, borderColor: COLORS.border, borderRadius: 4, backgroundColor: COLORS.surface },
  btnGhostText: { color: COLORS.text, fontWeight: '700', letterSpacing: 1.5, fontSize: 12 },
  btn: { flex: 1, flexDirection: 'row', gap: 8, justifyContent: 'center', padding: 14, borderRadius: 4, backgroundColor: COLORS.primary },
  btnText: { color: '#fff', fontWeight: '800', letterSpacing: 1.5, fontSize: 12 },
});

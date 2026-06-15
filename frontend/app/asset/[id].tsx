import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Image, ActivityIndicator,
  TouchableOpacity, Alert, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useVideoPlayer, VideoView } from 'expo-video';
import { api, COLORS } from '../../src/api';
import { EnergyLayer, EnergyBox } from '../../src/Energy';

export default function AssetDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [asset, setAsset] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [speed, setSpeed] = useState(1);

  useEffect(() => {
    (async () => {
      try {
        const r: any = await api.getAsset(String(id));
        setAsset(r);
        if (r.type === 'video' && r.video_b64 && Platform.OS !== 'web') {
          const path = FileSystem.cacheDirectory + `aiforge-${r.id}.mp4`;
          await FileSystem.writeAsStringAsync(path, r.video_b64, { encoding: FileSystem.EncodingType.Base64 });
          setVideoUri(path);
        }
      } catch (e: any) {
        Alert.alert('Error', e.message);
      } finally { setLoading(false); }
    })();
  }, [id]);

  const player = useVideoPlayer(videoUri || '', (p) => {
    p.loop = false;
    p.playbackRate = speed;
  });

  useEffect(() => { if (player) player.playbackRate = speed; }, [speed]);

  const onDelete = () => Alert.alert('Delete asset?', 'Cannot be undone.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: async () => { await api.deleteAsset(String(id)); router.back(); } },
  ]);
  const copyPrompt = async () => { await Clipboard.setStringAsync(asset.prompt || ''); Alert.alert('Copied', 'Prompt copied'); };
  const shareFile = async () => {
    if (Platform.OS === 'web') return Alert.alert('Unavailable', 'Share on mobile only');
    try {
      const ext = asset.type === 'image' ? 'png' : 'mp4';
      const b64 = asset.image_b64 || asset.video_b64;
      if (!b64) return;
      const path = FileSystem.cacheDirectory + `aiforge-${asset.id}.${ext}`;
      await FileSystem.writeAsStringAsync(path, b64, { encoding: FileSystem.EncodingType.Base64 });
      await Sharing.shareAsync(path);
    } catch (e: any) { Alert.alert('Share failed', e.message); }
  };

  if (loading) return <View style={[styles.root, styles.center]}><ActivityIndicator color={COLORS.energy} size="large" /></View>;
  if (!asset) return <View style={[styles.root, styles.center]}><Text style={{ color: COLORS.textDim }}>Not found</Text></View>;

  return (
    <View style={styles.root}>
      <EnergyLayer>
        <SafeAreaView style={{ flex: 1 }} edges={['top']}>
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
              <EnergyBox style={{ borderRadius: 4 }} color={COLORS.primary} intensity={0.8}>
                <Image source={{ uri: `data:${asset.mime_type || 'image/png'};base64,${asset.image_b64}` }} style={styles.preview} resizeMode="contain" />
              </EnergyBox>
            )}
            {asset.type === 'video' && (
              <>
                <EnergyBox style={{ borderRadius: 4, overflow: 'hidden' }} color={COLORS.green} intensity={0.9}>
                  {videoUri ? (
                    <VideoView style={styles.video} player={player} allowsFullscreen nativeControls contentFit="contain" />
                  ) : (
                    <View style={[styles.video, styles.videoPlaceholder]}>
                      <Ionicons name="play-circle" size={80} color={COLORS.green} />
                      <Text style={styles.videoInfo}>{asset.size} · {asset.duration}s</Text>
                    </View>
                  )}
                </EnergyBox>

                {/* Mini video editor controls */}
                <View style={styles.editorCard}>
                  <Text style={styles.dataLabel}>SPEED · ⏯ ✂︎</Text>
                  <View style={styles.speedRow}>
                    {[0.5, 1, 1.5, 2].map((sp) => (
                      <TouchableOpacity key={sp} style={[styles.speedPill, speed === sp && styles.speedPillActive]}
                        onPress={() => setSpeed(sp)} testID={`speed-${sp}`}>
                        <Text style={[styles.speedText, speed === sp && { color: '#fff' }]}>{sp}×</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <View style={styles.transportRow}>
                    <TouchableOpacity onPress={() => player.currentTime = Math.max(0, player.currentTime - 5)} style={styles.transportBtn} testID="rewind">
                      <Ionicons name="play-back" size={18} color={COLORS.text} /><Text style={styles.transportLbl}>-5s</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => player.playing ? player.pause() : player.play()} style={[styles.transportBtn, { backgroundColor: COLORS.energy + '22', borderColor: COLORS.energy }]} testID="playpause">
                      <Ionicons name="play" size={18} color={COLORS.energy} /><Text style={[styles.transportLbl, { color: COLORS.energy }]}>PLAY/PAUSE</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => player.currentTime = player.currentTime + 5} style={styles.transportBtn} testID="forward">
                      <Ionicons name="play-forward" size={18} color={COLORS.text} /><Text style={styles.transportLbl}>+5s</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </>
            )}

            <EnergyBox style={styles.card} color={COLORS.primary} intensity={0.4}>
              <Text style={styles.dataLabel}>PROMPT</Text>
              <Text style={styles.prompt}>{asset.prompt}</Text>
            </EnergyBox>

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
              <TouchableOpacity onPress={shareFile} testID="share-btn" style={{ flex: 1 }}>
                <EnergyBox style={styles.btn} color={COLORS.energy} intensity={1}>
                  <Ionicons name="share-outline" color="#fff" size={16} />
                  <Text style={styles.btnText}>EXPORT</Text>
                </EnergyBox>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </SafeAreaView>
      </EnergyLayer>
    </View>
  );
}

function MetaRow({ k, v }: { k: string; v: string }) {
  return <View style={styles.metaRow}><Text style={styles.metaKey}>{k}</Text><Text style={styles.metaVal}>{v}</Text></View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  center: { justifyContent: 'center', alignItems: 'center' },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomColor: COLORS.border, borderBottomWidth: 1 },
  title: { color: COLORS.text, letterSpacing: 3, fontWeight: '800', fontSize: 12 },
  iconBtn: { padding: 8 },
  content: { padding: 20, paddingBottom: 40 },
  preview: { width: '100%', aspectRatio: 1, backgroundColor: COLORS.surface, borderRadius: 4 },
  video: { width: '100%', aspectRatio: 16/9, backgroundColor: COLORS.surface },
  videoPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  videoInfo: { color: COLORS.text, marginTop: 12, letterSpacing: 2, fontWeight: '700' },
  editorCard: { marginTop: 12, padding: 14, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 4 },
  speedRow: { flexDirection: 'row', gap: 8 },
  speedPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 3, backgroundColor: COLORS.bg, borderWidth: 1, borderColor: COLORS.border },
  speedPillActive: { backgroundColor: COLORS.energy, borderColor: COLORS.energy },
  speedText: { color: COLORS.textDim, fontSize: 12, fontWeight: '800' },
  transportRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  transportBtn: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, paddingVertical: 12, borderWidth: 1, borderColor: COLORS.border, borderRadius: 3, backgroundColor: COLORS.bg },
  transportLbl: { color: COLORS.text, fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  card: { marginTop: 16, padding: 14 },
  dataLabel: { color: COLORS.textDim, fontSize: 10, letterSpacing: 2, marginBottom: 6, marginTop: 14 },
  prompt: { color: COLORS.text, fontSize: 15, lineHeight: 22 },
  metaCard: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 4 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 14, borderBottomColor: COLORS.border, borderBottomWidth: 1 },
  metaKey: { color: COLORS.textDim, fontSize: 11, letterSpacing: 1.5, fontWeight: '700' },
  metaVal: { color: COLORS.text, fontSize: 13, fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }) },
  actions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  btnGhost: { flex: 1, flexDirection: 'row', gap: 8, justifyContent: 'center', padding: 14, borderWidth: 1, borderColor: COLORS.border, borderRadius: 4, backgroundColor: COLORS.surface },
  btnGhostText: { color: COLORS.text, fontWeight: '700', letterSpacing: 1.5, fontSize: 12 },
  btn: { flexDirection: 'row', gap: 8, justifyContent: 'center', alignItems: 'center', padding: 14, borderRadius: 4, backgroundColor: COLORS.primary },
  btnText: { color: '#fff', fontWeight: '800', letterSpacing: 1.5, fontSize: 12 },
});

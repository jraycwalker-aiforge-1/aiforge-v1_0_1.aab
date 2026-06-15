import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api, COLORS, pollJob } from '../../src/api';
import { EnergyLayer, EnergyBox } from '../../src/Energy';

type Kind = 'image' | 'video' | 'model';
const SIZES = ['1280x720', '1792x1024', '1024x1792', '1024x1024'];
const DURATIONS = [4, 8, 12];

export default function Create() {
  const params = useLocalSearchParams<{ kind?: string }>();
  const router = useRouter();
  const initKind = (params.kind as Kind) || 'image';
  const [kind, setKind] = useState<Kind>(initKind);
  const [prompt, setPrompt] = useState('');
  const [duration, setDuration] = useState(4);
  const [size, setSize] = useState('1280x720');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<string>('');
  const [err, setErr] = useState<string | null>(null);

  const generate = async () => {
    if (prompt.trim().length < 3) return setErr('Prompt too short');
    setErr(null); setLoading(true); setProgress(0); setStatus('Queuing...');
    try {
      if (kind === 'image') {
        setStatus('Generating image with Nano Banana...');
        const res: any = await api.generateImage(prompt);
        router.replace(`/asset/${res.id}`);
      } else if (kind === 'video') {
        setStatus(`Queued Sora 2 video (${duration}s)...`);
        const res: any = await api.generateVideo({ prompt, duration, size });
        const done: any = await pollJob(res.job_id, (j) => {
          setProgress(j.progress || 0);
          setStatus(`Sora 2: ${j.status} (${j.progress || 0}%)`);
        });
        router.replace(`/asset/${done.asset_id}`);
      } else {
        setStatus('Designing 3D model with Claude...');
        const res: any = await api.generateModel(prompt);
        const done: any = await pollJob(res.job_id, (j) => {
          setProgress(j.progress || 0);
          setStatus(`Building STL: ${j.status} (${j.progress || 0}%)`);
        });
        router.replace(`/model/${done.asset_id}`);
      }
      setPrompt('');
    } catch (e: any) {
      setErr(e.message || 'Generation failed');
    } finally {
      setLoading(false); setProgress(0); setStatus('');
    }
  };

  const placeholder = {
    image: 'A cyberpunk samurai fox under neon signs, studio lighting',
    video: 'A macro timelapse of a crystal flower blooming, cinematic',
    model: 'A hexagonal cable organizer with 6 slots, 50mm wide',
  }[kind];

  const tint = kind === 'image' ? COLORS.primary : kind === 'video' ? COLORS.green : COLORS.accent;

  return (
    <View style={styles.root}>
      <EnergyLayer>
        <SafeAreaView style={{ flex: 1 }} edges={['top']}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
              <Text style={styles.dataLabel}>FORGE</Text>
              <Text style={styles.h1}>Create with AI</Text>

              <EnergyBox style={styles.tabs} color={tint} intensity={0.7}>
                {(['image','video','model'] as Kind[]).map((k) => (
                  <TouchableOpacity key={k} style={[styles.tab, kind === k && { backgroundColor: tint }]}
                    onPress={() => setKind(k)} testID={`kind-${k}`}>
                    <Ionicons name={k === 'image' ? 'image-outline' : k === 'video' ? 'videocam-outline' : 'cube-outline'}
                      size={18} color={kind === k ? '#fff' : COLORS.textDim} />
                    <Text style={[styles.tabText, kind === k && { color: '#fff' }]}>{k.toUpperCase()}</Text>
                  </TouchableOpacity>
                ))}
              </EnergyBox>

              <EnergyBox style={styles.infoCard} color={tint} intensity={0.5}>
                <Text style={[styles.infoModel, { color: tint }]}>
                  {kind === 'image' ? '◆ Gemini Nano Banana' : kind === 'video' ? '◆ Sora 2' : '◆ Claude Sonnet 4.5 → STL'}
                </Text>
                <Text style={styles.infoDesc}>
                  {kind === 'image' && 'Text-to-image. Photorealistic, artistic, abstract. ~10s · 1 credit.'}
                  {kind === 'video' && 'Text-to-video. 4-12s cinematic generations. ~1-3 min · 5 credits.'}
                  {kind === 'model' && 'Text-to-3D. OpenSCAD + printable STL with slicer. ~30s · 2 credits.'}
                </Text>
              </EnergyBox>

              <Text style={styles.dataLabel}>PROMPT</Text>
              <TextInput value={prompt} onChangeText={setPrompt} multiline numberOfLines={4}
                placeholder={placeholder} placeholderTextColor={COLORS.textMuted}
                style={styles.textarea} testID="prompt-input" />

              {kind === 'video' && (
                <>
                  <Text style={styles.dataLabel}>DURATION</Text>
                  <View style={styles.pillRow}>
                    {DURATIONS.map((d) => (
                      <TouchableOpacity key={d} style={[styles.pill, duration === d && { backgroundColor: tint, borderColor: tint }]}
                        onPress={() => setDuration(d)} testID={`duration-${d}`}>
                        <Text style={[styles.pillText, duration === d && { color: '#fff' }]}>{d}s</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={styles.dataLabel}>RESOLUTION</Text>
                  <View style={styles.pillRow}>
                    {SIZES.map((s) => (
                      <TouchableOpacity key={s} style={[styles.pill, size === s && { backgroundColor: tint, borderColor: tint }]}
                        onPress={() => setSize(s)} testID={`size-${s}`}>
                        <Text style={[styles.pillText, size === s && { color: '#fff' }]}>{s}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              {err ? <Text style={styles.err} testID="create-error">{err}</Text> : null}

              {loading && (
                <View style={styles.progressBox} testID="progress">
                  <ActivityIndicator color={tint} />
                  <Text style={styles.progressText}>{status}</Text>
                  {progress > 0 && (
                    <View style={styles.bar}><View style={[styles.barFill, { width: `${progress}%`, backgroundColor: tint }]} /></View>
                  )}
                </View>
              )}

              <TouchableOpacity onPress={generate} disabled={loading} testID="generate-btn" activeOpacity={0.8}>
                <EnergyBox style={[styles.btn, { backgroundColor: tint }]} color={tint} intensity={1.2}>
                  {loading ? <ActivityIndicator color="#fff" /> :
                    <Text style={styles.btnText}>⚡ FORGE {kind.toUpperCase()}</Text>}
                </EnergyBox>
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </EnergyLayer>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 20, paddingBottom: 60 },
  dataLabel: { color: COLORS.textDim, fontSize: 10, letterSpacing: 2, marginBottom: 6, marginTop: 16 },
  h1: { color: COLORS.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.5, marginBottom: 20 },
  tabs: { flexDirection: 'row', padding: 4 },
  tab: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, paddingVertical: 10, borderRadius: 2 },
  tabText: { color: COLORS.textDim, fontSize: 11, fontWeight: '700', letterSpacing: 1.5 },
  infoCard: { padding: 14, marginTop: 16 },
  infoModel: { fontSize: 12, letterSpacing: 2, fontWeight: '700' },
  infoDesc: { color: COLORS.textDim, fontSize: 13, marginTop: 4, lineHeight: 18 },
  textarea: { backgroundColor: COLORS.surface, color: COLORS.text, borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 14, paddingVertical: 14, borderRadius: 4, fontSize: 15, minHeight: 110, textAlignVertical: 'top' },
  pillRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  pill: { paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: COLORS.border, borderRadius: 3, backgroundColor: COLORS.surface },
  pillText: { color: COLORS.textDim, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  btn: { paddingVertical: 18, alignItems: 'center', borderRadius: 4, marginTop: 24 },
  btnText: { color: '#fff', fontWeight: '800', letterSpacing: 2, fontSize: 14 },
  err: { color: COLORS.danger, marginTop: 14, fontSize: 13 },
  progressBox: { marginTop: 18, padding: 14, backgroundColor: COLORS.surface, borderRadius: 4, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' },
  progressText: { color: COLORS.text, marginTop: 8, fontSize: 13, letterSpacing: 0.5 },
  bar: { width: '100%', height: 4, backgroundColor: COLORS.bg, borderRadius: 2, marginTop: 10, overflow: 'hidden' },
  barFill: { height: '100%' },
});

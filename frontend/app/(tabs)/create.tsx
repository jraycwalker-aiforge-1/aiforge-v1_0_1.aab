import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api, COLORS } from '../../src/api';

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
  const [err, setErr] = useState<string | null>(null);

  const generate = async () => {
    if (prompt.trim().length < 3) return setErr('Prompt too short');
    setErr(null); setLoading(true);
    try {
      let res: any;
      if (kind === 'image') res = await api.generateImage(prompt);
      else if (kind === 'video') res = await api.generateVideo({ prompt, duration, size });
      else res = await api.generateModel(prompt);
      setPrompt('');
      if (kind === 'model') router.push(`/model/${res.id}`);
      else router.push(`/asset/${res.id}`);
    } catch (e: any) {
      setErr(e.message || 'Generation failed');
    } finally {
      setLoading(false);
    }
  };

  const placeholder = {
    image: 'A cyberpunk samurai fox standing under neon signs, studio lighting',
    video: 'A macro timelapse of a blooming crystal flower, dreamy cinematic',
    model: 'A hexagonal cable organizer with 6 slots, 50mm wide, rounded edges',
  }[kind];

  return (
    <SafeAreaView style={styles.root} edges={['top']} testID="create-screen">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.dataLabel}>MODE</Text>
          <Text style={styles.h1}>Create with AI</Text>

          <View style={styles.tabs}>
            {(['image', 'video', 'model'] as Kind[]).map((k) => (
              <TouchableOpacity key={k} style={[styles.tab, kind === k && styles.tabActive]}
                onPress={() => setKind(k)} testID={`kind-${k}`}>
                <Ionicons
                  name={k === 'image' ? 'image-outline' : k === 'video' ? 'videocam-outline' : 'cube-outline'}
                  size={18} color={kind === k ? COLORS.text : COLORS.textDim}
                />
                <Text style={[styles.tabText, kind === k && styles.tabTextActive]}>{k.toUpperCase()}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.infoCard}>
            <Text style={styles.infoModel}>
              {kind === 'image' ? 'Gemini Nano Banana' : kind === 'video' ? 'Sora 2' : 'Claude Sonnet 4.5 → STL'}
            </Text>
            <Text style={styles.infoDesc}>
              {kind === 'image' && 'Text-to-image. Photorealistic, artistic, or abstract outputs.'}
              {kind === 'video' && 'Text-to-video. 4-12 second cinematic generations.'}
              {kind === 'model' && 'Text-to-3D. Generates OpenSCAD code + printable STL mesh.'}
            </Text>
          </View>

          <Text style={styles.dataLabel}>PROMPT</Text>
          <TextInput
            value={prompt} onChangeText={setPrompt} multiline numberOfLines={4}
            placeholder={placeholder} placeholderTextColor={COLORS.textMuted}
            style={styles.textarea} testID="prompt-input"
          />

          {kind === 'video' && (
            <>
              <Text style={styles.dataLabel}>DURATION (SEC)</Text>
              <View style={styles.pillRow}>
                {DURATIONS.map((d) => (
                  <TouchableOpacity key={d} style={[styles.pill, duration === d && styles.pillActive]}
                    onPress={() => setDuration(d)} testID={`duration-${d}`}>
                    <Text style={[styles.pillText, duration === d && styles.pillTextActive]}>{d}s</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.dataLabel}>RESOLUTION</Text>
              <View style={styles.pillRow}>
                {SIZES.map((s) => (
                  <TouchableOpacity key={s} style={[styles.pill, size === s && styles.pillActive]}
                    onPress={() => setSize(s)} testID={`size-${s}`}>
                    <Text style={[styles.pillText, size === s && styles.pillTextActive]}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {err ? <Text style={styles.err} testID="create-error">{err}</Text> : null}

          <TouchableOpacity style={styles.btn} onPress={generate} disabled={loading} testID="generate-btn">
            {loading ? (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <ActivityIndicator color="#fff" />
                <Text style={[styles.btnText, { marginLeft: 12 }]}>
                  {kind === 'video' ? 'GENERATING... (2-5 MIN)' : 'FORGING...'}
                </Text>
              </View>
            ) : (
              <Text style={styles.btnText}>▶ FORGE {kind.toUpperCase()}</Text>
            )}
          </TouchableOpacity>

          {kind === 'video' && (
            <Text style={styles.note}>⚠ Video generation may take 2-5 minutes. Please stay on this screen.</Text>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 20, paddingBottom: 60 },
  dataLabel: { color: COLORS.textDim, fontSize: 10, letterSpacing: 2, marginBottom: 6, marginTop: 16 },
  h1: { color: COLORS.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.5, marginBottom: 20 },
  tabs: { flexDirection: 'row', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 4, padding: 4 },
  tab: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, paddingVertical: 10, borderRadius: 2 },
  tabActive: { backgroundColor: COLORS.primary },
  tabText: { color: COLORS.textDim, fontSize: 11, fontWeight: '700', letterSpacing: 1.5 },
  tabTextActive: { color: '#fff' },
  infoCard: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, padding: 14, borderRadius: 4, marginTop: 16 },
  infoModel: { color: COLORS.accent, fontSize: 12, letterSpacing: 2, fontWeight: '700' },
  infoDesc: { color: COLORS.textDim, fontSize: 13, marginTop: 4, lineHeight: 18 },
  textarea: {
    backgroundColor: COLORS.surface, color: COLORS.text, borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 14, paddingVertical: 14, borderRadius: 4, fontSize: 15, minHeight: 110, textAlignVertical: 'top',
  },
  pillRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  pill: { paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: COLORS.border, borderRadius: 3, backgroundColor: COLORS.surface },
  pillActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  pillText: { color: COLORS.textDim, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  pillTextActive: { color: '#fff' },
  btn: { backgroundColor: COLORS.primary, paddingVertical: 18, alignItems: 'center', borderRadius: 4, marginTop: 24 },
  btnText: { color: '#fff', fontWeight: '800', letterSpacing: 2, fontSize: 14 },
  err: { color: COLORS.danger, marginTop: 14, fontSize: 13 },
  note: { color: COLORS.textMuted, fontSize: 12, marginTop: 12, textAlign: 'center' },
});

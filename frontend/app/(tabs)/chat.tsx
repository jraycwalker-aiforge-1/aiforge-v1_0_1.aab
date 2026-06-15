import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api, COLORS, pollJob } from '../../src/api';
import { EnergyLayer, EnergyBox } from '../../src/Energy';

type Msg = { role: 'user' | 'assistant'; text: string; assetId?: string; jobId?: string; kind?: string; };

export default function Chat() {
  const router = useRouter();
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: 'assistant', text: "Hi, I'm your AiForge assistant. Ask me to design a 3D model, generate an image, or make a Sora 2 clip. Try: \"design a 3D phone stand 60mm tall\" or \"generate image of a glowing cyber dragon\"." },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setMsgs((m) => [...m, { role: 'user', text }]);
    setInput('');
    setSending(true);
    try {
      const r: any = await api.chat(text);
      const reply: Msg = { role: 'assistant', text: r.reply, assetId: r.asset_id, jobId: r.job_id, kind: r.kind };
      setMsgs((m) => [...m, reply]);
      // If a job is kicked off, poll for it and update message
      if (r.job_id) {
        pollJob(r.job_id, () => {})
          .then((done: any) => {
            setMsgs((m) => [...m, { role: 'assistant', text: `✓ Done. Tap to view.`, assetId: done.asset_id, kind: r.kind }]);
          })
          .catch((e) => {
            setMsgs((m) => [...m, { role: 'assistant', text: `⚠️ Job failed: ${e.message}` }]);
          });
      }
    } catch (e: any) {
      setMsgs((m) => [...m, { role: 'assistant', text: `⚠️ ${e.message}` }]);
    } finally {
      setSending(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  const tapAsset = (m: Msg) => {
    if (!m.assetId) return;
    if (m.kind === 'model') router.push(`/model/${m.assetId}`);
    else router.push(`/asset/${m.assetId}`);
  };

  return (
    <View style={styles.root}>
      <EnergyLayer>
        <SafeAreaView style={{ flex: 1 }} edges={['top']}>
          <View style={styles.header}>
            <Text style={styles.dataLabel}>ASSISTANT</Text>
            <Text style={styles.h1}>AI Forge</Text>
            <Text style={styles.sub}>Claude Sonnet 4.5 · can also create</Text>
          </View>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }} keyboardVerticalOffset={80}>
            <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll}
              onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}>
              {msgs.map((m, i) => (
                <TouchableOpacity key={i} disabled={!m.assetId} onPress={() => tapAsset(m)} testID={`msg-${i}`}>
                  <EnergyBox
                    style={[styles.bubble, m.role === 'user' ? styles.userBubble : styles.aiBubble]}
                    color={m.role === 'user' ? COLORS.primary : COLORS.energy}
                    intensity={m.role === 'user' ? 0.4 : 0.7}>
                    <Text style={styles.role}>{m.role === 'user' ? 'YOU' : 'AIFORGE'}</Text>
                    <Text style={styles.bubbleText}>{m.text}</Text>
                    {m.assetId && (
                      <View style={styles.openLink}>
                        <Ionicons name="open-outline" size={14} color={COLORS.energy} />
                        <Text style={styles.openLinkText}>OPEN ASSET</Text>
                      </View>
                    )}
                    {m.jobId && !m.assetId && (
                      <Text style={styles.jobNote}>⚡ working...</Text>
                    )}
                  </EnergyBox>
                </TouchableOpacity>
              ))}
              {sending && (
                <View style={styles.typing}>
                  <ActivityIndicator color={COLORS.energy} size="small" />
                  <Text style={styles.typingText}>thinking...</Text>
                </View>
              )}
            </ScrollView>

            <View style={styles.inputRow}>
              <TextInput value={input} onChangeText={setInput} placeholder="Ask, design, generate..."
                placeholderTextColor={COLORS.textMuted} style={styles.input} testID="chat-input"
                onSubmitEditing={send} returnKeyType="send" />
              <TouchableOpacity onPress={send} disabled={sending} testID="chat-send" activeOpacity={0.8}>
                <EnergyBox style={styles.sendBtn} color={COLORS.energy} intensity={1.2}>
                  <Ionicons name="send" size={18} color="#fff" />
                </EnergyBox>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </EnergyLayer>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  header: { padding: 20, paddingBottom: 4 },
  dataLabel: { color: COLORS.textDim, fontSize: 10, letterSpacing: 2, marginBottom: 4 },
  h1: { color: COLORS.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  sub: { color: COLORS.textDim, fontSize: 12, marginTop: 4 },
  scroll: { padding: 16, paddingBottom: 20 },
  bubble: { padding: 12, marginBottom: 12, maxWidth: '88%' },
  userBubble: { alignSelf: 'flex-end', backgroundColor: COLORS.primary + '18' },
  aiBubble: { alignSelf: 'flex-start' },
  role: { color: COLORS.textDim, fontSize: 9, letterSpacing: 2, fontWeight: '700', marginBottom: 6 },
  bubbleText: { color: COLORS.text, fontSize: 14, lineHeight: 20 },
  openLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  openLinkText: { color: COLORS.energy, fontSize: 11, letterSpacing: 1.5, fontWeight: '700' },
  jobNote: { color: COLORS.accent, fontSize: 12, marginTop: 6 },
  typing: { flexDirection: 'row', gap: 8, marginBottom: 10, padding: 12, alignItems: 'center' },
  typingText: { color: COLORS.textDim, fontSize: 12 },
  inputRow: { flexDirection: 'row', gap: 8, padding: 12, borderTopColor: COLORS.border, borderTopWidth: 1, backgroundColor: COLORS.bg },
  input: { flex: 1, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, color: COLORS.text, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 4, fontSize: 14 },
  sendBtn: { width: 46, height: 46, borderRadius: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.primary },
});

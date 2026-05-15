import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/auth';
import { COLORS } from '../../src/api';

export default function Login() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('admin@forgeai.com');
  const [password, setPassword] = useState('Admin@123');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    setErr(null);
    setLoading(true);
    try {
      await login(email.trim(), password);
    } catch (e: any) {
      setErr(e.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} testID="login-screen">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.brandWrap}>
            <View style={styles.logoBox}><Text style={styles.logoMark}>◆</Text></View>
            <Text style={styles.brand}>FORGE<Text style={{ color: COLORS.accent }}>AI</Text></Text>
            <Text style={styles.tag}>AI • Images • Video • 3D</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.h1}>Sign in</Text>
            <Text style={styles.dataLabel}>EMAIL</Text>
            <TextInput
              value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address"
              placeholder="you@forge.ai" placeholderTextColor={COLORS.textMuted}
              style={styles.input} testID="login-email"
            />
            <Text style={styles.dataLabel}>PASSWORD</Text>
            <TextInput
              value={password} onChangeText={setPassword} secureTextEntry
              placeholder="••••••••" placeholderTextColor={COLORS.textMuted}
              style={styles.input} testID="login-password"
            />
            {err ? <Text style={styles.err} testID="login-error">{err}</Text> : null}
            <TouchableOpacity style={styles.btn} onPress={onSubmit} disabled={loading} testID="login-submit">
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>ENTER FORGE</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push('/auth/register')} style={styles.linkRow} testID="goto-register">
              <Text style={styles.linkDim}>New here?</Text>
              <Text style={styles.link}>  Create account →</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  brandWrap: { alignItems: 'center', marginBottom: 40 },
  logoBox: {
    width: 56, height: 56, backgroundColor: COLORS.primary, marginBottom: 16,
    alignItems: 'center', justifyContent: 'center', borderRadius: 2,
    transform: [{ rotate: '45deg' }],
  },
  logoMark: { color: '#fff', fontSize: 22, transform: [{ rotate: '-45deg' }] },
  brand: { color: COLORS.text, fontSize: 32, fontWeight: '800', letterSpacing: -1 },
  tag: { color: COLORS.textDim, marginTop: 6, letterSpacing: 2, fontSize: 11 },
  card: {
    backgroundColor: COLORS.surface, borderColor: COLORS.border, borderWidth: 1,
    padding: 24, borderRadius: 4,
  },
  h1: { color: COLORS.text, fontSize: 22, fontWeight: '700', marginBottom: 20, letterSpacing: -0.5 },
  dataLabel: { color: COLORS.textDim, fontSize: 10, letterSpacing: 2, marginBottom: 6, marginTop: 8 },
  input: {
    backgroundColor: COLORS.bg, color: COLORS.text, borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 14, paddingVertical: 14, borderRadius: 4, fontSize: 15,
  },
  btn: {
    backgroundColor: COLORS.primary, paddingVertical: 16, alignItems: 'center',
    borderRadius: 4, marginTop: 20,
  },
  btnText: { color: '#fff', fontWeight: '700', letterSpacing: 2, fontSize: 13 },
  linkRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 18 },
  linkDim: { color: COLORS.textDim },
  link: { color: COLORS.primary, fontWeight: '600' },
  err: { color: COLORS.danger, marginTop: 10, fontSize: 13 },
});

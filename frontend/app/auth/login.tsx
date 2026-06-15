import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/auth';
import { COLORS } from '../../src/api';
import { EnergyLayer, EnergyBox } from '../../src/Energy';

export default function Login() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('admin@aiforge.app');
  const [password, setPassword] = useState('Admin@123');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    setErr(null); setLoading(true);
    try { await login(email.trim(), password); }
    catch (e: any) { setErr(e.message || 'Login failed'); }
    finally { setLoading(false); }
  };

  return (
    <View style={styles.root}>
      <EnergyLayer>
        <SafeAreaView style={{ flex: 1 }}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
              <View style={styles.brandWrap} pointerEvents="none">
                <View style={styles.logoBox}><Text style={styles.logoMark}>⚡</Text></View>
                <Text style={styles.brand}>Ai<Text style={{ color: COLORS.accent }}>Forge</Text></Text>
                <Text style={styles.tag}>AI · IMAGES · VIDEO · 3D · SLICER</Text>
              </View>

              <EnergyBox style={styles.card} color={COLORS.energy} intensity={1}>
                <Text style={styles.h1}>Enter the forge</Text>
                <Text style={styles.dataLabel}>EMAIL</Text>
                <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address"
                  placeholder="you@aiforge.app" placeholderTextColor={COLORS.textMuted}
                  style={styles.input} testID="login-email" />
                <Text style={styles.dataLabel}>PASSWORD</Text>
                <TextInput value={password} onChangeText={setPassword} secureTextEntry
                  placeholder="••••••••" placeholderTextColor={COLORS.textMuted}
                  style={styles.input} testID="login-password" />
                {err ? <Text style={styles.err} testID="login-error">{err}</Text> : null}
                <TouchableOpacity onPress={onSubmit} disabled={loading} testID="login-submit" activeOpacity={0.8}>
                  <EnergyBox style={styles.btn} color={COLORS.energy} intensity={1.2}>
                    {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>⚡ ENTER FORGE</Text>}
                  </EnergyBox>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => router.push('/auth/register')} style={styles.linkRow} testID="goto-register">
                  <Text style={styles.linkDim}>New here?</Text>
                  <Text style={styles.link}>  Create account →</Text>
                </TouchableOpacity>
              </EnergyBox>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </EnergyLayer>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  brandWrap: { alignItems: 'center', marginBottom: 40 },
  logoBox: {
    width: 64, height: 64, backgroundColor: COLORS.primary, marginBottom: 16,
    alignItems: 'center', justifyContent: 'center', borderRadius: 4,
    transform: [{ rotate: '45deg' }], shadowColor: COLORS.energy, shadowOpacity: 0.9, shadowRadius: 18,
  },
  logoMark: { color: '#fff', fontSize: 26, transform: [{ rotate: '-45deg' }] },
  brand: { color: COLORS.text, fontSize: 36, fontWeight: '900', letterSpacing: -1.2 },
  tag: { color: COLORS.textDim, marginTop: 6, letterSpacing: 2, fontSize: 10 },
  card: { padding: 24 },
  h1: { color: COLORS.text, fontSize: 22, fontWeight: '700', marginBottom: 20, letterSpacing: -0.5 },
  dataLabel: { color: COLORS.textDim, fontSize: 10, letterSpacing: 2, marginBottom: 6, marginTop: 8 },
  input: {
    backgroundColor: COLORS.bg, color: COLORS.text, borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 14, paddingVertical: 14, borderRadius: 4, fontSize: 15,
  },
  btn: { backgroundColor: COLORS.primary, paddingVertical: 16, alignItems: 'center', borderRadius: 4, marginTop: 20 },
  btnText: { color: '#fff', fontWeight: '800', letterSpacing: 2, fontSize: 13 },
  linkRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 18 },
  linkDim: { color: COLORS.textDim },
  link: { color: COLORS.energy, fontWeight: '700' },
  err: { color: COLORS.danger, marginTop: 10, fontSize: 13 },
});

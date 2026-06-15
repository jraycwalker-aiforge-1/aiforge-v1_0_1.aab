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

export default function Register() {
  const { register } = useAuth();
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    setErr(null);
    if (password.length < 6) return setErr('Password must be at least 6 characters.');
    setLoading(true);
    try { await register(email.trim(), password, name.trim()); }
    catch (e: any) { setErr(e.message || 'Registration failed'); }
    finally { setLoading(false); }
  };

  return (
    <View style={styles.root}>
      <EnergyLayer>
        <SafeAreaView style={{ flex: 1 }}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
              <View style={styles.brandWrap} pointerEvents="none">
                <Text style={styles.brand}>CREATE ACCOUNT</Text>
                <Text style={styles.tag}>10 FREE CREDITS · NO CARD</Text>
              </View>
              <EnergyBox style={styles.card} color={COLORS.energy} intensity={1}>
                <Text style={styles.dataLabel}>FULL NAME</Text>
                <TextInput value={name} onChangeText={setName} placeholder="Ada Lovelace" placeholderTextColor={COLORS.textMuted} style={styles.input} testID="register-name" />
                <Text style={styles.dataLabel}>EMAIL</Text>
                <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="you@aiforge.app" placeholderTextColor={COLORS.textMuted} style={styles.input} testID="register-email" />
                <Text style={styles.dataLabel}>PASSWORD</Text>
                <TextInput value={password} onChangeText={setPassword} secureTextEntry placeholder="min. 6 chars" placeholderTextColor={COLORS.textMuted} style={styles.input} testID="register-password" />
                {err ? <Text style={styles.err} testID="register-error">{err}</Text> : null}
                <TouchableOpacity onPress={onSubmit} disabled={loading} testID="register-submit" activeOpacity={0.8}>
                  <EnergyBox style={styles.btn} color={COLORS.energy} intensity={1.2}>
                    {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>⚡ CREATE ACCOUNT</Text>}
                  </EnergyBox>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => router.push('/auth/login')} style={styles.linkRow} testID="goto-login">
                  <Text style={styles.linkDim}>Already have an account?</Text>
                  <Text style={styles.link}>  Sign in →</Text>
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
  brandWrap: { alignItems: 'center', marginBottom: 30 },
  brand: { color: COLORS.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  tag: { color: COLORS.textDim, marginTop: 6, letterSpacing: 2, fontSize: 10 },
  card: { padding: 24 },
  dataLabel: { color: COLORS.textDim, fontSize: 10, letterSpacing: 2, marginBottom: 6, marginTop: 8 },
  input: { backgroundColor: COLORS.bg, color: COLORS.text, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 14, paddingVertical: 14, borderRadius: 4, fontSize: 15 },
  btn: { backgroundColor: COLORS.primary, paddingVertical: 16, alignItems: 'center', borderRadius: 4, marginTop: 20 },
  btnText: { color: '#fff', fontWeight: '800', letterSpacing: 2, fontSize: 13 },
  linkRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 18 },
  linkDim: { color: COLORS.textDim },
  link: { color: COLORS.energy, fontWeight: '700' },
  err: { color: COLORS.danger, marginTop: 10, fontSize: 13 },
});

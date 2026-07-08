import React, { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthProvider, useAuth } from '../src/auth';
import { COLORS } from '../src/api';

function Gate() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  useEffect(() => {
    if (loading) return;
    const inAuth = segments[0] === 'auth';
    if (!user && !inAuth) router.replace('/auth/login');
    else if (user && inAuth) router.replace('/(tabs)');
  }, [user, loading, segments]);

  if (loading) return (
    <View style={styles.center}><ActivityIndicator color={COLORS.energy} size="large" /></View>
  );
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: COLORS.bg }, animation: 'fade' }}>
      <Stack.Screen name="auth/login" />
      <Stack.Screen name="auth/register" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="model/[id]" />
      <Stack.Screen name="asset/[id]" />
            <Stack.Screen name="privacy" />
            <Stack.Screen name="billing" />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <AuthProvider><Gate /></AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.bg },
});

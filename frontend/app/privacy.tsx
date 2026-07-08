import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api, COLORS } from '../src/api';
import { EnergyLayer, EnergyBox } from '../src/Energy';

export default function Privacy() {
  const router = useRouter();
  const [text, setText] = useState<string>('');
  useEffect(() => { api.privacy().then((r: any) => setText(r.policy)).catch(() => setText('Unable to load policy.')); }, []);

  return (
    <View style={styles.root}>
      <EnergyLayer>
        <SafeAreaView style={{ flex: 1 }} edges={['top']}>
          <View style={styles.topBar}>
            <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} testID="back-btn">
              <Ionicons name="chevron-back" color={COLORS.text} size={24} />
            </TouchableOpacity>
            <Text style={styles.title}>PRIVACY</Text>
            <View style={styles.iconBtn} />
          </View>
          <ScrollView contentContainerStyle={styles.content}>
            <EnergyBox style={styles.card} color={COLORS.energy} intensity={0.6}>
              {!text ? <ActivityIndicator color={COLORS.energy} /> :
                <Text style={styles.body} selectable>{text}</Text>}
            </EnergyBox>
          </ScrollView>
        </SafeAreaView>
      </EnergyLayer>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomColor: COLORS.border, borderBottomWidth: 1 },
  title: { color: COLORS.text, letterSpacing: 3, fontWeight: '800', fontSize: 12 },
  iconBtn: { padding: 8, minWidth: 40 },
  content: { padding: 20, paddingBottom: 40 },
  card: { padding: 18 },
  body: { color: COLORS.text, fontSize: 14, lineHeight: 22 },
});

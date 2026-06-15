import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, StyleSheet } from 'react-native';
import { COLORS } from '../../src/api';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.energy,
        tabBarInactiveTintColor: COLORS.textDim,
        tabBarStyle: {
          backgroundColor: COLORS.bg,
          borderTopColor: COLORS.border,
          borderTopWidth: 1,
          height: 86,
          paddingTop: 8,
          paddingBottom: 26,
        },
        tabBarLabelStyle: { fontSize: 9, letterSpacing: 1.8, fontWeight: '700' },
      }}
    >
      <Tabs.Screen name="index"
        options={{ title: 'HOME',
          tabBarIcon: ({ color, size }) => <Ionicons name="grid-outline" color={color} size={size - 2} />,
          tabBarButtonTestID: 'tab-home' }} />
      <Tabs.Screen name="create"
        options={{ title: 'FORGE',
          tabBarIcon: ({ color }) => (
            <View style={styles.createBtn}><Ionicons name="flash" color="#fff" size={26} /></View>
          ),
          tabBarButtonTestID: 'tab-create' }} />
      <Tabs.Screen name="chat"
        options={{ title: 'ASSIST',
          tabBarIcon: ({ color, size }) => <Ionicons name="chatbubbles-outline" color={color} size={size - 2} />,
          tabBarButtonTestID: 'tab-chat' }} />
      <Tabs.Screen name="library"
        options={{ title: 'LIBRARY',
          tabBarIcon: ({ color, size }) => <Ionicons name="folder-open-outline" color={color} size={size - 2} />,
          tabBarButtonTestID: 'tab-library' }} />
      <Tabs.Screen name="profile"
        options={{ title: 'PROFILE',
          tabBarIcon: ({ color, size }) => <Ionicons name="person-circle-outline" color={color} size={size} />,
          tabBarButtonTestID: 'tab-profile' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  createBtn: {
    width: 46, height: 46, borderRadius: 4, alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.primary, marginTop: -4,
    shadowColor: COLORS.energy, shadowOpacity: 0.9, shadowRadius: 12, shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
});

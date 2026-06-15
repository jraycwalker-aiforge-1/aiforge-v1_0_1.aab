import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Alert, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { api, COLORS } from '../../src/api';
import { EnergyLayer, EnergyBox } from '../../src/Energy';
import StlViewer from '../../src/StlViewer';

const MONO: any = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

export default function ModelDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [asset, setAsset] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'preview'|'scad'|'slicer'|'gcode'>('preview');
  const [gcode, setGcode] = useState<string>('');

  useEffect(() => {
    (async () => { try { setAsset(await api.getAsset(String(id))); } finally { setLoading(false); } })();
  }, [id]);

  useEffect(() => {
    if (view === 'gcode' && !gcode && asset) {
      api.gcodePreview(String(id)).then((r: any) => {
        setGcode(r.gcode);
        setAsset((a: any) => ({ ...a, estimate: r.estimate, slicer_settings: r.settings }));
      }).catch((e: any) => Alert.alert('Error', e.message));
    }
  }, [view, asset]);

  const bump = async (key: string, delta: number) => {
    const s = { ...(asset.slicer_settings || {}) };
    if (key === 'supports') s.supports = !s.supports;
    else s[key] = Math.max(0, (s[key] || 0) + delta);
    try { const r: any = await api.updateSlicer(String(id), s); setAsset(r); setGcode(''); }
    catch (e: any) { Alert.alert('Error', e.message); }
  };

  const copyScad = async () => { await Clipboard.setStringAsync(asset.scad_code || ''); Alert.alert('Copied', 'OpenSCAD code copied'); };
  const shareStl = async () => {
    if (Platform.OS === 'web') return Alert.alert('Unavailable', 'STL export on mobile only');
    try {
      const path = FileSystem.cacheDirectory + `aiforge-${asset.id}.stl`;
      await FileSystem.writeAsStringAsync(path, asset.stl_b64, { encoding: FileSystem.EncodingType.Base64 });
      await Sharing.shareAsync(path, { mimeType: 'model/stl', dialogTitle: 'Open STL in slicer' });
    } catch (e: any) { Alert.alert('Export failed', e.message); }
  };
  const onDelete = () => Alert.alert('Delete model?', 'Cannot be undone.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: async () => { await api.deleteAsset(String(id)); router.back(); } },
  ]);

  if (loading) return <View style={[styles.root, styles.center]}><ActivityIndicator color={COLORS.energy} size="large" /></View>;
  if (!asset) return null;

  const s = asset.slicer_settings || {};
  const stats = asset.stats || {};
  const est = asset.estimate || {};
  const dims = stats.dimensions_mm || { x:0,y:0,z:0 };

  return (
    <View style={styles.root}>
      <EnergyLayer>
        <SafeAreaView style={{ flex: 1 }} edges={['top']}>
          <View style={styles.topBar}>
            <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} testID="back-btn">
              <Ionicons name="chevron-back" color={COLORS.text} size={24} />
            </TouchableOpacity>
            <Text style={styles.title} numberOfLines={1}>{asset.name || '3D Model'}</Text>
            <TouchableOpacity onPress={onDelete} style={styles.iconBtn} testID="delete-btn">
              <Ionicons name="trash-outline" color={COLORS.danger} size={20} />
            </TouchableOpacity>
          </View>

          <View style={styles.tabs}>
            {(['preview','scad','slicer','gcode'] as const).map((t) => (
              <TouchableOpacity key={t} style={[styles.tab, view === t && styles.tabActive]}
                onPress={() => setView(t)} testID={`view-${t}`}>
                <Text style={[styles.tabText, view === t && styles.tabTextActive]}>{t.toUpperCase()}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <ScrollView contentContainerStyle={styles.content}>
            {view === 'preview' && (
              <>
                <EnergyBox style={{ borderRadius: 4 }} color={COLORS.accent} intensity={0.9}>
                  <StlViewer stlBase64={asset.stl_b64} height={340} />
                </EnergyBox>

                <View style={styles.statsGrid}>
                  <Stat k="X" v={`${dims.x} mm`} />
                  <Stat k="Y" v={`${dims.y} mm`} />
                  <Stat k="Z" v={`${dims.z} mm`} />
                  <Stat k="TRIS" v={String(stats.triangle_count || 0)} />
                  <Stat k="VERTS" v={String(stats.vertex_count || 0)} />
                  <Stat k="VOL" v={`${stats.volume_mm3 || 0}mm³`} />
                </View>

                <EnergyBox style={styles.estCard} color={COLORS.accent} intensity={0.7}>
                  <Text style={styles.dataLabel}>PRINT ESTIMATE</Text>
                  <View style={styles.estRow}>
                    <Stat k="LAYERS" v={String(est.layers || 0)} />
                    <Stat k="TIME" v={`${est.estimated_time_min || 0}m`} />
                    <Stat k="FILAMENT" v={`${est.filament_length_m || 0}m`} />
                    <Stat k="WEIGHT" v={`${est.filament_grams || 0}g`} />
                  </View>
                </EnergyBox>

                <View style={styles.actions}>
                  <TouchableOpacity style={styles.btnGhost} onPress={copyScad} testID="copy-scad">
                    <Ionicons name="code-slash-outline" color={COLORS.text} size={16} />
                    <Text style={styles.btnGhostText}>COPY SCAD</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={shareStl} testID="export-stl" style={{ flex: 1 }}>
                    <EnergyBox style={styles.btn} color={COLORS.energy} intensity={1}>
                      <Ionicons name="download-outline" color="#fff" size={16} />
                      <Text style={styles.btnText}>EXPORT STL</Text>
                    </EnergyBox>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {view === 'scad' && (
              <EnergyBox style={styles.codeBox} color={COLORS.energy} intensity={0.6}>
                <Text style={styles.codeLabel}>OPENSCAD CODE</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <Text style={styles.code} selectable>{asset.scad_code}</Text>
                </ScrollView>
                <TouchableOpacity style={styles.btn} onPress={copyScad} testID="copy-scad-full">
                  <Ionicons name="copy-outline" color="#fff" size={16} />
                  <Text style={styles.btnText}>COPY TO CLIPBOARD</Text>
                </TouchableOpacity>
              </EnergyBox>
            )}

            {view === 'slicer' && (
              <View>
                <Text style={styles.dataLabel}>SLICER SETTINGS</Text>
                <SlicerRow label="LAYER HEIGHT" unit="mm" value={s.layer_height} onMinus={() => bump('layer_height', -0.05)} onPlus={() => bump('layer_height', 0.05)} testID="layer_height" />
                <SlicerRow label="INFILL" unit="%" value={s.infill_percent} onMinus={() => bump('infill_percent', -5)} onPlus={() => bump('infill_percent', 5)} testID="infill_percent" />
                <SlicerRow label="PRINT SPEED" unit="mm/s" value={s.print_speed} onMinus={() => bump('print_speed', -10)} onPlus={() => bump('print_speed', 10)} testID="print_speed" />
                <SlicerRow label="NOZZLE TEMP" unit="°C" value={s.nozzle_temp} onMinus={() => bump('nozzle_temp', -5)} onPlus={() => bump('nozzle_temp', 5)} testID="nozzle_temp" />
                <SlicerRow label="BED TEMP" unit="°C" value={s.bed_temp} onMinus={() => bump('bed_temp', -5)} onPlus={() => bump('bed_temp', 5)} testID="bed_temp" />
                <View style={styles.toggleRow}>
                  <Text style={styles.toggleLabel}>SUPPORTS</Text>
                  <TouchableOpacity style={[styles.toggle, s.supports && styles.toggleOn]}
                    onPress={() => bump('supports', 0)} testID="toggle-supports">
                    <View style={[styles.toggleDot, s.supports && styles.toggleDotOn]} />
                  </TouchableOpacity>
                </View>
                <EnergyBox style={styles.estCard} color={COLORS.accent} intensity={0.6}>
                  <Text style={styles.dataLabel}>LIVE ESTIMATE</Text>
                  <View style={styles.estRow}>
                    <Stat k="LAYERS" v={String(est.layers || 0)} />
                    <Stat k="TIME" v={`${est.estimated_time_min || 0}m`} />
                    <Stat k="FILAMENT" v={`${est.filament_length_m || 0}m`} />
                  </View>
                </EnergyBox>
              </View>
            )}

            {view === 'gcode' && (
              <EnergyBox style={styles.codeBox} color={COLORS.energy} intensity={0.6}>
                <Text style={styles.codeLabel}>G-CODE PREVIEW</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <Text style={styles.code} selectable>{gcode || 'Loading...'}</Text>
                </ScrollView>
                <TouchableOpacity style={styles.btnGhost} onPress={async () => { await Clipboard.setStringAsync(gcode); Alert.alert('Copied', 'G-code copied'); }} testID="copy-gcode">
                  <Ionicons name="copy-outline" color={COLORS.text} size={16} />
                  <Text style={styles.btnGhostText}>COPY G-CODE</Text>
                </TouchableOpacity>
              </EnergyBox>
            )}
          </ScrollView>
        </SafeAreaView>
      </EnergyLayer>
    </View>
  );
}

function Stat({ k, v }: any) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statK}>{k}</Text>
      <Text style={styles.statV}>{v}</Text>
    </View>
  );
}
function SlicerRow({ label, unit, value, onMinus, onPlus, testID }: any) {
  return (
    <View style={styles.slicerRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.slicerLabel}>{label}</Text>
        <Text style={styles.slicerValue}>{value ?? 0}<Text style={styles.slicerUnit}> {unit}</Text></Text>
      </View>
      <TouchableOpacity style={styles.stepBtn} onPress={onMinus} testID={`${testID}-minus`}><Ionicons name="remove" size={18} color={COLORS.text} /></TouchableOpacity>
      <TouchableOpacity style={styles.stepBtn} onPress={onPlus} testID={`${testID}-plus`}><Ionicons name="add" size={18} color={COLORS.text} /></TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  center: { justifyContent: 'center', alignItems: 'center' },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomColor: COLORS.border, borderBottomWidth: 1 },
  title: { color: COLORS.text, fontWeight: '800', fontSize: 15, flex: 1, textAlign: 'center', marginHorizontal: 8 },
  iconBtn: { padding: 8 },
  tabs: { flexDirection: 'row', borderBottomColor: COLORS.border, borderBottomWidth: 1 },
  tab: { flex: 1, paddingVertical: 14, alignItems: 'center' },
  tabActive: { borderBottomColor: COLORS.energy, borderBottomWidth: 2 },
  tabText: { color: COLORS.textDim, fontSize: 10, fontWeight: '700', letterSpacing: 2 },
  tabTextActive: { color: COLORS.text },
  content: { padding: 20, paddingBottom: 40 },
  dataLabel: { color: COLORS.textDim, fontSize: 10, letterSpacing: 2, marginBottom: 8, marginTop: 8 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  stat: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, padding: 10, borderRadius: 3, minWidth: 80, flexGrow: 1 },
  statK: { color: COLORS.textDim, fontSize: 9, letterSpacing: 1.5, fontWeight: '700' },
  statV: { color: COLORS.text, fontSize: 15, fontWeight: '700', marginTop: 4, fontFamily: MONO },
  estCard: { marginTop: 16, padding: 14 },
  estRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  btnGhost: { flex: 1, flexDirection: 'row', gap: 8, justifyContent: 'center', padding: 14, borderWidth: 1, borderColor: COLORS.border, borderRadius: 4, backgroundColor: COLORS.surface },
  btnGhostText: { color: COLORS.text, fontWeight: '700', letterSpacing: 1.5, fontSize: 12 },
  btn: { flexDirection: 'row', gap: 8, justifyContent: 'center', alignItems: 'center', padding: 14, borderRadius: 4, backgroundColor: COLORS.primary, marginTop: 12 },
  btnText: { color: '#fff', fontWeight: '800', letterSpacing: 1.5, fontSize: 12 },
  codeBox: { padding: 12 },
  codeLabel: { color: COLORS.energy, fontSize: 10, letterSpacing: 2, marginBottom: 10, fontWeight: '700' },
  code: { color: '#E4E4E7', fontFamily: MONO, fontSize: 12, lineHeight: 18 },
  slicerRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, padding: 14, borderRadius: 4, marginBottom: 8, gap: 10 },
  slicerLabel: { color: COLORS.textDim, fontSize: 10, letterSpacing: 1.5, fontWeight: '700' },
  slicerValue: { color: COLORS.text, fontSize: 22, fontFamily: MONO, fontWeight: '700', marginTop: 4 },
  slicerUnit: { color: COLORS.textDim, fontSize: 13 },
  stepBtn: { width: 38, height: 38, backgroundColor: COLORS.bg, borderWidth: 1, borderColor: COLORS.border, borderRadius: 3, alignItems: 'center', justifyContent: 'center' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, padding: 14, borderRadius: 4, marginBottom: 8 },
  toggleLabel: { color: COLORS.text, fontWeight: '700', letterSpacing: 1.5, fontSize: 12 },
  toggle: { width: 48, height: 28, borderRadius: 14, backgroundColor: COLORS.bg, borderWidth: 1, borderColor: COLORS.border, padding: 2 },
  toggleOn: { backgroundColor: COLORS.energy + '55', borderColor: COLORS.energy },
  toggleDot: { width: 22, height: 22, borderRadius: 11, backgroundColor: COLORS.textDim },
  toggleDotOn: { backgroundColor: COLORS.energy, marginLeft: 20 },
});

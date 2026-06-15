import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Dimensions, GestureResponderEvent, Pressable } from 'react-native';
import Svg, { Polyline, Circle, Line } from 'react-native-svg';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence, Easing,
} from 'react-native-reanimated';
import { COLORS } from './api';

const { width: W, height: H } = Dimensions.get('window');

type Bolt = { id: number; points: string; opacity: any; color: string };

// recursive fractal bolt — midpoint displacement
function fractalBolt(x1: number, y1: number, x2: number, y2: number, displace: number, detail = 5): string {
  if (detail <= 0) return `${x1},${y1} ${x2},${y2}`;
  const mx = (x1 + x2) / 2 + (Math.random() - 0.5) * displace;
  const my = (y1 + y2) / 2 + (Math.random() - 0.5) * displace;
  const a = fractalBolt(x1, y1, mx, my, displace / 2, detail - 1);
  const b = fractalBolt(mx, my, x2, y2, displace / 2, detail - 1);
  // strip duplicate middle point
  return a + ' ' + b.split(' ').slice(1).join(' ');
}

function Star({ x, y, size, delay }: any) {
  const opacity = useSharedValue(0.2);
  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.9, { duration: 2500 + Math.random() * 2500, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.2, { duration: 2500 + Math.random() * 2500 }),
      ), -1, true,
    );
  }, []);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View style={[
      { position: 'absolute', left: x, top: y, width: size, height: size,
        borderRadius: size / 2, backgroundColor: '#fff' }, style,
    ]} />
  );
}

const STARS = Array.from({ length: 60 }).map((_, i) => ({
  id: i, x: Math.random() * W, y: Math.random() * H,
  size: Math.random() * 1.6 + 0.4, delay: Math.random() * 5000,
}));

export function EnergyLayer({ children, interactive = true }: { children?: React.ReactNode; interactive?: boolean }) {
  const [bolts, setBolts] = useState<Bolt[]>([]);
  const idRef = useRef(0);
  const flash = useSharedValue(0);

  // Ambient drifting bolt every few seconds (background energy)
  useEffect(() => {
    const tick = () => {
      const startX = Math.random() * W;
      const endX = Math.random() * W;
      const points = fractalBolt(startX, -10, endX, H + 10, 80, 5);
      const id = ++idRef.current;
      setBolts((b) => [...b, { id, points, opacity: 0.35, color: COLORS.energy }]);
      setTimeout(() => setBolts((b) => b.filter((x) => x.id !== id)), 700);
    };
    const i = setInterval(tick, 3500 + Math.random() * 2500);
    return () => clearInterval(i);
  }, []);

  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));

  const strike = (x: number, y: number) => {
    flash.value = withSequence(withTiming(0.35, { duration: 60 }), withTiming(0, { duration: 240 }));
    // 4 bolts radiating from edges to (x, y)
    const newBolts: Bolt[] = [];
    const starts = [
      [Math.random() * W, -10], [Math.random() * W, H + 10],
      [-10, Math.random() * H], [W + 10, Math.random() * H],
    ];
    starts.forEach(([sx, sy], i) => {
      newBolts.push({
        id: ++idRef.current,
        points: fractalBolt(sx, sy, x, y, 60, 5),
        opacity: 1,
        color: i % 2 === 0 ? COLORS.energy : COLORS.energyAlt,
      });
    });
    setBolts((b) => [...b, ...newBolts]);
    const ids = newBolts.map((n) => n.id);
    setTimeout(() => setBolts((b) => b.filter((x) => !ids.includes(x.id))), 500);
  };

  const onTouch = (e: GestureResponderEvent) => {
    const { pageX, pageY } = e.nativeEvent;
    strike(pageX, pageY);
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={interactive ? 'box-none' : 'none'}>
      {/* Starfield background */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: COLORS.bg }]} />
      <Svg width={W} height={H} style={StyleSheet.absoluteFill} pointerEvents="none">
        {STARS.map((s) => (
          // SVG circles for crisp tiny stars (animation handled by RN Animated views below)
          <Circle key={s.id} cx={s.x} cy={s.y} r={s.size} fill="#FFFFFF" opacity={0.4} />
        ))}
      </Svg>
      {STARS.map((s) => <Star key={`s-${s.id}`} {...s} />)}

      {/* Lightning bolts */}
      <Svg width={W} height={H} style={StyleSheet.absoluteFill} pointerEvents="none">
        {bolts.map((b) => (
          <Polyline
            key={b.id}
            points={b.points}
            stroke={b.color}
            strokeWidth={1.4}
            fill="none"
            opacity={b.opacity}
          />
        ))}
      </Svg>

      {/* Flash overlay */}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: COLORS.energy }, flashStyle]}
      />

      {/* Touch capture sits BEHIND children so buttons still get taps */}
      {interactive && (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPressIn={onTouch}
        />
      )}

      {children}
    </View>
  );
}

// Glowing animated border for cards / boxes
export function EnergyBox({ children, style, color = COLORS.primary, intensity = 1 }: any) {
  const glow = useSharedValue(0.4);
  useEffect(() => {
    glow.value = withRepeat(
      withSequence(
        withTiming(0.85, { duration: 1600, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.4, { duration: 1600 }),
      ), -1, true,
    );
  }, []);
  const aStyle = useAnimatedStyle(() => ({
    shadowOpacity: glow.value * intensity,
    borderColor: color + Math.floor(glow.value * 200).toString(16).padStart(2, '0'),
  }));
  return (
    <Animated.View
      style={[
        {
          borderWidth: 1,
          borderRadius: 4,
          backgroundColor: COLORS.surface,
          shadowColor: color,
          shadowOffset: { width: 0, height: 0 },
          shadowRadius: 18,
          elevation: 6,
        },
        aStyle,
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
}

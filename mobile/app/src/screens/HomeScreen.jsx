import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { formatCountdown, formatRelative, getPlatform } from '../../../../core/index.js';
import { theme } from '../theme.js';

/** Status, what you have written, and the way in to writing more. */
export default function HomeScreen({ gate, onWrite, onSettings }) {
  const { snapshot } = gate;
  const { status, stats, journal } = snapshot;

  const label = status === 'unlocked' ? 'Feeds are open'
    : status === 'pending' ? 'Waiting on your post'
      : 'Feeds are locked';
  const dot = status === 'unlocked' ? theme.good : status === 'pending' ? theme.warn : theme.bad;

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.header}>
        <Text style={styles.title}>Free Radicals</Text>
        <Pressable onPress={onSettings} hitSlop={12}>
          <Text style={styles.link}>Settings</Text>
        </Pressable>
      </View>

      <View style={styles.status}>
        <View style={[styles.dot, { backgroundColor: dot }]} />
        <Text style={styles.statusText}>{label}</Text>
        {status === 'unlocked' ? (
          <Text style={[styles.clock, snapshot.warning && styles.clockWarn]}>
            {formatCountdown(snapshot.remainingMs)}
          </Text>
        ) : null}
      </View>

      {status === 'unlocked' ? (
        <Pressable style={styles.ghost} onPress={gate.lockNow}>
          <Text style={styles.ghostText}>Lock feeds now</Text>
        </Pressable>
      ) : (
        <Pressable style={styles.primary} onPress={onWrite}>
          <Text style={styles.primaryText}>Write something</Text>
        </Pressable>
      )}

      <View style={styles.stats}>
        <Stat value={stats.today} label="today" />
        <Stat value={stats.streak} label="day streak" />
        <Stat value={stats.week} label="this week" />
        <Stat value={stats.words} label="words" />
      </View>

      <Text style={styles.section}>RECENTLY WRITTEN</Text>
      {journal.length === 0 ? (
        <Text style={styles.empty}>Nothing yet. The first post is the hard one.</Text>
      ) : journal.slice(0, 10).map((entry) => {
        const platform = getPlatform(entry.platformId);
        return (
          <View key={entry.id} style={styles.entry}>
            <Text style={styles.entryText}>{entry.text}</Text>
            <Text style={styles.entryWhen}>
              {formatRelative(entry.at, snapshot.now)}
              {platform ? ` · ${platform.name}` : ''}
              {entry.verified ? ' · published' : ''}
            </Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

function Stat({ value, label }) {
  return (
    <View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: 20, gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: theme.text, fontSize: 22, fontWeight: '700', letterSpacing: -0.3 },
  link: { color: theme.muted, fontSize: 14 },
  status: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: theme.panel, borderColor: theme.line, borderWidth: 1,
    borderRadius: 12, padding: 14,
  },
  dot: { width: 9, height: 9, borderRadius: 999 },
  statusText: { color: theme.text, fontSize: 15, flex: 1 },
  clock: { color: theme.text, fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  clockWarn: { color: theme.bad },
  primary: { backgroundColor: theme.accent, borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  primaryText: { color: theme.bg, fontSize: 16, fontWeight: '600' },
  ghost: {
    borderRadius: 12, paddingVertical: 14, alignItems: 'center',
    borderWidth: 1, borderColor: theme.line,
  },
  ghostText: { color: theme.muted, fontSize: 15 },
  stats: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  statValue: { color: theme.text, fontSize: 20, fontWeight: '700' },
  statLabel: { color: theme.muted, fontSize: 12 },
  section: {
    color: theme.muted, fontSize: 12, letterSpacing: 1.6, fontWeight: '600', marginTop: 8,
  },
  empty: { color: theme.muted, fontSize: 14 },
  entry: { borderTopWidth: 1, borderTopColor: theme.line, paddingVertical: 10 },
  entryText: { color: theme.text, fontSize: 14, lineHeight: 20 },
  entryWhen: { color: theme.muted, fontSize: 12, marginTop: 4 },
});

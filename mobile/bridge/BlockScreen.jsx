import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { formatCountdown, getPlatform, pickQuote } from '../../core/index.js';

/**
 * The mobile block screen. Deliberately a near line-for-line translation of
 * extension/content/overlay.js: same snapshot in, same states out
 * (locked / pending / unlocked), same copy. Only the rendering primitives
 * differ, which is the point of keeping every decision in core/.
 *
 * On Android this is hosted by an activity the overlay service launches when a
 * blocked app comes to the foreground. On iOS it is the screen the Screen Time
 * shield's "unblock" button opens. See mobile/README.md.
 */
export function BlockScreen({ snapshot, onSubmit, onOpenComposer, onOverride, appId }) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const { settings, stats, status } = snapshot;
  const platform = getPlatform(snapshot.session?.platformId) || null;
  const name = platform ? platform.name : appLabel(appId);
  const accent = platform ? platform.accent : '#7c8cff';
  const long = text.trim().length >= settings.minChars;

  async function submit() {
    if (busy || !long) return;
    setBusy(true);
    setError('');
    try {
      const res = await onSubmit(text, platform ? platform.id : null);
      if (res && res.ok === false) setError(res.message);
      else setText('');
    } finally {
      setBusy(false);
    }
  }

  if (status === 'pending') {
    return (
      <View style={styles.screen}>
        <View style={styles.row}>
          <ActivityIndicator color={accent} />
          <Text style={styles.waiting}>Waiting for your post to appear on {name}…</Text>
        </View>
        <Text style={styles.echo}>{snapshot.journal[0]?.text}</Text>
        <Pressable style={[styles.primary, { backgroundColor: accent }]} onPress={onOpenComposer}>
          <Text style={styles.primaryText}>Open {name}'s composer</Text>
        </Pressable>
        {snapshot.proofOverrideAvailable ? (
          <Pressable style={styles.ghost} onPress={onOverride}>
            <Text style={styles.ghostText}>I posted it anyway</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  const quote = settings.showQuotes ? pickQuote(snapshot.now) : null;

  return (
    <View style={styles.screen}>
      <Text style={[styles.eyebrow, { color: accent }]}>{name.toUpperCase()} IS LOCKED</Text>
      <Text style={styles.title}>Post before you scroll.</Text>
      <Text style={styles.lede}>
        Write something worth publishing. Posting it opens {name} for{' '}
        {settings.unlockMinutes} minutes — when the timer runs out, it closes and you write again.
      </Text>

      <TextInput
        style={styles.input}
        value={text}
        onChangeText={(v) => { setText(v); setError(''); }}
        placeholder="What are you working on? What did you just learn?"
        placeholderTextColor="#5c6478"
        multiline
        autoFocus
      />

      <View style={styles.meta}>
        <Text style={[styles.count, long && styles.countOk]}>
          {text.trim().length} / {settings.minChars}
        </Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>

      <Pressable
        style={[styles.primary, { backgroundColor: accent }, !long && styles.disabled]}
        onPress={submit}
        disabled={!long || busy}
      >
        <Text style={styles.primaryText}>
          Post &amp; open for {formatCountdown(settings.unlockMinutes * 60_000)}
        </Text>
      </Pressable>

      <View style={styles.stats}>
        <Text style={styles.stat}><Text style={styles.statNum}>{stats.today}</Text> today</Text>
        <Text style={styles.stat}><Text style={styles.statNum}>{stats.streak}</Text> day streak</Text>
        <Text style={styles.stat}><Text style={styles.statNum}>{stats.words}</Text> words</Text>
      </View>

      {quote ? <Text style={styles.quote}>“{quote.text}” — {quote.by}</Text> : null}
    </View>
  );
}

function appLabel(appId) {
  return appId ? String(appId).split('.').pop() : 'This feed';
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0b0d12', padding: 24, gap: 16, justifyContent: 'center' },
  eyebrow: { fontSize: 12, letterSpacing: 2, fontWeight: '600' },
  title: { color: '#f4f4f5', fontSize: 28, fontWeight: '700', letterSpacing: -0.5 },
  lede: { color: '#a8b0c2', fontSize: 15, lineHeight: 23 },
  input: {
    minHeight: 150, borderRadius: 14, backgroundColor: '#12151d',
    borderWidth: 1, borderColor: '#262b38', color: '#f4f4f5',
    padding: 16, fontSize: 16, textAlignVertical: 'top',
  },
  meta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  count: { color: '#6f7789', fontSize: 13 },
  countOk: { color: '#4ade80' },
  error: { color: '#fca5a5', fontSize: 13, flexShrink: 1, textAlign: 'right' },
  primary: { borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  primaryText: { color: '#0b0d12', fontSize: 16, fontWeight: '600' },
  disabled: { opacity: 0.45 },
  ghost: { borderRadius: 12, paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: '#2a3040' },
  ghostText: { color: '#a8b0c2', fontSize: 15 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  waiting: { color: '#d4d8e2', fontSize: 16, flexShrink: 1 },
  echo: {
    color: '#a8b0c2', backgroundColor: '#12151d', borderRadius: 12,
    borderWidth: 1, borderColor: '#262b38', padding: 14, fontSize: 14,
  },
  stats: { flexDirection: 'row', gap: 18, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#1e232f' },
  stat: { color: '#8b93a7', fontSize: 13 },
  statNum: { color: '#f4f4f5', fontWeight: '700' },
  quote: { color: '#7b8397', fontSize: 13, fontStyle: 'italic', lineHeight: 20 },
});

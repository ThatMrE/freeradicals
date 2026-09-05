import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BlockScreen } from '../../../bridge/BlockScreen.jsx';
import { theme } from '../theme.js';

/**
 * Writing from inside the app, rather than because a feed was blocked.
 *
 * It is the same BlockScreen component: the deal is identical whether you
 * arrived deliberately or were stopped on your way into Instagram, and having
 * one component means the two can never quote different prices.
 */
export default function WriteScreen({ gate, onDone }) {
  const { snapshot } = gate;

  return (
    <View style={styles.root}>
      <Pressable onPress={onDone} hitSlop={12} style={styles.back}>
        <Text style={styles.backText}>← Back</Text>
      </Pressable>

      <BlockScreen
        snapshot={snapshot}
        onSubmit={async (text, platformId) => {
          const result = await gate.submitPost(text, platformId);
          if (result && result.ok !== false) onDone();
          return result;
        }}
        onOverride={gate.overrideProof}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  back: { paddingHorizontal: 20, paddingTop: 12 },
  backText: { color: theme.muted, fontSize: 15 },
});

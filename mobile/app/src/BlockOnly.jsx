import React from 'react';
import { Linking, SafeAreaView, StatusBar, StyleSheet } from 'react-native';

import { getPlatform } from '../../../core/index.js';
import { composeIntent } from '../../bridge/appIds.js';
import { BlockScreen } from '../../bridge/BlockScreen.jsx';
import { useGate } from '../../bridge/useGate.js';
import { gateBridge } from './native.js';
import { theme } from './theme.js';

/**
 * The block screen on its own, with no app chrome around it.
 *
 * This is what Android's overlay service hosts when a blocked app comes to the
 * foreground, and where iOS's Screen Time shield sends the user when they press
 * its button. It renders the same component the ordinary app uses to compose,
 * so there is one block screen, not two that drift.
 */
export default function BlockOnly(props) {
  const gate = useGate({ native: gateBridge });

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={theme.bg} />
      <BlockScreen
        snapshot={gate.snapshot}
        appId={props.appId}
        onSubmit={gate.submitPost}
        onOpenComposer={() => openComposer(gate.snapshot)}
        onOverride={gate.overrideProof}
      />
    </SafeAreaView>
  );
}

/**
 * Hand the user off to the platform's own composer. Networks without a
 * published scheme (Facebook, Instagram) return null rather than a dead link,
 * so nothing is opened and the button simply does not appear.
 */
async function openComposer(snapshot) {
  const platform = getPlatform(snapshot.session && snapshot.session.platformId);
  const draft = snapshot.journal[0] ? snapshot.journal[0].text : '';
  const url = composeIntent(platform, draft);
  if (!url) return;
  if (await Linking.canOpenURL(url)) Linking.openURL(url);
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
});

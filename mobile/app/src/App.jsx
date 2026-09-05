import React, { useState } from 'react';
import { SafeAreaView, StatusBar, StyleSheet } from 'react-native';

import { useGate } from '../../bridge/useGate.js';
import { gateBridge } from './native.js';
import HomeScreen from './screens/HomeScreen.jsx';
import SettingsScreen from './screens/SettingsScreen.jsx';
import WriteScreen from './screens/WriteScreen.jsx';
import { theme } from './theme.js';

/**
 * The whole app. Three screens and no router: a stack of two would be a
 * dependency and a build step for something `useState` says in one line.
 *
 * `useGate` is the same hook the block screen uses, over the same core gate the
 * browser extension runs. Nothing about the rules lives here.
 */
export default function App() {
  const gate = useGate({ native: gateBridge });
  const [screen, setScreen] = useState('home');

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={theme.bg} />
      {screen === 'home' && (
        <HomeScreen gate={gate} onWrite={() => setScreen('write')} onSettings={() => setScreen('settings')} />
      )}
      {screen === 'write' && <WriteScreen gate={gate} onDone={() => setScreen('home')} />}
      {screen === 'settings' && <SettingsScreen gate={gate} onBack={() => setScreen('home')} />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
});

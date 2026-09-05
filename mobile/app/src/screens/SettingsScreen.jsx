import React, { useCallback, useEffect, useState } from 'react';
import {
  Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View,
} from 'react-native';

import { PLATFORMS, isPlatformEnabled } from '../../../../core/index.js';
import { android, enforcementRequirements, hasNativeModule, ios } from '../native.js';
import { theme } from '../theme.js';

/**
 * The same settings as the extension, plus the part that has no browser
 * equivalent: the OS permissions without which nothing can be blocked at all.
 *
 * Those are surfaced first and honestly. An app that silently fails to block
 * because the user never granted usage access is worse than one that says so.
 */
export default function SettingsScreen({ gate, onBack }) {
  const { settings } = gate.snapshot;
  const [permissions, setPermissions] = useState({ usageAccess: false, overlay: false, screenTime: false });

  const refresh = useCallback(async () => {
    if (Platform.OS === 'android') setPermissions(await android.permissions());
    else setPermissions({ screenTime: await ios.isAuthorized() });
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const grant = (key) => {
    if (key === 'usageAccess') android.openUsageAccessSettings();
    else if (key === 'overlay') android.openOverlaySettings();
    else if (key === 'screenTime') ios.requestAuthorization().then(refresh);
  };

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Pressable onPress={onBack} hitSlop={12}><Text style={styles.link}>← Back</Text></Pressable>
      <Text style={styles.title}>Settings</Text>

      <Text style={styles.section}>ENFORCEMENT</Text>
      {!hasNativeModule ? (
        <Text style={styles.warning}>
          The native module is not loaded, so nothing can be blocked. This is a JavaScript-only run.
        </Text>
      ) : null}
      {enforcementRequirements().map((req) => (
        <View key={req.key} style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>{req.label}</Text>
            <Text style={styles.rowDetail}>{req.detail}</Text>
          </View>
          {permissions[req.key] ? (
            <Text style={styles.granted}>granted</Text>
          ) : (
            <Pressable style={styles.small} onPress={() => grant(req.key)}>
              <Text style={styles.smallText}>Grant</Text>
            </Pressable>
          )}
        </View>
      ))}
      {Platform.OS === 'ios' ? (
        <Pressable style={styles.ghost} onPress={ios.presentAppPicker}>
          <Text style={styles.ghostText}>Choose apps to block</Text>
        </Pressable>
      ) : null}

      <Text style={styles.section}>THE DEAL</Text>
      <NumberField
        label="Base window"
        detail="What a post that just clears the minimum buys, in minutes."
        value={settings.unlockMinutes}
        onChange={(v) => gate.updateSettings({ unlockMinutes: v })}
      />
      <NumberField
        label="Minimum length"
        detail="Characters required before you can post."
        value={settings.minChars}
        onChange={(v) => gate.updateSettings({ minChars: v })}
      />
      <Toggle
        label="Earn a longer window by writing more"
        detail={`Every ${settings.earnPerChars} characters past the minimum buys another minute, up to ${settings.maxUnlockMinutes}.`}
        value={settings.durationMode === 'earned'}
        onChange={(on) => gate.updateSettings({ durationMode: on ? 'earned' : 'fixed' })}
      />
      <Toggle
        label="Refuse repeats"
        detail="The same text cannot buy a second window."
        value={settings.blockDuplicatePosts}
        onChange={(v) => gate.updateSettings({ blockDuplicatePosts: v })}
      />

      <Text style={styles.section}>WHERE IT APPLIES</Text>
      {PLATFORMS.map((p) => (
        <Toggle
          key={p.id}
          label={p.name}
          value={isPlatformEnabled(settings, p.id)}
          onChange={(on) => gate.updateSettings({
            platformOverrides: { ...settings.platformOverrides, [p.id]: on },
          })}
        />
      ))}
    </ScrollView>
  );
}

function Toggle({ label, detail, value, onChange }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{label}</Text>
        {detail ? <Text style={styles.rowDetail}>{detail}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: theme.accent }} />
    </View>
  );
}

function NumberField({ label, detail, value, onChange }) {
  const [text, setText] = useState(String(value));
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{label}</Text>
        {detail ? <Text style={styles.rowDetail}>{detail}</Text> : null}
      </View>
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={setText}
        onEndEditing={() => onChange(Number.parseInt(text, 10) || value)}
        keyboardType="number-pad"
        returnKeyType="done"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: 20, gap: 4, paddingBottom: 60 },
  title: { color: theme.text, fontSize: 22, fontWeight: '700', marginBottom: 8 },
  link: { color: theme.muted, fontSize: 15, marginBottom: 12 },
  section: {
    color: theme.muted, fontSize: 12, letterSpacing: 1.6, fontWeight: '600',
    marginTop: 22, marginBottom: 6,
  },
  warning: {
    color: theme.warn, fontSize: 13, lineHeight: 19, paddingVertical: 8,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderTopWidth: 1, borderTopColor: theme.line, paddingVertical: 12,
  },
  rowText: { flex: 1 },
  rowTitle: { color: theme.text, fontSize: 15, fontWeight: '500' },
  rowDetail: { color: theme.muted, fontSize: 12.5, lineHeight: 18, marginTop: 2 },
  granted: { color: theme.good, fontSize: 13 },
  small: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
    borderWidth: 1, borderColor: theme.line,
  },
  smallText: { color: theme.text, fontSize: 13 },
  ghost: {
    borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 12,
    borderWidth: 1, borderColor: theme.line,
  },
  ghostText: { color: theme.muted, fontSize: 15 },
  input: {
    width: 74, textAlign: 'center', color: theme.text, fontSize: 15,
    backgroundColor: theme.panel, borderColor: theme.line, borderWidth: 1,
    borderRadius: 10, paddingVertical: 8,
  },
});

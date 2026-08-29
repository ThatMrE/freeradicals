import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * core/storage.js implemented on React Native's AsyncStorage.
 *
 * Two details matter for the port:
 *
 * 1. AsyncStorage has no change notifications, so this adapter keeps its own
 *    in-process listener set. That is enough: on mobile there is exactly one
 *    JS context, unlike the extension where several tabs share storage.
 * 2. Values are JSON round-tripped, which is why core keeps every stored shape
 *    (settings, session, journal) plain-JSON with no class instances.
 */
const PREFIX = '@freeradicals/';

export function createAsyncStorageAdapter() {
  const listeners = new Set();

  return {
    async get(keys) {
      const list = Array.isArray(keys) ? keys : [keys];
      const pairs = await AsyncStorage.multiGet(list.map((k) => PREFIX + k));
      const out = {};
      for (const [key, value] of pairs) {
        if (value == null) continue;
        try { out[key.slice(PREFIX.length)] = JSON.parse(value); } catch { /* skip corrupt */ }
      }
      return out;
    },

    async set(patch) {
      const entries = Object.entries(patch);
      await AsyncStorage.multiSet(entries.map(([k, v]) => [PREFIX + k, JSON.stringify(v ?? null)]));
      const keys = entries.map(([k]) => k);
      for (const fn of listeners) fn(keys);
    },

    async remove(keys) {
      const list = Array.isArray(keys) ? keys : [keys];
      await AsyncStorage.multiRemove(list.map((k) => PREFIX + k));
      for (const fn of listeners) fn(list);
    },

    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

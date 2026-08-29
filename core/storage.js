/**
 * Storage contract every platform implements.
 *
 *   get(keys: string[]) -> Promise<object>
 *   set(patch: object)  -> Promise<void>
 *   subscribe(fn)       -> unsubscribe    // fn(changedKeys: string[])
 *
 * Chrome  -> chrome.storage.local (+ chrome.storage.onChanged)
 * Android -> DataStore / SharedPreferences
 * iOS     -> UserDefaults in the App Group shared with the shield extension
 * RN      -> AsyncStorage (see mobile/bridge/asyncStorageAdapter.js)
 */

/** In-memory implementation. Used by the tests and by mobile previews. */
export function createMemoryStorage(initial = {}) {
  let data = { ...initial };
  const listeners = new Set();
  return {
    async get(keys) {
      const list = Array.isArray(keys) ? keys : Object.keys(data);
      const out = {};
      for (const k of list) if (k in data) out[k] = data[k];
      return JSON.parse(JSON.stringify(out));
    },
    async set(patch) {
      data = { ...data, ...JSON.parse(JSON.stringify(patch)) };
      const keys = Object.keys(patch);
      for (const fn of listeners) fn(keys);
    },
    async remove(keys) {
      const list = Array.isArray(keys) ? keys : [keys];
      for (const k of list) delete data[k];
      for (const fn of listeners) fn(list);
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

/**
 * core/storage.js implemented over chrome.storage.local.
 *
 * chrome.storage.onChanged fires in every context — service worker, each tab's
 * content script, the popup — which is what lets every surface stay in sync
 * without any of them talking to each other.
 */
export function createChromeStorage(area = 'local') {
  const store = chrome.storage[area];
  return {
    async get(keys) {
      return store.get(keys);
    },
    async set(patch) {
      return store.set(patch);
    },
    async remove(keys) {
      return store.remove(keys);
    },
    subscribe(fn) {
      const handler = (changes, changedArea) => {
        if (changedArea !== area) return;
        fn(Object.keys(changes));
      };
      chrome.storage.onChanged.addListener(handler);
      return () => chrome.storage.onChanged.removeListener(handler);
    },
  };
}

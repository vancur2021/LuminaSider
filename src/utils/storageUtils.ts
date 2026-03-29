import * as idb from 'idb-keyval';

export interface StorageSize {
  indexedDb: number;    // bytes
  chromeStorage: number; // bytes
  total: number;         // bytes
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export async function calculateStorageSize(): Promise<StorageSize> {
  // Calculate IndexedDB size by iterating all keys
  let indexedDbSize = 0;
  try {
    const keys = await idb.keys();
    for (const key of keys) {
      const value = await idb.get(key);
      if (value !== undefined && value !== null) {
        const str = typeof value === 'string' ? value : JSON.stringify(value);
        indexedDbSize += new TextEncoder().encode(str).length;
      }
    }
  } catch (e) {
    console.error('Failed to calculate IndexedDB size:', e);
  }

  // Calculate chrome.storage.local size
  let chromeStorageSize = 0;
  try {
    const items = await chrome.storage.local.get(null);
    const str = JSON.stringify(items);
    chromeStorageSize = new TextEncoder().encode(str).length;
  } catch (e) {
    console.error('Failed to calculate chrome.storage.local size:', e);
  }

  return {
    indexedDb: indexedDbSize,
    chromeStorage: chromeStorageSize,
    total: indexedDbSize + chromeStorageSize,
  };
}

/**
 * Clears all page snapshots and attachment blobs from IndexedDB.
 * Does NOT clear API keys or settings from chrome.storage.local.
 */
export async function clearIndexedDbCache(): Promise<void> {
  try {
    const keys = await idb.keys();
    const cacheKeys = (keys as IDBValidKey[]).filter((key: IDBValidKey) => {
      const k = String(key);
      return k.startsWith('context_snapshot_') || k.startsWith('attachment_');
    });
    await Promise.all(cacheKeys.map((key: IDBValidKey) => idb.del(key)));
  } catch (e) {
    console.error('Failed to clear IndexedDB cache:', e);
  }
}

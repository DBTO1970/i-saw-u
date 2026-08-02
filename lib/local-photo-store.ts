type StoredLivePhotoAsset = {
  id: string;
  blob: Blob;
  fileName: string;
  mimeType: string;
  createdAt: string;
};

const DB_NAME = 'iSawULiveMode';
const DB_VERSION = 1;
const STORE_NAME = 'livePhotoAssets';

function ensureIndexedDbAvailable() {
  if (typeof indexedDB === 'undefined') {
    throw new Error('IndexedDB is not available in this browser context.');
  }
}

function createAssetId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `live-asset-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function openDatabase(): Promise<IDBDatabase> {
  ensureIndexedDbAvailable();

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB.'));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  runner: (store: IDBObjectStore, resolve: (value: T) => void, reject: (error: Error) => void) => void,
): Promise<T> {
  const db = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);

    tx.onabort = () => {
      reject(tx.error || new Error('IndexedDB transaction aborted.'));
      db.close();
    };
    tx.onerror = () => {
      reject(tx.error || new Error('IndexedDB transaction failed.'));
      db.close();
    };
    tx.oncomplete = () => db.close();

    runner(store, resolve, reject);
  });
}

export async function saveLivePhotoAsset(blob: Blob, fileName: string, mimeType: string): Promise<string> {
  const id = createAssetId();
  const asset: StoredLivePhotoAsset = {
    id,
    blob,
    fileName,
    mimeType,
    createdAt: new Date().toISOString(),
  };

  await withStore<void>('readwrite', (store, resolve, reject) => {
    const request = store.put(asset);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error('Failed to persist live photo asset.'));
  });

  return id;
}

export async function readLivePhotoAssetBlob(assetId: string): Promise<Blob | null> {
  if (!assetId) {
    return null;
  }

  return withStore<Blob | null>('readonly', (store, resolve, reject) => {
    const request = store.get(assetId);
    request.onsuccess = () => {
      const value = request.result as StoredLivePhotoAsset | undefined;
      resolve(value?.blob || null);
    };
    request.onerror = () => reject(request.error || new Error('Failed to read live photo asset.'));
  });
}

export async function deleteLivePhotoAsset(assetId: string): Promise<void> {
  if (!assetId) {
    return;
  }

  await withStore<void>('readwrite', (store, resolve, reject) => {
    const request = store.delete(assetId);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error('Failed to delete live photo asset.'));
  });
}

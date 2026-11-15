import type { AnatomyMarker, TelemetrySample } from '../types/astrocare';

const DB_NAME = 'astrocare_offline_db';
const DB_VERSION = 1;

const STORE_TELEMETRY = 'telemetry_cache';
const STORE_MARKERS = 'markers_cache';
const STORE_PENDING_MARKERS = 'pending_markers';
const STORE_PENDING_ACTIONS = 'pending_actions';

export interface PendingAction {
  id: string;
  type: 'SOS' | 'SIMULATOR_MODE';
  payload: Record<string, unknown>;
  createdAt: number;
}

interface TelemetryCacheRecord {
  astronautId: string;
  history: TelemetrySample[];
  updatedAt: number;
}

interface MarkersCacheRecord {
  astronautId: string;
  markers: AnatomyMarker[];
  updatedAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_TELEMETRY)) {
        db.createObjectStore(STORE_TELEMETRY, { keyPath: 'astronautId' });
      }
      if (!db.objectStoreNames.contains(STORE_MARKERS)) {
        db.createObjectStore(STORE_MARKERS, { keyPath: 'astronautId' });
      }
      if (!db.objectStoreNames.contains(STORE_PENDING_MARKERS)) {
        db.createObjectStore(STORE_PENDING_MARKERS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_PENDING_ACTIONS)) {
        db.createObjectStore(STORE_PENDING_ACTIONS, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function cacheTelemetryHistory(
  astronautId: string,
  history: TelemetrySample[]
): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_TELEMETRY, 'readwrite');
    const store = tx.objectStore(STORE_TELEMETRY);
    const trimmed = history.slice(-90);
    store.put({
      astronautId,
      history: trimmed,
      updatedAt: Date.now(),
    } satisfies TelemetryCacheRecord);
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
    db.close();
  } catch {
    // IndexedDB may be unavailable in restricted contexts
  }
}

export async function getCachedTelemetryHistory(
  astronautId: string
): Promise<TelemetrySample[]> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_TELEMETRY, 'readonly');
    const store = tx.objectStore(STORE_TELEMETRY);
    const req = store.get(astronautId);
    const record = await new Promise<TelemetryCacheRecord | undefined>((res, rej) => {
      req.onsuccess = () => res(req.result as TelemetryCacheRecord | undefined);
      req.onerror = () => rej(req.error);
    });
    db.close();
    return record?.history ?? [];
  } catch {
    return [];
  }
}

export async function cacheMarkers(
  astronautId: string,
  markers: AnatomyMarker[]
): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_MARKERS, 'readwrite');
    tx.objectStore(STORE_MARKERS).put({
      astronautId,
      markers,
      updatedAt: Date.now(),
    } satisfies MarkersCacheRecord);
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
    db.close();
  } catch {
    // Ignore storage error
  }
}

export async function getCachedMarkers(astronautId: string): Promise<AnatomyMarker[]> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_MARKERS, 'readonly');
    const req = tx.objectStore(STORE_MARKERS).get(astronautId);
    const record = await new Promise<MarkersCacheRecord | undefined>((res, rej) => {
      req.onsuccess = () => res(req.result as MarkersCacheRecord | undefined);
      req.onerror = () => rej(req.error);
    });
    db.close();
    return record?.markers ?? [];
  } catch {
    return [];
  }
}

export async function queueOfflineMarker(marker: AnatomyMarker): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_PENDING_MARKERS, 'readwrite');
  tx.objectStore(STORE_PENDING_MARKERS).put({ ...marker, synced: false });
  await new Promise<void>((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
  db.close();
}

export async function getPendingMarkers(): Promise<AnatomyMarker[]> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_PENDING_MARKERS, 'readonly');
    const req = tx.objectStore(STORE_PENDING_MARKERS).getAll();
    const rows = await new Promise<AnatomyMarker[]>((res, rej) => {
      req.onsuccess = () => res((req.result as AnatomyMarker[]) ?? []);
      req.onerror = () => rej(req.error);
    });
    db.close();
    return rows;
  } catch {
    return [];
  }
}

export async function removePendingMarker(id: string): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_PENDING_MARKERS, 'readwrite');
    tx.objectStore(STORE_PENDING_MARKERS).delete(id);
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
    db.close();
  } catch {
    // Ignore
  }
}

export async function queueOfflineAction(action: PendingAction): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_PENDING_ACTIONS, 'readwrite');
  tx.objectStore(STORE_PENDING_ACTIONS).put(action);
  await new Promise<void>((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
  db.close();
}

export async function getPendingActions(): Promise<PendingAction[]> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_PENDING_ACTIONS, 'readonly');
    const req = tx.objectStore(STORE_PENDING_ACTIONS).getAll();
    const rows = await new Promise<PendingAction[]>((res, rej) => {
      req.onsuccess = () => res((req.result as PendingAction[]) ?? []);
      req.onerror = () => rej(req.error);
    });
    db.close();
    return rows;
  } catch {
    return [];
  }
}

export async function removePendingAction(id: string): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_PENDING_ACTIONS, 'readwrite');
    tx.objectStore(STORE_PENDING_ACTIONS).delete(id);
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
    db.close();
  } catch {
    // Ignore
  }
}

export async function getPendingSyncCount(): Promise<number> {
  const [markers, actions] = await Promise.all([getPendingMarkers(), getPendingActions()]);
  return markers.length + actions.length;
}

/**
 * Stage 5.I — Client-side offline queue helpers (IndexedDB).
 *
 * Browser-only. Used by client components to queue POST/PUT/PATCH
 * actions when navigator.onLine === false; the service worker drains
 * the queue via background sync when connectivity returns.
 *
 * Pure logic delegates to IndexedDB through a small async API. Pure
 * helpers (deduplication, fingerprinting) are exported separately for
 * unit testing and reused server-side via the same code surface.
 */

const DB_NAME = "arconique-offline";
const DB_VERSION = 1;
const QUEUE_STORE = "queue";
const PHOTO_STORE = "photos";

export interface OfflineAction {
  id: string;
  endpoint: string;
  method: "POST" | "PUT" | "PATCH";
  payload: unknown;
  createdAt: string;
  failures: number;
  lastAttempt?: string;
  lastFailureReason?: string;
}

export interface OfflinePhoto {
  id: string;
  blob: Blob;
  metadata: {
    siteReportId?: string;
    villaId?: string;
    description?: string;
  };
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Pure helpers (testable without IndexedDB)
// ---------------------------------------------------------------------------

export function generateClientActionId(): string {
  // RFC 4122 v4 — uses crypto.randomUUID where available.
  if (
    typeof crypto !== "undefined" &&
    typeof (crypto as Crypto).randomUUID === "function"
  ) {
    return (crypto as Crypto).randomUUID();
  }
  // Fallback (test env): millis + random.
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function isDuplicateAction(
  candidate: OfflineAction,
  existing: OfflineAction[],
): boolean {
  return existing.some((e) => e.id === candidate.id);
}

export function shouldRetry(action: OfflineAction, maxFailures = 5): boolean {
  return action.failures < maxFailures;
}

// ---------------------------------------------------------------------------
// IndexedDB API (browser-only)
// ---------------------------------------------------------------------------

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  if (!isBrowser()) {
    return Promise.reject(new Error("IndexedDB not available"));
  }
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(PHOTO_STORE)) {
        db.createObjectStore(PHOTO_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function queueOfflineAction(
  action: Omit<OfflineAction, "id" | "createdAt" | "failures">,
): Promise<string> {
  const db = await openDb();
  const id = generateClientActionId();
  const record: OfflineAction = {
    ...action,
    id,
    createdAt: new Date().toISOString(),
    failures: 0,
  };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, "readwrite");
    tx.objectStore(QUEUE_STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return id;
}

export async function getPendingActions(): Promise<OfflineAction[]> {
  const db = await openDb();
  return new Promise<OfflineAction[]>((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, "readonly");
    const req = tx.objectStore(QUEUE_STORE).getAll();
    req.onsuccess = () => resolve(req.result as OfflineAction[]);
    req.onerror = () => reject(req.error);
  });
}

export async function clearAction(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, "readwrite");
    tx.objectStore(QUEUE_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getQueueSize(): Promise<number> {
  const items = await getPendingActions();
  return items.length;
}

export async function queueOfflinePhoto(input: {
  blob: Blob;
  metadata: OfflinePhoto["metadata"];
}): Promise<string> {
  const db = await openDb();
  const id = generateClientActionId();
  const record: OfflinePhoto = {
    id,
    blob: input.blob,
    metadata: input.metadata,
    createdAt: new Date().toISOString(),
  };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, "readwrite");
    tx.objectStore(PHOTO_STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return id;
}

export async function getPendingPhotos(): Promise<OfflinePhoto[]> {
  const db = await openDb();
  return new Promise<OfflinePhoto[]>((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, "readonly");
    const req = tx.objectStore(PHOTO_STORE).getAll();
    req.onsuccess = () => resolve(req.result as OfflinePhoto[]);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Request a one-shot background sync from the SW. Falls back to
 * resolved Promise if the API isn't available so callers don't have
 * to feature-detect.
 */
export async function requestBackgroundSync(): Promise<void> {
  if (!isBrowser() || !("serviceWorker" in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const syncReg = (reg as ServiceWorkerRegistration & {
      sync?: { register: (tag: string) => Promise<void> };
    }).sync;
    if (syncReg) {
      await syncReg.register("sync-offline-queue");
    }
  } catch {
    // Background Sync unsupported — caller should fall through to immediate POST.
  }
}

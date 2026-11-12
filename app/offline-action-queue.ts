"use client";

/**
 * Durable FIFO queue for POST /api/pos mutations.
 *
 * The caller must generate one clientRequestId per user intent and keep it when
 * retrying. The server already treats that value as an idempotency key, so a
 * response lost after the server commits cannot create the same action twice.
 */

export type OfflineActionStatus = "pending" | "syncing" | "failed";

export type OfflinePosAction = {
  id: string;
  body: Record<string, unknown> & { clientRequestId: string };
  status: OfflineActionStatus;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  lastError: string;
};

export type OfflineQueueSnapshot = {
  items: OfflinePosAction[];
  pending: number;
  syncing: number;
  failed: number;
  online: boolean;
  isSyncing: boolean;
};

export type OfflineMutationResult<T> =
  | { queued: false; response: Response; payload: T }
  | { queued: true; queueId: string; clientRequestId: string };

export type OfflineQueueOptions = {
  endpoint?: string;
  maxAttempts?: number;
  fetcher?: typeof fetch;
};

type QueueListener = (snapshot: OfflineQueueSnapshot) => void;

const DB_NAME = "pbru-hotel-pos-offline";
const DB_VERSION = 1;
const STORE_NAME = "pos-actions";
const FALLBACK_KEY = "pbru-pos-offline-actions-v1";

function nowIso() {
  return new Date().toISOString();
}

function requestId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function isOnline() {
  return typeof navigator === "undefined" || navigator.onLine;
}

function isNetworkFailure(error: unknown) {
  return !isOnline() || error instanceof TypeError || (error instanceof DOMException && error.name === "NetworkError");
}

function normalizeItems(items: OfflinePosAction[]) {
  return [...items].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

function readFallback(): OfflinePosAction[] {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(FALLBACK_KEY) ?? "[]") as unknown;
    return Array.isArray(value) ? normalizeItems(value as OfflinePosAction[]) : [];
  } catch {
    return [];
  }
}

function writeFallback(items: OfflinePosAction[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(FALLBACK_KEY, JSON.stringify(normalizeItems(items)));
}

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    // Safari private mode and locked-down WebViews can expose IndexedDB but
    // reject opening it. In that case localStorage remains a usable fallback.
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

async function readAll(): Promise<OfflinePosAction[]> {
  const db = await openDb();
  if (!db) return readFallback();
  return new Promise((resolve) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(normalizeItems(request.result as OfflinePosAction[]));
    request.onerror = () => resolve(readFallback());
    transaction.oncomplete = () => db.close();
  });
}

async function put(item: OfflinePosAction) {
  const db = await openDb();
  if (!db) {
    const items = readFallback().filter((row) => row.id !== item.id);
    writeFallback([...items, item]);
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(item);
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); reject(transaction.error); };
  });
}

async function remove(id: string) {
  const db = await openDb();
  if (!db) {
    writeFallback(readFallback().filter((row) => row.id !== id));
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(id);
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); reject(transaction.error); };
  });
}

async function responsePayload<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text.trim()) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`ระบบกลางตอบกลับไม่ถูกต้อง (HTTP ${response.status})`);
  }
}

export function createOfflineActionQueue(options: OfflineQueueOptions = {}) {
  const endpoint = options.endpoint ?? "/api/pos";
  const maxAttempts = Math.max(1, options.maxAttempts ?? 5);
  const fetcher = options.fetcher ?? fetch;
  const listeners = new Set<QueueListener>();
  let syncing = false;
  let disposed = false;

  async function snapshot(): Promise<OfflineQueueSnapshot> {
    const items = await readAll();
    return {
      items,
      pending: items.filter((item) => item.status === "pending").length,
      syncing: items.filter((item) => item.status === "syncing").length,
      failed: items.filter((item) => item.status === "failed").length,
      online: isOnline(),
      isSyncing: syncing,
    };
  }

  async function notify() {
    const value = await snapshot();
    listeners.forEach((listener) => listener(value));
  }

  async function enqueue(body: Record<string, unknown>, existingId?: string) {
    const clientRequestId = String(body.clientRequestId ?? existingId ?? requestId());
    const current = await readAll();
    const duplicate = current.find((item) => item.body.clientRequestId === clientRequestId);
    if (duplicate) return duplicate;
    const timestamp = nowIso();
    const item: OfflinePosAction = {
      id: clientRequestId,
      body: { ...body, clientRequestId },
      status: "pending",
      attempts: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
      lastError: "",
    };
    await put(item);
    await notify();
    return item;
  }

  async function execute<T = Record<string, unknown>>(body: Record<string, unknown>): Promise<OfflineMutationResult<T>> {
    const clientRequestId = String(body.clientRequestId ?? requestId());
    const durableBody = { ...body, clientRequestId };
    if (!isOnline()) {
      const item = await enqueue(durableBody, clientRequestId);
      return { queued: true, queueId: item.id, clientRequestId };
    }
    try {
      const response = await fetcher(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(durableBody),
      });
      const payload = await responsePayload<T & { error?: string }>(response);
      if (!response.ok) throw new Error(payload.error ?? `ทำรายการไม่สำเร็จ (HTTP ${response.status})`);
      return { queued: false, response, payload };
    } catch (error) {
      if (!isNetworkFailure(error)) throw error;
      const item = await enqueue(durableBody, clientRequestId);
      return { queued: true, queueId: item.id, clientRequestId };
    }
  }

  async function sync() {
    if (syncing || disposed || !isOnline()) return snapshot();
    syncing = true;
    await notify();
    try {
      const items = await readAll();
      for (const queued of items) {
        if (!isOnline()) break;
        if (queued.status === "failed") continue;
        let item: OfflinePosAction = { ...queued, status: "syncing", updatedAt: nowIso() };
        await put(item);
        await notify();
        try {
          const response = await fetcher(endpoint, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(item.body),
          });
          const payload = await responsePayload<{ error?: string }>(response);
          if (response.ok) {
            await remove(item.id);
            await notify();
            continue;
          }
          const permanent = response.status >= 400 && response.status < 500;
          item = {
            ...item,
            status: permanent || item.attempts + 1 >= maxAttempts ? "failed" : "pending",
            attempts: item.attempts + 1,
            updatedAt: nowIso(),
            lastError: payload.error ?? `HTTP ${response.status}`,
          };
          await put(item);
          await notify();
        } catch (error) {
          const network = isNetworkFailure(error);
          item = {
            ...item,
            status: network ? "pending" : item.attempts + 1 >= maxAttempts ? "failed" : "pending",
            attempts: item.attempts + 1,
            updatedAt: nowIso(),
            lastError: error instanceof Error ? error.message : "ซิงก์ไม่สำเร็จ",
          };
          await put(item);
          await notify();
          // Preserve FIFO ordering. Later actions may depend on this mutation.
          if (network) break;
        }
      }
    } finally {
      syncing = false;
      await notify();
    }
    return snapshot();
  }

  async function retry(id: string) {
    const item = (await readAll()).find((row) => row.id === id);
    if (!item) return snapshot();
    await put({ ...item, status: "pending", attempts: 0, lastError: "", updatedAt: nowIso() });
    await notify();
    return sync();
  }

  async function discard(id: string) {
    await remove(id);
    await notify();
    return snapshot();
  }

  function subscribe(listener: QueueListener) {
    listeners.add(listener);
    void snapshot().then(listener);
    return () => listeners.delete(listener);
  }

  const onlineHandler = () => { void sync(); };
  const offlineHandler = () => { void notify(); };
  if (typeof window !== "undefined") {
    window.addEventListener("online", onlineHandler);
    window.addEventListener("offline", offlineHandler);
  }

  function dispose() {
    disposed = true;
    listeners.clear();
    if (typeof window !== "undefined") {
      window.removeEventListener("online", onlineHandler);
      window.removeEventListener("offline", offlineHandler);
    }
  }

  return { execute, enqueue, sync, retry, discard, snapshot, subscribe, dispose };
}

export type OfflineActionQueue = ReturnType<typeof createOfflineActionQueue>;

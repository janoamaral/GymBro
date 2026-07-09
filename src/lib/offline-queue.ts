const DB_NAME = "gymbro-offline-db";
const DB_VERSION = 1;
const QUEUE_STORE = "mutationQueue";
const CACHE_STORE = "workoutCache";
const RESOURCE_CACHE_STORE = "resourceCache";

const SYNC_EVENT_NAME = "gymbro:offline-sync";

type QueueMutationType = "set_update" | "reorder_exercises" | "reschedule_workout" | "delete_workout";

type SetUpdatePayload = {
  setFeelingScore?: number | null;
  rpe?: number | null;
  rir?: number | null;
  isDone?: boolean;
  repsTarget?: number;
  targetWeight?: number;
  durationSeconds?: number | null;
  distanceMeters?: number | null;
};

type QueueMutationPayload =
  | SetUpdatePayload
  | { orderedExerciseIds: string[] }
  | { rescheduledToLocalDate: string; rescheduleReason: string | null }
  | Record<string, never>;

export type QueueMutation = {
  id: string;
  type: QueueMutationType;
  targetId: string;
  endpoint: string;
  method: "PATCH" | "DELETE";
  payload: QueueMutationPayload;
  createdAt: number;
  updatedAt: number;
  attempts: number;
};

type CachedWorkoutDay = {
  date: string;
  sessions: unknown;
  updatedAt: number;
};

type CachedResource = {
  key: string;
  value: unknown;
  updatedAt: number;
};

type SyncStatus = "idle" | "syncing" | "error";

function canUseIndexedDb(): boolean {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

function nextMutationId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!canUseIndexedDb()) {
      reject(new Error("IndexedDB not available"));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        const store = db.createObjectStore(QUEUE_STORE, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }

      if (!db.objectStoreNames.contains(CACHE_STORE)) {
        const store = db.createObjectStore(CACHE_STORE, { keyPath: "date" });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
      }

      if (!db.objectStoreNames.contains(RESOURCE_CACHE_STORE)) {
        const store = db.createObjectStore(RESOURCE_CACHE_STORE, { keyPath: "key" });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB"));
  });
}

async function withStore<T>(
  storeName: typeof QUEUE_STORE | typeof CACHE_STORE | typeof RESOURCE_CACHE_STORE,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => void,
): Promise<T> {
  const db = await openDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);

    try {
      action(store);
    } catch (error) {
      tx.abort();
      reject(error);
      db.close();
      return;
    }

    tx.oncomplete = () => {
      db.close();
      resolve(undefined as T);
    };

    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error("IndexedDB transaction failed"));
    };

    tx.onabort = () => {
      db.close();
      reject(tx.error ?? new Error("IndexedDB transaction aborted"));
    };
  });
}

async function getAllQueueMutations(): Promise<QueueMutation[]> {
  if (!canUseIndexedDb()) {
    return [];
  }

  const db = await openDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, "readonly");
    const store = tx.objectStore(QUEUE_STORE);
    const request = store.getAll();

    request.onsuccess = () => {
      const results = (request.result as QueueMutation[] | undefined) ?? [];
      resolve(results.sort((a, b) => a.createdAt - b.createdAt));
    };

    request.onerror = () => reject(request.error ?? new Error("Failed to read queue"));
    tx.oncomplete = () => db.close();
    tx.onabort = () => {
      db.close();
      reject(tx.error ?? new Error("Read queue transaction aborted"));
    };
  });
}

async function putQueueMutation(mutation: QueueMutation): Promise<void> {
  await withStore<void>(QUEUE_STORE, "readwrite", (store) => {
    store.put(mutation);
  });
}

async function deleteQueueMutation(id: string): Promise<void> {
  await withStore<void>(QUEUE_STORE, "readwrite", (store) => {
    store.delete(id);
  });
}

function dispatchSyncEvent(status: SyncStatus, pending: number, error: string | null = null): void {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(SYNC_EVENT_NAME, {
      detail: {
        status,
        pending,
        error,
      },
    }),
  );
}

function mutationKey(type: QueueMutationType, targetId: string): string {
  return `${type}:${targetId}`;
}

export async function enqueueSetMutation(setId: string, sessionId: string, payload: SetUpdatePayload): Promise<void> {
  if (!canUseIndexedDb()) {
    return;
  }

  const queue = await getAllQueueMutations();
  const existing = queue.find((item) => item.type === "set_update" && item.targetId === setId);
  const now = Date.now();

  const next: QueueMutation = existing
    ? {
        ...existing,
        endpoint: `/api/workouts/${sessionId}/sets/${setId}`,
        payload: {
          ...(existing.payload as SetUpdatePayload),
          ...payload,
        },
        updatedAt: now,
      }
    : {
        id: nextMutationId(),
        type: "set_update",
        targetId: setId,
        endpoint: `/api/workouts/${sessionId}/sets/${setId}`,
        method: "PATCH",
        payload,
        createdAt: now,
        updatedAt: now,
        attempts: 0,
      };

  await putQueueMutation(next);
  dispatchSyncEvent("idle", await getOfflineQueuePendingCount());
}

export async function enqueueReorderMutation(date: string, orderedExerciseIds: string[]): Promise<void> {
  if (!canUseIndexedDb()) {
    return;
  }

  const queue = await getAllQueueMutations();
  const key = mutationKey("reorder_exercises", date);
  const existing = queue.find((item) => mutationKey(item.type, item.targetId) === key);
  const now = Date.now();

  const next: QueueMutation = existing
    ? {
        ...existing,
        payload: { orderedExerciseIds },
        updatedAt: now,
      }
    : {
        id: nextMutationId(),
        type: "reorder_exercises",
        targetId: date,
        endpoint: `/api/workouts/by-date/${date}`,
        method: "PATCH",
        payload: { orderedExerciseIds },
        createdAt: now,
        updatedAt: now,
        attempts: 0,
      };

  await putQueueMutation(next);
  dispatchSyncEvent("idle", await getOfflineQueuePendingCount());
}

export async function enqueueRescheduleMutation(
  sessionId: string,
  rescheduledToLocalDate: string,
  rescheduleReason: string | null,
): Promise<void> {
  if (!canUseIndexedDb()) {
    return;
  }

  const queue = await getAllQueueMutations();
  const key = mutationKey("reschedule_workout", sessionId);
  const existing = queue.find((item) => mutationKey(item.type, item.targetId) === key);
  const now = Date.now();

  const next: QueueMutation = existing
    ? {
        ...existing,
        payload: { rescheduledToLocalDate, rescheduleReason },
        updatedAt: now,
      }
    : {
        id: nextMutationId(),
        type: "reschedule_workout",
        targetId: sessionId,
        endpoint: `/api/workouts/${sessionId}`,
        method: "PATCH",
        payload: { rescheduledToLocalDate, rescheduleReason },
        createdAt: now,
        updatedAt: now,
        attempts: 0,
      };

  await putQueueMutation(next);
  dispatchSyncEvent("idle", await getOfflineQueuePendingCount());
}

export async function enqueueDeleteWorkoutMutation(sessionId: string): Promise<void> {
  if (!canUseIndexedDb()) {
    return;
  }

  const queue = await getAllQueueMutations();
  const key = mutationKey("delete_workout", sessionId);
  const existing = queue.find((item) => mutationKey(item.type, item.targetId) === key);
  const now = Date.now();

  const next: QueueMutation = existing
    ? {
        ...existing,
        updatedAt: now,
      }
    : {
        id: nextMutationId(),
        type: "delete_workout",
        targetId: sessionId,
        endpoint: `/api/workouts/${sessionId}`,
        method: "DELETE",
        payload: {},
        createdAt: now,
        updatedAt: now,
        attempts: 0,
      };

  await putQueueMutation(next);
  dispatchSyncEvent("idle", await getOfflineQueuePendingCount());
}

export async function acknowledgeSetMutationFields(
  setId: string,
  keys: Array<keyof SetUpdatePayload>,
): Promise<void> {
  if (!canUseIndexedDb() || keys.length === 0) {
    return;
  }

  const queue = await getAllQueueMutations();
  const existing = queue.find((item) => item.type === "set_update" && item.targetId === setId);
  if (!existing) {
    return;
  }

  const payload = { ...(existing.payload as SetUpdatePayload) };
  keys.forEach((key) => {
    delete payload[key];
  });

  if (Object.keys(payload).length === 0) {
    await deleteQueueMutation(existing.id);
  } else {
    await putQueueMutation({
      ...existing,
      payload,
      updatedAt: Date.now(),
    });
  }

  dispatchSyncEvent("idle", await getOfflineQueuePendingCount());
}

export async function getOfflineQueuePendingCount(): Promise<number> {
  if (!canUseIndexedDb()) {
    return 0;
  }

  const queue = await getAllQueueMutations();
  return queue.length;
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

let isFlushingQueue = false;

export async function flushOfflineMutationQueue(): Promise<void> {
  if (isFlushingQueue || typeof window === "undefined") {
    return;
  }

  if (!navigator.onLine) {
    dispatchSyncEvent("idle", await getOfflineQueuePendingCount());
    return;
  }

  isFlushingQueue = true;

  try {
    let queue = await getAllQueueMutations();
    if (queue.length > 0) {
      dispatchSyncEvent("syncing", queue.length);
    }

    for (const mutation of queue) {
      try {
        const response = await fetch(mutation.endpoint, {
          method: mutation.method,
          headers: mutation.method === "PATCH" ? { "Content-Type": "application/json" } : undefined,
          body: mutation.method === "PATCH" ? JSON.stringify(mutation.payload) : undefined,
        });

        if (response.ok || response.status === 404) {
          await deleteQueueMutation(mutation.id);
          queue = queue.filter((item) => item.id !== mutation.id);
          if (queue.length > 0) {
            dispatchSyncEvent("syncing", queue.length);
          }
          continue;
        }

        if (response.status === 401 || response.status === 403) {
          dispatchSyncEvent("error", queue.length, "Sesion expirada. Inicia sesion para sincronizar.");
          return;
        }

        if (isRetryableStatus(response.status)) {
          await putQueueMutation({
            ...mutation,
            attempts: mutation.attempts + 1,
            updatedAt: Date.now(),
          });
          dispatchSyncEvent("error", queue.length, "No se pudo sincronizar. Reintentaremos automaticamente.");
          return;
        }

        await deleteQueueMutation(mutation.id);
        queue = queue.filter((item) => item.id !== mutation.id);
      } catch {
        await putQueueMutation({
          ...mutation,
          attempts: mutation.attempts + 1,
          updatedAt: Date.now(),
        });
        dispatchSyncEvent("error", queue.length, "Sin internet. Reintentaremos al reconectar.");
        return;
      }
    }

    dispatchSyncEvent("idle", await getOfflineQueuePendingCount());
  } finally {
    isFlushingQueue = false;
  }
}

export async function cacheWorkoutDay(date: string, sessions: unknown): Promise<void> {
  if (!canUseIndexedDb()) {
    return;
  }

  const entry: CachedWorkoutDay = {
    date,
    sessions,
    updatedAt: Date.now(),
  };

  await withStore<void>(CACHE_STORE, "readwrite", (store) => {
    store.put(entry);
  });
}

export async function getCachedWorkoutDay(date: string): Promise<unknown | null> {
  if (!canUseIndexedDb()) {
    return null;
  }

  const db = await openDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(CACHE_STORE, "readonly");
    const store = tx.objectStore(CACHE_STORE);
    const request = store.get(date);

    request.onsuccess = () => {
      const item = request.result as CachedWorkoutDay | undefined;
      resolve(item?.sessions ?? null);
    };
    request.onerror = () => reject(request.error ?? new Error("Failed to read workout cache"));

    tx.oncomplete = () => db.close();
    tx.onabort = () => {
      db.close();
      reject(tx.error ?? new Error("Read workout cache transaction aborted"));
    };
  });
}

export async function clearCachedWorkoutDay(date: string): Promise<void> {
  if (!canUseIndexedDb()) {
    return;
  }

  await withStore<void>(CACHE_STORE, "readwrite", (store) => {
    store.delete(date);
  });
}

export async function cacheResource(key: string, value: unknown): Promise<void> {
  if (!canUseIndexedDb()) {
    return;
  }

  const entry: CachedResource = {
    key,
    value,
    updatedAt: Date.now(),
  };

  await withStore<void>(RESOURCE_CACHE_STORE, "readwrite", (store) => {
    store.put(entry);
  });
}

export async function getCachedResource<T>(key: string): Promise<T | null> {
  if (!canUseIndexedDb()) {
    return null;
  }

  const db = await openDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(RESOURCE_CACHE_STORE, "readonly");
    const store = tx.objectStore(RESOURCE_CACHE_STORE);
    const request = store.get(key);

    request.onsuccess = () => {
      const item = request.result as CachedResource | undefined;
      resolve((item?.value as T | undefined) ?? null);
    };
    request.onerror = () => reject(request.error ?? new Error("Failed to read resource cache"));

    tx.oncomplete = () => db.close();
    tx.onabort = () => {
      db.close();
      reject(tx.error ?? new Error("Read resource cache transaction aborted"));
    };
  });
}

export async function listOfflineQueueMutations(): Promise<QueueMutation[]> {
  return getAllQueueMutations();
}

// ponytail: cache patched by set id only — keeps callers simple, no full-day reserialize.
export async function patchCachedSetsInDay(
  date: string,
  setPatches: Array<{ id: string } & Record<string, unknown>>,
): Promise<void> {
  if (!canUseIndexedDb() || setPatches.length === 0) {
    return;
  }

  const cached = await getCachedWorkoutDay(date);
  if (!cached) {
    return;
  }

  const sessions = cached as Array<{ sets?: Array<{ id: string } & Record<string, unknown>> }>;
  const { sessions: merged, touched } = mergeSetPatchesIntoSessions(sessions, setPatches);

  if (touched) {
    await cacheWorkoutDay(date, merged);
  }
}

export function mergeSetPatchesIntoSessions(
  sessions: Array<{ sets?: Array<{ id: string } & Record<string, unknown>> }>,
  setPatches: Array<{ id: string } & Record<string, unknown>>,
): { sessions: typeof sessions; touched: boolean } {
  if (setPatches.length === 0) {
    return { sessions, touched: false };
  }

  const patchMap = new Map(setPatches.map((patch) => [patch.id, patch]));
  let touched = false;

  const next = sessions.map((session) => {
    if (!Array.isArray(session.sets)) {
      return session;
    }

    let sessionTouched = false;
    const patchedSets = session.sets.map((set) => {
      const patch = patchMap.get(set?.id);
      if (!patch) {
        return set;
      }
      sessionTouched = true;
      return { ...set, ...patch };
    });

    if (!sessionTouched) {
      return session;
    }
    touched = true;
    return { ...session, sets: patchedSets };
  });

  if (!touched) {
    return { sessions, touched: false };
  }
  return { sessions: next, touched };
}

export async function hasPendingMutationsForDay(
  date: string,
  sessionIds: string[],
  setIds: string[],
): Promise<boolean> {
  if (!canUseIndexedDb()) {
    return false;
  }

  const queue = await getAllQueueMutations();
  const sessionIdSet = new Set(sessionIds);
  const setIdSet = new Set(setIds);

  return queue.some((mutation) => {
    if (mutation.type === 'set_update') {
      return setIdSet.has(mutation.targetId);
    }
    if (mutation.type === 'reorder_exercises') {
      return mutation.targetId === date;
    }
    return sessionIdSet.has(mutation.targetId);
  });
}

export const offlineSyncEventName = SYNC_EVENT_NAME;

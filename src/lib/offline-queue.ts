const OFFLINE_QUEUE_KEY = "offline-set-mutation-queue-v1";
const SYNC_EVENT_NAME = "gymbro:offline-sync";

type SetMutationPayload = {
  setFeelingScore?: number | null;
  rpe?: number | null;
  rir?: number | null;
  isDone?: boolean;
};

type SetMutationPayloadKey = keyof SetMutationPayload;

type OfflineSetMutation = {
  id: string;
  sessionId: string;
  setId: string;
  payload: SetMutationPayload;
  createdAt: number;
  updatedAt: number;
  attempts: number;
};

type SyncStatus = "idle" | "syncing" | "error";

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function readQueue(): OfflineSetMutation[] {
  if (!canUseStorage()) {
    return [];
  }

  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((item): item is OfflineSetMutation => {
      if (!item || typeof item !== "object") {
        return false;
      }

      const candidate = item as Partial<OfflineSetMutation>;
      return (
        typeof candidate.id === "string" &&
        typeof candidate.sessionId === "string" &&
        typeof candidate.setId === "string" &&
        typeof candidate.payload === "object" &&
        candidate.payload !== null
      );
    });
  } catch {
    return [];
  }
}

function writeQueue(queue: OfflineSetMutation[]): void {
  if (!canUseStorage()) {
    return;
  }

  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}

function dispatchSyncEvent(status: SyncStatus, error: string | null = null): void {
  if (typeof window === "undefined") {
    return;
  }

  const pending = getOfflineQueuePendingCount();
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

function nextMutationId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function enqueueOfflineSetMutation(
  sessionId: string,
  setId: string,
  payload: SetMutationPayload,
): void {
  const queue = readQueue();
  const now = Date.now();
  const existingIndex = queue.findIndex((item) => item.setId === setId);

  if (existingIndex >= 0) {
    const existing = queue[existingIndex];
    queue[existingIndex] = {
      ...existing,
      sessionId,
      payload: {
        ...existing.payload,
        ...payload,
      },
      updatedAt: now,
    };
  } else {
    queue.push({
      id: nextMutationId(),
      sessionId,
      setId,
      payload,
      createdAt: now,
      updatedAt: now,
      attempts: 0,
    });
  }

  writeQueue(queue);
  dispatchSyncEvent("idle");
}

export function acknowledgeOfflineSetMutationFields(
  setId: string,
  keys: SetMutationPayloadKey[],
): void {
  if (keys.length === 0) {
    return;
  }

  const queue = readQueue();
  const existingIndex = queue.findIndex((item) => item.setId === setId);
  if (existingIndex < 0) {
    return;
  }

  const existing = queue[existingIndex];
  const nextPayload: SetMutationPayload = { ...existing.payload };

  keys.forEach((key) => {
    delete nextPayload[key];
  });

  const hasPayload = Object.keys(nextPayload).length > 0;

  if (!hasPayload) {
    queue.splice(existingIndex, 1);
  } else {
    queue[existingIndex] = {
      ...existing,
      payload: nextPayload,
      updatedAt: Date.now(),
    };
  }

  writeQueue(queue);
  dispatchSyncEvent("idle");
}

export function getOfflineQueuePendingCount(): number {
  return readQueue().length;
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

let isFlushingQueue = false;

export async function flushOfflineSetMutationQueue(): Promise<void> {
  if (isFlushingQueue || typeof window === "undefined") {
    return;
  }

  if (!navigator.onLine) {
    dispatchSyncEvent("idle");
    return;
  }

  isFlushingQueue = true;
  dispatchSyncEvent("syncing");

  try {
    const queue = readQueue().sort((a, b) => a.createdAt - b.createdAt);
    const remaining: OfflineSetMutation[] = [];

    for (const mutation of queue) {
      try {
        const response = await fetch(`/api/workouts/${mutation.sessionId}/sets/${mutation.setId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(mutation.payload),
        });

        if (response.ok || response.status === 404) {
          continue;
        }

        if (response.status === 401 || response.status === 403) {
          remaining.push(mutation);
          remaining.push(...queue.slice(queue.indexOf(mutation) + 1));
          writeQueue(remaining);
          dispatchSyncEvent("error", "Sesion expirada. Inicia sesion para sincronizar.");
          return;
        }

        mutation.attempts += 1;
        remaining.push(mutation);

        if (isRetryableStatus(response.status)) {
          remaining.push(...queue.slice(queue.indexOf(mutation) + 1));
          writeQueue(remaining);
          dispatchSyncEvent("error", "No se pudo sincronizar. Reintentaremos automaticamente.");
          return;
        }
      } catch {
        mutation.attempts += 1;
        remaining.push(mutation);
        remaining.push(...queue.slice(queue.indexOf(mutation) + 1));
        writeQueue(remaining);
        dispatchSyncEvent("error", "Sin internet. Reintentaremos al reconectar.");
        return;
      }
    }

    writeQueue(remaining);
    dispatchSyncEvent("idle");
  } finally {
    isFlushingQueue = false;
  }
}

export const offlineSyncEventName = SYNC_EVENT_NAME;

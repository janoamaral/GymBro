'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  flushOfflineMutationQueue,
  getOfflineQueuePendingCount,
  offlineSyncEventName,
} from '@/lib/offline-queue';

type SyncStatus = 'idle' | 'syncing' | 'error';

type SyncEventDetail = {
  status: SyncStatus;
  pending: number;
  error: string | null;
};

export function OfflineSyncStatus() {
  const [isOnline, setIsOnline] = useState(() =>
    typeof window === 'undefined' ? true : navigator.onLine
  );
  const [pendingCount, setPendingCount] = useState(0);
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleOnline = () => {
      setIsOnline(true);
      void flushOfflineMutationQueue();
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    const handleVisibilityOrFocus = () => {
      // Lazy poll: solo flusheamos si hay algo pendiente.
      void (async () => {
        const pending = await getOfflineQueuePendingCount();
        if (pending > 0 && navigator.onLine) {
          void flushOfflineMutationQueue();
        }
      })();
    };

    const handleSyncEvent = (event: Event) => {
      const custom = event as CustomEvent<SyncEventDetail>;
      setStatus(custom.detail?.status ?? 'idle');
      setPendingCount(custom.detail?.pending ?? 0);
      setErrorMessage(custom.detail?.error ?? null);
    };

    const hydratePendingCount = async () => {
      const pending = await getOfflineQueuePendingCount();
      setPendingCount(pending);
      if (pending > 0 && navigator.onLine) {
        void flushOfflineMutationQueue();
      }
    };

    const intervalId = window.setInterval(() => {
      if (navigator.onLine) {
        void flushOfflineMutationQueue();
      }
    }, 25_000);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener(offlineSyncEventName, handleSyncEvent as EventListener);

    void hydratePendingCount();

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener(offlineSyncEventName, handleSyncEvent as EventListener);
    };
  }, []);

  const message = useMemo(() => {
    if (status === 'syncing') {
      return pendingCount > 0 ? `Sincronizando (${pendingCount})...` : 'Sincronizando...';
    }

    if (status === 'error' && errorMessage) {
      return errorMessage;
    }

    if (!isOnline && pendingCount > 0) {
      return `${pendingCount} cambio${pendingCount === 1 ? '' : 's'} pendiente${pendingCount === 1 ? '' : 's'}`;
    }

    return null;
  }, [errorMessage, isOnline, pendingCount, status]);

  if (!message) {
    return null;
  }

  const colorClass = !isOnline
    ? 'border-amber-300/55 bg-amber-300/20 text-amber-100'
    : status === 'error'
      ? 'border-red-300/55 bg-red-400/20 text-red-100'
      : status === 'syncing'
        ? 'border-sky-300/55 bg-sky-400/20 text-sky-100'
        : 'border-emerald-300/55 bg-emerald-400/20 text-emerald-100';

  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2">
      <div className={`rounded-xl border px-3 py-2 text-center text-xs font-semibold ${colorClass}`}>
        {message}
      </div>
    </div>
  );
}

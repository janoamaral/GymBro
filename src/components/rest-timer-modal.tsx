'use client';

import { useEffect, useRef, useState } from 'react';

interface RestTimerModalProps {
  readonly isOpen: boolean;
  readonly initialSeconds: number;
  readonly onClose: () => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function RestTimerModal({ isOpen, initialSeconds, onClose }: RestTimerModalProps) {
  if (!isOpen) {
    return null;
  }

  return <RestTimerModalContent initialSeconds={initialSeconds} onClose={onClose} />;
}

interface RestTimerModalContentProps {
  readonly initialSeconds: number;
  readonly onClose: () => void;
}

function RestTimerModalContent({ initialSeconds, onClose }: RestTimerModalContentProps) {
  const [remaining, setRemaining] = useState(initialSeconds);
  const [isFinished, setIsFinished] = useState(false);
  const [showGoZoom, setShowGoZoom] = useState(false);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (isFinished) {
      if (intervalRef.current !== null) {
        globalThis.window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = globalThis.window.setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          if (intervalRef.current !== null) {
            globalThis.window.clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          setIsFinished(true);
          setShowGoZoom(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current !== null) {
        globalThis.window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isFinished]);

  useEffect(() => {
    if (!showGoZoom) {
      return;
    }
    const timeout = globalThis.window.setTimeout(() => {
      setShowGoZoom(false);
    }, 600);
    return () => globalThis.window.clearTimeout(timeout);
  }, [showGoZoom]);

  const handleAddThirty = () => {
    setRemaining((prev) => prev + 30);
    if (isFinished) {
      setIsFinished(false);
    }
  };

  return (
    <div
      className="rest-timer-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Timer de descanso"
    >
      <div className="rest-timer-content">
        {!isFinished && <p className="rest-timer-label">Rest</p>}
        {isFinished ? (
          <span className={`rest-timer-go${showGoZoom ? ' rest-timer-go--animate' : ''}`}>
            Go!
          </span>
        ) : (
          <span className="rest-timer-display">{formatTime(remaining)}</span>
        )}
      </div>

      <div className="rest-timer-actions">
        <button type="button" onClick={handleAddThirty} className="rest-timer-btn-add">
          +30 sec
        </button>
        <button type="button" onClick={onClose} className="rest-timer-btn-finish">
          Finish
        </button>
      </div>

      <style jsx global>{`
        .rest-timer-overlay {
          position: fixed;
          inset: 0;
          z-index: 9999;
          background: #d6ff43;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: space-between;
          padding: 3rem 1.5rem 2.5rem;
        }
        .rest-timer-content {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          width: 100%;
        }
        .rest-timer-label {
          font-family: var(--font-heading), sans-serif;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          font-style: italic;
          font-weight: 900;
          font-size: clamp(1.5rem, 8vw, 5rem);
          color: #0c1100;
          margin-bottom: 0.5rem;
          line-height: 1;
        }
        .rest-timer-display {
          font-family: var(--font-heading), sans-serif;
          letter-spacing: -0.02em;
          text-transform: uppercase;
          font-style: italic;
          font-weight: 900;
          font-size: clamp(5rem, 26vw, 24rem);
          color: #0c1100;
          line-height: 1;
          display: block;
          text-align: center;
          width: 80vw;
        }
        .rest-timer-go {
          font-family: var(--font-heading), sans-serif;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          font-style: italic;
          font-weight: 900;
          font-size: clamp(7.5rem, 36vw, 34rem);
          color: #0c1100;
          line-height: 1;
          display: block;
          text-align: center;
          width: 80vw;
        }
        .rest-timer-go--animate {
          animation: rest-timer-go-zoom 600ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        @keyframes rest-timer-go-zoom {
          0% { transform: scale(0.5); opacity: 0; }
          60% { transform: scale(1.08); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        .rest-timer-actions {
          display: flex;
          gap: 1rem;
          width: 100%;
          max-width: 420px;
        }
        .rest-timer-btn-add {
          flex: 1;
          padding: 0.875rem 1rem;
          border-radius: 0.875rem;
          background: #000;
          color: #d6ff43;
          font-family: var(--font-heading), sans-serif;
          font-weight: 900;
          font-style: italic;
          font-size: 1.1rem;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          border: none;
          cursor: pointer;
          transition: opacity 0.15s ease;
        }
        .rest-timer-btn-add:active { opacity: 0.8; }
        .rest-timer-btn-finish {
          flex: 1;
          padding: 0.875rem 1rem;
          border-radius: 0.875rem;
          background: transparent;
          color: #000;
          font-family: var(--font-heading), sans-serif;
          font-weight: 900;
          font-style: italic;
          font-size: 1.1rem;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          border: 2px solid #000;
          cursor: pointer;
          transition: background 0.15s ease;
        }
        .rest-timer-btn-finish:active { background: rgba(0, 0, 0, 0.08); }
      `}</style>
    </div>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';

interface HangTimerModalProps {
  readonly isOpen: boolean;
  readonly setupSeconds: number;
  readonly workoutSeconds: number;
  readonly onComplete: () => void;
}

function formatTime(seconds: number): string {
  if (seconds <= 0) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

type Phase = 'setup' | 'workout' | 'done';

export function HangTimerModal({ isOpen, setupSeconds, workoutSeconds, onComplete }: HangTimerModalProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <HangTimerModalContent
      setupSeconds={setupSeconds}
      workoutSeconds={workoutSeconds}
      onComplete={onComplete}
    />
  );
}

interface ContentProps {
  readonly setupSeconds: number;
  readonly workoutSeconds: number;
  readonly onComplete: () => void;
}

function HangTimerModalContent({ setupSeconds, workoutSeconds, onComplete }: ContentProps) {
  const [phase, setPhase] = useState<Phase>('setup');
  const [remaining, setRemaining] = useState(setupSeconds);
  const audioContextRef = useRef<AudioContext | null>(null);
  const cleanupTimeoutsRef = useRef<number[]>([]);

  useEffect(() => {
    let currentPhase: Phase = 'setup';
    let current = Math.max(0, setupSeconds);

    const ensureAudio = (): AudioContext | null => {
      const AudioContextCtor =
        (globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ??
        (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) {
        return null;
      }

      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContextCtor();
      }
      void audioContextRef.current.resume().catch(() => {
        console.warn('No se pudo activar el audio del hang timer.');
      });
      return audioContextRef.current;
    };

    const playBeep = (frequency = 880, duration = 0.08) => {
      const ctx = ensureAudio();
      if (!ctx) {
        return;
      }

      const startAt = ctx.currentTime + 0.01;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = 'square';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(0.3, startAt + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(startAt);
      oscillator.stop(startAt + duration + 0.02);

      const timeoutId = globalThis.window.setTimeout(() => {
        oscillator.disconnect();
        gain.disconnect();
      }, (duration + 0.1) * 1000);
      cleanupTimeoutsRef.current.push(timeoutId);
    };

    const playDoneChime = () => {
      [880, 1100, 1320].forEach((frequency, index) => {
        const timeoutId = globalThis.window.setTimeout(() => {
          playBeep(frequency, 0.12);
        }, index * 180);
        cleanupTimeoutsRef.current.push(timeoutId);
      });
    };

    const intervalId = globalThis.window.setInterval(() => {
      if (currentPhase === 'done') {
        return;
      }

      const nextValue = current - 1;

      if (currentPhase === 'setup') {
        if (nextValue <= 3 && nextValue >= 1) {
          playBeep(720);
        }

        if (nextValue <= 0) {
          currentPhase = 'workout';
          current = Math.max(0, workoutSeconds);
          setPhase('workout');
          setRemaining(current);
          return;
        }
      } else if (currentPhase === 'workout') {
        if (nextValue <= 5 && nextValue >= 1) {
          playBeep(960);
        }

        if (nextValue <= 0) {
          currentPhase = 'done';
          current = 0;
          setPhase('done');
          setRemaining(0);
          playDoneChime();
          return;
        }
      }

      current = nextValue;
      setRemaining(nextValue);
    }, 1000);

    return () => {
      globalThis.window.clearInterval(intervalId);
    };
  }, [setupSeconds, workoutSeconds]);

  useEffect(() => {
    return () => {
      cleanupTimeoutsRef.current.forEach((timeoutId) => {
        globalThis.window.clearTimeout(timeoutId);
      });
      cleanupTimeoutsRef.current = [];
      void audioContextRef.current?.close().catch(() => {
        console.warn('No se pudo cerrar el audio del hang timer.');
      });
      audioContextRef.current = null;
    };
  }, []);

  const totalForPhase = phase === 'setup' ? setupSeconds : workoutSeconds;
  const fillFraction = totalForPhase > 0
    ? Math.max(0, Math.min(1, (totalForPhase - remaining + 1) / totalForPhase))
    : phase === 'done' ? 1 : 0;
  const fillColor = phase === 'setup' ? '#f1ff0a' : '#21f0a8';
  const textColor = '#0c1100';
  const label = phase === 'setup' ? 'Setup Time' : phase === 'workout' ? 'Hang in there!' : 'Completado!';

  return (
    <div
      className="hang-timer-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Timer de serie por tiempo"
    >
      <div className="hang-timer-fill" aria-hidden="true" style={{ height: `${fillFraction * 100}%`, background: fillColor }} />

      <div className="hang-timer-content">
        <p className="hang-timer-label" style={{ color: textColor }}>{label}</p>
        <span className="hang-timer-display" style={{ color: textColor }}>
          {phase === 'done' ? 'GO!' : formatTime(remaining)}
        </span>
      </div>

      <div className="hang-timer-actions">
        <button type="button" onClick={onComplete} className="hang-timer-btn-finish" style={{ color: textColor, borderColor: textColor }}>
          Finish
        </button>
      </div>

      <style jsx global>{`
        .hang-timer-overlay {
          position: fixed;
          inset: 0;
          z-index: 9999;
          background: #d1d1d1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: space-between;
          padding: 2.5rem 1.5rem;
          overflow: hidden;
          user-select: none;
        }
        .hang-timer-fill {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          transition: height 0.99s linear;
          pointer-events: none;
          z-index: 0;
        }
        .hang-timer-content {
          position: relative;
          z-index: 1;
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          width: 100%;
          text-align: center;
          transition: color 0.3s ease;
        }
        .hang-timer-label {
          font-family: var(--font-heading), sans-serif;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          font-weight: 900;
          font-size: clamp(1.4rem, 7vw, 4rem);
          margin: 0 0 0.5rem;
          line-height: 1;
          text-align: center;
          width: 100%;
        }
        .hang-timer-display {
          font-family: var(--font-heading), sans-serif;
          letter-spacing: -0.02em;
          text-transform: uppercase;
          font-weight: 900;
          font-size: clamp(5rem, 26vw, 22rem);
          line-height: 1;
          display: block;
          text-align: center;
          width: 80vw;
        }
        .hang-timer-actions {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 420px;
        }
        .hang-timer-btn-finish {
          width: 100%;
          padding: 0.875rem 1rem;
          border-radius: 0.875rem;
          background: transparent;
          font-family: var(--font-heading), sans-serif;
          font-weight: 900;
          font-size: 1.1rem;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          border: 2px solid;
          cursor: pointer;
          transition: background 0.15s ease, opacity 0.15s ease;
        }
        .hang-timer-btn-finish:active {
          opacity: 0.8;
        }
      `}</style>
    </div>
  );
}
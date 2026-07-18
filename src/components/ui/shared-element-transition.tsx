import { useEffect, useRef } from 'react';

interface SharedElementTransitionProps {
  id: string;
  text: string;
  from: DOMRect | null;
  to: DOMRect | null;
  onFinish: () => void;
  duration?: number;
}

export function SharedElementTransition({
  id,
  text,
  from,
  to,
  onFinish,
  duration = 420,
}: SharedElementTransitionProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!from || !to || !ref.current) return;
    const el = ref.current;
    // Set initial position
    el.style.position = 'fixed';
    el.style.left = `${from.left}px`;
    el.style.top = `${from.top}px`;
    el.style.width = `${from.width}px`;
    el.style.height = `${from.height}px`;
    el.style.transform = 'none';
    el.style.zIndex = '9999';
    el.style.margin = '0';
    el.style.pointerEvents = 'none';
    el.style.transition = `all ${duration}ms cubic-bezier(.4,0,.2,1)`;
    // Force reflow
    void el.offsetWidth;
    // Animate to target
    requestAnimationFrame(() => {
      el.style.left = `${to.left}px`;
      el.style.top = `${to.top}px`;
      el.style.width = `${to.width}px`;
      el.style.height = `${to.height}px`;
      el.style.color = '#fff';
      el.style.transform = 'none';
    });
    // Cleanup after animation
    const timeout = setTimeout(onFinish, duration + 30);
    return () => clearTimeout(timeout);
  }, [from, to, onFinish, duration]);

  return (
    <div
      ref={ref}
      style={{
        fontFamily: 'var(--font-heading), sans-serif',
        fontWeight: 900,
        fontSize: '2rem',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        background: 'none',
        color: '#101010',
        lineHeight: 1.1,
        textAlign: 'left',
        whiteSpace: 'nowrap',
        pointerEvents: 'none',
      }}
      data-shared-element={id}
    >
      {text}
    </div>
  );
}

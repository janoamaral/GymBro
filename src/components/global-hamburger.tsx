'use client';

import { FullscreenMenu } from '@/components/fullscreen-menu';

export function GlobalHamburger() {
  return (
    <div className="fixed right-4 top-5 z-40 sm:right-6 sm:top-6 lg:right-8 lg:top-8">
      <FullscreenMenu />
    </div>
  );
}

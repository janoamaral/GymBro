"use client";
import { useState, useCallback, useMemo } from 'react';
import { SharedElementContext, SharedElementData } from './shared-element-context';

export function SharedElementProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [sharedElement, setSharedElement] = useState<SharedElementData | null>(null);

  const setShared = useCallback((data: SharedElementData | null) => {
    setSharedElement(data);
  }, []);

  const contextValue = useMemo(() => ({ sharedElement, setSharedElement: setShared }), [sharedElement, setShared]);
  return (
    <SharedElementContext.Provider value={contextValue}>
      {children}
    </SharedElementContext.Provider>
  );
}

"use client";
import { createContext, useContext } from 'react';

export interface SharedElementData {
  id: string;
  text: string;
  rect: DOMRect;
}

export interface SharedElementContextValue {
  setSharedElement: (data: SharedElementData | null) => void;
  sharedElement: SharedElementData | null;
}

export const SharedElementContext = createContext<SharedElementContextValue | undefined>(undefined);

export function useSharedElement() {
  const ctx = useContext(SharedElementContext);
  if (!ctx) throw new Error('useSharedElement must be used within SharedElementProvider');
  return ctx;
}

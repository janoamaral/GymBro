'use client';

import { ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
}

export function Modal({ isOpen, onClose, children, title }: ModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4">
      <div className="flex min-h-full items-start justify-center py-4 sm:items-center sm:py-0">
        <div className="relative w-full max-w-md max-h-[calc(100vh-2rem)] overflow-y-auto rounded-lg bg-gray-900 p-6 shadow-xl">
        {title && (
          <h2 className="mb-4 text-xl font-bold text-white">{title}</h2>
        )}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 p-1 hover:bg-gray-800 rounded"
          aria-label="Close modal"
        >
          <X size={20} className="text-gray-400" />
        </button>
        {children}
        </div>
      </div>
    </div>
  );
}

'use client';

import { ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly title?: string;
}

export function Modal({ isOpen, onClose, children, title }: ModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-black/65 p-4 backdrop-blur-sm">
      <div className="flex min-h-full items-start justify-center py-4 sm:items-center sm:py-0">
        <div className="panel relative max-h-[calc(100vh-2rem)] w-full max-w-md overflow-y-auto p-6 shadow-xl">
        {title && (
          <h2 className="mb-4 text-xl font-bold text-white">{title}</h2>
        )}
        <button
          onClick={onClose}
          className="btn-dark absolute right-4 top-4 p-1"
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

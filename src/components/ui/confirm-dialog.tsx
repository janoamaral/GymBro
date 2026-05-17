'use client';

import { Modal } from './modal';

interface ConfirmDialogProps {
  isOpen: boolean;
  message: string;
  title?: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
}

export function ConfirmDialog({
  isOpen,
  message,
  title = 'Confirmar',
  onConfirm,
  onCancel,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  isDanger = false,
}: ConfirmDialogProps) {
  return (
    <Modal isOpen={isOpen} onClose={onCancel} title={title}>
      <p className="mb-6 text-gray-300">{message}</p>
      <div className="flex gap-3 justify-end">
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded bg-gray-700 text-white hover:bg-gray-600 transition-colors"
        >
          {cancelText}
        </button>
        <button
          onClick={onConfirm}
          className={`px-4 py-2 rounded text-gray-900 font-medium transition-colors ${
            isDanger
              ? 'bg-red-500 hover:bg-red-600'
              : 'bg-[#d6ff43] hover:bg-yellow-400'
          }`}
        >
          {confirmText}
        </button>
      </div>
    </Modal>
  );
}

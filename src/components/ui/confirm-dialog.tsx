'use client';

import { Modal } from './modal';

interface ConfirmDialogProps {
  readonly isOpen: boolean;
  readonly message: string;
  readonly title?: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  readonly confirmText?: string;
  readonly cancelText?: string;
  readonly isDanger?: boolean;
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
          className="btn-dark px-4 py-2"
        >
          {cancelText}
        </button>
        <button
          onClick={onConfirm}
          className={`px-4 py-2 font-medium transition-colors ${
            isDanger
              ? 'rounded-xl bg-red-500 text-white hover:bg-red-600'
              : 'btn-accent'
          }`}
        >
          {confirmText}
        </button>
      </div>
    </Modal>
  );
}

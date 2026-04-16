import { AlertTriangle } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  warning?: string;
  confirmLabel?: string;
  isDanger?: boolean;
  suppressAutoClose?: boolean;
}

export default function ConfirmDialog({ isOpen, onClose, onConfirm, title, message, warning, confirmLabel = 'Confirm', isDanger = false, suppressAutoClose = false }: ConfirmDialogProps) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-card-lg w-full max-w-sm p-5">
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isDanger ? 'bg-error-50' : 'bg-warning-50'}`}>
            <AlertTriangle className={`w-5 h-5 ${isDanger ? 'text-error-600' : 'text-warning-600'}`} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-neutral-900">{title}</h3>
            <p className="text-sm text-neutral-500 mt-1">{message}</p>
            {warning && (
              <p className="text-xs text-error-600 font-medium mt-2 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 shrink-0" /> {warning}
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-2 mt-5 justify-end">
          <button onClick={onClose} className="btn-secondary text-xs px-3 py-1.5">Cancel</button>
          <button
            onClick={() => { onConfirm(); if (!suppressAutoClose) onClose(); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-colors ${isDanger ? 'bg-error-600 hover:bg-error-700' : 'bg-primary-600 hover:bg-primary-700'}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

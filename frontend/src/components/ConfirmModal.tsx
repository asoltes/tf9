import { useEffect } from 'react';

interface ConfirmModalProps {
  visible: boolean;
  header: string;
  children?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: 'primary' | 'normal';
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  visible,
  header,
  children,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmVariant = 'primary',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, onCancel]);

  if (!visible) return null;

  return (
    <div
      className="overlay show"
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="modal" style={{ width: 440 }} role="dialog" aria-modal="true">
        <div className="modal-head">{header}</div>
        {children != null && <div className="modal-body">{children}</div>}
        <div className="modal-foot">
          <button className="btn btn-normal" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </button>
          <button
            className={confirmVariant === 'primary' ? 'btn btn-primary' : 'btn btn-normal'}
            onClick={onConfirm}
            disabled={loading}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

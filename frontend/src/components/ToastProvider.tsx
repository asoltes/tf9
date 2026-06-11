import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

type ShowToast = (message: string, type?: ToastType) => void;

const ToastContext = createContext<ShowToast>(() => {});

let nextId = 0;
const AUTO_DISMISS_MS = 1900;

export function useToast(): ShowToast {
  return useContext(ToastContext);
}

const CheckIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const ErrIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#ff6b6b' }}>
    <circle cx="12" cy="12" r="9" /><line x1="12" y1="8" x2="12" y2="13" /><line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const timers = timersRef.current;
    return () => { timers.forEach(t => clearTimeout(t)); };
  }, []);

  const dismiss = useCallback((id: string) => {
    clearTimeout(timersRef.current.get(id));
    timersRef.current.delete(id);
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const showToast = useCallback<ShowToast>((message, type = 'success') => {
    const id = `toast-${nextId++}`;
    setToasts(prev => [...prev, { id, message, type }]);
    const timer = setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    timersRef.current.set(id, timer);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <div
        style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          display: 'flex', flexDirection: 'column-reverse', alignItems: 'center', gap: 10,
          zIndex: 3000, pointerEvents: 'none',
        }}
      >
        {toasts.map(t => (
          <div
            key={t.id}
            className="toast show"
            style={{ position: 'static', left: 'auto', bottom: 'auto', transform: 'none' }}
            onClick={() => dismiss(t.id)}
          >
            {t.type === 'error' || t.type === 'warning' ? ErrIcon : CheckIcon}
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

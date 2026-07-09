import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';
import { Toast } from '../types';

interface ToastContainerProps {
  toasts: Toast[];
  onRemove: (id: string) => void;
}

const TOAST_ICONS = {
  success: <CheckCircle2 className="h-5 w-5 text-green-400" />,
  error:   <XCircle     className="h-5 w-5 text-red-400" />,
  warning: <AlertTriangle className="h-5 w-5 text-gold-400" />,
  info:    <Info        className="h-5 w-5 text-blue-400" />,
};

const TOAST_STYLES = {
  success: 'border-green-500/40 bg-dark-800/90',
  error:   'border-red-500/40 bg-dark-800/90',
  warning: 'border-gold-500/40 bg-dark-800/90',
  info:    'border-blue-500/40 bg-dark-800/90',
};

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: string) => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setVisible(true), 10);
    const t2 = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onRemove(toast.id), 400);
    }, 4500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  return (
    <div
      className={`
        flex items-start gap-3 p-4 rounded-xl border backdrop-blur-xl shadow-dark-lg
        ${TOAST_STYLES[toast.type]}
        transition-all duration-400 ease-out
        ${visible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-10'}
      `}
      style={{ minWidth: '300px', maxWidth: '380px' }}
    >
      <div className="shrink-0 mt-0.5">{TOAST_ICONS[toast.type]}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-white">{toast.title}</p>
        <p className="text-xs text-dark-300 mt-0.5">{toast.message}</p>
      </div>
      <button
        onClick={() => { setVisible(false); setTimeout(() => onRemove(toast.id), 400); }}
        className="shrink-0 text-dark-400 hover:text-white transition-colors"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export default function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map(toast => (
        <div key={toast.id} className="pointer-events-auto">
          <ToastItem toast={toast} onRemove={onRemove} />
        </div>
      ))}
    </div>
  );
}

// src/components/ToastProvider.jsx
import { useCallback, useRef, useState } from 'react'
import { ToastContext } from '../toastContext'

export default function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const nextId = useRef(0)

  const dismiss = useCallback(id => setToasts(list => list.filter(t => t.id !== id)), [])

  const toast = useCallback((message, type = 'success') => {
    nextId.current += 1
    const id = nextId.current
    setToasts(list => [...list, { id, message, type }])
    setTimeout(() => dismiss(id), type === 'error' ? 6000 : 2800)
  }, [dismiss])

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.type}`} onClick={() => dismiss(t.id)}>
            <span>{t.type === 'error' ? '⚠' : '✓'}</span> {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

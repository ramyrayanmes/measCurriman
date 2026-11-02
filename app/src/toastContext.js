// src/toastContext.js
import { createContext, useContext } from 'react'

export const ToastContext = createContext(() => {})

// Usage: const toast = useToast(); toast('Saved'); toast('Failed', 'error')
export function useToast() {
  return useContext(ToastContext)
}

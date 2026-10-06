import { useCallback, useEffect, useState } from 'react'
import { remember } from './store'

/** State that survives navigating into a record and back (filters, selected tab, expanded sections). */
export function useRemembered<T>(key: string, initial: T): [T, (v: T | ((p: T) => T)) => void] {
  const [v, setV] = useState<T>(() => remember.get(key, initial))
  const set = useCallback((n: T | ((p: T) => T)) => {
    setV(prev => { const next = typeof n === 'function' ? (n as any)(prev) : n; remember.set(key, next); return next })
  }, [key])
  return [v, set]
}

/** Restore scroll position when returning to a list page; save it when leaving. */
export function useScrollMemory(key: string, ready = true) {
  useEffect(() => {
    if (!ready) return
    const y = remember.get<number>('scroll:' + key, 0)
    if (y) requestAnimationFrame(() => window.scrollTo(0, y))
    return () => { remember.set('scroll:' + key, window.scrollY) }
    // eslint-disable-next-line
  }, [key, ready])
}

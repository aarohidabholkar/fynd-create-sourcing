import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useBlocker } from 'react-router-dom'
import { Calendar, ChevronDown, ChevronRight, Maximize2, Minimize2, X } from 'lucide-react'
import { ApiError, openSource, run, useSnap, type R } from './store'
import { fmtDate, fmtTs, personLabel, uid } from './util'

/* ---------- small display pieces ---------- */
export function Badge({ tone = '', children, title }: { tone?: string; children: ReactNode; title?: string }) {
  return <span className={`badge ${tone}`} title={title}>{children}</span>
}

export function Person({ id, role = true }: { id?: string | null; role?: boolean }) {
  const { state } = useSnap()
  if (!state) return null
  return <span>{personLabel(state, id, role)}</span>
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="empty"><span className="strong">{title}</span>{children}</div>
}

export function Placeholder({ label = 'No image' }: { label?: string }) {
  return <div className="placeholder-img" aria-label="Image not available" role="img">{label}</div>
}

export function SourceLink({ id, label, ctx }: { id?: string | null; label?: string; ctx?: R }) {
  const { state } = useSnap()
  if (!id) return <span className="muted">Source unavailable</span>
  const s = state?.sources[id]
  return (
    <button className="link" onClick={e => { e.stopPropagation(); openSource(id, ctx || null) }}>
      {label || s?.title || 'Source'}
    </button>
  )
}

export function DateText({ d, withYear }: { d?: string | null; withYear?: boolean }) {
  return <span>{d ? fmtDate(d, withYear) : <span className="muted">Not recorded</span>}</span>
}

export function ErrorBox({ err }: { err?: ApiError | null }) {
  if (!err) return null
  return <div className="alert error" role="alert">{err.message}</div>
}

export function Field({ label, required, error, hint, children }: { label: string; required?: boolean; error?: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className={required ? 'req' : ''}>{label}</span>
      {children}
      {hint && <span className="hint">{hint}</span>}
      {error && <span className="field-error" role="alert">{error}</span>}
    </label>
  )
}

export function Disclosure({ summary, defaultOpen = false, children, count, id }: { summary: ReactNode; defaultOpen?: boolean; children: ReactNode; count?: number; id?: string }) {
  const [open, setOpen] = useState(defaultOpen)
  const cid = useId()
  return (
    <div>
      <button className="btn link-like row" aria-expanded={open} aria-controls={cid} onClick={() => setOpen(!open)} style={{ gap: 4 }}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}{summary}{count !== undefined && <span className="muted">· {count}</span>}
      </button>
      {open && <div id={cid} className="mt-8">{children}</div>}
    </div>
  )
}

export function Tabs({ tabs, value, onChange, label }: { tabs: { id: string; label: string; count?: number }[]; value: string; onChange: (id: string) => void; label: string }) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map(t => (
        <button key={t.id} role="tab" className="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}>
          {t.label}{t.count !== undefined && <span className="count">{t.count}</span>}
        </button>
      ))}
    </div>
  )
}

/* ---------- overlays with focus management ---------- */
const overlayStack: object[] = []

function useFocusTrap(ref: React.RefObject<HTMLElement | null>, onClose: () => void) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useLayoutEffect(() => {
    const token = {}
    overlayStack.push(token)
    const prev = document.activeElement as HTMLElement | null
    const el = ref.current
    const focusable = () => Array.from(el?.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])') || [])
    const first = focusable().find(x => !x.hasAttribute('data-close')) || focusable()[0]
    first?.focus()
    // Escape works from anywhere (even if focus fell to the page after a control disappeared); only the topmost overlay reacts
    const onKey = (e: KeyboardEvent) => {
      if (overlayStack[overlayStack.length - 1] !== token) return
      if (e.key === 'Escape') { e.stopPropagation(); closeRef.current() }
      if (e.key === 'Tab') {
        const f = focusable()
        if (!f.length) return
        const a = f[0], z = f[f.length - 1]
        const inside = el?.contains(document.activeElement)
        if (!inside) { e.preventDefault(); a.focus() }
        else if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus() }
        else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus() }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      const i = overlayStack.indexOf(token); if (i >= 0) overlayStack.splice(i, 1)
      prev?.focus?.()
    }
    // eslint-disable-next-line
  }, [])
}

export function Dialog({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const id = useId()
  useFocusTrap(ref, onClose)
  return (
    <>
      <div className="overlay" style={{ zIndex: 85 }} onClick={onClose} />
      <div className={`dialog ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={id} ref={ref}>
        <div className="dialog-head"><h2 id={id} className="grow">{title}</h2>
          <button className="btn ghost small" data-close onClick={onClose} aria-label="Close dialog"><X size={16} /></button></div>
        <div className="dialog-body">{children}</div>
        {footer && <div className="dialog-foot">{footer}</div>}
      </div>
    </>
  )
}

export function Drawer({ title, onClose, children, expanded, onToggle, extraBar }: { title: string; onClose: () => void; children: ReactNode; expanded?: boolean; onToggle?: () => void; extraBar?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const id = useId()
  useFocusTrap(ref, onClose)
  return (
    <>
      <div className="overlay" onClick={onClose} />
      <aside className={`drawer ${expanded ? 'expanded' : ''}`} role="dialog" aria-modal="true" aria-labelledby={id} ref={ref}>
        <div className="drawer-bar">
          <span id={id} className="sr-only">{title}</span>
          {extraBar}
          <span className="grow" />
          {onToggle && <button className="btn ghost small" onClick={onToggle} aria-label={expanded ? 'Collapse panel' : 'Expand panel'}>
            {expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}{expanded ? 'Collapse' : 'Expand'}</button>}
          <button className="btn ghost small" data-close onClick={onClose} aria-label="Close panel"><X size={16} /> Close</button>
        </div>
        <div className="drawer-body">{children}</div>
      </aside>
    </>
  )
}

/* ---------- submission with preserved input, no false success, no double submit ---------- */
export function useSubmit(op: string) {
  const key = useRef(uid())
  const busyRef = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)
  const submit = useCallback(async (body: R): Promise<R | undefined> => {
    if (busyRef.current) return undefined
    busyRef.current = true; setBusy(true); setError(null)
    try {
      const r = await run(op, body, key.current)
      key.current = uid()
      return r
    } catch (e: any) {
      setError(e instanceof ApiError ? e : new ApiError(0, 'Something went wrong. Nothing was saved.'))
      return undefined
    } finally { busyRef.current = false; setBusy(false) }
  }, [op])
  return { submit, busy, error, clear: () => setError(null) }
}

/** Warn before discarding unsaved input (in-app navigation and tab close). */
export function useUnsavedGuard(dirty: boolean, message = 'You have unsaved changes. Discard them?') {
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname + currentLocation.search !== nextLocation.pathname + nextLocation.search)
  useEffect(() => {
    if (blocker.state === 'blocked') {
      if (window.confirm(message)) blocker.proceed(); else blocker.reset()
    }
  }, [blocker, message])
  useEffect(() => {
    if (!dirty) return
    const h = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])
}

/* ---------- people & dates pickers ---------- */
export function PersonPicker({ value, onChange, label, exclude }: { value?: string; onChange: (id: string) => void; label: string; exclude?: string[] }) {
  const { state } = useSnap()
  return (
    <select aria-label={label} value={value || ''} onChange={e => onChange(e.target.value)}>
      <option value="" disabled>Choose person…</option>
      {Object.values(state!.users).filter((u: any) => !exclude?.includes(u.id)).map((u: any) => <option key={u.id} value={u.id}>John Doe · {u.role}</option>)}
    </select>
  )
}

/** Clickable assignee name that opens a small picker. No permanent Edit button. */
export function AssigneeButton({ action, onDone }: { action: R; onDone?: () => void }) {
  const { state } = useSnap()
  const [open, setOpen] = useState(false)
  const [val, setVal] = useState(action.assignee_id)
  const { submit, busy, error, clear } = useSubmit('reassign_action')
  const canAssign = (state!.users[state!.me].caps as string[]).includes('assign')
  const closed = ['completed', 'cancelled'].includes(action.status)
  const label = action.assignment_confirmed
    ? personLabel(state!, action.assignee_id)
    : `${personLabel(state!, action.assignee_id)}; assignment to confirm`
  if (!canAssign || closed) return <span>{label}</span>
  return (
    <span style={{ position: 'relative' }}>
      <button className="link" aria-haspopup="dialog" aria-expanded={open} onClick={() => { setOpen(!open); clear() }} title="Reassign this action">{label}</button>
      {open && (
        <div className="pop" style={{ left: 0, top: '100%', marginTop: 4, padding: 10, width: 260 }} role="dialog" aria-label="Reassign action">
          <div className="col">
            <PersonPicker value={val} onChange={setVal} label="New assignee" />
            <span className="hint">Only this action changes hands. The overall work owner stays the same.</span>
            <ErrorBox err={error} />
            <div className="row">
              <button className="btn primary small" disabled={busy || val === action.assignee_id} onClick={async () => {
                const r = await submit({ action_id: action.id, assignee_id: val, if_rev: action.rev })
                if (r) { setOpen(false); onDone?.() }
              }}>{busy ? 'Saving…' : 'Reassign'}</button>
              <button className="btn small" onClick={() => setOpen(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </span>
  )
}

/* ---------- compact timeline: dots with hover/focus/click, expandable list ---------- */
export function Timeline({ events, since, title = 'Timeline', maxDots = 14 }: { events: R[]; since?: string | null; title?: string; maxDots?: number }) {
  const { state } = useSnap()
  const [expanded, setExpanded] = useState(false)
  const [hover, setHover] = useState<{ ev: R; x: number; y: number } | null>(null)
  const [pinned, setPinned] = useState<string | null>(null)
  const sorted = [...events].sort((a, b) => b.ts.localeCompare(a.ts))
  const shown = sorted.slice(0, maxDots)
  const show = (ev: R, el: HTMLElement) => {
    const r = el.getBoundingClientRect()
    const w = 280
    const x = Math.max(8, Math.min(r.left - w - 8, window.innerWidth - w - 8))
    const y = Math.max(64, Math.min(r.top - 10, window.innerHeight - 160))
    setHover({ ev, x, y })
  }
  const card = (ev: R) => (
    <div className="tl-card" style={{ width: 280 }}>
      <div className="small muted">{fmtTs(ev.ts)} · {personLabel(state!, ev.actor_id)}</div>
      <div className="strong">{ev.title}</div>
      {ev.detail && <div className="small">{ev.detail}</div>}
      <div className="small muted">{ev.origin === 'prototype' ? 'Recorded in this prototype' : 'From recorded source'}</div>
      {ev.source_id && <SourceLink id={ev.source_id} label="View source" />}
    </div>
  )
  const pinnedEv = pinned ? sorted.find(e => e.id === pinned) : null
  return (
    <section aria-label={title} className="tl">
      <div className="row mb-8"><h3 className="grow">{title} <span className="muted" style={{ fontWeight: 400 }}>· {sorted.length} events</span></h3>
        <button className="btn ghost small" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? 'Collapse' : 'Expand'}</button></div>
      {!expanded && (
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <div className="tl-rail" role="list">
            {shown.map(ev => (
              <button key={ev.id} role="listitem" className={`tl-dot ${ev.origin === 'prototype' ? 'proto' : ''}`} aria-pressed={pinned === ev.id}
                aria-label={`${fmtTs(ev.ts)}: ${ev.title}`}
                onMouseEnter={e => show(ev, e.currentTarget)} onMouseLeave={() => setHover(null)}
                onFocus={e => show(ev, e.currentTarget)} onBlur={() => setHover(null)}
                onClick={() => setPinned(pinned === ev.id ? null : ev.id)} />
            ))}
          </div>
          <div className="grow small muted" style={{ paddingLeft: 8 }}>
            {pinnedEv ? card(pinnedEv) : <>Hover, focus or select a dot for details. {sorted.length > shown.length && `Showing latest ${shown.length}.`}</>}
          </div>
        </div>
      )}
      {!expanded && hover && !pinnedEv && <div style={{ position: 'fixed', left: hover.x, top: hover.y, zIndex: 120, pointerEvents: 'none' }}>{card(hover.ev)}</div>}
      {expanded && (
        <ol className="tl-list" aria-label={`${title}, full history`}>
          {sorted.map(ev => (
            <li key={ev.id} className={`${ev.origin === 'prototype' ? 'proto' : ''} ${since && ev.ts > since ? 'new' : ''}`}>
              <div className="small muted">{fmtTs(ev.ts)} · {personLabel(state!, ev.actor_id)}</div>
              <div className="strong tl-title">{ev.title}</div>
              {ev.detail && <div className="small">{ev.detail}</div>}
              <div className="small muted">{ev.origin === 'prototype' ? 'Recorded in this prototype' : 'From recorded source'} {ev.source_id && <>· <SourceLink id={ev.source_id} label="View source" /></>}</div>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

export function CalendarIcon() { return <Calendar size={14} /> }

import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Bell, Factory, LayoutDashboard, ListChecks, MessageSquare, Shirt, Store, X } from 'lucide-react'
import { closeSource, loadState, resetDemo, run, setSimulateFail, switchUser, toast, toggleAssistant, useSnap, useUi } from './store'
import { Dialog, Person } from './ui'
import { fmtDate, fmtTs } from './util'
import { Assistant } from './Assistant'

const NAV = [
  { to: '/overview', label: 'Overview', icon: LayoutDashboard },
  { to: '/my-work', label: 'My Work', icon: ListChecks },
  { to: '/brands', label: 'Brands', icon: Store },
  { to: '/styles', label: 'Styles', icon: Shirt },
  { to: '/vendors', label: 'Vendors', icon: Factory },
]

function Notifications() {
  const { state } = useSnap()
  const [open, setOpen] = useState(false)
  const nav = useNavigate()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (open && ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])
  const list = Object.values(state!.notifications).sort((a: any, b: any) => b.ts.localeCompare(a.ts)) as any[]
  const unread = list.filter(n => !n.read_at).length
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="icon-btn" aria-label={`Notifications, ${unread} unread`} aria-expanded={open} onClick={() => setOpen(!open)}>
        <Bell size={18} />{unread > 0 && <span className="dot" aria-hidden>{unread}</span>}
      </button>
      {open && (
        <div className="pop" style={{ right: 0, top: 42, width: 360, maxHeight: 440, overflow: 'auto' }} role="dialog" aria-label="Notifications">
          <div className="row" style={{ padding: '10px 14px' }}><h3 className="grow">Notifications</h3>
            {unread > 0 && <button className="btn ghost small" onClick={() => run('read_all_notifications')}>Mark all read</button>}</div>
          <div className="hint" style={{ padding: '0 14px 8px' }}>Demo notifications: simulated in-app only, nothing is sent externally.</div>
          {list.length === 0 && <div className="empty">You have no notifications.</div>}
          <ul className="list">
            {list.map(n => (
              <li key={n.id} style={{ padding: 0, background: n.read_at ? undefined : '#f3f9f6' }}>
                <button className="item-btn" style={{ padding: '10px 14px' }} onClick={async () => { await run('read_notification', { notification_id: n.id }); setOpen(false); nav(n.route) }}>
                  <div className={n.read_at ? '' : 'strong'}>{n.text}</div>
                  <div className="small muted">{fmtTs(n.ts)}{!n.read_at && ' · Unread'}</div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function AccountMenu() {
  const { state, userId, simulateFail } = useSnap()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (open && ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="avatar-btn" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="avatar" aria-hidden>JD</span>
        <span className="small" style={{ textAlign: 'left' }}>John Doe<br /><span style={{ color: 'var(--shell-text-2)' }}>{state!.users[userId].role}</span></span>
      </button>
      {open && (
        <div className="pop" style={{ right: 0, top: 46, width: 320, padding: 14 }} role="dialog" aria-label="Account and demo controls">
          <h3>Demo controls</h3>
          <p className="hint mb-8">This prototype has no real sign-in. Switching role only changes which demo permissions apply; it confers no real authority.</p>
          <label className="field mb-8"><span>Demo role (acting as)</span>
            <select value={userId} onChange={e => { switchUser(e.target.value); toast(`Now acting as John Doe · ${state!.users[e.target.value].role} (demo role)`, 'info') }}>
              {Object.values(state!.users).map((u: any) => <option key={u.id} value={u.id}>John Doe · {u.role}</option>)}
            </select></label>
          <label className="row mb-8" style={{ fontSize: 13 }}><input type="checkbox" checked={simulateFail} onChange={e => setSimulateFail(e.target.checked)} />
            Simulate save failures (to see input preserved)</label>
          <button className="btn small" onClick={async () => { if (window.confirm('Reset all demo data to the original illustrative dataset? Your changes will be lost.')) { await resetDemo(); toast('Demo data reset.'); setOpen(false) } }}>Reset demo data</button>
        </div>
      )}
    </div>
  )
}

function SourceDialog() {
  const { source, sourceCtx } = useUi()
  const { state } = useSnap()
  const [full, setFull] = useState(false)
  useEffect(() => setFull(false), [source])
  if (!source || !state) return null
  const s = state.sources[source]
  if (!s) return <Dialog title="Source unavailable" onClose={closeSource}><p>This source is not available.</p></Dialog>
  const types: Record<string, string> = { meeting_note: 'Meeting note excerpt', email: 'Email', message: 'Message', document: 'Document' }
  const brandId = sourceCtx?.brand_id
  const multi = s.sections && s.sections.length > 0
  const mine = multi && brandId ? s.sections.filter((x: any) => x.brand_id === brandId) : s.sections
  const canFull = (state.users[state.me].caps as string[]).includes('assign')
  return (
    <Dialog title={s.title} onClose={closeSource} footer={<button className="btn" onClick={closeSource}>Close</button>}>
      <dl className="kv">
        <dt>Type</dt><dd>{types[s.type]}{s.summary_only && ' (summary supplied; original not available)'}</dd>
        <dt>Date</dt><dd>{fmtDate(s.date, true)} · {s.time}</dd>
        <dt>Author</dt><dd>{s.author}</dd>
        <dt>Participants</dt><dd>{s.participants?.length ? s.participants.join(', ') : 'Not recorded'}</dd>
      </dl>
      <div className="panel pad mt-16" style={{ background: 'var(--subtle)' }}>
        {multi ? (
          <>
            {(full ? s.sections : mine).map((x: any) => <p key={x.brand_id} className="mb-8"><strong>{state.brands[x.brand_id].name}:</strong> {x.text}</p>)}
            {brandId && !full && <p className="hint">This meeting covered several brands. Only the section relevant to {state.brands[brandId]?.name} is shown. {canFull && <button className="link" onClick={() => setFull(true)}>Show the full meeting record</button>}</p>}
          </>
        ) : <p>{s.excerpt}</p>}
      </div>
      <p className="hint mt-8">{s.original_url ? <a href={s.original_url}>Open original</a> : 'Open original is unavailable: this prototype has no live integration and holds only the supplied excerpt. Content is illustrative demo data.'}</p>
    </Dialog>
  )
}

function Toasts() {
  const { toasts } = useUi()
  return <div className="toast-wrap" role="status" aria-live="polite">{toasts.map(t => <div key={t.id} className="toast">{t.text}</div>)}</div>
}

export default function Shell() {
  const { state, loadError } = useSnap()
  const loc = useLocation()
  const { assistant } = useUi()
  useEffect(() => { if (!state) loadState() }, [])
  if (loadError && !state) return <div style={{ padding: 40 }}><div className="alert error" role="alert">{loadError}</div><button className="btn mt-16" onClick={loadState}>Retry</button></div>
  if (!state) return <div style={{ padding: 40 }} role="status">Loading prototype data…</div>
  return (
    <>
      <header className="topbar">
        <div className="brand"><span className="brand-mark" aria-hidden>F</span>Fynd Create Sourcing</div>
        <span className="demo-chip" title={state.meta.notice}>Prototype · illustrative demo data</span>
        <span className="grow" />
        <Notifications />
        <AccountMenu />
      </header>
      <nav className="rail" aria-label="Main">
        {NAV.map(n => (
          <NavLink key={n.to} to={n.to} className={({ isActive }) => (isActive || loc.pathname.startsWith(n.to) ? 'active' : '')}>
            <n.icon size={20} aria-hidden /><span>{n.label}</span>
          </NavLink>
        ))}
      </nav>
      <main className="main" id="main"><Outlet /></main>
      <button className="fab" aria-label={assistant ? 'Close assistant' : 'Open assistant'} aria-expanded={assistant} onClick={() => toggleAssistant()}>{assistant ? <X size={20} /> : <MessageSquare size={20} />}</button>
      {assistant && <Assistant />}
      <SourceDialog />
      <Toasts />
    </>
  )
}

export function PageHead({ title, crumbs, actions, children, sub }: { title: React.ReactNode; crumbs?: React.ReactNode; actions?: React.ReactNode; children?: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="page-head">
      {crumbs && <div className="crumbs">{crumbs}</div>}
      <div className="title-row"><div className="grow"><h1>{title}</h1>{sub && <div className="muted mt-8" style={{ marginTop: 4 }}>{sub}</div>}</div><div className="row wrap">{actions}</div></div>
      {children}
    </div>
  )
}

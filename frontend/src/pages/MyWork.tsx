import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Copy } from 'lucide-react'
import { PageHead } from '../Shell'
import { FocusDetail } from '../detail/FocusDetail'
import { NoteComposer } from '../detail/NoteComposer'
import { requestsFor } from '../detail/ActionBits'
import { useRemembered, useScrollMemory } from '../hooks'
import { toast, useSnap, type R } from '../store'
import { Badge, Dialog, Drawer, Empty, Tabs } from '../ui'
import { OPEN, TODAY, addDays, daysBetween, effDate, fmtDate, fmtTs, personLabel, plural, relDay } from '../util'

type Item = { kind: 'task'; action: R; group: string; date: string | null; replyBy: string | null; leadership: R | null; reqToMe: R | null }

function weekStart(d: string) { const t = new Date(d + 'T00:00:00Z'); const dow = (t.getUTCDay() + 6) % 7; return addDays(d, -dow) }

export default function MyWork() {
  const { state: s } = useSnap()
  const st = s!
  const me = st.me
  const nav = useNavigate()
  const [q, setQ] = useSearchParams()
  const openId = q.get('open')
  const [tab, setTab] = useRemembered('mw:tab', 'tasks')
  const [search, setSearch] = useRemembered('mw:search', '')
  const [brandF, setBrandF] = useRemembered('mw:brand', 'all')
  const [open, setOpen] = useRemembered<Record<string, boolean>>('mw:groups', { overdue: true, today: true, later: false, nodate: false })
  const [day, setDay] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [composer, setComposer] = useState<null | { note?: R }>(null)
  const [allNotes, setAllNotes] = useState(false)
  const [calendar, setCalendar] = useState(false)
  useScrollMemory('mywork')

  const actions = Object.values(st.actions) as R[]
  const brandOf = (a: R) => (a.work_id ? st.works[a.work_id].brand_id : a.vendor_id ? 'vendor' : '')
  const matches = (a: R) => {
    if (brandF !== 'all' && brandOf(a) !== brandF) return false
    const t = search.trim().toLowerCase()
    if (!t) return true
    const w = a.work_id ? st.works[a.work_id] : null
    const hay = [a.title, w?.title, w && st.brands[w.brand_id].name, a.style_id && st.styles[a.style_id]?.name, a.style_id, a.vendor_id && st.vendors[a.vendor_id]?.name, a.id].join(' ').toLowerCase()
    return hay.includes(t)
  }

  const items: Item[] = useMemo(() => actions.filter(a => a.assignee_id === me && OPEN.includes(a.status) && matches(a)).map(a => {
    const reqToMe = requestsFor(st, a.id).find(r => r.state === 'awaiting' && r.recipient_id === me) || null
    const replyBy = reqToMe?.response_due || null
    const dates = [a.due, replyBy].filter(Boolean) as string[]
    const date = dates.length ? dates.sort()[0] : null
    const group = !date ? 'nodate' : date < TODAY ? 'overdue' : date === TODAY ? 'today' : 'later'
    return { kind: 'task' as const, action: a, group, date, replyBy, leadership: reqToMe?.leadership ? reqToMe : null, reqToMe }
  }).sort((a, b) => (a.date || '9').localeCompare(b.date || '9')), [st, search, brandF])

  const waiting = useMemo(() => {
    const out: R[] = []
    const seenActions = new Set<string>()
    for (const w of Object.values(st.waiting) as R[]) {
      if (w.tracker_id !== me || w.state !== 'open') continue
      const a = st.actions[w.action_id]
      if (!matches(a)) continue
      seenActions.add(w.action_id)
      const req = requestsFor(st, w.action_id).find(r => r.requester_id === me && ((r.state === 'responded' && !r.requester_read_at) || r.state === 'awaiting'))
      out.push({ id: w.id, action: a, desc: w.description, party: w.party.name, expected: w.expected, latest: w.latest, received: w.update_received || (req?.state === 'responded' && !req.requester_read_at), work: a.work_id })
    }
    for (const r of Object.values(st.requests) as R[]) {
      if (r.requester_id !== me || seenActions.has(r.action_id)) continue
      if (r.state === 'awaiting' || (r.state === 'responded' && !r.requester_read_at)) {
        const a = st.actions[r.action_id]
        if (!matches(a)) continue
        out.push({ id: r.id, action: a, desc: 'Waiting for a response to your update request', party: personLabel(st, r.recipient_id), expected: r.response_due, latest: r.state === 'responded' ? 'Response received. Not yet reviewed.' : `Requested ${relDay(r.requested_at.slice(0, 10))}.`, received: r.state === 'responded', work: a.work_id })
      }
    }
    return out
  }, [st, search, brandF])

  const completed = actions.filter(a => a.assignee_id === me && a.status === 'completed' && matches(a)).sort((a, b) => b.completion.at.localeCompare(a.completion.at))

  const groups: [string, string, Item[]][] = [['overdue', 'Overdue', items.filter(i => i.group === 'overdue')], ['today', 'Today', items.filter(i => i.group === 'today')],
    ['later', 'Later', items.filter(i => i.group === 'later')], ['nodate', 'No date set', items.filter(i => i.group === 'nodate')]]

  // Coming up: my task deadlines, reply deadlines and commitments I own
  const agenda = useMemo(() => {
    const out: { date: string; kind: string; title: string; ctx: string; action?: string; work?: string; commitment?: string }[] = []
    for (const a of actions) {
      if (a.assignee_id === me && OPEN.includes(a.status)) {
        const ctx = a.work_id ? `${st.brands[st.works[a.work_id].brand_id].name} · ${st.works[a.work_id].title}` : a.vendor_id ? st.vendors[a.vendor_id].name : ''
        if (a.due) out.push({ date: a.due, kind: 'Task due', title: a.title, ctx, action: a.id })
        const r = requestsFor(st, a.id).find(x => x.state === 'awaiting' && x.recipient_id === me && x.response_due)
        if (r) out.push({ date: r.response_due, kind: 'Reply due', title: a.title, ctx, action: a.id })
      }
    }
    for (const c of Object.values(st.commitments) as R[]) {
      if (c.owner_id === me && c.state !== 'done') {
        const w = st.works[c.work_id]
        out.push({ date: effDate(c), kind: 'Commitment', title: c.title, ctx: `${st.brands[w.brand_id].name} · ${w.title}`, work: w.id, commitment: c.id })
      }
    }
    return out.sort((a, b) => a.date.localeCompare(b.date))
  }, [st])
  const ws = weekStart(TODAY)
  const week = Array.from({ length: 7 }, (_, i) => addDays(ws, i))
  const agendaShown = day ? agenda.filter(x => x.date === day) : agenda.filter(x => x.date >= TODAY && x.date <= addDays(TODAY, 14))

  const myNotes = (Object.values(st.notes) as R[]).filter(n => n.author_id === me).sort((a, b) => b.created_at.localeCompare(a.created_at))

  const openAction = (id: string) => { setQ({ open: id }, { replace: false }) }
  const closePanel = () => { setQ({}, { replace: false }) }
  const act = openId ? st.actions[openId] : null
  const brands = Object.values(st.brands) as R[]

  const rowCTA = (i: Item) => i.reqToMe ? 'Respond' : 'View action'

  return (
    <>
      <PageHead title="My Work" sub={<>{fmtDate(TODAY, true)} · Your actions, what you are waiting for, and what is coming up.</>}
        actions={<button className="btn primary" onClick={() => setComposer({})}>+ Add note</button>}>
        <Tabs label="My Work views" value={tab} onChange={setTab} tabs={[{ id: 'tasks', label: 'My tasks', count: items.length }, { id: 'waiting', label: 'Waiting for updates', count: waiting.length }, { id: 'done', label: 'Completed', count: completed.length }]} />
      </PageHead>
      <div className="page-body">
        <div className="grid-main" style={{ gridTemplateColumns: 'minmax(0, 2fr) minmax(300px, 1fr)' }}>
          <section className="panel" aria-label={tab === 'tasks' ? 'My tasks' : tab === 'waiting' ? 'Waiting for updates' : 'Completed'}>
            <div className="toolbar" role="search">
              <select aria-label="Brand" value={brandF} onChange={e => setBrandF(e.target.value)}><option value="all">All brands</option>{brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}<option value="vendor">Vendor-only work</option></select>
              <input className="search" type="search" aria-label="Search actions" placeholder="Search actions, brands, vendors, styles…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>

            {tab === 'tasks' && (items.length === 0 ? <Empty title={search || brandF !== 'all' ? 'No tasks match your search' : 'You have no open tasks'}>{(search || brandF !== 'all') && <button className="link" onClick={() => { setSearch(''); setBrandF('all') }}>Clear filters</button>}</Empty> : (
              <div>
                {groups.map(([key, label, list]) => (list.length === 0 && key !== 'overdue' ? null : list.length === 0 ? null : (
                  <div key={key}>
                    <button className="btn link-like" style={{ width: '100%', padding: '10px 16px', background: 'var(--subtle)', justifyContent: 'space-between', color: 'var(--text)', textDecoration: 'none' }} aria-expanded={open[key]} onClick={() => setOpen({ ...open, [key]: !open[key] })}>
                      <span className="strong">{label} <span className="muted" style={{ fontWeight: 400 }}>· {list.length}</span></span><span className="small muted">{open[key] ? 'Hide' : 'Show'}</span></button>
                    {open[key] && <ul className="list">{list.map(i => {
                      const a = i.action; const w = a.work_id ? st.works[a.work_id] : null
                      const replyOnly = i.replyBy && (!a.due || a.due > i.replyBy)
                      return (
                        <li key={a.id} className={i.leadership ? 'leader' : ''} style={{ padding: '10px 16px' }}>
                          <div className="row wrap" style={{ alignItems: 'flex-start' }}>
                            <div className="grow">
                              <button className="link strong" style={{ textAlign: 'left' }} onClick={() => openAction(a.id)}>{a.title}</button>
                              <div className="small muted">{w ? `${st.brands[w.brand_id].name} · ${w.title}` : a.vendor_id ? `Vendor · ${st.vendors[a.vendor_id].name}` : ''}{a.style_id && st.styles[a.style_id] ? ` · ${st.styles[a.style_id].name}` : ''}</div>
                              <div className="row wrap small mt-8" style={{ gap: 6 }}>
                                <span>{a.due ? `Due ${fmtDate(a.due)}` : 'No date set'}</span>
                                {key === 'overdue' && a.due && a.due < TODAY && <Badge tone="error">Overdue · {plural(daysBetween(a.due, TODAY), 'day')}</Badge>}
                                {i.replyBy && <Badge tone={i.replyBy < TODAY ? 'error' : 'attention'}>{i.replyBy === TODAY ? 'Reply by today' : `Reply by ${fmtDate(i.replyBy)}`}</Badge>}
                                {a.status === 'blocked' && <Badge tone="error">Blocked</Badge>}
                                {a.status === 'awaiting_review' && <Badge tone="info">Awaiting review</Badge>}
                                {i.leadership && <Badge tone="info">Leadership requested an update</Badge>}
                                {i.reqToMe && !i.leadership && <Badge tone="attention">Update requested</Badge>}
                                {i.leadership && <span className="muted">from {personLabel(st, i.leadership.requester_id)}</span>}
                              </div>
                              {replyOnly && a.due && <div className="small muted">Task due {fmtDate(a.due)}; reply is due earlier.</div>}
                            </div>
                            <button className={`btn small ${i.reqToMe ? 'primary' : ''}`} onClick={() => openAction(a.id)}>{rowCTA(i)}</button>
                          </div>
                        </li>)
                    })}</ul>}
                  </div>)))}
              </div>
            ))}

            {tab === 'waiting' && (waiting.length === 0 ? <Empty title="You are not waiting on anything">Items appear here when you own dependent work or request an update.</Empty> : (
              <ul className="list">{waiting.map(w => (
                <li key={w.id} style={{ padding: '10px 16px' }}>
                  <div className="row wrap" style={{ alignItems: 'flex-start' }}>
                    <div className="grow">
                      <div className="strong">{w.desc} <span className="muted" style={{ fontWeight: 400 }}>· {w.party}</span></div>
                      <div className="small muted"><button className="link" onClick={() => openAction(w.action.id)}>{w.action.title}</button>{w.work && ` · ${st.brands[st.works[w.work].brand_id].name} · ${st.works[w.work].title}`}</div>
                      <div className="row wrap small mt-8" style={{ gap: 6 }}>
                        <span>{w.expected ? `Expected ${fmtDate(w.expected)}` : 'No expected date'}</span>
                        {w.received && <Badge tone="info">Update received</Badge>}
                        <span className="muted">Latest: {w.latest}</span></div>
                    </div>
                    <button className="btn small" onClick={() => openAction(w.action.id)}>{w.received ? 'Review update' : 'Follow up'}</button>
                  </div>
                </li>))}</ul>
            ))}

            {tab === 'done' && (completed.length === 0 ? <Empty title="No completed actions match">Completed work appears here with its outcome.</Empty> : (
              <ul className="list">{completed.map(a => (
                <li key={a.id} style={{ padding: '10px 16px' }}>
                  <button className="link strong" onClick={() => openAction(a.id)}>{a.title}</button>
                  <div className="small muted">{a.work_id ? `${st.brands[st.works[a.work_id].brand_id].name} · ${st.works[a.work_id].title}` : ''} · Completed {fmtDate(a.completion.at)}</div>
                  <div className="small">{a.completion.outcome}</div></li>))}</ul>
            ))}
          </section>

          <div className="col gap-16">
            <section className="panel" aria-label="Coming up">
              <div className="panel-head"><h2 className="grow">Coming up</h2><button className="btn link-like small" onClick={() => setCalendar(true)}>View calendar</button></div>
              <div className="panel-body">
                <div className="row" role="group" aria-label="This week" style={{ gap: 4, justifyContent: 'space-between' }}>
                  {week.map(d => {
                    const n = agenda.filter(x => x.date === d).length
                    const lbl = new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' })
                    return <button key={d} className="btn small" aria-pressed={day === d} onClick={() => setDay(day === d ? null : d)}
                      style={{ flexDirection: 'column', height: 52, padding: '0 6px', flex: 1, background: day === d ? 'var(--nav-active)' : d === TODAY ? 'var(--subtle)' : undefined, color: day === d ? '#fff' : undefined, borderColor: day === d ? 'var(--nav-active)' : undefined }}
                      aria-label={`${fmtDate(d)}${d === TODAY ? ' (today)' : ''}, ${n} ${n === 1 ? 'item' : 'items'}`}>
                      <span className="small">{lbl}</span><strong>{Number(d.slice(8))}</strong>{n > 0 ? <span style={{ fontSize: 9 }}>● {n}</span> : <span style={{ fontSize: 9 }}>&nbsp;</span>}</button>
                  })}
                </div>
                <div className="small muted mt-8">{day ? <>Showing {fmtDate(day)} · <button className="link" onClick={() => setDay(null)}>Show all upcoming</button></> : 'Next 14 days, including today'}</div>
                {agendaShown.length === 0 ? <div className="muted mt-8">{day ? 'Nothing is due on this day.' : 'No upcoming commitments.'}</div> : (
                  <ul className="list" style={{ marginTop: 4 }}>
                    {agendaShown.map((x, idx) => (
                      <li key={idx} style={{ padding: '8px 0' }}>
                        <button className="item-btn" onClick={() => x.action ? openAction(x.action) : nav(`/overview/work/${x.work}?commitment=${x.commitment}`)}>
                          <div className="row" style={{ gap: 8 }}><strong style={{ minWidth: 48 }}>{relDay(x.date) === 'Today' || relDay(x.date) === 'Tomorrow' || relDay(x.date) === 'Yesterday' ? fmtDate(x.date) : fmtDate(x.date)}</strong><Badge tone={x.kind === 'Reply due' ? 'attention' : x.kind === 'Commitment' ? 'info' : ''}>{x.kind}</Badge></div>
                          <div>{x.title}</div><div className="small muted">{x.ctx}</div>
                        </button>
                      </li>))}
                  </ul>
                )}
                <p className="hint mt-8">Work deadlines only. Overdue work stays in your task list. Meeting calendars are not connected.</p>
              </div>
            </section>

            <section className="panel" aria-label="Notes">
              <div className="panel-head"><h2 className="grow">Notes</h2><button className="btn small" onClick={() => setComposer({})}>Add note</button></div>
              <div className="panel-body">
                {myNotes.length === 0 ? <div className="muted">No notes yet. Use Add note after a call or factory visit.</div> : (
                  <ul className="list">{myNotes.slice(0, 3).map(n => (
                    <li key={n.id} style={{ padding: '8px 0' }}>
                      <button className="item-btn" onClick={() => setComposer({ note: n })}>
                        <div className="row wrap" style={{ gap: 6 }}><strong>{n.title || 'Untitled note'}</strong>{n.visibility === 'private' ? <Badge>Private · Only you</Badge> : <Badge tone="success">Posted</Badge>}</div>
                        <div className="small">{n.body.slice(0, 90)}{n.body.length > 90 ? '…' : ''}</div><div className="small muted">{fmtTs(n.created_at)}</div></button></li>))}</ul>
                )}
                <button className="btn link-like small mt-8" onClick={() => setAllNotes(true)}>View all notes ({myNotes.length})</button>
              </div>
            </section>
          </div>
        </div>
      </div>

      {act && (
        <Drawer title={`Action: ${act.title}`} onClose={closePanel} expanded={expanded} onToggle={() => setExpanded(!expanded)}
          extraBar={<button className="btn ghost small" onClick={() => { navigator.clipboard?.writeText(window.location.href).then(() => toast('Link copied.')).catch(() => toast('Could not copy the link.', 'error')) }}><Copy size={14} /> Copy link</button>}>
          <FocusDetail workId={act.work_id} mode="panel" focus={{ actionId: act.id, issueId: act.issue_id }} />
        </Drawer>
      )}
      {openId && !act && <Dialog title="Action not found" onClose={closePanel}><p>This action is no longer available.</p></Dialog>}

      {composer && <NoteComposer note={composer.note} onClose={() => setComposer(null)} />}
      {allNotes && (
        <Dialog title="All notes" onClose={() => setAllNotes(false)} wide footer={<button className="btn" onClick={() => setAllNotes(false)}>Close</button>}>
          <p className="hint mb-8">Your private notes and notes you have posted. Tasks arising from a note are separate actions.</p>
          {myNotes.length === 0 && <Empty title="No notes" />}
          <ul className="list">{myNotes.map(n => (
            <li key={n.id} style={{ padding: '10px 0' }}>
              <div className="row wrap" style={{ gap: 6 }}><strong>{n.title || 'Untitled note'}</strong>{n.visibility === 'private' ? <Badge>Private · Only you</Badge> : <Badge tone="success">Posted</Badge>}<span className="muted small">{fmtTs(n.created_at)} · {fmtDate(n.event_date)}</span></div>
              <div>{n.body}</div>
              {n.visibility === 'posted' ? <div className="small mt-8">Posted {fmtTs(n.posted_at)} to {[...(n.posted_to.work_ids || []).map((w: string) => st.works[w]?.title), ...(n.posted_to.vendor_ids || []).map((v: string) => st.vendors[v]?.name), ...(n.posted_to.style_ids || []).map((x: string) => st.styles[x]?.name)].filter(Boolean).join(', ')}. {n.links.brand_id && <Link to={`/brands/${n.links.brand_id}/activity`} onClick={() => setAllNotes(false)}>See it in shared Activity</Link>}</div>
                : <button className="btn small mt-8" onClick={() => { setAllNotes(false); setComposer({ note: n }) }}>Open / edit / post</button>}
            </li>))}</ul>
        </Dialog>
      )}
      {calendar && <CalendarDialog agenda={agenda} onClose={() => setCalendar(false)} onOpen={(x: any) => { setCalendar(false); x.action ? openAction(x.action) : nav(`/overview/work/${x.work}?commitment=${x.commitment}`) }} />}
    </>
  )
}

function CalendarDialog({ agenda, onClose, onOpen }: { agenda: any[]; onClose: () => void; onOpen: (x: any) => void }) {
  const [month, setMonth] = useState(TODAY.slice(0, 7))
  const [y, m] = month.split('-').map(Number)
  const first = `${month}-01`
  const lead = (new Date(first + 'T00:00:00Z').getUTCDay() + 6) % 7
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const cells = Array.from({ length: lead + days }, (_, i) => (i < lead ? null : `${month}-${String(i - lead + 1).padStart(2, '0')}`))
  const shift = (n: number) => { const t = new Date(Date.UTC(y, m - 1 + n, 1)); setMonth(t.toISOString().slice(0, 7)) }
  return (
    <Dialog title="Your calendar (work deadlines)" onClose={onClose} wide footer={<button className="btn" onClick={onClose}>Close</button>}>
      <div className="row mb-8"><button className="btn small" onClick={() => shift(-1)}>‹ Previous</button><strong className="grow" style={{ textAlign: 'center' }}>{new Date(first + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</strong><button className="btn small" onClick={() => shift(1)}>Next ›</button></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0,1fr))', gap: 4 }} role="grid" aria-label="Month">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => <div key={d} className="small muted" style={{ textAlign: 'center' }}>{d}</div>)}
        {cells.map((d, i) => d === null ? <div key={i} /> : (
          <div key={d} role="gridcell" className="panel" style={{ minHeight: 72, padding: 4, background: d === TODAY ? 'var(--subtle)' : undefined }}>
            <div className="small"><strong>{Number(d.slice(8))}</strong></div>
            {agenda.filter(x => x.date === d).map((x, j) => <button key={j} className="link small trunc" style={{ display: 'block', maxWidth: '100%', textAlign: 'left' }} onClick={() => onOpen(x)} title={`${x.kind}: ${x.title}`}>{x.kind === 'Reply due' ? '↩ ' : x.kind === 'Commitment' ? '◆ ' : '● '}{x.title}</button>)}
          </div>))}
      </div>
      <p className="hint mt-8">● task due · ↩ reply due · ◆ commitment. Undated work stays in your task list under “No date set”.</p>
    </Dialog>
  )
}

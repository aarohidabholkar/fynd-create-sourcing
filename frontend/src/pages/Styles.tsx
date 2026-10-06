import { useMemo, useState } from 'react'
import { Link, Navigate, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { PageHead } from '../Shell'
import { NoteComposer } from '../detail/NoteComposer'
import { FocusDetail } from '../detail/FocusDetail'
import { AddActionForm } from '../detail/ActionBits'
import { useRemembered, useScrollMemory } from '../hooks'
import { eventLinks } from '../links'
import { useSnap, type R } from '../store'
import { Badge, Drawer, Empty, Person, Placeholder, SourceLink, Tabs } from '../ui'
import { OPEN, effDate, fmtDate, fmtTs, isOverdue, personLabel, plural } from '../util'
import { CostingTab } from '../styles/Costing'
import { BomDialog, CreateStyleDialog, FilesDialog, ImportDialog, InfoDialog, LockNotice, MeasurementsDialog, TechPackDialog } from '../styles/Docs'
import { OrderTab } from '../styles/OrderTab'
import { ProductionTab } from '../styles/Production'
import { SamplingTab } from '../styles/Sampling'

export default function Styles() {
  return (
    <Routes>
      <Route index element={<StyleDirectory />} />
      <Route path=":styleId" element={<RedirectOverview />} />
      <Route path=":styleId/:tab" element={<StylePage />} />
    </Routes>
  )
}
function RedirectOverview() { const { styleId } = useParams(); const loc = window.location.search; return <Navigate to={`/styles/${styleId}/overview${loc}`} replace /> }

function StyleDirectory() {
  const { state: s } = useSnap()
  const st = s!
  const [qp] = useSearchParams()
  const [f, setF] = useRemembered('styles:filters', { brand: 'all', work: 'all', life: 'all', owner: 'all', vendor: 'all', q: '' })
  const [dlg, setDlg] = useState<null | 'create' | 'import'>(null)
  useScrollMemory('styles')
  const brandScope = qp.get('brand')
  const filt = brandScope ? { ...f, brand: brandScope } : f
  const all = Object.values(st.styles) as R[]
  const vendorStyles = (vid: string) => new Set((st.derived.vendors[vid].work as R[]).map(r => r.style_id))
  const rows = all.filter(x => {
    if (filt.brand !== 'all' && x.brand_id !== filt.brand) return false
    if (filt.work !== 'all' && x.work_id !== filt.work) return false
    if (filt.owner !== 'all' && x.owner_id !== filt.owner) return false
    if (filt.vendor !== 'all' && !vendorStyles(filt.vendor).has(x.id)) return false
    if (filt.life === 'draft' && x.lifecycle !== 'draft') return false
    if (filt.life === 'ready' && !(x.lifecycle !== 'draft' && st.derived.styles[x.id].readiness.sourcing_ready.ready)) return false
    if (filt.life === 'active' && x.lifecycle !== 'active') return false
    if (filt.life === 'dropped' && x.lifecycle !== 'dropped') return false
    return !filt.q || (x.name + ' ' + x.id + ' ' + x.category).toLowerCase().includes(filt.q.toLowerCase())
  })
  const drafts = all.filter(x => x.lifecycle === 'draft').length
  const nextAction = (sid: string) => (Object.values(st.actions) as R[]).filter(a => a.style_id === sid && OPEN.includes(a.status)).sort((a, b) => (a.due || '9').localeCompare(b.due || '9'))[0]
  const reset = () => setF({ brand: 'all', work: 'all', life: 'all', owner: 'all', vendor: 'all', q: '' })
  const works = (Object.values(st.works) as R[]).filter(w => filt.brand === 'all' || w.brand_id === filt.brand)
  return (
    <>
      <PageHead title="Styles" sub={`Every style across brands, including ${plural(drafts, 'draft')}. Open one to work on costing, sampling, orders and production.`}
        actions={<><button className="btn" onClick={() => setDlg('import')}>Bulk import</button><button className="btn primary" onClick={() => setDlg('create')}>Create style</button></>} />
      <div className="page-body">
        <section className="panel">
          <div className="toolbar" role="search">
            <select aria-label="Brand" value={filt.brand} onChange={e => setF({ ...f, brand: e.target.value, work: 'all' })}><option value="all">All brands</option>{(Object.values(st.brands) as R[]).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
            <select aria-label="Project" value={filt.work} onChange={e => setF({ ...f, work: e.target.value })}><option value="all">All projects</option>{works.map(w => <option key={w.id} value={w.id}>{w.title}</option>)}</select>
            <select aria-label="State" value={filt.life} onChange={e => setF({ ...f, life: e.target.value })}><option value="all">All states</option><option value="draft">Drafts ({drafts})</option><option value="ready">Ready for sourcing</option><option value="active">Active</option><option value="dropped">Dropped</option></select>
            <select aria-label="Owner" value={filt.owner} onChange={e => setF({ ...f, owner: e.target.value })}><option value="all">All owners</option>{(Object.values(st.users) as R[]).map(u => <option key={u.id} value={u.id}>John Doe · {u.role}</option>)}</select>
            <select aria-label="Vendor" value={filt.vendor} onChange={e => setF({ ...f, vendor: e.target.value })}><option value="all">All vendors</option>{(Object.values(st.vendors) as R[]).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select>
            <input className="search" type="search" aria-label="Search styles by name or ID" placeholder="Search name or style ID…" value={filt.q} onChange={e => setF({ ...f, q: e.target.value })} />
          </div>
          <div className="small muted" style={{ padding: '8px 16px' }}>{plural(rows.length, 'style')} shown{brandScope && <> · filtered to {st.brands[brandScope]?.name} <Link to="/styles">Show all brands</Link></>}</div>
          <div className="table-wrap"><table className="t"><thead><tr><th>Style</th><th>Brand / project</th><th>Category</th><th>Current position</th><th>Owner</th><th>Next action</th></tr></thead><tbody>
            {rows.length === 0 && <tr><td colSpan={6}><Empty title="No styles match these filters"><button className="link" onClick={reset}>Clear filters</button></Empty></td></tr>}
            {rows.map(x => { const na = nextAction(x.id); const ro = st.derived.styles[x.id]; return (
              <tr key={x.id}><td><div className="row"><Placeholder /><div><Link to={`/styles/${x.id}/overview`} className="strong">{x.name}</Link>{x.lifecycle === 'draft' && <> <Badge tone="attention">Draft</Badge></>}{x.lifecycle === 'dropped' && <> <Badge>Dropped</Badge></>}<div className="small muted">{x.id}</div></div></div></td>
                <td className="small">{st.brands[x.brand_id].name}<div className="muted">{x.work_id ? st.works[x.work_id].title : 'No project'}</div></td><td className="small">{x.category}</td>
                <td className="small">{ro.position}{x.lifecycle === 'draft' && ro.readiness.sourcing_ready.missing.length > 0 && <div className="muted">Missing: {ro.readiness.sourcing_ready.missing.map((m: R) => m.label).join(', ')}</div>}</td>
                <td className="small"><Person id={x.owner_id} role={false} /> <span className="muted">{st.users[x.owner_id].role}</span></td>
                <td className="small">{na ? <>{na.title}<div className="muted">{na.due ? `Due ${fmtDate(na.due)}` : 'No date set'}</div></> : <span className="muted">None</span>}</td></tr>) })}</tbody></table></div>
        </section>
      </div>
      {dlg === 'create' && <CreateStyleDialog onClose={() => setDlg(null)} brandId={filt.brand !== 'all' ? filt.brand : undefined} />}
      {dlg === 'import' && <ImportDialog onClose={() => setDlg(null)} />}
    </>
  )
}

const KIND_GROUP = (k: string) => k.startsWith('quote') ? 'Costing' : /^(sample|round|internal_review|correction|external_decision|brand_receipt)/.test(k) ? 'Sampling'
  : /^(order|allocated|amendment)/.test(k) ? 'Order' : /^(progress|milestone|test|inspection|gate3|shipment)/.test(k) ? 'Production' : 'General'

function StyleOverview({ styleId }: { styleId: string }) {
  const { state: s } = useSnap()
  const st = s!
  const nav = useNavigate()
  const [q, setQ] = useSearchParams()
  const [adding, setAdding] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [filter, setFilter] = useRemembered('style:act:' + styleId, 'All')
  const [term, setTerm] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const style = st.styles[styleId]; const d = st.derived.styles[styleId]
  const allocs = (Object.values(st.allocations) as R[]).filter(a => a.style_id === styleId)
  const rounds = (Object.values(st.sample_rounds) as R[]).filter(r => st.sample_requests[r.request_id].style_id === styleId)
  const quotes = (Object.values(st.quotes) as R[]).filter(x => x.style_id === styleId)
  const actions = (Object.values(st.actions) as R[]).filter(a => a.style_id === styleId && OPEN.includes(a.status))

  type Todo = { key: string; title: string; ctx: string; owner?: string; due?: string | null; cta: string; go: () => void; tone?: string }
  const todos: Todo[] = []
  rounds.filter(r => r.received > 0 && ['not_started', 'in_progress'].includes(r.internal.state)).forEach(r => { const rq = st.sample_requests[r.request_id]; todos.push({ key: 'rv' + r.id, title: `Review ${rq.type} sample round ${r.round}`, ctx: `${st.vendors[rq.vendor_id].name} · ${r.received} piece(s) received`, cta: 'Start review', go: () => nav(`/styles/${styleId}/sampling?round=${r.id}`) }) })
  quotes.filter(x => x.state === 'received').forEach(x => todos.push({ key: 'q' + x.id, title: `Review quote v${x.version}`, ctx: `${st.vendors[x.vendor_id].name} · no decision recorded`, cta: 'Review quote', go: () => nav(`/styles/${styleId}/costing?quote=${x.id}`) }))
  allocs.filter(a => a.gate3.state !== 'signed').forEach(a => todos.push({ key: 'g' + a.id, title: `Complete readiness sign-off: ${a.label}`, ctx: st.derived.allocations[a.id].position, cta: 'Open readiness', go: () => nav(`/styles/${styleId}/production?alloc=${a.id}`) }))
  allocs.forEach(a => st.derived.allocations[a.id].open_failed_inspections.forEach((iid: string) => todos.push({ key: 'i' + iid, title: `Re-inspection needed: ${st.inspections[iid].lot}`, ctx: `${a.label} · failed ${fmtDate(st.inspections[iid].date)}`, cta: 'Open inspections', go: () => nav(`/styles/${styleId}/production?alloc=${a.id}`), tone: 'error' })))
  actions.forEach(a => todos.push({ key: 'a' + a.id, title: a.title, ctx: a.status === 'blocked' ? 'Blocked' : '', owner: a.assignee_id, due: a.due, cta: 'Open action', go: () => { const n = new URLSearchParams(q); n.set('action', a.id); setQ(n) }, tone: isOverdue(a) ? 'error' : '' }))

  const commits = (Object.values(st.commitments) as R[]).filter(c => c.style_id === styleId && c.state !== 'done')
  const ms = (Object.values(st.milestones) as R[]).filter(m => allocs.some(a => a.id === m.allocation_id) && (m.proposed || m.state === 'late'))
  const events = (Object.values(st.events) as R[]).filter(e => e.scope.style_id === styleId || e.scope.also?.style_ids?.includes(styleId) || (e.scope.allocation_id && st.allocations[e.scope.allocation_id]?.style_id === styleId))
    .filter(e => filter === 'All' || KIND_GROUP(e.kind) === filter).filter(e => !term || (e.title + e.detail).toLowerCase().includes(term.toLowerCase())).sort((a, b) => b.ts.localeCompare(a.ts))
  const approvedQuotes = quotes.filter(x => x.state === 'approved')

  return (
    <div className="col gap-16">
      <section className="panel pad" aria-label="Current position">
        <h2>What is happening now</h2>
        <p className="mt-8" style={{ fontSize: 15 }}>{d.position}.</p>
        <div className="row wrap mt-8" style={{ gap: 8 }}>{allocs.length > 1 && <Badge tone="info">{allocs.length} parallel allocations: each approved and released separately</Badge>}</div>
      </section>

      <section className="panel" aria-label="Actions needing attention"><div className="panel-head"><h2 className="grow">Needs attention</h2>
        <button className="btn small" onClick={() => setUpdating(true)}>Add update</button><button className="btn small" onClick={() => setAdding(!adding)}>Add action</button></div>
        <div className="panel-body">
          {adding && <AddActionForm workId={style.work_id} styleId={styleId} onClose={() => setAdding(false)} />}
          {todos.length === 0 ? <div className="muted">No actions currently need attention. This does not mean the style is finished.</div> : (
            <ul className="list">{todos.map(t => <li key={t.key} className="row wrap"><div className="grow"><strong>{t.title}</strong>{t.tone === 'error' && <> <Badge tone="error">Overdue / failed</Badge></>}<div className="small muted">{[t.ctx, t.owner && personLabel(st, t.owner), t.due ? `Due ${fmtDate(t.due)}` : t.owner ? 'No date set' : ''].filter(Boolean).join(' · ')}</div></div>
              <button className="btn small primary" onClick={t.go}>{t.cta}</button></li>)}</ul>)}
        </div></section>

      <section className="panel" aria-label="Commitments"><div className="panel-head"><h2>Commitments</h2></div><div className="panel-body">
        {commits.length + ms.length === 0 ? <div className="muted">No open commitments recorded.</div> : <ul className="list">
          {commits.map(c => <li key={c.id}><Badge>{c.kind}</Badge> <strong>{c.title}</strong> <span className="muted">· {c.scope}</span><div className="small">Original {fmtDate(c.original)} · Agreed {c.agreed ? fmtDate(c.agreed) : 'not agreed'}{c.proposed && <> · <strong>Proposed {fmtDate(c.proposed)} (not agreed)</strong></>}</div></li>)}
          {ms.map(m => <li key={m.id}><Badge>Allocation milestone</Badge> <strong>{m.name}</strong> <span className="muted">· {st.allocations[m.allocation_id].label}</span><div className="small">Baseline {fmtDate(m.baseline)} · Agreed {fmtDate(m.agreed)}{m.proposed && <> · <strong>Proposed {fmtDate(m.proposed)} (not agreed)</strong></>}{m.state === 'late' && ' · Late'} <Link to={`/styles/${styleId}/production?alloc=${m.allocation_id}`}>Open</Link></div></li>)}</ul>}
      </div></section>

      <div className="grid-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
        <section className="panel pad" aria-label="Costing summary"><h3>Costing</h3>{approvedQuotes.length ? approvedQuotes.map(x => <p key={x.id} className="small mt-8">{st.vendors[x.vendor_id].name}: v{x.version} approved{x.restricted ? '' : ` · ${x.currency} ${x.total}/pc`} (spec v{x.spec_version})</p>) : <p className="small muted mt-8">{quotes.length ? 'Quotes received; none approved yet.' : 'No quote yet.'}</p>}<Link to={`/styles/${styleId}/costing`} className="small">Open Costing</Link></section>
        <section className="panel pad" aria-label="Sampling summary"><h3>Sampling</h3>{rounds.length ? <p className="small mt-8">{plural(new Set(rounds.map(r => r.request_id)).size, 'request')} · {plural(rounds.length, 'round')} · pieces: {rounds.reduce((t, r) => t + r.made, 0)} made, {rounds.reduce((t, r) => t + r.dispatched, 0)} dispatched, {rounds.reduce((t, r) => t + r.received, 0)} received</p> : <p className="small muted mt-8">No sample requested.</p>}<Link to={`/styles/${styleId}/sampling`} className="small">Open Sampling</Link></section>
        <section className="panel pad" aria-label="Production summary"><h3>Production</h3>{allocs.length ? allocs.map(a => <p key={a.id} className="small mt-8">{a.label.split(' · ')[0]}: {st.derived.allocations[a.id].position}</p>) : <p className="small muted mt-8">Not in production.</p>}<Link to={`/styles/${styleId}/production`} className="small">Open Production</Link></section>
      </div>

      <section className="panel" aria-label="Combined activity">
        <div className="panel-head"><h2 className="grow">Activity</h2></div>
        <div className="toolbar" role="search"><div className="row" role="group" aria-label="Filter activity">{['All', 'Costing', 'Sampling', 'Order', 'Production'].map(k => <button key={k} className="btn small" aria-pressed={filter === k} style={filter === k ? { background: 'var(--nav-active)', color: '#fff' } : undefined} onClick={() => setFilter(k)}>{k}</button>)}</div>
          <input className="search" type="search" aria-label="Search activity" placeholder="Search activity…" value={term} onChange={e => setTerm(e.target.value)} /></div>
        {events.length === 0 ? <Empty title="No matching activity" /> : <ul className="list">{events.slice(0, 40).map(e => { const links = eventLinks(e, st); const isOpen = open === e.id; return (
          <li key={e.id}><div className="small muted">{fmtTs(e.ts)} · {personLabel(st, e.actor_id)} · <Badge>{KIND_GROUP(e.kind)}</Badge></div>
            <button className="link strong" style={{ textAlign: 'left' }} aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : e.id)}>{e.title}</button>
            {isOpen && <div className="mt-8 col">{e.detail && <div className="small">{e.detail}</div>}{e.source_id && <div className="small">Source: <SourceLink id={e.source_id} ctx={{ brand_id: style.brand_id }} /></div>}<div className="row wrap">{links.map((l, i) => <button key={i} className="btn small" onClick={() => nav(l.to)}>{l.label}</button>)}</div></div>}</li>) })}</ul>}
      </section>
      {updating && <NoteComposer onClose={() => setUpdating(false)} initial={{ brand_id: style.brand_id, work_id: style.work_id, style_id: styleId }} />}
    </div>
  )
}

function StylePage() {
  const { styleId, tab = 'overview' } = useParams()
  const { state: s } = useSnap()
  const st = s!
  const nav = useNavigate()
  const [q, setQ] = useSearchParams()
  const [dlg, setDlg] = useState<null | 'tech' | 'bom' | 'pom' | 'files' | 'info'>(null)
  const style = st.styles[styleId!]
  const actionId = q.get('action')
  if (!style) return <div className="page-body"><Empty title="Style not found">This style is not available. <Link to="/styles">Back to Styles</Link></Empty></div>
  const d = st.derived.styles[style.id]
  const brand = st.brands[style.brand_id]
  const work = style.work_id ? st.works[style.work_id] : null
  const keep = (t: string) => nav(`/styles/${style.id}/${t}`)
  const chips: [string, string][] = [['costing_ready', 'Costing'], ['sampling_ready', 'Sampling'], ['vendor_ready', 'Vendor'], ['order_ready', 'Order']]
  return (
    <>
      <PageHead title={<span className="row"><Placeholder />{style.name}</span>} crumbs={<><Link to="/styles">Styles</Link><span>/</span><Link to={`/brands/${brand.id}/styles`}>{brand.name}</Link>{work && <><span>/</span><Link to={`/brands/${brand.id}/work?work=${work.id}`}>{work.title}</Link></>}<span>/</span><span>{style.id}</span></>}
        sub={<>{style.id} · {style.category}{style.season && ` · ${style.season}`} · Owner <Person id={style.owner_id} /> {style.lifecycle === 'draft' && <Badge tone="attention">Draft</Badge>}</>}
        actions={<><button className="btn" onClick={() => setDlg('tech')}>Tech pack</button><button className="btn" onClick={() => setDlg('bom')}>BOM</button><button className="btn" onClick={() => setDlg('pom')}>Measurements</button><button className="btn" onClick={() => setDlg('files')}>Files</button><button className="btn" onClick={() => setDlg('info')}>Style information</button></>}>
        <div className="row wrap mb-8" style={{ gap: 6 }} aria-label="Readiness">{chips.map(([k, l]) => <Badge key={k} tone={d.readiness[k].ready ? 'success' : 'attention'} title={d.readiness[k].missing.map((m: R) => m.label).join('; ')}>{d.readiness[k].ready ? '✓' : '○'} {l} {d.readiness[k].ready ? 'ready' : 'not ready'}</Badge>)}
          {d.locks.length > 0 && <Badge tone="info" title="Controlled specification fields are locked while these requests are active">🔒 {d.locks.length} active request(s)</Badge>}
          <button className="link small" onClick={() => setDlg('info')}>What’s missing?</button></div>
        <Tabs label="Style sections" value={tab} onChange={keep} tabs={[{ id: 'overview', label: 'Overview' }, { id: 'costing', label: 'Costing' }, { id: 'sampling', label: 'Sampling' }, { id: 'order', label: 'Order' }, { id: 'production', label: 'Production' }]} />
      </PageHead>
      <div className="page-body">
        {d.locks.length > 0 && tab === 'overview' && <div className="mb-16"><LockNotice locks={d.locks} /></div>}
        {tab === 'overview' && <StyleOverview styleId={style.id} />}
        {tab === 'costing' && <CostingTab styleId={style.id} />}
        {tab === 'sampling' && <SamplingTab styleId={style.id} />}
        {tab === 'order' && <OrderTab styleId={style.id} />}
        {tab === 'production' && <ProductionTab styleId={style.id} />}
      </div>
      {actionId && st.actions[actionId] && <Drawer title="Action details" onClose={() => { const n = new URLSearchParams(q); n.delete('action'); setQ(n) }}><FocusDetail workId={st.actions[actionId].work_id} mode="panel" focus={{ actionId }} /></Drawer>}
      {dlg === 'tech' && <TechPackDialog styleId={style.id} onClose={() => setDlg(null)} />}
      {dlg === 'bom' && <BomDialog styleId={style.id} onClose={() => setDlg(null)} />}
      {dlg === 'pom' && <MeasurementsDialog styleId={style.id} onClose={() => setDlg(null)} />}
      {dlg === 'files' && <FilesDialog styleId={style.id} onClose={() => setDlg(null)} />}
      {dlg === 'info' && <InfoDialog styleId={style.id} onClose={() => setDlg(null)} />}
    </>
  )
}

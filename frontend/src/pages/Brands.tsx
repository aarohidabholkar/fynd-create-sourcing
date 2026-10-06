import { useMemo, useState } from 'react'
import { Link, Navigate, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { PageHead } from '../Shell'
import { FocusDetail } from '../detail/FocusDetail'
import { SampleMovementDialog } from '../components/SampleMovement'
import { OrderView } from '../components/OrderView'
import { CONVERSATION_KINDS, eventLinks, eventType } from '../links'
import { useRemembered, useScrollMemory } from '../hooks'
import { toast, useSnap, type R } from '../store'
import { Badge, Dialog, Disclosure, Drawer, Empty, ErrorBox, Field, Person, Placeholder, SourceLink, Tabs, Timeline, useSubmit } from '../ui'
import { TODAY, effDate, fmtDate, fmtTs, personLabel, plural, relDay } from '../util'

export default function Brands() {
  return (
    <Routes>
      <Route index element={<BrandDirectory />} />
      <Route path=":brandId" element={<RedirectWork />} />
      <Route path=":brandId/:tab" element={<BrandPage />} />
    </Routes>
  )
}
function RedirectWork() { const { brandId } = useParams(); return <Navigate to={`/brands/${brandId}/work`} replace /> }

function BrandDirectory() {
  const { state: s } = useSnap()
  const st = s!
  const [q, setQ] = useRemembered('brands:q', '')
  useScrollMemory('brands')
  const rows = (Object.values(st.brands) as R[]).filter(b => !q || (b.name + ' ' + b.summary).toLowerCase().includes(q.toLowerCase()))
  return (
    <>
      <PageHead title="Brands" sub="Find a brand, then follow its work, styles, orders and history." />
      <div className="page-body">
        <section className="panel">
          <div className="toolbar" role="search"><input className="search" style={{ marginLeft: 0 }} type="search" aria-label="Search brands" placeholder="Search brands…" value={q} onChange={e => setQ(e.target.value)} /></div>
          <div className="table-wrap"><table className="t"><thead><tr><th>Brand</th><th>Relationship owner</th><th>Current position</th><th>Active work</th></tr></thead><tbody>
            {rows.length === 0 && <tr><td colSpan={4}><Empty title="No brands match">Try a different search. <button className="link" onClick={() => setQ('')}>Clear search</button></Empty></td></tr>}
            {rows.map(b => { const ws = (Object.values(st.works) as R[]).filter(w => w.brand_id === b.id && w.lifecycle === 'active'); const att = ws.reduce((t, w) => t + st.derived.works[w.id].attention_count, 0)
              return (<tr key={b.id} className="clickable" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') location.assign(`/brands/${b.id}/work`) }}>
                <td><Link to={`/brands/${b.id}/work`} className="strong">{b.name}</Link></td><td><Person id={b.owner} /></td><td>{b.summary}</td>
                <td>{plural(ws.length, 'track')}{att > 0 && <> <Badge tone="error">{att} need attention</Badge></>}</td></tr>) })}
          </tbody></table></div>
        </section>
      </div>
    </>
  )
}

function BrandPage() {
  const { brandId, tab = 'work' } = useParams()
  const { state: s } = useSnap()
  const st = s!
  const nav = useNavigate()
  const [q, setQ] = useSearchParams()
  const brand = st.brands[brandId!]
  const [search, setSearch] = useState('')
  const [dlg, setDlg] = useState<null | 'contacts' | 'files'>(null)
  if (!brand) return <div className="page-body"><Empty title="Brand not found">This brand is not available. <Link to="/brands">Back to Brands</Link></Empty></div>
  const workScope = q.get('work')
  const scoped = workScope ? st.works[workScope] : null
  const panelOpen = !!(q.get('issue') || q.get('action') || q.get('commitment') || q.get('panel'))
  const works = (Object.values(st.works) as R[]).filter(w => w.brand_id === brand.id)
  const updated = works.reduce((m, w) => (w.updated_at > m ? w.updated_at : m), '')
  const keep = (t: string) => nav(`/brands/${brand.id}/${t}${workScope && t !== 'work' ? `?work=${workScope}` : ''}`)

  // search within brand: type + context, opens the exact record
  const results = useMemo(() => {
    const t = search.trim().toLowerCase()
    if (t.length < 2) return []
    const out: { type: string; label: string; ctx: string; to: string }[] = []
    works.forEach(w => { if ((w.title + w.type).toLowerCase().includes(t)) out.push({ type: 'Project', label: w.title, ctx: w.type, to: `/brands/${brand.id}/work?work=${w.id}` }) })
    works.flatMap(w => w.style_ids.map((x: string) => st.styles[x])).forEach((x: R) => { if ((x.name + x.id).toLowerCase().includes(t)) out.push({ type: 'Style', label: x.name, ctx: x.id, to: `/styles/${x.id}` }) })
    ;(Object.values(st.orders) as R[]).filter(o => o.brand_id === brand.id).forEach(o => { if (o.ref.toLowerCase().includes(t)) out.push({ type: 'Order', label: o.ref, ctx: o.state, to: `/brands/${brand.id}/orders?order=${o.id}` }) })
    ;(Object.values(st.events) as R[]).filter(e => e.scope.brand_id === brand.id && (e.title + e.detail).toLowerCase().includes(t)).slice(0, 5).forEach(e => out.push({ type: 'Activity', label: e.title, ctx: fmtDate(e.ts), to: `/brands/${brand.id}/activity` }))
    ;(Object.values(st.notes) as R[]).filter(n => n.visibility === 'posted' && n.links.brand_id === brand.id && (n.title + n.body).toLowerCase().includes(t)).forEach(n => out.push({ type: 'Note', label: n.title || n.body.slice(0, 40), ctx: 'Posted note', to: `/brands/${brand.id}/activity` }))
    return out.slice(0, 12)
  }, [search, st])

  return (
    <>
      <PageHead title={brand.name} crumbs={<><Link to="/brands">Brands</Link><span>/</span><span>{brand.name}</span></>}
        sub={<><span>Relationship owner: <Person id={brand.owner} /></span> · <span>{brand.summary} <Link to={`/brands/${brand.id}/activity`}>See supporting activity</Link></span> · <span className="small">Updated {fmtTs(updated)}</span></>}
        actions={<><button className="btn" onClick={() => setDlg('contacts')}>Contacts</button><button className="btn" onClick={() => setDlg('files')}>Shared files</button></>}>
        <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <Tabs label="Brand sections" value={tab} onChange={keep} tabs={[{ id: 'work', label: 'Work' }, { id: 'styles', label: 'Styles' }, { id: 'orders', label: 'Orders' }, { id: 'activity', label: 'Activity' }]} />
          <div style={{ position: 'relative', width: 300, margin: '4px 0' }}>
            <input type="search" aria-label={`Search within ${brand.name}`} placeholder="Search this brand…" value={search} onChange={e => setSearch(e.target.value)} />
            {search.trim().length >= 2 && <div className="pop" style={{ top: 40, left: 0, right: 0 }} role="listbox" aria-label="Search results">
              {results.length === 0 ? <div className="empty small">No matches in {brand.name}.</div> : results.map((r, i) => <button key={i} role="option" aria-selected="false" className="item-btn" style={{ padding: '8px 12px' }} onClick={() => { setSearch(''); nav(r.to) }}><Badge>{r.type}</Badge> <strong>{r.label}</strong> <span className="small muted">{r.ctx}</span></button>)}</div>}
          </div>
        </div>
      </PageHead>
      <div className="page-body">
        {scoped && tab !== 'work' && <div className="row mb-16"><Badge tone="info">Scope: {scoped.title}</Badge><button className="btn link-like small" onClick={() => nav(`/brands/${brand.id}/${tab}`)}>Remove scope</button></div>}
        {tab === 'work' && (scoped ? <ProjectView work={scoped} /> : <WorkList brandId={brand.id} />)}
        {tab === 'styles' && <BrandStyles brandId={brand.id} workScope={workScope} />}
        {tab === 'orders' && <BrandOrders brandId={brand.id} workScope={workScope} />}
        {tab === 'activity' && <Activity brandId={brand.id} workScope={workScope} />}
      </div>
      {panelOpen && scoped && (
        <Drawer title={`Work details: ${scoped.title}`} expanded={false} onClose={() => { const n = new URLSearchParams(q); ['issue', 'action', 'commitment', 'panel'].forEach(k => n.delete(k)); setQ(n) }}>
          <FocusDetail workId={scoped.id} mode="panel" focus={{ issueId: q.get('issue'), actionId: q.get('action'), commitmentId: q.get('commitment') }} />
        </Drawer>
      )}
      {dlg === 'contacts' && <Dialog title={`${brand.name}: contacts`} onClose={() => setDlg(null)} footer={<button className="btn" onClick={() => setDlg(null)}>Close</button>}>
        <p className="strong">Internal owner</p><p><Person id={brand.owner} /></p><p className="strong mt-16">Brand contacts</p><ul>{brand.contacts.map((c: R, i: number) => <li key={i}>{c.name} · {c.role}</li>)}</ul>
        <p className="hint">Contact details are not stored in this prototype. Brand contacts are external people, not platform users.</p></Dialog>}
      {dlg === 'files' && <Dialog title={`${brand.name}: shared files`} onClose={() => setDlg(null)} footer={<button className="btn" onClick={() => setDlg(null)}>Close</button>}>
        <ul>{brand.files.map((f: string) => <li key={f}>{f} <span className="muted small">(listed only: this prototype has no file storage)</span></li>)}</ul></Dialog>}
    </>
  )
}

function WorkList({ brandId }: { brandId: string }) {
  const { state: s } = useSnap()
  const st = s!
  const [past, setPast] = useRemembered('brand:past:' + brandId, false)
  useScrollMemory('brandwork:' + brandId)
  const works = (Object.values(st.works) as R[]).filter(w => w.brand_id === brandId)
  const act = works.filter(w => w.lifecycle === 'active'); const old = works.filter(w => w.lifecycle !== 'active')
  const unlinked = (Object.values(st.sources) as R[]).filter(x => x.brand_ids.includes(brandId) && x.unlinked)
  const card = (w: R) => {
    const fl = st.derived.works[w.id]; const c = fl.counts; const next = st.commitments[w.next_commitment_id]
    const issues = (Object.values(st.issues) as R[]).filter(i => i.work_id === w.id && i.state === 'open')
    const orders = (Object.values(st.orders) as R[]).filter(o => o.work_id === w.id)
    return (
      <li key={w.id} className="panel pad" style={{ listStyle: 'none' }}>
        <div className="row wrap"><h3 className="grow"><Link to={`/brands/${brandId}/work?work=${w.id}`}>{w.title}</Link> <span className="muted" style={{ fontWeight: 400 }}>· {w.type}{w.season && ` · ${w.season}`}</span></h3>
          {fl.attention_count > 0 && <Badge tone="error">Needs attention</Badge>}{w.waiting_on_brand && <Badge tone="attention">Waiting on brand</Badge>}</div>
        <p className="mt-8">{w.position}</p>
        <div className="small muted mt-8">Owner <Person id={w.owner_id} /> · {c.styles} styles{c.sample_rounds > 0 && ` · ${c.sample_rounds} sample rounds (${c.samples_made} made, ${c.samples_dispatched} dispatched, ${c.samples_received} received)`}{c.styles_ordered > 0 && ` · ${c.styles_ordered} ordered (${c.ordered_pieces} pcs)`}</div>
        <div className="small mt-8">{issues.length > 0 && <span>{plural(issues.length, 'open issue')}: {issues.map(i => i.title).join('; ')}. </span>}{fl.pending_requests.length > 0 && <span>{fl.pending_requests.length} awaiting response. </span>}
          {next && <span>Next: <strong>{next.proposed ? 'date confirmation needed' : fmtDate(effDate(next))}</strong> · {next.title}. </span>}</div>
        {w.vendor_alloc.length > 0 && <div className="small muted mt-8">Vendors: {w.vendor_alloc.map((v: R) => `${st.vendors[v.vendor_id].name} (${v.scope})`).join(' · ')}</div>}
        {orders.length > 0 && <div className="small mt-8">Orders: {orders.map(o => <Link key={o.id} to={`/brands/${brandId}/orders?order=${o.id}`} style={{ marginRight: 8 }}>{o.ref}</Link>)}</div>}
      </li>)
  }
  return (
    <div className="col gap-16">
      <ul className="col" style={{ padding: 0, margin: 0 }}>{act.map(card)}</ul>
      {act.length === 0 && <Empty title="No active work for this brand" />}
      {old.length > 0 && <Disclosure summary="Past work" count={old.length} defaultOpen={past}><ul className="col" style={{ padding: 0 }}>{old.map(card)}</ul></Disclosure>}
      {unlinked.length > 0 && <section className="panel pad"><h3>Brand-level conversations</h3><p className="small muted">Early discussions that are not linked to a project yet. They stay findable in Activity; link them when a project or style becomes clear.</p>
        <ul className="list">{unlinked.map(x => <li key={x.id}><SourceLink id={x.id} ctx={{ brand_id: brandId }} /> <span className="muted small">· {fmtDate(x.date)}</span></li>)}</ul></section>}
    </div>
  )
}

function ProjectView({ work }: { work: R }) {
  const { state: s } = useSnap()
  const st = s!
  const nav = useNavigate()
  const [q, setQ] = useSearchParams()
  const [vendorView, setVendorView] = useState<string | null>(null)
  const [movement, setMovement] = useState<R | null>(null)
  const fl = st.derived.works[work.id]; const c = fl.counts
  const styles = work.style_ids.map((x: string) => st.styles[x])
  const orders = (Object.values(st.orders) as R[]).filter(o => o.work_id === work.id)
  const sreq = (Object.values(st.sample_requests) as R[]).filter(r => work.style_ids.includes(r.style_id))
  const rounds = (Object.values(st.sample_rounds) as R[]).filter(r => sreq.some(x => x.id === r.request_id)).sort((a, b) => a.request_id.localeCompare(b.request_id) || a.round - b.round)
  const issues = (Object.values(st.issues) as R[]).filter(i => i.work_id === work.id && i.state === 'open')
  const actions = (Object.values(st.actions) as R[]).filter(a => a.work_id === work.id && ['open', 'blocked', 'awaiting_review'].includes(a.status))
  const commitments = (Object.values(st.commitments) as R[]).filter(m => m.work_id === work.id)
  const events = (Object.values(st.events) as R[]).filter(e => e.scope.work_id === work.id).sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, 5)
  const scopeLink = (tab: string, extra = '') => `/brands/${work.brand_id}/${tab}?work=${work.id}${extra}`
  const openPanel = (p: string) => { const n = new URLSearchParams(q); n.set('panel', '1'); if (p) { const [k, v] = p.split('='); n.set(k, v) } setQ(n) }
  return (
    <div className="col gap-16">
      <div className="crumbs"><Link to={`/brands/${work.brand_id}/work`}>All brand work</Link><span>/</span><strong>{work.title}</strong></div>
      <section className="panel pad">
        <div className="row wrap"><h2 className="grow">{work.title}</h2><Badge tone="info">{work.stage}</Badge>{fl.attention_count > 0 && <Badge tone="error">Needs attention</Badge>}<button className="btn" onClick={() => openPanel('')}>Open work details</button></div>
        <p className="mt-8">{work.position}</p>
        <p className="small muted mt-8">{work.type}{work.season && ` · ${work.season}`} · Owner <Person id={work.owner_id} /> · Brief: {work.brief}</p>
        <div className="row wrap mt-16" role="group" aria-label="Counts (each opens its records)" style={{ gap: 8 }}>
          <Link className="btn small" to={scopeLink('styles')}>{plural(c.styles, 'style')}</Link>
          <Link className="btn small" to={scopeLink('styles', '&filter=selected')}>{c.styles_selected} selected (not orders)</Link>
          <Link className="btn small" to={scopeLink('orders')}>{c.styles_ordered} ordered (confirmed orders only)</Link>
          <span className="btn small" style={{ cursor: 'default' }}>{plural(c.sample_requests, 'sample request')} · {plural(c.sample_rounds, 'round')}</span>
          <span className="btn small" style={{ cursor: 'default' }}>Pieces: {c.samples_made} made · {c.samples_dispatched} dispatched · {c.samples_received} received</span>
          {c.ordered_pieces > 0 && <Link className="btn small" to={scopeLink('orders')}>{c.ordered_pieces} pcs ordered</Link>}
        </div>
      </section>

      {work.vendor_alloc.length > 0 && <section className="panel" aria-label="Vendor allocation"><div className="panel-head"><h2>Vendors by scope of work</h2></div><div className="table-wrap"><table className="t"><thead><tr><th>Vendor</th><th>Scope</th><th>Styles</th><th /></tr></thead><tbody>
        {work.vendor_alloc.map((v: R, i: number) => <tr key={i}><td><button className="link strong" onClick={() => setVendorView(v.vendor_id)}>{st.vendors[v.vendor_id].name}</button>{v.historical && <> <Badge>Historical</Badge></>}</td><td>{v.scope}</td><td>{v.style_ids.map((x: string) => st.styles[x].name).join(', ')}</td><td><Link to={`/vendors/${v.vendor_id}`}>Vendor workspace</Link></td></tr>)}</tbody></table></div></section>}

      {(issues.length > 0 || actions.length > 0) && <section className="panel" aria-label="Issues and actions"><div className="panel-head"><h2>Issues and outstanding actions</h2></div><div className="panel-body"><ul className="list">
        {issues.map(i => <li key={i.id} style={{ padding: 0 }}><button className="item-btn" style={{ padding: '8px 0' }} onClick={() => openPanel('issue=' + i.id)}><Badge tone="error">Issue</Badge> <strong>{i.title}</strong><div className="small muted">{i.impact}</div></button></li>)}
        {actions.map(a => <li key={a.id} style={{ padding: 0 }}><button className="item-btn" style={{ padding: '8px 0' }} onClick={() => openPanel('action=' + a.id)}><Badge>Action</Badge> {a.title}<div className="small muted">{personLabel(st, a.assignee_id)} · {a.due ? `Due ${fmtDate(a.due)}` : 'No date set'}</div></button></li>)}</ul></div></section>}

      <section className="panel" aria-label="Styles"><div className="panel-head"><h2 className="grow">Styles</h2><Link to={scopeLink('styles')}>Open in Styles tab</Link></div><div className="panel-body"><ul className="list">
        {styles.map((x: R) => <li key={x.id} className="row" style={{ padding: '8px 0' }}><Placeholder /><div className="grow"><Link to={`/styles/${x.id}`} className="strong">{x.name}</Link> <span className="muted small">{x.id}</span><div className="small muted">{st.derived.styles[x.id].position}</div></div>
          {x.selection && <Badge tone={x.selection.state === 'selected' ? 'success' : x.selection.state === 'held' ? 'attention' : ''}>{x.selection.state}</Badge>}</li>)}</ul></div></section>

      {rounds.length > 0 && <section className="panel" aria-label="Sample rounds"><div className="panel-head"><h2>Sample requests and rounds</h2></div><div className="table-wrap"><table className="t"><thead><tr><th>Style / vendor</th><th>Round</th><th>Pieces</th><th>Review</th><th /></tr></thead><tbody>
        {rounds.map(r => { const rq = st.sample_requests[r.request_id]; return (<tr key={r.id}><td><Link to={`/styles/${rq.style_id}/sampling?round=${r.id}`}>{st.styles[rq.style_id].name}</Link><div className="small muted">{st.vendors[rq.vendor_id].name}</div></td><td>{rq.type} · round {r.round}</td>
          <td className="small">Requested {r.requested} · made {r.made} · dispatched {r.dispatched} · received {r.received}</td>
          <td className="small">QC: {r.internal.state.replace('_', ' ')} · Brand: {r.external.state.replace(/_/g, ' ')}</td>
          <td>{r.dispatched > r.received ? <button className="btn small" onClick={() => setMovement(r)}>Record receipt</button> : r.dispatched < r.requested && r.round === Math.max(...rounds.filter(x => x.request_id === r.request_id).map(x => x.round)) ? <button className="btn small" onClick={() => setMovement(r)}>Record movement</button> : null}</td></tr>) })}</tbody></table></div></section>}

      {orders.length > 0 && <section className="panel" aria-label="Orders"><div className="panel-head"><h2>Orders</h2></div><div className="panel-body"><ul className="list">
        {orders.map(o => <li key={o.id} className="row"><Link to={`/brands/${work.brand_id}/orders?order=${o.id}`} className="strong">{o.ref}</Link>{o.state === 'confirmed' ? <Badge tone="success">Confirmed</Badge> : <Badge tone="attention">Draft: not confirmed</Badge>}<span className="small muted">{st.derived.orders[o.id].total} pcs</span></li>)}</ul></div></section>}

      <section className="panel" aria-label="Commitments"><div className="panel-head"><h2>Commitments</h2></div><div className="panel-body"><ul className="list">
        {commitments.map(m => <li key={m.id} style={{ padding: 0 }}><button className="item-btn" style={{ padding: '8px 0' }} onClick={() => openPanel('commitment=' + m.id)}><strong>{m.title}</strong> · {m.state === 'done' ? `done ${fmtDate(m.actual)}` : fmtDate(effDate(m))} <span className="muted">({m.state})</span>{m.proposed && <> <Badge tone="attention">Proposed {fmtDate(m.proposed)}: not agreed</Badge></>}</button></li>)}</ul></div></section>

      <section className="panel pad" aria-label="Recent activity"><Timeline events={(Object.values(st.events) as R[]).filter(e => e.scope.work_id === work.id)} title="Work timeline" />
        <Link to={`/brands/${work.brand_id}/activity?work=${work.id}`} className="small">Open full Activity for this work</Link></section>

      {vendorView && <Dialog title={`${st.vendors[vendorView].name} in ${work.title}`} onClose={() => setVendorView(null)} footer={<><Link className="btn" to={`/vendors/${vendorView}`}>Open full vendor workspace</Link><button className="btn" onClick={() => setVendorView(null)}>Close</button></>}>
        {(st.derived.vendors[vendorView].work as R[]).filter(r => work.style_ids.includes(r.style_id)).map(r => <div key={r.style_id} className="panel pad mb-8"><Link to={`/styles/${r.style_id}`} className="strong">{st.styles[r.style_id].name}</Link><div className="small">{r.roles.join(' · ')}</div><div className="small muted">{r.stage}</div>{r.next_action && <div className="small">Next: {r.next_action.title}</div>}</div>)}
        {(st.derived.vendors[vendorView].work as R[]).filter(r => work.style_ids.includes(r.style_id)).length === 0 && <Empty title="No linked work for this vendor in this project" />}
        <p className="hint">Historical vendor attribution is kept: reassigning future work does not rewrite who made an earlier sample.</p></Dialog>}
      {movement && <SampleMovementDialog round={movement} onClose={() => setMovement(null)} />}
    </div>
  )
}

function BrandStyles({ brandId, workScope }: { brandId: string; workScope: string | null }) {
  const { state: s } = useSnap()
  const st = s!
  const [q, setQ] = useSearchParams()
  const [term, setTerm] = useRemembered('brand:styles:q:' + brandId, '')
  const filter = q.get('filter')
  useScrollMemory('brandstyles:' + brandId)
  const styles = (Object.values(st.styles) as R[]).filter(x => x.brand_id === brandId && (!workScope || x.work_id === workScope)
    && (!filter || (filter === 'selected' && x.selection?.state === 'selected')) && (!term || (x.name + x.id).toLowerCase().includes(term.toLowerCase())))
  const ordered = new Set((Object.values(st.orders) as R[]).filter(o => o.state === 'confirmed').flatMap(o => o.lines.map((l: R) => l.style_id)))
  const draftOrdered = new Set((Object.values(st.orders) as R[]).filter(o => o.state !== 'confirmed').flatMap(o => o.lines.map((l: R) => l.style_id)))
  return (
    <section className="panel">
      <div className="toolbar" role="search"><input className="search" style={{ marginLeft: 0 }} type="search" aria-label="Search styles by name or ID" placeholder="Search styles by name or ID…" value={term} onChange={e => setTerm(e.target.value)} />
        {filter && <Badge tone="info">Filter: {filter}</Badge>}{filter && <button className="btn link-like small" onClick={() => { const n = new URLSearchParams(q); n.delete('filter'); setQ(n) }}>Remove filter</button>}</div>
      <div className="table-wrap"><table className="t"><thead><tr><th>Style</th><th>Project</th><th>Current position</th><th>Selection / order</th></tr></thead><tbody>
        {styles.length === 0 && <tr><td colSpan={4}><Empty title="No styles match" /></td></tr>}
        {styles.map(x => <tr key={x.id}><td><div className="row"><Placeholder /><div><Link to={`/styles/${x.id}`} className="strong">{x.name}</Link><div className="small muted">{x.id} · {x.category}</div></div></div></td>
          <td className="small">{x.work_id ? st.works[x.work_id].title : <span className="muted">Not linked</span>}</td><td className="small">{st.derived.styles[x.id].position}</td>
          <td>{x.selection ? <Badge tone={x.selection.state === 'selected' ? 'success' : ''}>{x.selection.state}</Badge> : <span className="muted small">No decision</span>} {ordered.has(x.id) ? <Badge tone="success">Ordered (confirmed)</Badge> : draftOrdered.has(x.id) ? <Badge tone="attention">Draft order only</Badge> : x.selection?.state === 'selected' ? <Badge>Selected, not ordered</Badge> : null}</td></tr>)}
      </tbody></table></div>
    </section>
  )
}

function BrandOrders({ brandId, workScope }: { brandId: string; workScope: string | null }) {
  const { state: s } = useSnap()
  const st = s!
  const [q, setQ] = useSearchParams()
  const sel = q.get('order')
  const orders = (Object.values(st.orders) as R[]).filter(o => o.brand_id === brandId && (!workScope || o.work_id === workScope))
  if (sel && st.orders[sel]) return (
    <div className="col gap-16"><div className="crumbs"><button className="link" onClick={() => { const n = new URLSearchParams(q); n.delete('order'); setQ(n) }}>All orders</button><span>/</span><strong>{st.orders[sel].ref}</strong></div>
      <section className="panel pad"><OrderView order={st.orders[sel]} /></section>
      <p className="hint">To allocate quantities or record production, open the order from <Link to={`/styles/${st.orders[sel].lines[0].style_id}/order`}>the style’s Order tab</Link>.</p></div>)
  return (
    <section className="panel"><div className="table-wrap"><table className="t"><thead><tr><th>Order</th><th>Project</th><th>State</th><th>Contents</th><th>Vendors</th><th>Next commitment</th></tr></thead><tbody>
      {orders.length === 0 && <tr><td colSpan={6}><Empty title="No orders for this brand" >{workScope ? 'No orders are linked to this project. A selected style is not an order.' : 'Selections and verbal intentions are not orders.'}</Empty></td></tr>}
      {orders.map(o => { const al = (Object.values(st.allocations) as R[]).filter(a => a.order_id === o.id); const sm = st.derived.orders[o.id]; return (
        <tr key={o.id} className="clickable" onClick={() => { const n = new URLSearchParams(q); n.set('order', o.id); setQ(n) }}>
          <td><button className="link strong" onClick={e => { e.stopPropagation(); const n = new URLSearchParams(q); n.set('order', o.id); setQ(n) }}>{o.ref}</button></td><td className="small">{o.work_id ? st.works[o.work_id].title : ''}</td>
          <td>{o.state === 'confirmed' ? <Badge tone="success">Confirmed</Badge> : <Badge tone="attention">Draft: not confirmed</Badge>}</td>
          <td className="small">{[...new Set(o.lines.map((l: R) => st.styles[l.style_id].name))].join(', ')} · {sm.total} pcs</td>
          <td className="small">{al.length ? al.map(a => a.label.split(' · ').slice(0, 2).join(' · ')).join('; ') : <span className="muted">None allocated</span>}</td>
          <td className="small">{o.dates.required_in_dc.agreed ? `In DC ${fmtDate(o.dates.required_in_dc.agreed)} (agreed)` : o.dates.required_in_dc.proposed ? `In DC ${fmtDate(o.dates.required_in_dc.proposed)} (proposed)` : 'Not recorded'}</td></tr>) })}
    </tbody></table></div></section>
  )
}

function LinkSourceDialog({ source, brandId, onClose }: { source: R; brandId: string; onClose: () => void }) {
  const { state: s } = useSnap()
  const st = s!
  const [w, setW] = useState('')
  const { submit, busy, error } = useSubmit('link_source')
  return (
    <Dialog title="Link conversation to work" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!w || busy} onClick={async () => { if (await submit({ source_id: source.id, work_id: w })) { toast('Linked. The existing thread is now connected; nothing was copied.'); onClose() } }}>Link</button></>}>
      <p className="mb-8"><strong>{source.title}</strong></p>
      <Field label="Work" required hint="Linking does not create a project or any confirmed work."><select value={w} onChange={e => setW(e.target.value)}><option value="">Choose work…</option>{(Object.values(st.works) as R[]).filter(x => x.brand_id === brandId).map(x => <option key={x.id} value={x.id}>{x.title}</option>)}</select></Field>
      <ErrorBox err={error} />
    </Dialog>
  )
}

function Activity({ brandId, workScope }: { brandId: string; workScope: string | null }) {
  const { state: s } = useSnap()
  const st = s!
  const nav = useNavigate()
  const [filter, setFilter] = useRemembered('brand:act:filter:' + brandId, 'all')
  const [term, setTerm] = useState('')
  const [limit, setLimit] = useState(25)
  const [open, setOpen] = useState<string | null>(null)
  const [linking, setLinking] = useState<R | null>(null)
  useScrollMemory('brandact:' + brandId)
  const events = (Object.values(st.events) as R[]).filter(e => (e.scope.brand_id === brandId || e.scope.also?.brand_ids?.includes(brandId))
    && (!workScope || e.scope.work_id === workScope || e.scope.also?.work_ids?.includes(workScope))
    && (filter === 'all' || (filter === 'conv' ? CONVERSATION_KINDS.includes(e.kind) : !CONVERSATION_KINDS.includes(e.kind)))
    && (!term || (e.title + e.detail).toLowerCase().includes(term.toLowerCase()))).sort((a, b) => b.ts.localeCompare(a.ts))
  return (
    <section className="panel">
      <div className="toolbar" role="search">
        <div className="row" role="group" aria-label="Filter activity">{[['all', 'All'], ['conv', 'Conversations'], ['upd', 'Updates & decisions']].map(([k, l]) => <button key={k} className="btn small" aria-pressed={filter === k} style={filter === k ? { background: 'var(--nav-active)', color: '#fff' } : undefined} onClick={() => setFilter(k)}>{l}</button>)}</div>
        <input className="search" type="search" aria-label="Search activity" placeholder="Search activity…" value={term} onChange={e => setTerm(e.target.value)} />
      </div>
      <div className="small muted" style={{ padding: '8px 16px' }}>{workScope ? `Scope: ${st.works[workScope].title}` : 'Scope: whole brand'} · {plural(events.length, 'entry', 'entries')}. Only recorded channels appear here; unrecorded calls and disconnected channels are not captured.</div>
      {events.length === 0 ? <Empty title="No matching activity">Nothing is recorded for this scope yet, which does not mean nothing happened.</Empty> : (
        <ul className="list">{events.slice(0, limit).map(e => { const src = e.source_id ? st.sources[e.source_id] : null; const links = eventLinks(e, st); const isOpen = open === e.id; const w = e.scope.work_id ? st.works[e.scope.work_id] : null
          return (<li key={e.id}>
            <div className="small muted">{fmtTs(e.ts)} · {personLabel(st, e.actor_id)} · <Badge>{eventType(e, st)}</Badge>{e.origin === 'prototype' && <> <Badge tone="info">Recorded in prototype</Badge></>}</div>
            <button className="link strong" style={{ textAlign: 'left' }} aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : e.id)}>{e.title}</button>
            <div className="small muted">{w ? w.title : 'Brand-level (not linked to work)'}</div>
            {isOpen && <div className="mt-8 col">
              {e.detail && <div>{e.detail}</div>}
              {src && <div className="small">Source: <SourceLink id={src.id} ctx={{ brand_id: brandId }} />{src.summary_only && <span className="muted"> · summary only</span>}</div>}
              <div className="row wrap">{links.map((l, i) => <button key={i} className="btn small" onClick={() => nav(l.to)}>{l.label}</button>)}{src?.unlinked && <button className="btn small" onClick={() => setLinking(src)}>Link to work</button>}</div>
            </div>}
          </li>) })}</ul>)}
      {events.length > limit && <div style={{ padding: 12 }}><button className="btn" onClick={() => setLimit(limit + 25)}>Show more</button></div>}
      {linking && <LinkSourceDialog source={linking} brandId={brandId} onClose={() => setLinking(null)} />}
    </section>
  )
}

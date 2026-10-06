import { useMemo } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { PageHead } from '../Shell'
import { FocusDetail } from '../detail/FocusDetail'
import { useRemembered, useScrollMemory } from '../hooks'
import { useSnap, type R } from '../store'
import { Badge, Empty, Person } from '../ui'
import { TODAY, addDays, daysBetween, effDate, fmtDate, personLabel, plural } from '../util'

function firstSentence(t: string) { const m = t.match(/^[^.]+\.?/); return m ? m[0] : t }

export function OverviewDetail() {
  const { workId } = useParams()
  const [q] = useSearchParams()
  const { state: s } = useSnap()
  const work = s!.works[workId!]
  return (
    <>
      <PageHead title={work ? `${s!.brands[work.brand_id].name} · ${work.title}` : 'Work'} crumbs={<><Link to="/overview">Overview</Link><span>/</span><span>{work?.title}</span></>}
        actions={<Link className="btn" to="/overview"><ChevronLeft size={16} /> Back to Overview</Link>} />
      <div className="page-body">
        <FocusDetail workId={workId} mode="page" focus={{ issueId: q.get('issue'), actionId: q.get('action'), commitmentId: q.get('commitment'), requestId: q.get('request') }}
          hideTitle />
      </div>
    </>
  )
}

export default function Overview() {
  const { state: s } = useSnap()
  const st = s!
  const nav = useNavigate()
  const [brandF, setBrandF] = useRemembered('ov:brand', 'all')
  const [stateF, setStateF] = useRemembered('ov:state', 'all')
  const [search, setSearch] = useRemembered('ov:search', '')
  const [naAll, setNaAll] = useRemembered('ov:naAll', false)
  const [ucAll, setUcAll] = useRemembered('ov:ucAll', false)
  const [naCollapsed, setNaCollapsed] = useRemembered('ov:naCollapsed', false)
  const [ucCollapsed, setUcCollapsed] = useRemembered('ov:ucCollapsed', false)
  const [resolvedView, setResolvedView] = useRemembered('ov:resolved', false)
  useScrollMemory('overview')

  const works = Object.values(st.works) as R[]
  const active = works.filter(w => w.lifecycle === 'active')
  const att = st.derived.attention as R[]
  const resolved = (Object.values(st.issues) as R[]).filter(i => i.state === 'resolved').sort((a, b) => b.resolution.at.localeCompare(a.resolution.at))
  const upcoming = (Object.values(st.commitments) as R[])
    .filter(c => c.state !== 'done' && effDate(c) >= TODAY && effDate(c) <= addDays(TODAY, 7))
    .sort((a, b) => effDate(a).localeCompare(effDate(b)))
  const viewer = st.viewer.work_views || {}
  const sumLine = `${plural(active.length, 'active work track')} across ${new Set(active.map(w => w.brand_id)).size} brands · ${att.length} ${att.length === 1 ? 'item needs' : 'items need'} intervention · ${plural(upcoming.length, 'commitment')} in the next 7 days.`

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase()
    return active.filter(w => {
      if (brandF !== 'all' && w.brand_id !== brandF) return false
      const flags = st.derived.works[w.id]
      if (stateF === 'attention' && flags.attention_count === 0) return false
      if (stateF === 'brand' && !w.waiting_on_brand) return false
      if (!term) return true
      const hay = [w.title, w.type, st.brands[w.brand_id].name,
        ...w.style_ids.map((x: string) => `${st.styles[x].name} ${x}`),
        ...(Object.values(st.orders) as R[]).filter(o => o.work_id === w.id).map(o => `${o.ref} ${o.id}`)].join(' ').toLowerCase()
      return hay.includes(term)
    }).sort((a, b) => st.brands[a.brand_id].name.localeCompare(st.brands[b.brand_id].name))
  }, [st, brandF, stateF, search])

  const clear = () => { setBrandF('all'); setStateF('all'); setSearch('') }
  const open = (w: string, p = '') => nav(`/overview/work/${w}${p}`)
  const naShown = naAll ? att : att.slice(0, 3)
  const ucShown = ucAll ? upcoming : upcoming.slice(0, 3)

  let lastBrand = ''
  return (
    <>
      <PageHead title="Overview" sub={<>{fmtDate(TODAY, true)} · Shared sourcing situation across all brands. {sumLine}</>} />
      <div className="page-body col gap-16">
        <div className="grid-2">
          <section className="panel" aria-label="Needs attention">
            <div className="panel-head"><h2 className="grow">Needs attention</h2>
              {!resolvedView && <button className="btn link-like small" onClick={() => setResolvedView(true)}>View resolved ({resolved.length})</button>}
              {resolvedView && <button className="btn link-like small" onClick={() => setResolvedView(false)}>Back to open issues</button>}
              <button className="btn ghost small" aria-expanded={!naCollapsed} onClick={() => setNaCollapsed(!naCollapsed)}>{naCollapsed ? 'Expand' : 'Collapse'}</button></div>
            {!naCollapsed && !resolvedView && (
              att.length === 0 ? <Empty title="No issues need attention">Nothing currently needs intervention. Resolved issues are kept under View resolved.</Empty> : (
                <>
                  <ul className="list">
                    {naShown.map(a => {
                      const w = st.works[a.work_id]
                      const i = a.kind === 'issue' ? st.issues[a.issue_id] : null
                      const req = a.kind === 'request' ? st.requests[a.request_id] : null
                      return (
                        <li key={a.issue_id || a.request_id} style={{ padding: 0 }}>
                          <button className="item-btn" style={{ padding: '10px 16px' }} onClick={() => open(w.id, i ? `?issue=${i.id}` : `?action=${a.action_id}&request=${req!.id}`)}>
                            <div className="small muted">{st.brands[w.brand_id].name} · {w.title}</div>
                            <div className="strong">{i ? i.title : `Update overdue: ${st.actions[a.action_id].title}`}</div>
                            <div className="small">{i ? firstSentence(i.impact) + (i.impact.includes('.') && i.impact.split('.').length > 2 ? ' ' + i.impact.split('.').slice(1, 2).join('.').trim() + '.' : '') : `Reply was requested by ${fmtDate(req!.response_due)}; intervention may be needed.`}</div>
                            <div className="row wrap small mt-8" style={{ gap: 6 }}>
                              {i?.blocking && <Badge tone="error">Blocking</Badge>}{i?.escalated && <Badge tone="error">Escalated</Badge>}{a.overdue_actions?.length > 0 && <Badge tone="attention">Overdue action</Badge>}{req && <Badge tone="attention">Reply overdue</Badge>}
                              <span className="muted">{personLabel(st, i ? i.owner_id : req!.recipient_id)} · Open {plural(a.age_days, 'day')}</span>
                            </div>
                          </button>
                        </li>)
                    })}
                  </ul>
                  {att.length > 3 && <div style={{ padding: '8px 16px' }}><button className="btn link-like small" onClick={() => setNaAll(!naAll)}>{naAll ? 'Show fewer' : `View all (${att.length})`}</button></div>}
                </>
              )
            )}
            {!naCollapsed && resolvedView && (
              resolved.length === 0 ? <Empty title="No resolved issues yet" /> : (
                <ul className="list">{resolved.map(i => { const w = st.works[i.work_id]; return (
                  <li key={i.id} style={{ padding: 0 }}><button className="item-btn" style={{ padding: '10px 16px' }} onClick={() => open(w.id, `?issue=${i.id}`)}>
                    <div className="small muted">{st.brands[w.brand_id].name} · {w.title}</div><div className="strong">{i.title}</div>
                    <div className="small">{i.resolution.note}</div><div className="small muted">Resolved by {personLabel(st, i.resolution.by)} · {fmtDate(i.resolution.at, true)}</div></button></li>) })}</ul>
              )
            )}
          </section>

          <section className="panel" aria-label="Upcoming commitments">
            <div className="panel-head"><div className="grow"><h2>Upcoming commitments</h2><div className="small muted">Next 7 days · {fmtDate(TODAY)} to {fmtDate(addDays(TODAY, 7))}</div></div>
              <button className="btn ghost small" aria-expanded={!ucCollapsed} onClick={() => setUcCollapsed(!ucCollapsed)}>{ucCollapsed ? 'Expand' : 'Collapse'}</button></div>
            {!ucCollapsed && (upcoming.length === 0 ? <Empty title="No upcoming commitments in this period" /> : (
              <>
                <ul className="list">
                  {ucShown.map(c => { const w = st.works[c.work_id]; return (
                    <li key={c.id} style={{ padding: 0 }}><button className="item-btn" style={{ padding: '10px 16px' }} onClick={() => open(w.id, `?commitment=${c.id}`)}>
                      <div className="row wrap" style={{ gap: 8 }}>
                        <span className="strong" style={{ minWidth: 52 }}>{fmtDate(effDate(c))}</span>
                        <Badge tone={c.proposed ? 'attention' : c.state === 'agreed' ? 'success' : ''}>{c.state === 'agreed' ? 'Agreed' : c.state === 'planned' ? 'Planned' : 'Proposed'}</Badge>
                        {c.proposed && <Badge tone="attention">Revision proposed: {fmtDate(c.proposed)}</Badge>}</div>
                      <div className="small muted">{st.brands[w.brand_id].name} · {w.title}</div>
                      <div>{c.title}. <span className="muted">{c.readiness}</span></div>
                      <div className="small muted"><Person id={c.owner_id} /></div></button></li>) })}
                </ul>
                {upcoming.length > 3 && <div style={{ padding: '8px 16px' }}><button className="btn link-like small" onClick={() => setUcAll(!ucAll)}>{ucAll ? 'Show fewer' : `View all (${upcoming.length})`}</button></div>}
              </>
            ))}
          </section>
        </div>

        <section className="panel" aria-label="Active work">
          <div className="panel-head"><h2>Active work</h2></div>
          <div className="toolbar" role="search">
            <select aria-label="Brand" value={brandF} onChange={e => setBrandF(e.target.value)}>
              <option value="all">All brands</option>{(Object.values(st.brands) as R[]).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
            <select aria-label="Work state" value={stateF} onChange={e => setStateF(e.target.value)}>
              <option value="all">All work</option><option value="attention">Needs attention</option><option value="brand">Waiting on brand</option></select>
            <input className="search" type="search" aria-label="Search projects, styles or orders" placeholder="Search projects, styles or orders…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th style={{ width: '24%' }}>Brand / work</th><th style={{ width: '38%' }}>Current position</th><th style={{ width: '24%' }}>Next commitment</th><th>Owner</th></tr></thead>
              <tbody>
                {rows.length === 0 && <tr><td colSpan={4}><Empty title="No work matches these filters">{search ? `Nothing matches “${search}”.` : 'Try a different brand or state.'} <button className="link" onClick={clear}>Clear filters</button></Empty></td></tr>}
                {rows.map(w => {
                  const fl = st.derived.works[w.id]
                  const c = st.commitments[w.next_commitment_id]
                  const newResp = (Object.values(st.requests) as R[]).filter(r => r.state === 'responded' && r.requester_id === st.me && !r.requester_read_at && st.actions[r.action_id]?.work_id === w.id)
                  const lv = viewer[w.id]?.last_viewed
                  const updated = lv && w.updated_at > lv
                  const head = st.brands[w.brand_id].name !== lastBrand
                  lastBrand = st.brands[w.brand_id].name
                  return [
                    head && <tr className="group" key={`g-${w.brand_id}`}><td colSpan={4}>{st.brands[w.brand_id].name}</td></tr>,
                    <tr key={w.id} className="clickable" tabIndex={0} onClick={() => open(w.id)} onKeyDown={e => { if (e.key === 'Enter') open(w.id) }} aria-label={`${st.brands[w.brand_id].name}, ${w.title}`}>
                      <td><div className="strong">{w.title}</div><div className="small muted">{w.style_ids.length} {w.style_ids.length === 1 ? 'style' : 'styles'}{w.colourway_note && ` · ${w.colourway_note}`}</div></td>
                      <td><div>{w.position}</div>
                        <div className="row wrap mt-8" style={{ gap: 6 }}>
                          <Badge tone="info">{w.stage}</Badge>
                          {fl.attention_count > 0 && <Badge tone="error">Needs attention</Badge>}
                          {w.waiting_on_brand && <Badge tone="attention">Waiting on brand</Badge>}
                          {fl.pending_requests.length > 0 && <Badge tone="attention">{fl.pending_requests.length} awaiting response</Badge>}
                          {newResp.length > 0 && <Badge tone="info">New response</Badge>}
                          {updated && <Badge tone="info" title="Changed since you last opened this work">Updated since your last view</Badge>}</div></td>
                      <td>{c ? <><div className="strong">{c.proposed ? 'Date confirmation needed' : fmtDate(effDate(c))}</div><div className="small muted">{c.title}{c.proposed ? ` · agreed ${fmtDate(c.agreed)}, proposed ${fmtDate(c.proposed)}` : ` · ${c.state}`}</div></> : <span className="muted">Date to be confirmed</span>}</td>
                      <td><Person id={w.owner_id} /></td></tr>]
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  )
}

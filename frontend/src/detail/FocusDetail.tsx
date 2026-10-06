import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { remember, run, toast, useSnap, type R } from '../store'
import { Badge, Disclosure, ErrorBox, Field, Placeholder, SourceLink, Timeline, useSubmit } from '../ui'
import { OPEN, TODAY, daysBetween, effDate, fmtDate, fmtTs, personLabel } from '../util'
import { ActionRow, AddActionForm } from './ActionBits'
import { ActionFocus } from './ActionFocus'

export interface Focus { issueId?: string | null; actionId?: string | null; commitmentId?: string | null; requestId?: string | null }

function IssueCard({ issue, focused }: { issue: R; focused: boolean }) {
  const { state: st } = useSnap()
  const s = st!
  const [mode, setMode] = useState<null | 'resolve' | 'reopen'>(null)
  const [note, setNote] = useState(''); const [ref, setRef] = useState('')
  const rs = useSubmit('resolve_issue'); const ro = useSubmit('reopen_issue')
  const work = s.works[issue.work_id]
  const open = issue.state === 'open'
  const age = daysBetween(issue.opened_at, TODAY)
  const canResolve = (s.users[s.me].caps as string[]).some(c => ['edit', 'assign'].includes(c))
  const canReopen = (s.users[s.me].caps as string[]).includes('reopen')
  const pendingReqs = (Object.values(s.requests) as R[]).filter(r => r.state === 'awaiting' && s.actions[r.action_id]?.issue_id === issue.id)
  return (
    <div className={`panel pad ${focused ? 'sel' : ''}`} id={`issue-${issue.id}`} style={focused ? { borderColor: 'var(--teal)' } : undefined}>
      <div className="row wrap">
        <h3 className="grow">{issue.title}</h3>
        {open ? <>{issue.blocking && <Badge tone="error">Blocking</Badge>}{issue.escalated && <Badge tone="error">Escalated</Badge>}<Badge tone="attention">Open · {age} days</Badge></> : <Badge tone="success">Resolved</Badge>}
      </div>
      {!open && issue.resolution && (
        <div className="alert success mt-8"><strong>Resolution:</strong> {issue.resolution.note}
          <div className="small">Resolved by {personLabel(s, issue.resolution.by)} · {fmtTs(issue.resolution.at)}{issue.resolution.ref && ` · Ref: ${issue.resolution.ref}`}</div></div>
      )}
      <p className="mt-8"><span className="muted">Impact: </span>{issue.impact}</p>
      <div className="small muted mt-8">{issue.kind} · Owner {personLabel(s, issue.owner_id)} · Opened {fmtDate(issue.opened_at)}
        {issue.affected_style_ids.length > 0 && <> · Affects {issue.affected_style_ids.map((x: string) => s.styles[x]?.name).join(', ')}</>}
        {issue.source_id && <> · Source: <SourceLink id={issue.source_id} ctx={{ brand_id: work.brand_id }} /></>}</div>
      {issue.resolution_history?.length > 0 && <div className="small muted mt-8">Earlier resolution retained: “{issue.resolution_history[issue.resolution_history.length - 1].note}” · reopened because {issue.resolution_history[issue.resolution_history.length - 1].reason}</div>}
      <div className="row wrap mt-8">
        {open && canResolve && <button className="btn small" onClick={() => setMode(mode === 'resolve' ? null : 'resolve')}>Mark resolved</button>}
        {!open && canReopen && <button className="btn small" onClick={() => setMode(mode === 'reopen' ? null : 'reopen')}>Reopen</button>}
      </div>
      {mode === 'resolve' && (
        <div className="inline-form">
          <Field label="Resolution note" required><textarea value={note} onChange={e => setNote(e.target.value)} placeholder="How was this resolved?" /></Field>
          <Field label="Supporting reference (optional)"><input type="text" value={ref} onChange={e => setRef(e.target.value)} /></Field>
          <div className="hint">Only this issue is resolved. Its actions stay as they are{pendingReqs.length > 0 && `, and ${pendingReqs.length} pending update request(s) are not cancelled`}. The track stays active.</div>
          <ErrorBox err={rs.error} />
          <div className="row"><button className="btn primary small" disabled={rs.busy || !note.trim()} onClick={async () => {
            const r = await rs.submit({ issue_id: issue.id, note, ref, if_rev: issue.rev })
            if (r) { toast('Issue resolved. It is kept under View resolved and in history.'); setMode(null) }
          }}>{rs.busy ? 'Saving…' : 'Mark resolved'}</button><button className="btn small" onClick={() => setMode(null)}>Cancel</button></div>
        </div>
      )}
      {mode === 'reopen' && (
        <div className="inline-form">
          <Field label="Reason for reopening" required><input type="text" value={note} onChange={e => setNote(e.target.value)} /></Field>
          <div className="hint">The same issue returns to Needs attention; the earlier resolution stays in its history. Completed tasks are not reopened automatically.</div>
          <ErrorBox err={ro.error} />
          <div className="row"><button className="btn primary small" disabled={ro.busy || !note.trim()} onClick={async () => { const r = await ro.submit({ issue_id: issue.id, reason: note }); if (r) { toast('Issue reopened.'); setMode(null) } }}>Reopen issue</button><button className="btn small" onClick={() => setMode(null)}>Cancel</button></div>
        </div>
      )}
    </div>
  )
}

function CommitmentBlock({ c, focused }: { c: R; focused: boolean }) {
  const { state: st } = useSnap()
  const s = st!
  const [mode, setMode] = useState<null | 'accept' | 'reject' | 'propose'>(null)
  const [t1, setT1] = useState(''); const [t2, setT2] = useState('')
  const dec = useSubmit('decide_commitment'); const prop = useSubmit('propose_commitment')
  const canAssign = (s.users[s.me].caps as string[]).includes('assign')
  const label: Record<string, string> = { planned: 'Planned', proposed: 'Proposed revision pending', agreed: 'Agreed', done: 'Done' }
  return (
    <div className={`panel pad ${focused ? 'sel' : ''}`} id={`commitment-${c.id}`}>
      <div className="row wrap"><h3 className="grow">{c.title}</h3><Badge tone={c.proposed ? 'attention' : c.state === 'done' ? 'success' : ''}>{label[c.state] || c.state}</Badge></div>
      <div className="small muted">{c.scope} · Owner {personLabel(s, c.owner_id)}</div>
      {c.proposed ? (
        <table className="t mt-8" aria-label="Original, agreed and proposed dates">
          <thead><tr><th>Original</th><th>Agreed</th><th>Proposed (not agreed)</th></tr></thead>
          <tbody><tr><td>{fmtDate(c.original, true)}</td><td>{c.agreed ? fmtDate(c.agreed, true) : 'Not agreed'}</td><td><strong>{fmtDate(c.proposed, true)}</strong></td></tr></tbody>
        </table>
      ) : <p className="mt-8"><strong>{c.state === 'done' ? `Completed ${fmtDate(c.actual, true)}` : fmtDate(effDate(c), true)}</strong> <span className="muted">· {c.state === 'done' ? 'actual' : c.state}</span>{c.revisions?.length > 0 && <span className="muted"> · originally {fmtDate(c.original, true)}</span>}</p>}
      {c.proposed && <p className="small mt-8">Reason: {c.reason} · Proposed by {c.proposer}{c.evidence_source_id && <> · <SourceLink id={c.evidence_source_id} ctx={{}} label="Evidence" /></>}. The agreed date stays in force until the proposal is accepted.</p>}
      {c.agreed_evidence && !c.proposed && <p className="small muted">Agreement evidence: {c.agreed_evidence}</p>}
      {c.revisions?.map((r: R, i: number) => <p key={i} className="small muted">Revision agreed {fmtTs(r.at)} by {personLabel(s, r.by)}: {fmtDate(r.was_agreed)} → {fmtDate(r.now_agreed)}. Evidence: {r.evidence}</p>)}
      {c.readiness && c.state !== 'done' && <p className="small mt-8"><span className="muted">Readiness: </span>{c.readiness}</p>}
      <div className="row wrap mt-8">
        {c.proposed && canAssign && <><button className="btn small" onClick={() => setMode('accept')}>Accept proposal</button><button className="btn small" onClick={() => setMode('reject')}>Do not accept</button></>}
        {!c.proposed && c.state !== 'done' && <button className="btn small link-like" onClick={() => setMode('propose')}>Propose a revised date</button>}
      </div>
      {mode === 'accept' && <div className="inline-form"><Field label="Agreement evidence" required hint="Who agreed, and where is it recorded?"><input type="text" value={t1} onChange={e => setT1(e.target.value)} /></Field><ErrorBox err={dec.error} />
        <div className="row"><button className="btn primary small" disabled={dec.busy || !t1.trim()} onClick={async () => { if (await dec.submit({ commitment_id: c.id, decision: 'accept', evidence: t1, if_rev: c.rev })) { toast('Revised date agreed. The original date is kept in history.'); setMode(null) } }}>Record agreement</button><button className="btn small" onClick={() => setMode(null)}>Cancel</button></div></div>}
      {mode === 'reject' && <div className="inline-form"><Field label="Reason" required><input type="text" value={t1} onChange={e => setT1(e.target.value)} /></Field><ErrorBox err={dec.error} />
        <div className="row"><button className="btn primary small" disabled={dec.busy || !t1.trim()} onClick={async () => { if (await dec.submit({ commitment_id: c.id, decision: 'reject', reason: t1, if_rev: c.rev })) setMode(null) }}>Record decision</button><button className="btn small" onClick={() => setMode(null)}>Cancel</button></div></div>}
      {mode === 'propose' && <div className="inline-form"><div className="form-grid"><Field label="Proposed date" required><input type="date" value={t1} onChange={e => setT1(e.target.value)} /></Field><Field label="Reason" required><input type="text" value={t2} onChange={e => setT2(e.target.value)} /></Field></div>
        <div className="hint">A proposal is not an agreement; the current commitment stays until accepted.</div><ErrorBox err={prop.error} />
        <div className="row"><button className="btn primary small" disabled={prop.busy || !t1 || !t2.trim()} onClick={async () => { if (await prop.submit({ commitment_id: c.id, date: t1, reason: t2 })) { toast('Proposal recorded; not yet agreed.'); setMode(null) } }}>Record proposal</button><button className="btn small" onClick={() => setMode(null)}>Cancel</button></div></div>}
    </div>
  )
}

export function FocusDetail({ workId, focus = {}, mode, actionOnly, headerSlot, hideTitle }: { workId?: string | null; focus?: Focus; mode: 'page' | 'panel'; actionOnly?: boolean; headerSlot?: ReactNode; hideTitle?: boolean }) {
  const { state: st, userId } = useSnap()
  const s = st!
  const work = workId ? s.works[workId] : null
  const prevKey = `prev:${userId}:${workId}`
  const [prev, setPrev] = useState<string | null | undefined>(remember.get(prevKey, undefined))
  const [adding, setAdding] = useState(false)
  const [stylesOpen, setStylesOpen] = useState(false)
  const [showAllResolved, setShowAllResolved] = useState(false)

  // Opening a work records this user's view (personal state). It never touches shared "last updated" and never marks responses read.
  useEffect(() => {
    if (!workId) return
    const k = `viewed:${userId}:${workId}`
    const last = remember.get<number>(k, 0)
    if (Date.now() - last < 4000) { setPrev(remember.get(prevKey, undefined)); return }
    remember.set(k, Date.now())
    run('view_work', { work_id: workId }).then(r => { remember.set(prevKey, r.previous); setPrev(r.previous) }).catch(() => {})
    // eslint-disable-next-line
  }, [workId, userId])

  useEffect(() => {
    const id = focus.issueId ? `issue-${focus.issueId}` : focus.commitmentId ? `commitment-${focus.commitmentId}` : null
    if (id) setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 200)
  }, [focus.issueId, focus.commitmentId])

  const action = focus.actionId ? s.actions[focus.actionId] : null
  if (!work && !action) return <div className="empty"><span className="strong">This record is no longer available.</span>It may have been removed or you may not have access.</div>

  const issues = work ? (Object.values(s.issues) as R[]).filter(i => i.work_id === work.id) : []
  const openIssues = issues.filter(i => i.state === 'open').sort((a, b) => (a.id === focus.issueId ? -1 : b.id === focus.issueId ? 1 : 0))
  const resolved = issues.filter(i => i.state === 'resolved').sort((a, b) => (a.id === focus.issueId ? -1 : b.id === focus.issueId ? 1 : 0))
  const focusedResolved = focus.issueId && resolved.find(i => i.id === focus.issueId)
  const actions = work ? (Object.values(s.actions) as R[]).filter(a => a.work_id === work.id) : []
  const dedupe = (a: R) => !(mode === 'panel' && a.id === focus.actionId)   // the focused action is shown once, in its own block
  const openActions = actions.filter(a => OPEN.includes(a.status) && dedupe(a))
  const doneActions = actions.filter(a => !OPEN.includes(a.status) && dedupe(a))
  const commitments = work ? (Object.values(s.commitments) as R[]).filter(c => c.work_id === work.id) : []
  const events = work ? (Object.values(s.events) as R[]).filter(e => e.scope.work_id === work.id || e.scope.also?.work_ids?.includes(work.id)) : []
  const sources = work ? (Object.values(s.sources) as R[]).filter(x => x.work_ids.includes(work.id)) : []
  const focusIssue = focus.issueId ? s.issues[focus.issueId] : openIssues[0]
  const brand = work ? s.brands[work.brand_id] : null
  const flags = work ? s.derived.works[work.id] : null
  const counts = flags?.counts
  const brandLink = work ? `/brands/${work.brand_id}/work?work=${work.id}${focus.issueId ? `&issue=${focus.issueId}` : ''}${focus.actionId ? `&action=${focus.actionId}` : ''}` : null

  const timeline = work ? (
    <aside aria-label="Timeline" className="panel pad">
      <Timeline events={events} since={prev} />
    </aside>
  ) : null

  const body = (
    <div className="col gap-16">
      {action && mode === 'panel' && <ActionFocus action={action} />}

      {work && !actionOnly && (
        <section className="panel pad" aria-label="What's happening">
          <h2>What’s happening</h2>
          <p className="mt-8">{focusedResolved ? <>{focusedResolved.title} was resolved. {focusedResolved.resolution.note}</> : <>{work.position} {focusIssue && focusIssue.state === 'open' && <>{focusIssue.impact}</>}</>}</p>
          <p className="small muted mt-8">
            {focusIssue?.affected_style_ids?.length > 0 && <>Affected: {focusIssue.affected_style_ids.map((x: string) => s.styles[x]?.name).join(', ')}. </>}
            {focusIssue?.source_id ? <>Source: <SourceLink id={focusIssue.source_id} ctx={{ brand_id: work.brand_id }} /></> : sources[0] ? <>Source: <SourceLink id={sources[0].id} ctx={{ brand_id: work.brand_id }} /></> : <span>Source unavailable</span>}
          </p>
        </section>
      )}

      {work && issues.length > 0 && !actionOnly && (
        <section aria-label="Issues" className="col">
          <h2>Issues{openIssues.length > 0 && <span className="muted" style={{ fontWeight: 400 }}> · {openIssues.length} open</span>}</h2>
          {openIssues.length === 0 && <div className="muted">No open issues on this work.</div>}
          {openIssues.map(i => <IssueCard key={i.id} issue={i} focused={i.id === focus.issueId} />)}
          {resolved.length > 0 && (
            <Disclosure summary="Resolved issues" count={resolved.length} defaultOpen={!!focusedResolved}>
              <div className="col">{(showAllResolved || focusedResolved ? resolved : resolved.slice(0, 3)).map(i => <IssueCard key={i.id} issue={i} focused={i.id === focus.issueId} />)}</div>
            </Disclosure>
          )}
        </section>
      )}

      {work && !actionOnly && (
        <section className="panel" aria-label="What needs to happen next">
          <div className="panel-head"><h2 className="grow">{mode === 'panel' && focus.actionId ? 'Other actions on this work' : 'What needs to happen next'}</h2><button className="btn small" onClick={() => setAdding(!adding)} aria-expanded={adding}>+ Add action</button></div>
          <div className="panel-body">
            {adding && <AddActionForm workId={work.id} issueId={focus.issueId || (openIssues[0]?.id ?? null)} onClose={() => setAdding(false)} />}
            {openActions.length === 0 && !adding && <div className="muted">No open actions on this work.</div>}
            <ul className="list" style={{ marginTop: 4 }}>
              {openActions.map(a => <ActionRow key={a.id} action={a} focused={a.id === focus.actionId} autoOpenFollowUp={a.id === focus.actionId || a.id === s.requests[focus.requestId || '']?.action_id} />)}
            </ul>
            {doneActions.length > 0 && <Disclosure summary="Completed actions" count={doneActions.length}><ul className="list">{doneActions.map(a => <ActionRow key={a.id} action={a} />)}</ul></Disclosure>}
          </div>
        </section>
      )}

      {work && commitments.length > 0 && !actionOnly && (
        <section aria-label="Commitments and revisions" className="col">
          <h2>Commitments</h2>
          {commitments.map(c => <CommitmentBlock key={c.id} c={c} focused={c.id === focus.commitmentId} />)}
        </section>
      )}

      {work && !actionOnly && (
        <section className="panel pad" aria-label="Styles involved">
          <button className="btn link-like row" aria-expanded={stylesOpen} onClick={() => setStylesOpen(!stylesOpen)} style={{ fontSize: 14 }}>
            <strong>Styles involved · {work.style_ids.length}</strong> {stylesOpen ? '▴' : '▾'}</button>
          {stylesOpen && (
            <ul className="list mt-8">
              {work.style_ids.map((sid: string) => { const sty = s.styles[sid]; return (
                <li key={sid} className="row" style={{ padding: '8px 0' }}>
                  <Placeholder />
                  <div className="grow"><Link to={`/styles/${sid}`} className="strong">{sty.name}</Link> <span className="muted">· {sid}</span>
                    <div className="small muted">{sty.category}{s.derived.styles[sid].position && <> · {s.derived.styles[sid].position}</>}</div></div>
                </li>) })}
            </ul>
          )}
        </section>
      )}

      {work && !actionOnly && (
        <section className="panel pad" aria-label="Follow-ups and supporting details">
          <h2>Follow-ups and supporting details</h2>
          <ul className="list mt-8">
            {(Object.values(s.requests) as R[]).filter(r => s.actions[r.action_id]?.work_id === work.id).sort((a, b) => b.requested_at.localeCompare(a.requested_at)).map(r => (
              <li key={r.id} style={{ padding: '6px 0' }}>
                <div className="small muted">{fmtTs(r.requested_at)} · {r.state === 'awaiting' ? 'Update requested' : r.state === 'responded' ? 'Response recorded' : 'Withdrawn'} · {s.actions[r.action_id].title}</div>
                <div>{r.state === 'responded' ? <>“{r.response.text.slice(0, 140)}{r.response.text.length > 140 ? '…' : ''}” <span className="muted small">(open the request under its action to read it in full)</span></> : <>“{r.question.slice(0, 140)}”</>}</div>
              </li>))}
            {sources.map(x => <li key={x.id} style={{ padding: '6px 0' }}><div className="small muted">{fmtDate(x.date)} · {x.type.replace('_', ' ')}</div><SourceLink id={x.id} ctx={{ brand_id: work.brand_id }} /></li>)}
          </ul>
          {sources.length === 0 && (Object.values(s.requests) as R[]).filter(r => s.actions[r.action_id]?.work_id === work.id).length === 0 && <div className="muted">No follow-ups or sources are recorded for this work.</div>}
        </section>
      )}
    </div>
  )

  const header = work ? (
    <header>
      {headerSlot}
      {!hideTitle && <><div className="small muted">{brand!.name}</div>
      <h1 style={{ fontSize: mode === 'panel' ? 20 : 26 }}>{work.title}</h1></>}
      <div className="row wrap" style={{ gap: 6, marginTop: hideTitle ? 0 : 8 }}>
        <Badge tone="info">{work.stage}</Badge>
        {flags!.attention_count > 0 && <Badge tone="error">Needs attention</Badge>}
        {work.waiting_on_brand && <Badge tone="attention">Waiting on brand</Badge>}
        {work.lifecycle !== 'active' && <Badge>{work.lifecycle}</Badge>}
      </div>
      <div className="small muted mt-8">
        Last updated {fmtTs(work.updated_at)} · Last viewed by you {prev === undefined ? '…' : prev ? fmtTs(prev) : 'Not viewed before'}
      </div>
      <div className="small mt-8 row wrap" style={{ gap: 12 }}>
        <button className="link" onClick={() => setStylesOpen(true)}>{counts.styles} {counts.styles === 1 ? 'style' : 'styles'}</button>
        {work.colourway_note && <span className="muted">{work.colourway_note}</span>}
        <span>Overall owner: {personLabel(s, work.owner_id)}</span>
        {brandLink && <Link className="btn small" to={brandLink}>View all brand details</Link>}
      </div>
    </header>
  ) : (
    <header>{headerSlot}<h1 style={{ fontSize: 20 }}>{action!.title}</h1><div className="muted small">This action is not linked to a work track.</div></header>
  )

  if (mode === 'page') {
    return (
      <div className="col gap-16">
        {header}
        <div className="grid-main"><div>{body}</div>{timeline}</div>
      </div>
    )
  }
  return <div className="col gap-16">{header}{body}{timeline}</div>
}

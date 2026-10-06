import { useState } from 'react'
import { Link } from 'react-router-dom'
import { run, toast, useSnap, type R } from '../store'
import { AssigneeButton, Badge, ErrorBox, Field, SourceLink, Timeline, useSubmit } from '../ui'
import { STATE_LABEL, fmtDate, fmtTs, isOverdue, personLabel } from '../util'
import { ActionStatusBadge, AddActionForm, FollowUpForm, RequestLine, requestsFor } from './ActionBits'
import { NoteComposer } from './NoteComposer'

/** The selected action, expanded: properties, outstanding request, completion/review/blocked controls, comments & activity. */
export function ActionFocus({ action }: { action: R }) {
  const { state: s } = useSnap()
  const st = s!
  const me = st.users[st.me]
  const work = action.work_id ? st.works[action.work_id] : null
  const [form, setForm] = useState<null | 'complete' | 'review' | 'blocked' | 'unblock' | 'reopen' | 'approve' | 'changes' | 'followup' | 'add' | 'note'>(null)
  const [tab, setTab] = useState<'comments' | 'activity'>('comments')
  const reqs = requestsFor(st, action.id)
  const [txt, setTxt] = useState(''); const [txt2, setTxt2] = useState('')
  const sub = useSubmit(form === 'complete' ? 'complete_action' : form === 'review' ? 'submit_review' : form === 'blocked' ? 'block_action' : form === 'unblock' ? 'unblock_action' : form === 'reopen' ? 'reopen_action' : 'review_decision')
  const comment = useSubmit('add_comment')
  const [ctext, setCtext] = useState('')
  const isAssignee = action.assignee_id === st.me
  const canActOwn = isAssignee || me.caps.includes('assign')
  const open = ['open', 'blocked'].includes(action.status)
  const finding = action.finding_id ? st.findings[action.finding_id] : null
  const vendor = action.vendor_id ? st.vendors[action.vendor_id] : null
  const closeForm = () => { setForm(null); setTxt(''); setTxt2('') }
  const comments = (Object.values(st.comments) as R[]).filter(c => c.action_id === action.id).sort((a, b) => a.ts.localeCompare(b.ts))
  const events = (Object.values(st.events) as R[]).filter(e => e.scope.action_id === action.id)
  const issue = action.issue_id ? st.issues[action.issue_id] : null

  async function go(op: string, body: R, ok: string) {
    const r = await sub.submit({ action_id: action.id, if_rev: action.rev, ...body })
    if (r) { toast(ok); closeForm() }
  }

  return (
    <section className="panel pad" aria-label="Selected action" style={{ borderColor: 'var(--teal)' }}>
      <div className="small muted">{work ? `${st.brands[work.brand_id].name} · ${work.title}` : vendor ? `Vendor · ${vendor.name}` : ''}</div>
      <h2 style={{ marginTop: 2 }}>{action.title}</h2>
      <dl className="kv mt-8">
        <dt>Status</dt><dd><ActionStatusBadge action={action} /> {action.status === 'awaiting_review' && <span className="small muted">Submitted by {personLabel(st, action.review.submitted_by)} · {fmtTs(action.review.at)}</span>}</dd>
        <dt>Assigned to</dt><dd><AssigneeButton action={action} />{work && action.assignee_id !== work.owner_id && <span className="small muted"> · Overall work owner: {personLabel(st, work.owner_id)}</span>}</dd>
        <dt>Due</dt><dd>{action.due ? <>{fmtDate(action.due, true)}{isOverdue(action) && <> <Badge tone="error">Overdue</Badge></>}</> : 'No date set'}</dd>
        {reqs.some(r => r.state === 'awaiting' && r.response_due) && <><dt>Reply requested by</dt><dd>{reqs.filter(r => r.state === 'awaiting' && r.response_due).map(r => <span key={r.id}>{fmtDate(r.response_due, true)} <span className="muted">(separate from the due date)</span></span>)}</dd></>}
      </dl>
      {reqs.filter(r => r.state === 'awaiting' || (r.state === 'responded' && !r.requester_read_at && r.requester_id === st.me)).map(r => <RequestLine key={r.id} req={r} defaultOpen={r.state === 'awaiting' && r.recipient_id === st.me} />)}
      <div className="mt-16">
        <h3>What needs to happen</h3>
        <p>{action.expected_outcome || 'Expected outcome not recorded.'}</p>
        {action.status === 'blocked' && action.blocked && <p className="mt-8"><Badge tone="error">Blocked</Badge> Needs <strong>{action.blocked.needs}</strong> from <strong>{action.blocked.from}</strong>. Receiving a message alone does not clear the blocker.</p>}
        {issue && <p className="small muted mt-8">Linked issue: <strong>{issue.title}</strong>. {issue.impact} Completing this action does not resolve the issue.</p>}
        {finding && <p className="small muted mt-8">Linked audit finding: {finding.section} ({finding.id}). <Link to={`/vendors/${finding.vendor_id}/audits?finding=${finding.id}`}>Open finding</Link>. Completing this task does not verify the finding closure.</p>}
        {action.sample_round_id && <p className="small muted mt-8"><Link to={`/styles/${action.style_id}/sampling?round=${action.sample_round_id}`}>Open sample round</Link></p>}
        {action.requires_recheck_of && <p className="small muted mt-8"><Link to={`/styles/${action.style_id}/production?alloc=${st.inspections[action.requires_recheck_of].allocation_id}`}>Open the inspection and re-inspection record</Link></p>}
        {action.source_id && <p className="small mt-8">Source: <SourceLink id={action.source_id} ctx={{ brand_id: work?.brand_id }} /></p>}
        {action.origin === 'prototype' && <p className="small muted mt-8">Created in this prototype.</p>}
      </div>

      {action.status === 'completed' && action.completion && (
        <div className="alert success mt-16">Completed {fmtTs(action.completion.at)} by {personLabel(st, action.completion.by)}. {action.completion.outcome}</div>
      )}

      <div className="row wrap mt-16" role="group" aria-label="Actions">
        {open && canActOwn && !action.requires_review && <button className="btn primary" onClick={() => setForm('complete')}>Mark complete</button>}
        {open && canActOwn && action.requires_review && <button className="btn primary" onClick={() => setForm('review')}>Submit for review</button>}
        {action.status === 'awaiting_review' && me.caps.includes('technical_review') && action.review.submitted_by !== st.me && <>
          <button className="btn primary" onClick={() => setForm('approve')}>Approve</button>
          <button className="btn" onClick={() => setForm('changes')}>Request changes</button></>}
        {action.status === 'awaiting_review' && action.review.submitted_by === st.me && <span className="small muted">Waiting for an authorised reviewer. You cannot approve your own submission.</span>}
        {action.status === 'completed' && me.caps.includes('reopen') && <button className="btn" onClick={() => setForm('reopen')}>Reopen</button>}
        {!['completed', 'cancelled'].includes(action.status) && <button className="btn small" onClick={() => setForm(form === 'followup' ? null : 'followup')}>Follow up</button>}
        <button className="btn small" onClick={() => setForm('add')}>Add action</button>
        <button className="btn small" onClick={() => setForm('note')}>Add note</button>
        {open && canActOwn && action.status === 'open' && <button className="btn small" onClick={() => setForm('blocked')}>Mark as blocked</button>}
        {action.status === 'blocked' && canActOwn && <button className="btn small" onClick={() => setForm('unblock')}>Clear blocker…</button>}
      </div>

      {form === 'followup' && (reqs.some(r => r.state === 'awaiting')
        ? <div className="alert info mt-8">An update is already awaiting a response on this action; see the request above. Reminders stay on the same request.</div>
        : <FollowUpForm action={action} allowExternal onClose={closeForm} />)}
      {form === 'add' && <AddActionForm workId={action.work_id} issueId={action.issue_id} styleId={action.style_id} vendorId={action.vendor_id} onClose={closeForm} />}
      {form === 'note' && <NoteComposer onClose={closeForm} initial={{ work_id: action.work_id, brand_id: work?.brand_id, style_id: action.style_id, vendor_id: action.vendor_id }} />}
      {form === 'complete' && (
        <div className="inline-form"><Field label="Outcome" required><textarea value={txt} onChange={e => setTxt(e.target.value)} placeholder="What was the result?" /></Field>
          <Field label="Evidence or reference (optional)"><input type="text" value={txt2} onChange={e => setTxt2(e.target.value)} /></Field>
          <div className="hint">Completing this action does not resolve its issue or complete other actions.</div>
          <ErrorBox err={sub.error} /><div className="row"><button className="btn primary small" disabled={sub.busy || !txt.trim()} onClick={() => go('complete_action', { outcome: txt, evidence: txt2 }, 'Action completed.')}>{sub.busy ? 'Saving…' : 'Confirm completion'}</button><button className="btn small" onClick={closeForm}>Cancel</button></div></div>
      )}
      {form === 'review' && (
        <div className="inline-form"><div className="small">This work needs formal review; it cannot be completed directly.</div><Field label="What are you submitting?" required><textarea value={txt} onChange={e => setTxt(e.target.value)} /></Field>
          <ErrorBox err={sub.error} /><div className="row"><button className="btn primary small" disabled={sub.busy || !txt.trim()} onClick={() => go('submit_review', { note: txt }, 'Submitted for review.')}>Submit for review</button><button className="btn small" onClick={closeForm}>Cancel</button></div></div>
      )}
      {(form === 'approve' || form === 'changes') && (
        <div className="inline-form"><Field label={form === 'approve' ? 'Approval comment' : 'What needs to change?'} required><textarea value={txt} onChange={e => setTxt(e.target.value)} /></Field>
          <ErrorBox err={sub.error} /><div className="row"><button className="btn primary small" disabled={sub.busy || !txt.trim()} onClick={() => go('review_decision', { decision: form === 'approve' ? 'approve' : 'changes', comment: txt }, form === 'approve' ? 'Approved.' : 'Changes requested.')}>{form === 'approve' ? 'Approve' : 'Request changes'}</button><button className="btn small" onClick={closeForm}>Cancel</button></div></div>
      )}
      {form === 'blocked' && (
        <div className="inline-form"><Field label="What is needed?" required><input type="text" value={txt} onChange={e => setTxt(e.target.value)} /></Field><Field label="From whom?" required><input type="text" value={txt2} onChange={e => setTxt2(e.target.value)} /></Field>
          <ErrorBox err={sub.error} /><div className="row"><button className="btn primary small" disabled={sub.busy || !txt.trim() || !txt2.trim()} onClick={() => go('block_action', { needs: txt, from_whom: txt2 }, 'Marked as blocked.')}>Mark as blocked</button><button className="btn small" onClick={closeForm}>Cancel</button></div></div>
      )}
      {form === 'unblock' && (
        <div className="inline-form"><Field label="Confirm what was received or decided" required hint="A message arriving is not enough: name the output or decision."><input type="text" value={txt} onChange={e => setTxt(e.target.value)} /></Field>
          <ErrorBox err={sub.error} /><div className="row"><button className="btn primary small" disabled={sub.busy || !txt.trim()} onClick={() => go('unblock_action', { confirmation: txt }, 'Blocker cleared.')}>Clear blocker</button><button className="btn small" onClick={closeForm}>Cancel</button></div></div>
      )}
      {form === 'reopen' && (
        <div className="inline-form"><Field label="Reason for reopening" required><input type="text" value={txt} onChange={e => setTxt(e.target.value)} /></Field>
          <ErrorBox err={sub.error} /><div className="row"><button className="btn primary small" disabled={sub.busy || !txt.trim()} onClick={() => go('reopen_action', { reason: txt }, 'Action reopened. The earlier completion is kept in history.')}>Reopen action</button><button className="btn small" onClick={closeForm}>Cancel</button></div></div>
      )}

      <div className="mt-16">
        <div className="row" role="tablist" aria-label="Comments or activity">
          <button role="tab" className="tab" aria-selected={tab === 'comments'} onClick={() => setTab('comments')}>Comments <span className="count">{comments.length}</span></button>
          <button role="tab" className="tab" aria-selected={tab === 'activity'} onClick={() => setTab('activity')}>Activity <span className="count">{events.length}</span></button>
        </div>
        {tab === 'comments' ? (
          <div className="col mt-8">
            {comments.length === 0 && <div className="muted small">No comments yet.</div>}
            {comments.map(c => <div key={c.id}><div className="small muted">{personLabel(st, c.author_id)} · {fmtTs(c.ts)}</div><div>{c.text}</div></div>)}
            <Field label="Add a comment"><textarea value={ctext} onChange={e => setCtext(e.target.value)} placeholder="Discuss this action. A comment does not answer an update request; use Respond for that." /></Field>
            <ErrorBox err={comment.error} />
            <div><button className="btn small" disabled={!ctext.trim() || comment.busy} onClick={async () => { if (await comment.submit({ action_id: action.id, text: ctext })) setCtext('') }}>Post comment</button></div>
          </div>
        ) : <div className="mt-8"><Timeline events={events} title="Activity" /></div>}
      </div>
    </section>
  )
}

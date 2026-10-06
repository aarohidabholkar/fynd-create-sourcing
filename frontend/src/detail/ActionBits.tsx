import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronRight, MessageSquare } from 'lucide-react'
import { run, toast, useSnap, type R } from '../store'
import { AssigneeButton, Badge, ErrorBox, Field, Person, PersonPicker, SourceLink, useSubmit } from '../ui'
import { OPEN, STATE_LABEL, TODAY, fmtDate, fmtTs, isOverdue, personLabel, relDay } from '../util'

export function requestsFor(s: R, actionId: string) {
  return (Object.values(s.requests) as R[]).filter(r => r.action_id === actionId).sort((a, b) => b.requested_at.localeCompare(a.requested_at))
}

/* ---------- one update request, shown compactly under its action; expand to read ---------- */
export function RequestLine({ req, defaultOpen = false, forceOpen = 0 }: { req: R; defaultOpen?: boolean; forceOpen?: number }) {
  const { state: s } = useSnap()
  const st = s!
  const [open, setOpen] = useState(defaultOpen)
  const me = st.me
  const iAmRequester = req.requester_id === me
  const iAmRecipient = req.recipient_id === me
  const isNew = req.state === 'responded' && iAmRequester && !req.requester_read_at
  const respond = useSubmit('respond_request')
  const remind = useSubmit('remind_request')
  const withdraw = useSubmit('withdraw_request')
  const [text, setText] = useState('')
  const [evidence, setEvidence] = useState('')
  const [wd, setWd] = useState<string | null>(null)

  useEffect(() => {
    if (forceOpen > 0) { setOpen(true); if (isNew) run('read_response', { request_id: req.id }) }
    // eslint-disable-next-line
  }, [forceOpen])
  const toggle = () => {
    const next = !open
    setOpen(next)
    // A response counts as read only when its content is actually opened by the requester
    if (next && isNew) run('read_response', { request_id: req.id })
  }
  const overdue = req.state === 'awaiting' && req.response_due && req.response_due < TODAY
  let label = ''
  if (req.state === 'awaiting') label = `${req.leadership ? 'Leadership requested an update' : 'Update requested'} · ${personLabel(st, req.requester_id)} · ${relDay(req.requested_at.slice(0, 10))}`
  else if (req.state === 'responded') label = `Response ${isNew ? 'received' : 'on record'} · ${personLabel(st, req.response.by)} · ${relDay(req.response.at.slice(0, 10))}`
  else label = `Request withdrawn · ${relDay(req.withdrawn.at.slice(0, 10))}`
  return (
    <div className={`mt-8 ${req.leadership && req.state === 'awaiting' ? 'leader' : isNew ? 'highlight' : ''}`} style={{ borderRadius: 6, padding: '6px 10px', background: req.leadership || isNew ? undefined : 'var(--subtle)' }}>
      <button className="btn link-like row" style={{ gap: 6, textAlign: 'left' }} aria-expanded={open} onClick={toggle}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}<MessageSquare size={14} /> {label}
      </button>
      <span style={{ marginLeft: 6 }}>
        {req.state === 'awaiting' && <Badge tone={overdue ? 'error' : 'attention'}>{overdue ? 'Reply overdue' : 'Awaiting response'}</Badge>}
        {req.state === 'awaiting' && req.response_due && <span className="small muted"> · Reply by {fmtDate(req.response_due)}</span>}
        {isNew && <Badge tone="info">New response</Badge>}
        {req.state === 'responded' && !isNew && <Badge tone="success">Response received</Badge>}
      </span>
      {open && (
        <div className="mt-8 col" style={{ fontSize: 13 }}>
          <div><span className="muted">Question from {personLabel(st, req.requester_id)} to {personLabel(st, req.recipient_id)} · {fmtTs(req.requested_at)}:</span><br />{req.question}</div>
          {req.recipient_history?.length > 0 && <div className="small muted">Moved with the reassigned action. Earlier recipient: {req.recipient_history.map((h: R) => personLabel(st, h.recipient_id)).join(', ')}.</div>}
          {req.reminders.length > 0 && <div className="small muted">{req.reminders.length} reminder(s) sent on this same request (latest {fmtTs(req.reminders[req.reminders.length - 1].at)}).</div>}
          {req.state === 'responded' && (
            <div className="panel pad" style={{ background: '#fff' }}>
              <div className="small muted">Response from {personLabel(st, req.response.by)} · {fmtTs(req.response.at)}</div>
              <div>{req.response.text}</div>
              {req.response.evidence && <div className="small muted">Evidence: {req.response.evidence}</div>}
              <div className="hint mt-8">A response does not complete the action or resolve any issue.</div>
            </div>
          )}
          {req.state === 'withdrawn' && <div className="small muted">Withdrawn: {req.withdrawn.reason}</div>}
          {req.state === 'awaiting' && iAmRecipient && (
            <div className="inline-form">
              <Field label="Your response" required><textarea value={text} onChange={e => setText(e.target.value)} placeholder="What is the current position?" /></Field>
              <Field label="Evidence or reference (optional)"><input type="text" value={evidence} onChange={e => setEvidence(e.target.value)} placeholder="e.g. email, photo, document name" /></Field>
              <ErrorBox err={respond.error} />
              <div className="row"><button className="btn primary small" disabled={respond.busy || !text.trim()} onClick={async () => {
                const r = await respond.submit({ request_id: req.id, text, evidence })
                if (r) { toast('Response recorded. The action and issue are unchanged.'); setText(''); setEvidence('') }
              }}>{respond.busy ? 'Saving…' : 'Respond'}</button></div>
            </div>
          )}
          {req.state === 'awaiting' && iAmRequester && (
            <div className="row wrap">
              <button className="btn small" disabled={remind.busy} onClick={async () => { if (await remind.submit({ request_id: req.id })) toast('Reminder added to this same request (simulated; nothing sent externally).') }}>Send reminder</button>
              <button className="btn small" onClick={() => setWd(wd === null ? '' : null)}>Withdraw request</button>
              <ErrorBox err={remind.error} />
            </div>
          )}
          {wd !== null && (
            <div className="inline-form">
              <Field label="Reason for withdrawing" required><input type="text" value={wd} onChange={e => setWd(e.target.value)} /></Field>
              <ErrorBox err={withdraw.error} />
              <div className="row"><button className="btn small danger" disabled={!wd.trim() || withdraw.busy} onClick={async () => { if (await withdraw.submit({ request_id: req.id, reason: wd })) setWd(null) }}>Withdraw</button></div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ---------- follow-up form: reveals only after the user chooses Follow up ---------- */
export function FollowUpForm({ action, onClose, allowExternal = false }: { action: R; onClose: () => void; allowExternal?: boolean }) {
  const { state: s } = useSnap()
  const st = s!
  const [q, setQ] = useState(`Could you share the latest on "${action.title}"?`)
  const [due, setDue] = useState('')
  const [channel, setChannel] = useState('internal_request')
  const { submit, busy, error } = useSubmit('follow_up')
  const internal = channel === 'internal_request'
  return (
    <div className="inline-form" role="group" aria-label={`Follow up: ${action.title}`}>
      <div className="small muted">Expected: {action.expected_outcome || action.title}. Responsible: {personLabel(st, action.assignee_id)}. Delivery date: {action.due ? fmtDate(action.due) : 'No date set'} (a response deadline below does not change it).</div>
      {allowExternal && (
        <Field label="Channel"><select value={channel} onChange={e => setChannel(e.target.value)}>
          <option value="internal_request">Request update (internal, on this action)</option>
          <option value="email">Email: log only (simulated, nothing sent)</option>
          <option value="whatsapp">WhatsApp: log only (simulated, nothing sent)</option>
        </select></Field>
      )}
      <div className="small">Recipient: <strong>{internal ? personLabel(st, action.assignee_id) : 'External contact (outside this prototype)'}</strong>{!internal && <span className="muted"> · no real message is delivered; this logs the follow-up on the action</span>}</div>
      <Field label="Message" required><textarea value={q} onChange={e => setQ(e.target.value)} /></Field>
      <Field label="Response needed by (optional)"><input type="date" min={TODAY} value={due} onChange={e => setDue(e.target.value)} /></Field>
      <ErrorBox err={error} />
      <div className="row">
        <button className="btn primary small" disabled={busy || !q.trim()} onClick={async () => {
          const r = await submit({ action_id: action.id, message: q, response_due: due || null, channel })
          if (r) { toast(internal ? 'Update requested on the existing action (simulated notification).' : 'Follow-up logged. No message was sent.'); onClose() }
        }}>{busy ? 'Saving…' : internal ? 'Request update' : 'Log follow-up'}</button>
        <button className="btn small" onClick={onClose}>Cancel</button>
      </div>
    </div>
  )
}

/* ---------- add genuinely new work ---------- */
export function AddActionForm({ workId, issueId, onClose, styleId, vendorId }: { workId?: string | null; issueId?: string | null; onClose: () => void; styleId?: string | null; vendorId?: string | null }) {
  const [title, setTitle] = useState('')
  const [assignee, setAssignee] = useState('')
  const [due, setDue] = useState('')
  const { submit, busy, error } = useSubmit('add_action')
  const [touched, setTouched] = useState(false)
  return (
    <div className="inline-form" role="group" aria-label="Add action">
      <Field label="Action" required error={touched && !title.trim() ? 'Describe the new work.' : ''}><input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="What new work needs doing?" /></Field>
      <div className="form-grid">
        <Field label="Assigned to" required error={touched && !assignee ? 'Choose who will do it.' : ''}><PersonPicker value={assignee} onChange={setAssignee} label="Assigned to" /></Field>
        <Field label="Due date (optional)"><input type="date" value={due} onChange={e => setDue(e.target.value)} /></Field>
      </div>
      <div className="hint">This creates new work. To ask about an existing action, use Follow up on that action instead.</div>
      <ErrorBox err={error} />
      <div className="row">
        <button className="btn primary small" disabled={busy} onClick={async () => {
          setTouched(true)
          if (!title.trim() || !assignee) return
          const r = await submit({ title, assignee_id: assignee, due: due || null, work_id: workId, issue_id: issueId, style_id: styleId, vendor_id: vendorId })
          if (r) { toast('Action added and linked to this work.'); onClose() }
        }}>{busy ? 'Saving…' : 'Add action'}</button>
        <button className="btn small" onClick={onClose}>Cancel</button>
      </div>
    </div>
  )
}

/* ---------- compact action row ---------- */
export function ActionRow({ action, focused, autoOpenFollowUp, onOpen, allowExternal }: { action: R; focused?: boolean; autoOpenFollowUp?: boolean; onOpen?: () => void; allowExternal?: boolean }) {
  const { state: s } = useSnap()
  const st = s!
  const reqs = requestsFor(st, action.id)
  const awaiting = reqs.find(r => r.state === 'awaiting')
  const [fu, setFu] = useState(false)
  const [showEarlier, setShowEarlier] = useState(false)
  const [nudge, setNudge] = useState(0)
  const closed = ['completed', 'cancelled'].includes(action.status)
  const overdue = isOverdue(action)
  const current = reqs.filter(r => r.state === 'awaiting' || (r.state === 'responded' && !r.requester_read_at && r.requester_id === st.me))
  const earlier = reqs.filter(r => !current.includes(r))
  return (
    <li className={focused ? 'sel' : ''} style={{ padding: '10px 12px' }}>
      <div className="row wrap" style={{ alignItems: 'flex-start' }}>
        <div className="grow">
          {onOpen ? <button className="link strong" style={{ textAlign: 'left' }} onClick={onOpen}>{action.title}</button> : <span className="strong">{action.title}</span>}
          <div className="small muted row wrap" style={{ gap: 6 }}>
            <AssigneeButton action={action} />
            <span>·</span>
            <span>{closed ? `Completed ${fmtDate(action.completion?.at)}` : action.due ? <>Due {fmtDate(action.due)}{overdue && <> <Badge tone="error">Overdue</Badge></>}</> : 'No date set'}</span>
            {action.status !== 'open' && <Badge tone={action.status === 'blocked' ? 'error' : action.status === 'completed' ? 'success' : 'info'}>{STATE_LABEL[action.status]}</Badge>}
          </div>
        </div>
        {!closed && <button className="btn small" aria-expanded={awaiting ? undefined : fu} onClick={() => { if (awaiting) setNudge(n => n + 1); else setFu(!fu) }}>Follow up</button>}
      </div>
      {fu && !awaiting && <FollowUpForm action={action} allowExternal={allowExternal} onClose={() => setFu(false)} />}
      {nudge > 0 && awaiting && <div className="alert info mt-8" role="status">An update is already awaiting a response on this action (requested by {personLabel(st, awaiting.requester_id)} · {relDay(awaiting.requested_at.slice(0, 10))}). It is opened below rather than creating another.</div>}
      {current.map(r => <RequestLine key={r.id} req={r} defaultOpen={(autoOpenFollowUp && r.id === awaiting?.id) || false} forceOpen={r.id === awaiting?.id ? nudge : 0} />)}
      {earlier.length > 0 && (
        <div className="mt-8"><button className="btn link-like small" onClick={() => setShowEarlier(!showEarlier)}>{showEarlier ? 'Hide' : 'Show'} earlier exchanges ({earlier.length})</button>
          {showEarlier && earlier.map(r => <RequestLine key={r.id} req={r} />)}</div>
      )}
    </li>
  )
}

export function ActionStatusBadge({ action }: { action: R }) {
  if (isOverdue(action)) return <Badge tone="error">Overdue</Badge>
  return <Badge tone={action.status === 'blocked' ? 'error' : action.status === 'completed' ? 'success' : action.status === 'awaiting_review' ? 'info' : ''}>{STATE_LABEL[action.status]}</Badge>
}

export { Person, SourceLink, Link, OPEN }

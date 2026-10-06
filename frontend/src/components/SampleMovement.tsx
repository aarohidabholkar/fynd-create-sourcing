import { useState } from 'react'
import { toast, useSnap, type R } from '../store'
import { Dialog, ErrorBox, Field, useSubmit } from '../ui'
import { TODAY, fmtDate } from '../util'

/** Record made / dispatched / received as separate facts. Shows exactly what a receipt will update. */
export function SampleMovementDialog({ round, initialKind, onClose }: { round: R; initialKind?: string; onClose: () => void }) {
  const { state: s } = useSnap()
  const st = s!
  const req = st.sample_requests[round.request_id]
  const [kind, setKind] = useState(initialKind || (round.dispatched > round.received ? 'received' : round.made > round.dispatched ? 'dispatched' : 'made'))
  const [qty, setQty] = useState('1')
  const [date, setDate] = useState(TODAY)
  const [colour, setColour] = useState(req.colourways?.[0] || '')
  const [size, setSize] = useState(req.sizes?.[0] || 'M')
  const [ref, setRef] = useState('')
  const { submit, busy, error } = useSubmit('record_sample_movement')
  const outstanding = round.dispatched - round.received
  const effects: string[] = []
  if (kind === 'received') {
    const n = Number(qty) || 0
    const full = round.received + n >= round.dispatched && round.dispatched > 0
    ;(Object.values(st.waiting) as R[]).forEach(w => { const a = st.actions[w.action_id]; if (a?.sample_round_id === round.id && w.state === 'open') effects.push(`Waiting item “${w.description}” will close.`) })
    ;(Object.values(st.actions) as R[]).forEach(a => { if (a.sample_round_id === round.id && a.completes_on_receipt && ['open', 'blocked'].includes(a.status)) effects.push(full ? `Action “${a.title}” will be completed (it exists to track this receipt).` : `Action “${a.title}” stays open until all dispatched pieces are received.`) })
    ;(Object.values(st.commitments) as R[]).forEach(c => { if (c.sample_round_id === round.id && !c.actual && full) effects.push(`Commitment “${c.title}” will record an actual date; any pending proposed date is cleared.`) })
    effects.push('Review, QC and brand approval are NOT triggered. Any linked issue stays open until explicitly resolved.')
  }
  return (
    <Dialog title={`Record sample movement · ${req.type} round ${round.round}`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy || !(Number(qty) > 0)} onClick={async () => {
          const r = await submit({ round_id: round.id, kind, qty: Number(qty), date, colour, size, ref, tracking: kind === 'dispatched' ? ref : undefined })
          if (r) { toast(`Recorded: ${qty} pc(s) ${kind}. ${r.message || ''}`.trim()); onClose() }
        }}>{busy ? 'Saving…' : 'Record'}</button></>}>
      <div className="col gap-12">
        <div className="small muted">{st.vendors[req.vendor_id].name} · {st.styles[req.style_id].name} · Requested {round.requested} · Made {round.made} · Dispatched {round.dispatched} · Received {round.received}{outstanding > 0 && ` · ${outstanding} in transit`}</div>
        <Field label="What happened?" required><select value={kind} onChange={e => setKind(e.target.value)}>
          <option value="made">Made (vendor reports pieces made)</option><option value="dispatched">Dispatched (shipped to us)</option><option value="received">Received (physically arrived)</option></select></Field>
        <div className="form-grid">
          <Field label="Pieces" required><input type="number" min={1} value={qty} onChange={e => setQty(e.target.value)} /></Field>
          <Field label="Date" required><input type="date" max={TODAY} value={date} onChange={e => setDate(e.target.value)} /></Field>
        </div>
        {kind === 'received' && <div className="form-grid">
          <Field label="Colour" required><input type="text" value={colour} onChange={e => setColour(e.target.value)} /></Field>
          <Field label="Size" required><input type="text" value={size} onChange={e => setSize(e.target.value)} /></Field></div>}
        {(kind === 'dispatched' || kind === 'received') && <Field label={kind === 'dispatched' ? 'Tracking / courier reference' : 'Receipt reference'}><input type="text" value={ref} onChange={e => setRef(e.target.value)} /></Field>}
        {kind === 'dispatched' && <div className="hint">A vendor saying a sample is “ready” is not dispatch. Record dispatch only when it has actually shipped.</div>}
        {effects.length > 0 && <div className="alert info"><strong>Recording this receipt will:</strong><ul style={{ margin: '4px 0 0 18px', padding: 0 }}>{effects.map((e, i) => <li key={i}>{e}</li>)}</ul></div>}
        <ErrorBox err={error} />
      </div>
    </Dialog>
  )
}

export function movementSummary(r: R) {
  return `Requested ${r.requested} · made ${r.made} · dispatched ${r.dispatched} · received ${r.received}`
}
export { fmtDate }

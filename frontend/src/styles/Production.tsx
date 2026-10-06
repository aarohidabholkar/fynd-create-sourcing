import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { TnaTable } from '../components/Tna'
import { toast, useSnap, type R } from '../store'
import { Badge, Dialog, Empty, ErrorBox, Field, useSubmit } from '../ui'
import { TODAY, fmtDate, fmtTs, personLabel } from '../util'

type Section = 'readiness' | 'tna' | 'quality' | 'dispatch'
const CLR: Record<string, [string, string, string]> = { satisfied: ['Satisfied', 'success', '✓'], pending: ['Pending', 'attention', '…'], missing: ['Missing', 'error', '✕'], failed: ['Failed', 'error', '✕'], partial: ['Partly satisfied', 'attention', '◐'], na: ['Not applicable', '', '–'] }

function Gate3Dialog({ al, onClose }: { al: R; onClose: () => void }) {
  const [f, setF] = useState({ date: TODAY, attendees: '', minutes: '', critical_points: '', decision: '', scope: `Allocation ${al.label}` })
  const { submit, busy, error } = useSubmit('sign_gate3')
  return (
    <Dialog title={`Record PP meeting and Gate 3: ${al.label}`} onClose={onClose} wide footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy || !f.attendees.trim() || !f.minutes.trim() || !f.decision.trim()} onClick={async () => { const r = await submit({ allocation_id: al.id, ...f, attendees: f.attendees.split(',').map(x => x.trim()).filter(Boolean) }); if (r) { toast('Gate 3 signed for this allocation only. Other vendors are not released.'); onClose() } }}>{busy ? 'Saving…' : 'Sign Gate 3'}</button></>}>
      <div className="col gap-12">
        <p className="hint">An uploaded file or a tick box does not replace the authorised decision. This sign-off applies only to this allocation and requires the applicable PP approval to be recorded.</p>
        <div className="form-grid"><Field label="Meeting date" required><input type="date" max={TODAY} value={f.date} onChange={e => setF({ ...f, date: e.target.value })} /></Field><Field label="Attendees (comma separated)" required><input type="text" value={f.attendees} onChange={e => setF({ ...f, attendees: e.target.value })} /></Field></div>
        <Field label="Minutes" required><textarea value={f.minutes} onChange={e => setF({ ...f, minutes: e.target.value })} /></Field>
        <Field label="Critical points"><input type="text" value={f.critical_points} onChange={e => setF({ ...f, critical_points: e.target.value })} /></Field>
        <Field label="Decision" required><input type="text" value={f.decision} onChange={e => setF({ ...f, decision: e.target.value })} placeholder="e.g. Release for bulk" /></Field>
        <Field label="Scope released" required><input type="text" value={f.scope} onChange={e => setF({ ...f, scope: e.target.value })} /></Field>
        {error?.extra.blockers ? <div className="alert warn" role="alert">{error.message}</div> : <ErrorBox err={error} />}
      </div>
    </Dialog>
  )
}

function ProgressForm({ al }: { al: R }) {
  const [f, setF] = useState({ type: 'sewn', basis: 'cumulative', qty: '', source: '', exception_reason: '' })
  const { submit, busy, error } = useSubmit('update_progress')
  const needs = error?.extra.needs_reason
  return (
    <div className="inline-form" role="group" aria-label="Record production quantity">
      <div className="form-grid"><Field label="Stage" required><select value={f.type} onChange={e => setF({ ...f, type: e.target.value })}><option value="cut">Cut</option><option value="sewn">Sewn</option><option value="washed">Washed / finished</option><option value="packed">Packed</option><option value="dispatched">Dispatched</option></select></Field>
        <Field label="Quantity is a…" required><select value={f.basis} onChange={e => setF({ ...f, basis: e.target.value })}><option value="cumulative">Cumulative total to date</option><option value="incremental">Incremental (added since last entry)</option></select></Field>
        <Field label="Pieces" required><input type="number" min={0} value={f.qty} onChange={e => setF({ ...f, qty: e.target.value })} /></Field><Field label="Source" required><input type="text" value={f.source} onChange={e => setF({ ...f, source: e.target.value })} placeholder="e.g. vendor daily report" /></Field></div>
      {needs && <Field label="Exception reason (required here)" required><input type="text" value={f.exception_reason} onChange={e => setF({ ...f, exception_reason: e.target.value })} placeholder="e.g. rework, overage, correction" /></Field>}
      <div className="hint">Other stage totals are never reset by this entry. If production started before sign-off, it is recorded truthfully and flagged; release is not granted by recording it.</div>
      <ErrorBox err={error} />
      <div><button className="btn primary small" disabled={busy || f.qty === '' || !f.source.trim()} onClick={async () => { const r = await submit({ allocation_id: al.id, ...f, qty: Number(f.qty), exception_reason: f.exception_reason || undefined }); if (r) { toast(r.flag ? `Recorded and FLAGGED: ${r.flag}` : `Recorded. New ${f.type} total: ${r.new_total}.`); setF({ ...f, qty: '', source: '', exception_reason: '' }) } }}>{busy ? 'Saving…' : 'Record quantity'}</button></div>
    </div>
  )
}

function InspectionForm({ al, onClose }: { al: R; onClose: () => void }) {
  const { state: s } = useSnap()
  const st = s!
  const failed = (Object.values(st.inspections) as R[]).filter(i => i.allocation_id === al.id && i.result === 'fail' && i.type === 'Final')
  const [f, setF] = useState({ type: 'Final', lot: al.lots[0].label.split(' (')[0], result: 'pass', qty_inspected: '', sample_size: '', plan_ref: '', major_accept: '', minor_accept: '', major: '0', minor: '0', disposition: '', recheck_of: '', rechecked: '', cleared_qty: '', follow_up_title: '', date: TODAY })
  const { submit, busy, error } = useSubmit('record_inspection')
  return (
    <div className="inline-form" role="group" aria-label="Record inspection">
      <div className="form-grid"><Field label="Inspection type" required><select value={f.type} onChange={e => setF({ ...f, type: e.target.value })}>{['Final', 'Inline', 'Mid-line', 'Cutting / panel', 'TOP'].map(t => <option key={t}>{t}</option>)}</select></Field>
        <Field label="Lot" required><select value={f.lot} onChange={e => setF({ ...f, lot: e.target.value })}>{al.lots.map((l: R) => <option key={l.id} value={l.label.split(' (')[0]}>{l.label}</option>)}</select></Field>
        <Field label="Date" required><input type="date" max={TODAY} value={f.date} onChange={e => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Lot quantity inspected" required><input type="number" value={f.qty_inspected} onChange={e => setF({ ...f, qty_inspected: e.target.value })} /></Field><Field label="Sample size (per plan)"><input type="number" value={f.sample_size} onChange={e => setF({ ...f, sample_size: e.target.value })} /></Field></div>
      <Field label="Sampling plan reference (buyer-approved)" required hint="Store the actual plan; this prototype does not assume one universal AQL value."><input type="text" value={f.plan_ref} onChange={e => setF({ ...f, plan_ref: e.target.value })} /></Field>
      <div className="form-grid"><Field label="Major accept limit"><input type="number" value={f.major_accept} onChange={e => setF({ ...f, major_accept: e.target.value })} /></Field><Field label="Minor accept limit"><input type="number" value={f.minor_accept} onChange={e => setF({ ...f, minor_accept: e.target.value })} /></Field><Field label="Major defects found"><input type="number" value={f.major} onChange={e => setF({ ...f, major: e.target.value })} /></Field><Field label="Minor defects found"><input type="number" value={f.minor} onChange={e => setF({ ...f, minor: e.target.value })} /></Field></div>
      <div className="form-grid"><Field label="Result" required><select value={f.result} onChange={e => setF({ ...f, result: e.target.value })}><option value="pass">Pass</option><option value="fail">Fail</option></select></Field><Field label="Disposition"><input type="text" value={f.disposition} onChange={e => setF({ ...f, disposition: e.target.value })} /></Field></div>
      <div className="form-grid"><Field label="This is a re-inspection of a failed inspection"><select value={f.recheck_of} onChange={e => setF({ ...f, recheck_of: e.target.value })}><option value="">No</option>{failed.map(i => <option key={i.id} value={i.id}>{i.lot} failed {fmtDate(i.date)}</option>)}</select></Field>
        {f.recheck_of && <Field label="What exactly was re-checked" required><input type="text" value={f.rechecked} onChange={e => setF({ ...f, rechecked: e.target.value })} placeholder="e.g. reworked 410 collars only" /></Field>}
        {f.result === 'pass' && f.type === 'Final' && <Field label={f.recheck_of ? 'Quantity cleared (reworked qty only)' : 'Quantity cleared (blank = whole lot)'} required={!!f.recheck_of}><input type="number" value={f.cleared_qty} onChange={e => setF({ ...f, cleared_qty: e.target.value })} /></Field>}
        {f.result === 'fail' && <Field label="Create corrective follow-up action (optional)"><input type="text" value={f.follow_up_title} onChange={e => setF({ ...f, follow_up_title: e.target.value })} placeholder="e.g. Rework and re-inspect Lot 2" /></Field>}</div>
      <ErrorBox err={error} />
      <div className="row"><button className="btn primary small" disabled={busy || !f.qty_inspected || !f.plan_ref.trim()} onClick={async () => {
        const defects = [...(Number(f.major) ? [{ cat: 'Major', name: 'Major defects', count: Number(f.major) }] : []), ...(Number(f.minor) ? [{ cat: 'Minor', name: 'Minor defects', count: Number(f.minor) }] : [])]
        const limits = f.major_accept !== '' || f.minor_accept !== '' ? { major_accept: f.major_accept === '' ? undefined : Number(f.major_accept), minor_accept: f.minor_accept === '' ? undefined : Number(f.minor_accept) } : null
        const r = await submit({ allocation_id: al.id, type: f.type, lot: f.lot, result: f.result, qty_inspected: Number(f.qty_inspected), sample_size: f.sample_size ? Number(f.sample_size) : null, plan_ref: f.plan_ref, date: f.date, defects, limits, disposition: f.disposition, recheck_of: f.recheck_of || null, rechecked: f.rechecked, cleared_qty: f.cleared_qty ? Number(f.cleared_qty) : null, follow_up_title: f.follow_up_title || null })
        if (r) { toast(f.result === 'fail' ? 'Failed inspection recorded and kept. Release is blocked for this scope.' : 'Inspection recorded. Only this scope is cleared.'); onClose() } }}>{busy ? 'Saving…' : 'Record inspection'}</button><button className="btn small" onClick={onClose}>Cancel</button></div>
    </div>
  )
}

function TestForm({ al, onClose }: { al: R; onClose: () => void }) {
  const { state: s } = useSnap()
  const st = s!
  const failed = (Object.values(st.tests) as R[]).filter(t => t.allocation_id === al.id && t.result === 'fail')
  const [f, setF] = useState({ type: 'FPT (fabric physical)', material: '', lot: '', issuer: '', date: TODAY, result: 'pass', evidence: '', retest_of: '' })
  const { submit, busy, error } = useSubmit('record_test')
  return (
    <div className="inline-form" role="group" aria-label="Record test report">
      <div className="form-grid"><Field label="Test type" required><select value={f.type} onChange={e => setF({ ...f, type: e.target.value })}>{['FPT (fabric physical)', 'GPT (garment physical)', 'Colour fastness', 'Other required test'].map(t => <option key={t}>{t}</option>)}</select></Field>
        <Field label="Material / garment" required><input type="text" value={f.material} onChange={e => setF({ ...f, material: e.target.value })} /></Field><Field label="Lot" required><input type="text" value={f.lot} onChange={e => setF({ ...f, lot: e.target.value })} /></Field><Field label="Issuer"><input type="text" value={f.issuer} onChange={e => setF({ ...f, issuer: e.target.value })} /></Field>
        <Field label="Report date" required><input type="date" max={TODAY} value={f.date} onChange={e => setF({ ...f, date: e.target.value })} /></Field><Field label="Result" required><select value={f.result} onChange={e => setF({ ...f, result: e.target.value })}><option value="pass">Pass</option><option value="fail">Fail</option><option value="pending">Pending</option></select></Field></div>
      <div className="form-grid"><Field label="Report / evidence reference" required={f.result !== 'pending'} hint="An uploaded report is not inherently a pass."><input type="text" value={f.evidence} onChange={e => setF({ ...f, evidence: e.target.value })} /></Field>
        <Field label="Retest of an earlier failure"><select value={f.retest_of} onChange={e => setF({ ...f, retest_of: e.target.value })}><option value="">No</option>{failed.map(t => <option key={t.id} value={t.id}>{t.type} · {t.lot} failed {fmtDate(t.date)}</option>)}</select></Field></div>
      <ErrorBox err={error} />
      <div className="row"><button className="btn primary small" disabled={busy || !f.material.trim() || !f.lot.trim()} onClick={async () => { if (await submit({ allocation_id: al.id, ...f, retest_of: f.retest_of || null })) { toast('Test recorded; earlier failures are retained.'); onClose() } }}>Record test</button><button className="btn small" onClick={onClose}>Cancel</button></div>
    </div>
  )
}

function ShipmentForm({ al, onClose }: { al: R; onClose: () => void }) {
  const { state: s } = useSnap()
  const st = s!
  const ins = (Object.values(st.inspections) as R[]).filter(i => i.allocation_id === al.id && i.type === 'Final' && i.result === 'pass')
  const shipped = (lot: string) => (Object.values(st.shipments) as R[]).flatMap(h => h.lines).filter((l: R) => l.allocation_id === al.id && l.lot === lot).reduce((t: number, l: R) => t + l.qty, 0)
  const cleared = (lot: string) => ins.filter(i => i.lot === lot).reduce((t, i) => t + (i.cleared_qty || 0), 0)
  const lots = al.lots.map((l: R) => l.label.split(' (')[0]) as string[]
  const [qty, setQty] = useState<Record<string, string>>({})
  const [f, setF] = useState({ carrier: '', lr_ref: '', destination: st.orders[al.order_id].destination || '', docs: 'Invoice, Packing list' })
  const { submit, busy, error } = useSubmit('release_shipment')
  const colour = (st.orders[al.order_id].lines.find((l: R) => al.lines[0].line_id === l.id) || {}).colour
  return (
    <div className="inline-form" role="group" aria-label="Release shipment">
      <p className="small">Only quantity cleared by final inspection (and not already shipped) can be released.</p>
      {lots.map((l: string) => <Field key={l} label={`${l}: ${cleared(l) - shipped(l)} pcs available to release (cleared ${cleared(l)}, shipped ${shipped(l)})`}><input type="number" min={0} value={qty[l] || ''} onChange={e => setQty({ ...qty, [l]: e.target.value })} style={{ maxWidth: 160 }} /></Field>)}
      <div className="form-grid"><Field label="Carrier" required><input type="text" value={f.carrier} onChange={e => setF({ ...f, carrier: e.target.value })} /></Field><Field label="LR / tracking reference"><input type="text" value={f.lr_ref} onChange={e => setF({ ...f, lr_ref: e.target.value })} /></Field><Field label="Destination (actual agreed buyer / warehouse)" required><input type="text" value={f.destination} onChange={e => setF({ ...f, destination: e.target.value })} /></Field></div>
      <ErrorBox err={error} />
      <div className="row"><button className="btn primary small" disabled={busy || !f.carrier.trim() || !f.destination.trim() || !Object.values(qty).some(v => Number(v) > 0)} onClick={async () => {
        const lines = Object.entries(qty).filter(([, v]) => Number(v) > 0).map(([lot, v]) => ({ allocation_id: al.id, lot, colour, qty: Number(v) }))
        if (await submit({ order_id: al.order_id, lines, carrier: f.carrier, lr_ref: f.lr_ref, destination: f.destination, documents: f.docs.split(',').map(x => x.trim()) })) { toast('Shipment released. Release is not dispatch, delivery or receipt.'); onClose() } }}>Release shipment</button><button className="btn small" onClick={onClose}>Cancel</button></div>
    </div>
  )
}

function ShipmentCard({ sh }: { sh: R }) {
  const { state: s } = useSnap()
  const st = s!
  const order = ['released', 'dispatched', 'in_transit', 'delivered', 'grn']
  const next = order[order.indexOf(sh.state) + 1]
  const [open, setOpen] = useState(false); const [date, setDate] = useState(TODAY); const [rq, setRq] = useState('')
  const { submit, busy, error } = useSubmit('update_shipment')
  const label: Record<string, string> = { dispatched: 'Dispatched', in_transit: 'In transit', delivered: 'Delivered', grn: 'Warehouse receipt (GRN)' }
  const shipped = sh.lines.reduce((t: number, l: R) => t + l.qty, 0)
  return (
    <div className="panel pad mb-8">
      <div className="row wrap"><strong className="grow">{sh.label}</strong><Badge tone="info">{sh.state.replace('_', ' ')}</Badge></div>
      <div className="small">{sh.lines.map((l: R) => `${l.qty} pcs ${l.colour} · ${l.lot}`).join('; ')} · {sh.carrier} {sh.lr_ref} → {sh.destination}</div>
      <div className="small muted">Released {fmtDate(sh.dates.released)} (by {personLabel(st, sh.released_by, false)}; {sh.release_basis}) · Dispatched {sh.dates.dispatched ? fmtDate(sh.dates.dispatched) : 'not yet'} · Delivered {sh.dates.delivered ? fmtDate(sh.dates.delivered) : 'not yet'} · GRN {sh.dates.grn ? fmtDate(sh.dates.grn) : 'not yet'}</div>
      {sh.received_qty != null && <div className="small mt-8">Received {sh.received_qty} of {shipped} shipped · variance <strong>{sh.variance}</strong>{sh.variance !== 0 && ' (needs resolution; remains visible)'}</div>}
      {next && <div className="mt-8">{!open ? <button className="btn small" onClick={() => setOpen(true)}>Record: {label[next]}</button> : <div className="inline-form"><div className="form-grid"><Field label={`${label[next]} date`} required><input type="date" max={TODAY} value={date} onChange={e => setDate(e.target.value)} /></Field>{next === 'grn' && <Field label="Quantity received (from GRN)" required><input type="number" value={rq} onChange={e => setRq(e.target.value)} /></Field>}</div><ErrorBox err={error} />
        <div className="row"><button className="btn primary small" disabled={busy || (next === 'grn' && rq === '')} onClick={async () => { if (await submit({ shipment_id: sh.id, state: next, date, received_qty: rq === '' ? undefined : Number(rq) })) { toast(`${label[next]} recorded.`); setOpen(false) } }}>Record</button><button className="btn small" onClick={() => setOpen(false)}>Cancel</button></div></div>}</div>}
    </div>
  )
}

export function ProductionTab({ styleId }: { styleId: string }) {
  const { state: s } = useSnap()
  const st = s!
  const [q, setQ] = useSearchParams()
  const [section, setSection] = useState<Section>('readiness')
  const [form, setForm] = useState<null | 'gate' | 'insp' | 'test' | 'ship'>(null)
  const allocs = (Object.values(st.allocations) as R[]).filter(a => a.style_id === styleId)
  const sel = (q.get('alloc') && st.allocations[q.get('alloc')!]) || allocs[0]
  const me = st.users[st.me]
  const caps = me.caps as string[]
  if (allocs.length === 0) return <div className="col gap-16"><h2>Production</h2><Empty title="Nothing is in production for this style">Production starts from an allocation on a confirmed order. A style can still have legitimate costing and sampling work.</Empty></div>
  const d = st.derived.allocations[sel.id]
  const order = st.orders[sel.order_id]
  const insp = (Object.values(st.inspections) as R[]).filter(i => i.allocation_id === sel.id).sort((a, b) => b.date.localeCompare(a.date))
  const tests = (Object.values(st.tests) as R[]).filter(t => t.allocation_id === sel.id).sort((a, b) => (b.date || '9').localeCompare(a.date || '9'))
  const ships = (Object.values(st.shipments) as R[]).filter(h => h.lines.some((l: R) => l.allocation_id === sel.id))
  const ppReq = (Object.values(st.sample_requests) as R[]).find(r => r.allocation_id === sel.id && r.type === 'PP')
  const ppRound = ppReq ? (Object.values(st.sample_rounds) as R[]).filter(r => r.request_id === ppReq.id).sort((a, b) => b.round - a.round)[0] : null
  const pick = (id: string) => { const n = new URLSearchParams(q); n.set('alloc', id); setQ(n); setForm(null) }
  const totals = d.totals
  const link = (key: string) => {
    if (key === 'pp_approval' && ppRound) return <Link to={`/styles/${styleId}/sampling?round=${ppRound.id}`}>Open PP round</Link>
    if (['lab_reports', 'bulk_fabric_test'].includes(key)) return <button className="link" onClick={() => setSection('quality')}>Open tests</button>
    if (['final', 'inline', 'midline'].includes(key)) return <button className="link" onClick={() => setSection('quality')}>Open inspections</button>
    if (key === 'pp_meeting') return <button className="link" onClick={() => setSection('readiness')}>PP meeting</button>
    if (key === 'po_recon') return <Link to={`/styles/${styleId}/order?order=${order.id}`}>Open order</Link>
    return null
  }
  return (
    <div className="col gap-16">
      <h2>Production</h2>
      <div className="grid-2" style={{ gridTemplateColumns: `repeat(${Math.min(allocs.length, 3)}, minmax(0, 1fr))` }} role="group" aria-label="Allocations">
        {allocs.map(a => { const ds = st.derived.allocations[a.id]; return (
          <button key={a.id} className={`panel pad item-btn ${sel.id === a.id ? 'sel' : ''}`} aria-pressed={sel.id === a.id} onClick={() => pick(a.id)} style={{ padding: 14 }}>
            <div className="row wrap"><strong className="grow">{a.label}</strong><Badge tone={a.gate3.state === 'signed' ? 'success' : 'attention'}>{a.gate3.state === 'signed' ? 'Released' : 'Not released'}</Badge></div>
            <div className="small muted">{order.ref} · {ds.qty} pcs · {ds.position}</div>
            <div className="small mt-8">Cut {ds.totals.cut ?? 0} · Sewn {ds.totals.sewn ?? 0} · Packed {ds.totals.packed ?? 0} · Dispatched {ds.totals.dispatched ?? 0}</div>
            {a.unauthorised_start && <div className="mt-8"><Badge tone="error">Unauthorised start flagged</Badge></div>}</button>) })}
      </div>
      <p className="hint">Each allocation has its own readiness, schedule, production and inspection scope. One vendor’s approval or blockage never releases or blocks another.</p>
      <div className="row" role="tablist" aria-label={`Production sections for ${sel.label}`}>{([['readiness', 'Readiness'], ['tna', 'TNA & progress'], ['quality', 'Quality checks'], ['dispatch', 'Dispatch & receipt']] as [Section, string][]).map(([k, l]) => <button key={k} role="tab" className="tab" aria-selected={section === k} onClick={() => { setSection(k); setForm(null) }}>{l}</button>)}</div>
      <div className="small muted">Selected: <strong>{sel.label}</strong> · Order {order.ref} · Lots: {sel.lots.map((l: R) => `${l.label} ${l.qty} pcs`).join('; ')}</div>

      {section === 'readiness' && (
        <div className="col gap-16">
          <section className="panel pad" aria-label="Gate 3">
            <div className="row wrap"><h3 className="grow">PP meeting and Gate 3: production readiness</h3><Badge tone={sel.gate3.state === 'signed' ? 'success' : 'attention'}>{sel.gate3.state === 'signed' ? 'Signed' : 'Pending'}</Badge></div>
            {sel.gate3.state === 'signed' ? <dl className="kv mt-8"><dt>Scope released</dt><dd>{sel.gate3.scope}</dd><dt>Signed by</dt><dd>{personLabel(st, sel.gate3.by)} · {fmtTs(sel.gate3.at)}</dd><dt>Meeting</dt><dd>{fmtDate(sel.pp_meeting.date, true)} · {sel.pp_meeting.attendees.join(', ')}</dd><dt>Decision</dt><dd>{sel.pp_meeting.decision}</dd><dt>Critical points</dt><dd>{sel.pp_meeting.critical_points || 'None recorded'}</dd><dt>Minutes</dt><dd>{sel.pp_meeting.minutes}</dd></dl>
              : <><p className="mt-8">Bulk production is not authorised for this allocation yet. {ppRound ? `Latest PP sample: round ${ppRound.round}, ${ppRound.internal.state.replace('_', ' ')}, brand ${ppRound.external.state.replace(/_/g, ' ')}.` : 'No PP sample recorded.'}</p>
                {sel.unauthorised_start && <div className="alert error mt-8"><strong>Unauthorised start flagged.</strong> {sel.progress.find((p: R) => p.flag)?.flag} The truthful quantity is on record; this does not release the allocation.</div>}
                {caps.includes('gate_signoff') && <button className="btn primary mt-8" onClick={() => setForm('gate')}>Record PP meeting and sign Gate 3…</button>}</>}
            {form === 'gate' && <Gate3Dialog al={sel} onClose={() => setForm(null)} />}
          </section>
          <section className="panel" aria-label="Final QA clearance"><div className="panel-head"><h3 className="grow">Final QA clearance: linked records</h3></div><div className="panel-body"><p className="hint mb-8">Existing records are reused: nothing here needs uploading again. A stale green state is never kept if scope or specification changes.</p>
            <table className="t"><thead><tr><th>#</th><th>Requirement</th><th>State</th><th /></tr></thead><tbody>{d.clearance.map((c: R, i: number) => { const [t, tone, ic] = CLR[c.state] || CLR.pending; return <tr key={c.key}><td>{i + 1}</td><td>{c.label}</td><td><Badge tone={tone}>{ic} {t}</Badge></td><td>{link(c.key)}</td></tr> })}</tbody></table>
            <p className="small muted mt-8">Booked, received, tested and approved are separate states. Detailed fabric/trim booking and partial receipt tracking are not modelled in this prototype beyond the “Fabric in-house” milestone.</p></div></section>
        </div>)}

      {section === 'tna' && (
        <div className="col gap-16">
          <section className="panel" aria-label="TNA"><div className="panel-head"><h3>Time and action plan</h3></div><div className="panel-body"><TnaTable allocationId={sel.id} canEdit /><p className="hint mt-8">Plans support parallel activity and dependencies. A back-calculated plan is only a proposal until agreed; asking for an update never moves a milestone.</p></div></section>
          <section className="panel pad" aria-label="Production progress"><h3>Actual production progress</h3>
            <div className="row wrap mt-8">{(['cut', 'sewn', 'washed', 'packed', 'dispatched'] as const).map(k => <div key={k} className="panel pad" style={{ minWidth: 110 }}><div className="small muted" style={{ textTransform: 'capitalize' }}>{k}</div><div className="strong" style={{ fontSize: 20 }}>{totals[k] ?? '–'}</div></div>)}<div className="panel pad" style={{ minWidth: 110 }}><div className="small muted">Authorised</div><div className="strong" style={{ fontSize: 20 }}>{d.qty}</div></div></div>
            <p className="hint mt-8">Totals are the latest cumulative entries plus any incremental entries; they are never summed as separate output.</p>
            {caps.includes('edit') && <ProgressForm al={sel} />}
            <div className="table-wrap mt-8"><table className="t"><thead><tr><th>When</th><th>Stage</th><th>Entry</th><th>Source</th><th>Notes</th></tr></thead><tbody>{[...sel.progress].reverse().map((p: R) => <tr key={p.id}><td className="small">{fmtTs(p.ts)}</td><td style={{ textTransform: 'capitalize' }}>{p.type}</td><td>{p.qty} <span className="muted small">{p.basis}</span></td><td className="small">{p.source}</td><td className="small">{p.flag && <Badge tone="error">Flagged</Badge>} {p.flag} {p.reason && `Reason: ${p.reason}. `}{p.previous_total != null && `Previous total ${p.previous_total}.`}</td></tr>)}{sel.progress.length === 0 && <tr><td colSpan={5} className="muted">No production quantities recorded yet.</td></tr>}</tbody></table></div></section>
        </div>)}

      {section === 'quality' && (
        <div className="col gap-16">
          <section className="panel" aria-label="Inspections"><div className="panel-head"><h3 className="grow">Production inspections</h3>{caps.includes('technical_review') && <button className="btn small" onClick={() => setForm(form === 'insp' ? null : 'insp')}>Record inspection</button>}</div><div className="panel-body">
            {form === 'insp' && <InspectionForm al={sel} onClose={() => setForm(null)} />}
            {insp.length === 0 ? <div className="muted">No inspections recorded for this allocation.</div> : <ul className="list">{insp.map(i => (
              <li key={i.id} style={{ padding: '10px 0' }}><div className="row wrap"><strong>{i.type} inspection · {i.lot}</strong><Badge tone={i.result === 'pass' ? 'success' : 'error'}>{i.result === 'pass' ? '✓ Pass' : '✕ Fail'}</Badge><span className="small muted">{fmtDate(i.date)} · {personLabel(st, i.inspector)}</span></div>
                <div className="small">{i.qty_inspected} pcs{i.sample_size ? ` (sample ${i.sample_size})` : ''} · Plan: {i.plan_ref}{i.limits && ` · Limits: major ≤ ${i.limits.major_accept}, minor ≤ ${i.limits.minor_accept}`}</div>
                <div className="small">Defects: {i.defects.length ? i.defects.map((x: R) => `${x.count} ${x.cat.toLowerCase()} (${x.name})`).join(', ') : 'none recorded'} · Disposition: {i.disposition}</div>
                {i.recheck_of && <div className="small muted">Re-inspection of {st.inspections[i.recheck_of]?.lot} ({fmtDate(st.inspections[i.recheck_of]?.date)} failure retained) · Re-checked: {i.rechecked}</div>}
                {i.cleared_qty != null && <div className="small"><strong>Cleared quantity: {i.cleared_qty} pcs</strong> · other lots and quantities are unaffected</div>}
                {i.follow_up && st.actions[i.follow_up] && <div className="small">Follow-up: <Link to={`/my-work?open=${i.follow_up}`}>{st.actions[i.follow_up].title}</Link></div>}</li>))}</ul>}
            <p className="hint mt-8">Factory technical audits are separate and live in <Link to={`/vendors/${sel.vendor_id}/audits`}>Vendors → Audits</Link>. A factory’s inspection-readiness checkpoint is not an inspection result for this order.</p></div></section>
          <section className="panel" aria-label="Tests"><div className="panel-head"><h3 className="grow">Fabric, trim and garment tests</h3>{caps.includes('technical_review') && <button className="btn small" onClick={() => setForm(form === 'test' ? null : 'test')}>Record test</button>}</div><div className="panel-body">
            {form === 'test' && <TestForm al={sel} onClose={() => setForm(null)} />}
            <table className="t"><thead><tr><th>Test</th><th>Material · lot</th><th>Issuer · date</th><th>Result</th><th>Evidence</th></tr></thead><tbody>{tests.map(t => <tr key={t.id}><td>{t.type}{t.retest_of && <div className="small muted">Retest of earlier failure (retained)</div>}</td><td className="small">{t.material} · {t.lot}</td><td className="small">{t.issuer} {t.date ? fmtDate(t.date) : 'Date not recorded'}</td><td><Badge tone={t.result === 'pass' ? 'success' : t.result === 'fail' ? 'error' : 'attention'}>{t.result === 'pass' ? '✓ Pass' : t.result === 'fail' ? '✕ Fail' : 'Pending'}</Badge></td><td className="small">{t.evidence || 'Not recorded'}</td></tr>)}{tests.length === 0 && <tr><td colSpan={5} className="muted">No tests recorded. Development test results do not stand in for required bulk-lot tests.</td></tr>}</tbody></table></div></section>
        </div>)}

      {section === 'dispatch' && (
        <section className="panel pad" aria-label="Dispatch and receipt">
          <div className="row"><h3 className="grow">Shipments</h3>{caps.includes('gate_signoff') && <button className="btn small" onClick={() => setForm(form === 'ship' ? null : 'ship')}>Release shipment</button>}</div>
          {form === 'ship' && <ShipmentForm al={sel} onClose={() => setForm(null)} />}
          <div className="mt-8">{ships.length === 0 ? <div className="muted">No shipment has been released for this allocation. Cleared so far: {d.cleared_qty} of {d.qty} pcs.</div> : ships.map(h => <ShipmentCard key={h.id} sh={h} />)}</div>
          <p className="hint mt-8">Release, dispatch, in-transit, delivery and warehouse receipt are separate recorded steps. The order stays open for remaining demand: shipped {d.shipped_qty} of {d.qty} pcs for this allocation. Delivery is not payment.</p>
        </section>)}
    </div>
  )
}

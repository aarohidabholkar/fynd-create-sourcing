import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast, useSnap, type R } from '../store'
import { Badge, Disclosure, ErrorBox, Field, SourceLink, useSubmit } from '../ui'
import { fmtDate, fmtTs, personLabel, sum } from '../util'
import { TnaTable } from './Tna'

const SIZES = ['S', 'M', 'L', 'XL']

export function QtyMatrix({ order }: { order: R }) {
  const { state: s } = useSnap()
  const st = s!
  const allocs = (Object.values(st.allocations) as R[]).filter(a => a.order_id === order.id)
  const allocated = (lineId: string, size: string) => allocs.reduce((t, a) => t + a.lines.filter((l: R) => l.line_id === lineId).reduce((x: number, l: R) => x + (l.qty[size] || 0), 0), 0)
  return (
    <div className="table-wrap">
      <table className="matrix" aria-label={`Quantity by colour and size, ${order.ref}`}>
        <thead><tr><th>Colour / style</th>{SIZES.map(z => <th key={z}>{z}</th>)}<th>Total</th><th>Allocated</th><th>Unallocated</th><th>Price</th></tr></thead>
        <tbody>
          {order.lines.map((l: R) => { const tot = sum(l.qty); const al = SIZES.reduce((t, z) => t + allocated(l.id, z), 0); return (
            <tr key={l.id}><td><Link to={`/styles/${l.style_id}`}>{st.styles[l.style_id].name}</Link> · {l.colour}<div className="small muted">Spec v{l.spec_version}{l.ean ? ` · EAN ${l.ean}` : ' · EAN not recorded'}</div></td>
              {SIZES.map(z => <td key={z}>{l.qty[z] ?? 0}</td>)}<td><strong>{tot}</strong></td><td>{al}</td><td className={tot - al > 0 ? 'bad' : ''}>{tot - al}</td>
              <td>{order.restricted ? <span className="muted">Restricted</span> : l.price ? `${order.currency} ${l.price}` : <span className="muted">Not recorded</span>}</td></tr>) })}
        </tbody>
      </table>
    </div>
  )
}

function Dates({ label, d }: { label: string; d: R }) {
  return <tr><td>{label}</td><td>{fmtDate(d.original)}</td><td>{d.proposed ? <strong>{fmtDate(d.proposed)}</strong> : '–'}</td><td>{d.agreed ? fmtDate(d.agreed) : 'Not agreed'}</td><td>{d.actual ? fmtDate(d.actual) : '–'}</td></tr>
}

function AllocateForm({ order, onClose }: { order: R; onClose: () => void }) {
  const { state: s } = useSnap()
  const st = s!
  const [line, setLine] = useState(order.lines[0].id)
  const [vendor, setVendor] = useState('')
  const [qty, setQty] = useState<Record<string, string>>({})
  const { submit, busy, error } = useSubmit('allocate')
  return (
    <div className="inline-form">
      <div className="form-grid">
        <Field label="Order line" required><select value={line} onChange={e => setLine(e.target.value)}>{order.lines.map((l: R) => <option key={l.id} value={l.id}>{st.styles[l.style_id].name} · {l.colour}</option>)}</select></Field>
        <Field label="Production vendor" required hint="Sampling or quote vendors are not automatically the production vendor."><select value={vendor} onChange={e => setVendor(e.target.value)}><option value="">Choose…</option>{(Object.values(st.vendors) as R[]).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></Field>
      </div>
      <div className="row wrap">{SIZES.map(z => <Field key={z} label={z}><input type="number" min={0} style={{ width: 80 }} value={qty[z] || ''} onChange={e => setQty({ ...qty, [z]: e.target.value })} /></Field>)}</div>
      <ErrorBox err={error} />
      <div className="row"><button className="btn primary small" disabled={busy || !vendor} onClick={async () => {
        const q: Record<string, number> = {}; SIZES.forEach(z => { if (qty[z]) q[z] = Number(qty[z]) })
        if (await submit({ order_id: order.id, line_id: line, vendor_id: vendor, qty: q })) { toast('Allocation recorded.'); onClose() }
      }}>{busy ? 'Saving…' : 'Allocate'}</button><button className="btn small" onClick={onClose}>Cancel</button></div>
    </div>
  )
}

function AmendForm({ order, onClose }: { order: R; onClose: () => void }) {
  const [line, setLine] = useState(order.lines[0].id); const [size, setSize] = useState('M'); const [q, setQ] = useState(''); const [why, setWhy] = useState('')
  const { submit, busy, error } = useSubmit('propose_amendment')
  return (
    <div className="inline-form">
      <div className="form-grid">
        <Field label="Line" required><select value={line} onChange={e => setLine(e.target.value)}>{order.lines.map((l: R) => <option key={l.id} value={l.id}>{l.colour}</option>)}</select></Field>
        <Field label="Size" required><select value={size} onChange={e => setSize(e.target.value)}>{SIZES.map(z => <option key={z}>{z}</option>)}</select></Field>
        <Field label="New quantity" required><input type="number" min={0} value={q} onChange={e => setQ(e.target.value)} /></Field>
      </div>
      <Field label="Reason" required><input type="text" value={why} onChange={e => setWhy(e.target.value)} /></Field>
      <div className="hint">A proposal does not change the confirmed quantity. Impact on allocations is listed for review.</div>
      <ErrorBox err={error} />
      <div className="row"><button className="btn primary small" disabled={busy || q === '' || !why.trim()} onClick={async () => { if (await submit({ order_id: order.id, line_id: line, size, new_qty: Number(q), reason: why })) { toast('Amendment proposed; the order is unchanged until it is decided.'); onClose() } }}>Propose amendment</button><button className="btn small" onClick={onClose}>Cancel</button></div>
    </div>
  )
}

function AmendmentList({ order, canDecide }: { order: R; canDecide: boolean }) {
  const { state: s } = useSnap()
  const st = s!
  const dec = useSubmit('decide_amendment')
  const [r, setR] = useState('')
  return (
    <ul className="list">
      {order.amendments.map((a: R) => (
        <li key={a.id} style={{ padding: '8px 0' }}>
          <div className="row wrap"><strong>{a.proposal}</strong><Badge tone={a.state === 'accepted' ? 'success' : a.state === 'rejected' ? 'error' : 'attention'}>{a.state === 'proposed' ? 'Proposed (not applied)' : a.state}</Badge></div>
          <div className="small muted">{fmtTs(a.ts)} · {personLabel(st, a.actor_id)} · Reason: {a.reason}{a.decision_reason && <> · Decision: {a.decision_reason}</>}{a.impact?.length > 0 && <> · Impact to review: {a.impact.join(', ')}</>}</div>
          {a.state === 'proposed' && canDecide && <div className="row mt-8"><input type="text" aria-label="Decision reason" placeholder="Decision reason" value={r} onChange={e => setR(e.target.value)} style={{ maxWidth: 260 }} />
            <button className="btn small" disabled={dec.busy || !r.trim()} onClick={() => dec.submit({ order_id: order.id, amendment_id: a.id, decision: 'accept', reason: r })}>Accept</button>
            <button className="btn small" disabled={dec.busy || !r.trim()} onClick={() => dec.submit({ order_id: order.id, amendment_id: a.id, decision: 'reject', reason: r })}>Reject</button></div>}
          {a.state === 'proposed' && <ErrorBox err={dec.error} />}
        </li>))}
    </ul>
  )
}

/** The canonical order record, used by Brands → Orders and Styles → Order. */
export function OrderView({ order, canEdit, styleScope }: { order: R; canEdit?: boolean; styleScope?: string }) {
  const { state: s } = useSnap()
  const st = s!
  const me = st.users[st.me]
  const [allocating, setAllocating] = useState(false)
  const [amending, setAmending] = useState(false)
  const allocs = (Object.values(st.allocations) as R[]).filter(a => a.order_id === order.id)
  const ships = (Object.values(st.shipments) as R[]).filter(h => h.order_id === order.id)
  const sm = st.derived.orders[order.id]
  const total = sm.total
  const confirmed = order.state === 'confirmed'
  const canCommercial = me.caps.includes('commercial')
  return (
    <div className="col gap-16">
      <div className="row wrap">
        <h2 className="grow">{order.ref}</h2>
        {confirmed ? <Badge tone="success">Confirmed order</Badge> : <Badge tone="attention">Draft: not confirmed demand</Badge>}
        <Badge>{total} pcs</Badge>
      </div>
      {order.verbal_note && <div className="alert warn">{order.verbal_note}</div>}
      <dl className="kv"><dt>Buyer</dt><dd>{order.buyer}</dd><dt>Destination</dt><dd>{order.destination || 'Not recorded'}</dd><dt>Payment terms</dt><dd>{order.restricted ? 'Restricted' : order.payment_terms || 'Not recorded'}</dd>
        <dt>PO evidence</dt><dd>{order.po_evidence || <span className="muted">None: a draft or verbal order cannot be confirmed without it</span>}</dd>
        <dt>Allocation</dt><dd>{sm.allocated} of {total} pcs allocated · {sm.unallocated} unallocated</dd></dl>

      <div><h3 className="mb-8">What was ordered</h3><QtyMatrix order={order} />
        <div className="small muted mt-8">Lines reference approved costing: {order.lines.map((l: R) => l.quote_id ? `${l.colour}: ${st.vendors[st.quotes[l.quote_id].vendor_id].name} quote v${st.quotes[l.quote_id].version}` : `${l.colour}: not linked`).join(' · ')}</div></div>

      <div><h3 className="mb-8">Dates and commitments</h3>
        <table className="t" aria-label="Order dates"><thead><tr><th>Date</th><th>Original</th><th>Proposed</th><th>Agreed</th><th>Actual</th></tr></thead>
          <tbody><Dates label="Ex-factory" d={order.dates.ex_factory} /><Dates label="Required in DC" d={order.dates.required_in_dc} /></tbody></table></div>

      <div>
        <div className="row"><h3 className="grow">Vendor allocation and production</h3>{canEdit && confirmed && <button className="btn small" onClick={() => setAllocating(!allocating)}>Allocate</button>}</div>
        {allocating && <AllocateForm order={order} onClose={() => setAllocating(false)} />}
        {allocs.length === 0 && <div className="muted mt-8">{confirmed ? 'Nothing is allocated yet.' : 'Allocation starts once the order is confirmed.'}</div>}
        {allocs.map(a => { const d = st.derived.allocations[a.id]; return (
          <div key={a.id} className="panel pad mt-8">
            <div className="row wrap"><strong className="grow">{a.label}</strong><Badge tone={a.gate3.state === 'signed' ? 'success' : 'attention'}>{a.gate3.state === 'signed' ? 'Released for bulk' : 'Not released'}</Badge>{a.unauthorised_start && <Badge tone="error">Unauthorised start flagged</Badge>}</div>
            <div className="small muted">{d.qty} pcs · {d.position} · Cut {d.totals.cut ?? 0} · Sewn {d.totals.sewn ?? 0} · Packed {d.totals.packed ?? 0} · Dispatched {d.totals.dispatched ?? 0}</div>
            <div className="mt-8"><Disclosure summary="Time and action calendar (TNA)"><TnaTable allocationId={a.id} canEdit={canEdit} /></Disclosure></div>
            <div className="mt-8"><Link to={`/styles/${a.style_id}/production?alloc=${a.id}`}>Open production for this allocation</Link>{a.vendor_id && <> · <Link to={`/vendors/${a.vendor_id}/styles`}>Vendor workspace</Link></>}</div>
          </div>) })}
      </div>

      <div><div className="row"><h3 className="grow">Amendments</h3>{canEdit && confirmed && <button className="btn small" onClick={() => setAmending(!amending)}>Propose amendment</button>}</div>
        {amending && <AmendForm order={order} onClose={() => setAmending(false)} />}
        {order.amendments.length === 0 ? <div className="muted">No amendments. A confirmed quantity changes only through an authorised amendment.</div> : <AmendmentList order={order} canDecide={canCommercial} />}</div>

      <div><h3 className="mb-8">Shipments and delivery</h3>
        {ships.length === 0 ? <div className="muted">No shipment released yet. Remaining demand: {total} pcs.</div> : ships.map(h => {
          const shipped = h.lines.reduce((t: number, l: R) => t + l.qty, 0)
          return (<div key={h.id} className="panel pad mb-8">
            <div className="row wrap"><strong className="grow">{h.label}</strong><Badge tone="info">{h.state.replace('_', ' ')}</Badge></div>
            <div className="small">{h.lines.map((l: R) => `${l.qty} pcs ${l.colour} (${l.lot}, ${st.allocations[l.allocation_id].label.split(' · ')[0]})`).join('; ')} · {h.carrier} {h.lr_ref} · to {h.destination}</div>
            <div className="small muted">Released {fmtDate(h.dates.released)} · Dispatched {fmtDate(h.dates.dispatched)} · Delivered {h.dates.delivered ? fmtDate(h.dates.delivered) : 'not yet'} · GRN {h.dates.grn ? fmtDate(h.dates.grn) : 'not yet'}{h.received_qty != null && ` · received ${h.received_qty}, variance ${h.variance}`}</div>
            <div className="small muted">{shipped} of {total} pcs shipped so far. Dispatch is not delivery, receipt or payment.</div>
          </div>) })}</div>
    </div>
  )
}

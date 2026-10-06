import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { OrderView } from '../components/OrderView'
import { toast, useSnap, type R } from '../store'
import { Badge, Dialog, Empty, ErrorBox, Field, useSubmit } from '../ui'
import { fmtDate } from '../util'

function ConfirmDialog({ order, onClose }: { order: R; onClose: () => void }) {
  const { state: s } = useSnap()
  const st = s!
  const [f, setF] = useState({ po_evidence: order.po_evidence || '', destination: order.destination || '', required_in_dc: order.dates.required_in_dc.agreed || '', ref: order.ref.startsWith('Draft') ? '' : order.ref })
  const [lines, setLines] = useState<Record<string, { price: string; ean: string; quote: string }>>(Object.fromEntries(order.lines.map((l: R) => [l.id, { price: l.price ? String(l.price) : '', ean: l.ean || '', quote: l.quote_id || '' }])))
  const { submit, busy, error } = useSubmit('confirm_order')
  const approved = (Object.values(st.quotes) as R[]).filter(q => q.state === 'approved')
  return (
    <Dialog title={`Confirm order: ${order.ref}`} onClose={onClose} wide footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy} onClick={async () => {
      const prices: R = {}, eans: R = {}, quotes: R = {}
      Object.entries(lines).forEach(([k, v]) => { if (v.price) prices[k] = Number(v.price); if (v.ean) eans[k] = v.ean; if (v.quote) quotes[k] = v.quote })
      if (await submit({ order_id: order.id, ...f, prices, eans, quotes })) { toast('Order confirmed. It now counts as confirmed demand.'); onClose() } }}>{busy ? 'Confirming…' : 'Confirm order'}</button></>}>
      <div className="col gap-12">
        <p className="hint">A selection, verbal intention or draft PO is not a confirmed order. Confirmation needs PO / acceptance evidence and the required fields below.</p>
        <div className="form-grid"><Field label="PO / acceptance evidence" required><input type="text" value={f.po_evidence} onChange={e => setF({ ...f, po_evidence: e.target.value })} placeholder="e.g. PO PDF reference" /></Field>
          <Field label="PO reference"><input type="text" value={f.ref} onChange={e => setF({ ...f, ref: e.target.value })} /></Field>
          <Field label="Delivery destination" required><input type="text" value={f.destination} onChange={e => setF({ ...f, destination: e.target.value })} /></Field>
          <Field label="Agreed required in-DC date" required><input type="date" value={f.required_in_dc} onChange={e => setF({ ...f, required_in_dc: e.target.value })} /></Field></div>
        {order.lines.map((l: R) => <div key={l.id} className="panel pad"><strong>{st.styles[l.style_id].name} · {l.colour}</strong>
          <div className="form-grid mt-8"><Field label="Agreed price" required><input type="number" value={lines[l.id].price} onChange={e => setLines({ ...lines, [l.id]: { ...lines[l.id], price: e.target.value } })} /></Field>
            <Field label="EAN (SKU level)" required><input type="text" value={lines[l.id].ean} onChange={e => setLines({ ...lines, [l.id]: { ...lines[l.id], ean: e.target.value } })} /></Field>
            <Field label="Approved costing used" required><select value={lines[l.id].quote} onChange={e => setLines({ ...lines, [l.id]: { ...lines[l.id], quote: e.target.value } })}><option value="">Choose…</option>{approved.filter(q => q.style_id === l.style_id).map(q => <option key={q.id} value={q.id}>{st.vendors[q.vendor_id].name} v{q.version}</option>)}</select></Field></div></div>)}
        {error?.extra.missing && <div className="alert warn" role="alert"><strong>Still missing:</strong><ul style={{ margin: '4px 0 0 18px' }}>{error.extra.missing.map((m: string) => <li key={m}>{m}</li>)}</ul></div>}
        {!error?.extra.missing && <ErrorBox err={error} />}
      </div>
    </Dialog>
  )
}

export function OrderTab({ styleId }: { styleId: string }) {
  const { state: s } = useSnap()
  const st = s!
  const [q, setQ] = useSearchParams()
  const [confirm, setConfirm] = useState(false)
  const orders = (Object.values(st.orders) as R[]).filter(o => o.lines.some((l: R) => l.style_id === styleId))
  const sel = (q.get('order') && st.orders[q.get('order')!]) || orders[0]
  const can = (st.users[st.me].caps as string[]).includes('commercial')
  if (orders.length === 0) return <div className="col gap-16"><h2>Order</h2><Empty title="No order for this style yet">Costing and sampling can still be in progress. A selection or verbal intention is not an order, and nothing is allocated until an order is confirmed.</Empty></div>
  return (
    <div className="col gap-16">
      <h2>Order</h2>
      <section className="panel"><div className="table-wrap"><table className="t" aria-label="Orders for this style"><thead><tr><th>Reference</th><th>State</th><th>Quantity</th><th>Delivery</th><th>Allocation</th></tr></thead><tbody>
        {orders.map(o => { const sm = st.derived.orders[o.id]; return (
          <tr key={o.id} className={`clickable ${sel?.id === o.id ? 'sel' : ''}`} onClick={() => { const n = new URLSearchParams(q); n.set('order', o.id); setQ(n) }}>
            <td><button className="link strong" onClick={e => { e.stopPropagation(); const n = new URLSearchParams(q); n.set('order', o.id); setQ(n) }}>{o.ref}</button></td>
            <td>{o.state === 'confirmed' ? <Badge tone="success">Confirmed</Badge> : <Badge tone="attention">Draft: not confirmed demand</Badge>}</td><td>{sm.total} pcs</td>
            <td className="small">{o.dates.required_in_dc.agreed ? `In DC ${fmtDate(o.dates.required_in_dc.agreed)} (agreed)` : o.dates.required_in_dc.proposed ? `In DC ${fmtDate(o.dates.required_in_dc.proposed)} (proposed)` : 'Not recorded'}</td>
            <td className="small">{o.state === 'confirmed' ? `${sm.allocated} allocated · ${sm.unallocated} unallocated` : 'Not allocatable until confirmed'}</td></tr>) })}</tbody></table></div></section>
      {sel && <section className="panel pad"><OrderView order={sel} canEdit />
        {sel.state !== 'confirmed' && <div className="mt-16">{can ? <button className="btn primary" onClick={() => setConfirm(true)}>Confirm order…</button> : <p className="hint">Confirming an order needs commercial authority (demo permission).</p>}</div>}</section>}
      {confirm && sel && <ConfirmDialog order={sel} onClose={() => setConfirm(false)} />}
    </div>
  )
}

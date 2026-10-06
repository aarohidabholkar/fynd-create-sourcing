import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast, useSnap, type R } from '../store'
import { Badge, Dialog, Empty, ErrorBox, Field, useSubmit } from '../ui'
import { fmtDate, fmtTs, personLabel } from '../util'

const QSTATE: Record<string, [string, string]> = { approved: ['Internally approved', 'success'], received: ['Received: no decision yet', 'info'], superseded: ['Superseded', ''], rejected: ['Rejected', 'error'] }

function money(q: R, v: number | null) { return v == null ? <span className="muted">Not stated</span> : `${q.currency} ${v}` }

function NewRequest({ styleId, onClose }: { styleId: string; onClose: () => void }) {
  const { state: s } = useSnap()
  const st = s!
  const rd = st.derived.styles[styleId].readiness.costing_ready
  const [f, setF] = useState({ vendor_id: '', qty_basis: '', target_price: '', due: '' })
  const { submit, busy, error } = useSubmit('create_quote_request')
  return (
    <Dialog title="New costing request" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy || !rd.ready || !f.vendor_id || !f.qty_basis.trim()} onClick={async () => { const r = await submit({ style_id: styleId, ...f, target_price: f.target_price ? Number(f.target_price) : null, due: f.due || null }); if (r) { toast('Saved as a draft. Nothing has been sent; issue it when ready.'); onClose() } }}>Save draft</button></>}>
      <div className="col gap-12">
        {!rd.ready && <div className="alert warn"><strong>This style is not costing-ready.</strong><ul style={{ margin: '4px 0 0 18px' }}>{rd.missing.map((m: R) => <li key={m.label}>{m.label}</li>)}</ul></div>}
        <p className="hint">The request captures the current tech pack, BOM and measurements as a snapshot. It does not require a sampling request.</p>
        <Field label="Vendor" required><select value={f.vendor_id} onChange={e => setF({ ...f, vendor_id: e.target.value })}><option value="">Choose…</option>{(Object.values(st.vendors) as R[]).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></Field>
        <div className="form-grid"><Field label="Quantity / basis" required><input type="text" value={f.qty_basis} onChange={e => setF({ ...f, qty_basis: e.target.value })} placeholder="e.g. 700 pcs, ex-factory" /></Field>
          <Field label="Target price (if known)"><input type="number" value={f.target_price} onChange={e => setF({ ...f, target_price: e.target.value })} /></Field><Field label="Quote needed by"><input type="date" value={f.due} onChange={e => setF({ ...f, due: e.target.value })} /></Field></div>
        <ErrorBox err={error} />
      </div>
    </Dialog>
  )
}

function RecordQuote({ styleId, requestId, onClose }: { styleId: string; requestId?: string; onClose: () => void }) {
  const { state: s } = useSnap()
  const st = s!
  const reqs = (Object.values(st.quote_requests) as R[]).filter(r => r.style_id === styleId && r.state !== 'draft')
  const [rid, setRid] = useState(requestId || reqs[0]?.id || '')
  const [comps, setComps] = useState(['Fabric', 'Trims', 'Conversion (CMT)', 'Wastage', 'Packing', 'Logistics'].map(l => ({ label: l, value: '' })))
  const [f, setF] = useState({ currency: 'INR', qty: '', moq: '', lead_days: '', terms: '', total: '', reason: '', source: 'Recorded manually (offline quote)' })
  const { submit, busy, error } = useSubmit('record_quote')
  const unknown = comps.filter(c => c.value === '').length
  return (
    <Dialog title="Record a quote" onClose={onClose} wide footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy || !rid || !f.qty} onClick={async () => {
      const r = await submit({ request_id: rid, currency: f.currency, qty: Number(f.qty), moq: f.moq ? Number(f.moq) : null, lead_days: f.lead_days ? Number(f.lead_days) : null, terms: f.terms, total: f.total === '' ? null : Number(f.total), reason: f.reason, source: f.source, components: comps.map(c => ({ label: c.label, value: c.value === '' ? null : Number(c.value) })) })
      if (r) { toast('Quote recorded as a new version. Earlier approved quotes are unchanged.'); onClose() } }}>{busy ? 'Saving…' : 'Record quote'}</button></>}>
      <div className="col gap-12">
        {reqs.length === 0 ? <div className="alert warn">Issue a costing request first.</div> : <Field label="Request" required><select value={rid} onChange={e => setRid(e.target.value)}>{reqs.map(r => <option key={r.id} value={r.id}>{st.vendors[r.vendor_id].name} · {r.qty_basis} · spec v{r.spec_version}</option>)}</select></Field>}
        <div className="form-grid"><Field label="Currency" required><input type="text" value={f.currency} onChange={e => setF({ ...f, currency: e.target.value })} /></Field><Field label="Quantity basis (pcs)" required><input type="number" value={f.qty} onChange={e => setF({ ...f, qty: e.target.value })} /></Field><Field label="MOQ"><input type="number" value={f.moq} onChange={e => setF({ ...f, moq: e.target.value })} /></Field><Field label="Lead time (days)"><input type="number" value={f.lead_days} onChange={e => setF({ ...f, lead_days: e.target.value })} /></Field></div>
        <Field label="Commercial / logistics terms"><input type="text" value={f.terms} onChange={e => setF({ ...f, terms: e.target.value })} placeholder="e.g. FOB Chennai; 30% advance" /></Field>
        <div><h3 className="mb-8">Cost per piece</h3><div className="form-grid">{comps.map((c, i) => <Field key={c.label} label={c.label} hint={c.value === '' ? 'Blank = not stated (not zero)' : ''}><input type="number" value={c.value} onChange={e => setComps(comps.map((x, j) => j === i ? { ...x, value: e.target.value } : x))} /></Field>)}</div></div>
        <Field label={`Vendor-stated total${unknown ? ' (required: some components are unknown)' : ' (optional: calculated if blank)'}`}><input type="number" value={f.total} onChange={e => setF({ ...f, total: e.target.value })} /></Field>
        <Field label="Reason / what changed vs the previous version"><input type="text" value={f.reason} onChange={e => setF({ ...f, reason: e.target.value })} /></Field>
        <ErrorBox err={error} />
      </div>
    </Dialog>
  )
}

function DecisionDialog({ quote, onClose }: { quote: R; onClose: () => void }) {
  const [kind, setKind] = useState('internal_commercial'); const [decision, setDecision] = useState('approve'); const [scope, setScope] = useState(`${quote.qty} pcs · spec v${quote.spec_version}`); const [evidence, setEvidence] = useState('')
  const { submit, busy, error } = useSubmit('decide_quote')
  return (
    <Dialog title={`Record decision: quote v${quote.version}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy || !scope.trim() || !evidence.trim()} onClick={async () => { if (await submit({ quote_id: quote.id, kind, decision, scope, evidence })) { toast('Decision recorded. Other decision types are not implied.'); onClose() } }}>Record decision</button></>}>
      <div className="col gap-12">
        <Field label="Which decision?" required hint="Internal commercial approval, vendor quote acceptance and brand price acceptance are separate; one never implies another."><select value={kind} onChange={e => setKind(e.target.value)}><option value="internal_commercial">Internal commercial approval</option><option value="vendor_acceptance">Vendor quote acceptance</option><option value="brand_price">Brand price acceptance</option></select></Field>
        <Field label="Outcome" required><select value={decision} onChange={e => setDecision(e.target.value)}><option value="approve">Approve / accept</option><option value="reject">Reject</option></select></Field>
        <Field label="Scope" required><input type="text" value={scope} onChange={e => setScope(e.target.value)} /></Field>
        <Field label="Evidence (negotiation note, email, etc.)" required><input type="text" value={evidence} onChange={e => setEvidence(e.target.value)} /></Field>
        <ErrorBox err={error} />
      </div>
    </Dialog>
  )
}

export function CostingTab({ styleId }: { styleId: string }) {
  const { state: s } = useSnap()
  const st = s!
  const [q, setQ] = useSearchParams()
  const [view, setView] = useState<'details' | 'compare' | 'history'>('details')
  const [dlg, setDlg] = useState<null | 'new' | 'record' | 'decide'>(null)
  const [recReq, setRecReq] = useState<string | undefined>()
  const issue = useSubmit('issue_quote_request')
  const me = st.users[st.me]
  const commercial = (me.caps as string[]).includes('commercial')
  const reqs = (Object.values(st.quote_requests) as R[]).filter(r => r.style_id === styleId)
  const quotes = (Object.values(st.quotes) as R[]).filter(x => x.style_id === styleId)
  const latestByVendor: Record<string, R> = {}
  quotes.forEach(x => { const c = latestByVendor[x.vendor_id]; if (!c || x.version > c.version) latestByVendor[x.vendor_id] = x })
  const current = Object.values(latestByVendor)
  const selId = q.get('quote') || (quotes.find(x => x.state === 'approved') || current[0])?.id
  const sel = selId ? st.quotes[selId] : null
  const cmp = st.derived.quote_comparison?.[styleId]
  const select = (id: string) => { const n = new URLSearchParams(q); n.set('quote', id); setQ(n) }

  return (
    <div className="col gap-16">
      <div className="row wrap"><h2 className="grow">Costing</h2>
        <button className="btn" onClick={() => setDlg('new')}>New costing request</button>
        <button className="btn" onClick={() => { setRecReq(undefined); setDlg('record') }}>Record quote</button></div>
      {reqs.length === 0 ? <Empty title="No costing request yet">Request a quote from one or more vendors. Costing does not depend on sampling and does not create a duplicate style.</Empty> : (
        <section className="panel" aria-label="Costing requests"><div className="panel-head"><h3>Requests</h3></div><div className="table-wrap"><table className="t"><thead><tr><th>Vendor</th><th>Status</th><th>Snapshot used</th><th>Basis</th><th /></tr></thead><tbody>
          {reqs.map(r => <tr key={r.id}><td className="strong">{st.vendors[r.vendor_id].name}</td>
            <td>{r.state === 'draft' ? <Badge tone="attention">Draft: not sent</Badge> : <Badge tone="success">Issued {fmtDate(r.issued_at)}{r.simulated_send ? ' (simulated send)' : ''}</Badge>} {r.state === 'received' && <Badge tone="info">Quote received</Badge>}</td>
            <td className="small">Spec v{r.spec_version} · BOM v{r.bom_version}{r.recipient && <div className="muted">To: {r.recipient}</div>}</td><td className="small">{r.qty_basis}{r.target_price != null && ` · target ${r.target_price}`}{r.due && ` · needed by ${fmtDate(r.due)}`}</td>
            <td>{r.state === 'draft' ? <button className="btn small primary" disabled={issue.busy} onClick={async () => { if (await issue.submit({ request_id: r.id })) toast('Request issued (SIMULATED: no real message was sent).') }}>Issue request</button> : <button className="btn small" onClick={() => { setRecReq(r.id); setDlg('record') }}>Record quote</button>}</td></tr>)}</tbody></table></div><div style={{ padding: '0 16px 8px' }}><ErrorBox err={issue.error} /></div></section>)}

      {quotes.length > 0 && <>
        <section className="panel" aria-label="Current quotes"><div className="panel-head"><h3>Current quote by vendor</h3></div><div className="panel-body"><ul className="list">
          {current.map(x => <li key={x.id} style={{ padding: 0 }}><button className={`item-btn ${sel?.id === x.id ? 'sel' : ''}`} style={{ padding: '10px 8px' }} onClick={() => select(x.id)}>
            <div className="row wrap"><strong>{st.vendors[x.vendor_id].name} · v{x.version}</strong><Badge tone={QSTATE[x.state][1]}>{QSTATE[x.state][0]}</Badge><span className="grow" />{x.restricted ? <span className="muted">Commercial details restricted</span> : <strong>{money(x, x.total)} / pc</strong>}</div>
            <div className="small muted">Spec v{x.spec_version} · {x.qty} pcs{x.moq && ` · MOQ ${x.moq}`}{x.lead_days && ` · ${x.lead_days} days`}</div></button></li>)}</ul>
          <p className="hint">The latest version is not automatically the approved one; approval is a separate recorded decision.</p></div></section>

        <div className="row" role="tablist" aria-label="Costing views">{[['details', 'Quote details'], ['compare', 'Compare vendors'], ['history', 'Version history']].map(([k, l]) => <button key={k} role="tab" className="tab" aria-selected={view === k} onClick={() => setView(k as any)}>{l}</button>)}</div>

        {view === 'details' && sel && (
          <section className="panel pad" aria-label="Quote details">
            <div className="row wrap"><h3 className="grow">{st.vendors[sel.vendor_id].name} · version {sel.version}</h3><Badge tone={QSTATE[sel.state][1]}>{QSTATE[sel.state][0]}</Badge>{commercial && <button className="btn small" onClick={() => setDlg('decide')}>Record decision</button>}</div>
            {sel.restricted ? <div className="alert info mt-8">Commercial details are restricted for your demo role. Quote status and decisions remain visible.</div> : <>
              <table className="t mt-8"><thead><tr><th>Component</th><th>Per piece</th></tr></thead><tbody>{sel.components.map((c: R) => <tr key={c.label}><td>{c.label}</td><td>{money(sel, c.value)}</td></tr>)}<tr><td><strong>Vendor total</strong></td><td><strong>{money(sel, sel.total)}</strong></td></tr></tbody></table>
              <dl className="kv mt-8"><dt>Quantity basis</dt><dd>{sel.qty} pcs</dd><dt>Currency</dt><dd>{sel.currency}</dd><dt>MOQ</dt><dd>{sel.moq ?? 'Not stated'}</dd><dt>Lead time</dt><dd>{sel.lead_days ? `${sel.lead_days} days` : 'Not stated'}</dd><dt>Terms</dt><dd>{sel.terms || 'Not stated'}</dd><dt>Specification</dt><dd>Spec v{sel.spec_version} · {sel.source}</dd><dt>Selling price / margin</dt><dd className="muted">Not configured in this demo (margin vs markup and tax/logistics treatment need a confirmed calculation policy).</dd></dl></>}
            <h3 className="mt-16 mb-8">Decisions</h3>
            {sel.decisions.length === 0 ? <div className="muted">No decision recorded. Receiving a quote is not approval.</div> : <ul className="list">{sel.decisions.map((d: R, i: number) => <li key={i} style={{ padding: '6px 0' }}><strong>{d.label}</strong> · {d.scope}<div className="small muted">{personLabel(st, d.by)} · {fmtTs(d.at)} · Evidence: {d.evidence}</div></li>)}</ul>}
            {sel.state === 'approved' && <p className="small mt-8">Approved costing links to the order lines using it. A later revision never changes an existing confirmed order price automatically; amendments go through the Order workflow.</p>}
          </section>)}

        {view === 'compare' && (
          <section className="panel pad" aria-label="Compare vendors">
            {!commercial ? <div className="alert info">Vendor comparison needs commercial visibility (demo permission).</div> : current.length < 2 ? <Empty title="Only one vendor has quoted">Request a second quote to compare like for like.</Empty> : <>
              <div className="table-wrap"><table className="t"><thead><tr><th>Vendor</th><th>Version</th><th>Spec</th><th>Qty basis</th><th>Currency</th><th>MOQ</th><th>Lead</th><th>Terms</th><th>Total / pc</th></tr></thead><tbody>
                {current.map(x => <tr key={x.id}><td className="strong">{st.vendors[x.vendor_id].name}</td><td>v{x.version}</td><td>v{x.spec_version}</td><td>{x.qty}</td><td>{x.currency}</td><td>{x.moq ?? 'n/s'}</td><td>{x.lead_days ?? 'n/s'}</td><td className="small">{x.terms}</td><td><strong>{money(x, x.total)}</strong></td></tr>)}</tbody></table></div>
              {cmp && !cmp.comparable ? <div className="alert warn mt-8" role="status"><strong>Not directly comparable: no “cheapest” is declared.</strong><ul style={{ margin: '4px 0 0 18px' }}>{cmp.flags.map((f: string) => <li key={f}>{f}</li>)}</ul></div> : <div className="alert success mt-8">Inputs are comparable on the recorded basis. Lowest total: <strong>{st.vendors[[...current].sort((a, b) => a.total - b.total)[0].vendor_id].name}</strong>. Lowest cost alone is not an approval.</div>}</>}
          </section>)}

        {view === 'history' && (
          <section className="panel pad" aria-label="Version history">
            {reqs.map(r => { const vs = quotes.filter(x => x.request_id === r.id).sort((a, b) => b.version - a.version); return vs.length === 0 ? null : (
              <div key={r.id} className="mb-16"><h3>{st.vendors[r.vendor_id].name}</h3>
                <ul className="list">{vs.map((x, i) => { const prev = vs[i + 1]; const delta = !x.restricted && prev && !prev.restricted && x.total != null && prev.total != null ? x.total - prev.total : null
                  return <li key={x.id} style={{ padding: '8px 0' }}><div className="row wrap"><strong>v{x.version}</strong><Badge tone={QSTATE[x.state][1]}>{QSTATE[x.state][0]}</Badge><span className="small muted">{fmtTs(x.created_at)} · {personLabel(st, x.author_id)} · {x.source}</span></div>
                    <div className="small">{x.reason}{delta != null && <> · Total {delta >= 0 ? '+' : ''}{delta} vs v{prev.version}</>}</div>
                    {!x.restricted && prev && !prev.restricted && x.components.map((c: R, j: number) => prev.components[j] && c.value !== prev.components[j].value ? <div key={c.label} className="small muted">• {c.label}: {prev.components[j].value ?? 'not stated'} → {c.value ?? 'not stated'}</div> : null)}</li> })}</ul></div>) })}
          </section>)}
      </>}
      {dlg === 'new' && <NewRequest styleId={styleId} onClose={() => setDlg(null)} />}
      {dlg === 'record' && <RecordQuote styleId={styleId} requestId={recReq} onClose={() => setDlg(null)} />}
      {dlg === 'decide' && sel && <DecisionDialog quote={sel} onClose={() => setDlg(null)} />}
    </div>
  )
}

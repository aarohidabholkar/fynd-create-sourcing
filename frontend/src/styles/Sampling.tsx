import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { SampleMovementDialog } from '../components/SampleMovement'
import { toast, useSnap, type R } from '../store'
import { Badge, Dialog, Empty, ErrorBox, Field, useSubmit, useUnsavedGuard } from '../ui'
import { TODAY, fmtDate, fmtTs, personLabel } from '../util'

const TYPES = ['Proto', 'Fit', 'Size set', 'PP', 'TOP', 'Counter sample']
const INT: Record<string, [string, string]> = { not_started: ['Not started', ''], in_progress: ['Review in progress', 'info'], passed: ['Internal QC passed', 'success'], changes_requested: ['Corrections requested', 'attention'] }
const EXT: Record<string, [string, string]> = { pending: ['Brand decision pending', ''], approved: ['Brand approved', 'success'], approved_with_comments: ['Brand approved with comments', 'attention'], rejected: ['Brand rejected / changes requested', 'error'] }

function receiptState(r: R) {
  if (r.dispatched === 0 && r.received === 0) return r.made > 0 ? `Made ${r.made}; not dispatched` : 'Not yet made'
  if (r.received === 0) return `Dispatched ${r.dispatched}; none received`
  if (r.received < r.dispatched) return `Partially received (${r.received} of ${r.dispatched} dispatched)`
  return `Received ${r.received}`
}

function NewRequestDialog({ styleId, onClose }: { styleId: string; onClose: () => void }) {
  const { state: s } = useSnap()
  const st = s!
  const rd = st.derived.styles[styleId].readiness.sampling_ready
  const [f, setF] = useState({ vendor_id: '', type: 'Fit', qty: '1', colourways: '', sizes: 'M', due: '', prereq: '' })
  const { submit, busy, error } = useSubmit('create_sample_request')
  return (
    <Dialog title="New sample request" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy || !rd.ready || !f.vendor_id} onClick={async () => { const r = await submit({ style_id: styleId, ...f, qty: Number(f.qty), colourways: f.colourways.split(',').map(x => x.trim()).filter(Boolean), sizes: f.sizes.split(',').map(x => x.trim()).filter(Boolean), due: f.due || null }); if (r) { toast('Sample request created with round 1.'); onClose() } }}>Create request</button></>}>
      <div className="col gap-12">
        {!rd.ready && <div className="alert warn"><strong>This style is not sampling-ready.</strong><ul style={{ margin: '4px 0 0 18px' }}>{rd.missing.map((m: R) => <li key={m.label}>{m.label}</li>)}</ul></div>}
        <p className="hint">Sampling can proceed independently of costing unless this particular request has its own prerequisite (note it below). There is no fixed limit on fit rounds.</p>
        <div className="form-grid"><Field label="Vendor" required><select value={f.vendor_id} onChange={e => setF({ ...f, vendor_id: e.target.value })}><option value="">Choose…</option>{(Object.values(st.vendors) as R[]).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></Field>
          <Field label="Sample type" required><select value={f.type} onChange={e => setF({ ...f, type: e.target.value })}>{TYPES.map(t => <option key={t}>{t}</option>)}</select></Field></div>
        <div className="form-grid"><Field label="Pieces" required><input type="number" min={1} value={f.qty} onChange={e => setF({ ...f, qty: e.target.value })} /></Field><Field label="Colourways (comma separated)"><input type="text" value={f.colourways} onChange={e => setF({ ...f, colourways: e.target.value })} /></Field><Field label="Sizes"><input type="text" value={f.sizes} onChange={e => setF({ ...f, sizes: e.target.value })} /></Field><Field label="Needed by"><input type="date" value={f.due} onChange={e => setF({ ...f, due: e.target.value })} /></Field></div>
        <Field label="Specific prerequisite for this request (optional)"><input type="text" value={f.prereq} onChange={e => setF({ ...f, prereq: e.target.value })} placeholder="e.g. Approved costing (needed for this proto)" /></Field>
        <ErrorBox err={error} />
      </div>
    </Dialog>
  )
}

function BrandDecisionDialog({ round, onClose }: { round: R; onClose: () => void }) {
  const [f, setF] = useState({ decision: 'approved', person_role: '', date: TODAY, ref: '', scope: '', conditions: '' })
  const { submit, busy, error } = useSubmit('record_external_decision')
  return (
    <Dialog title="Record brand decision" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy || !f.person_role.trim() || !f.ref.trim() || !f.scope.trim()} onClick={async () => { const r = await submit({ round_id: round.id, ...f }); if (r) { toast(r.warning ? 'Decision recorded. ' + r.warning : 'Decision recorded. No message was sent.'); onClose() } }}>Record decision</button></>}>
      <div className="col gap-12">
        <p className="hint">You are recording a decision made by someone at the brand. Recording it sends nothing. The deciding person and the person recording are separate on the record.</p>
        <Field label="Decision" required><select value={f.decision} onChange={e => setF({ ...f, decision: e.target.value })}><option value="approved">Approved</option><option value="approved_with_comments">Approved with comments</option><option value="rejected">Changes requested / rejected</option></select></Field>
        <div className="form-grid"><Field label="Brand person and role" required><input type="text" value={f.person_role} onChange={e => setF({ ...f, person_role: e.target.value })} placeholder="e.g. Head of design, Argo Navis" /></Field><Field label="Decision date" required><input type="date" max={TODAY} value={f.date} onChange={e => setF({ ...f, date: e.target.value })} /></Field></div>
        <Field label="Reference / evidence" required><input type="text" value={f.ref} onChange={e => setF({ ...f, ref: e.target.value })} placeholder="e.g. email of 6 Oct" /></Field>
        <Field label="Scope approved (colour, size, version)" required><input type="text" value={f.scope} onChange={e => setF({ ...f, scope: e.target.value })} /></Field>
        {f.decision === 'approved_with_comments' && <Field label="Conditions and release impact" required><textarea value={f.conditions} onChange={e => setF({ ...f, conditions: e.target.value })} /></Field>}
        <div className="hint">Specification version recorded: the version this round was made against.</div>
        <ErrorBox err={error} />
      </div>
    </Dialog>
  )
}

function PhotoViewer({ photos, start, onClose }: { photos: R[]; start: number; onClose: () => void }) {
  const [i, setI] = useState(start)
  const p = photos[i]
  return (
    <Dialog title={`Photo ${i + 1} of ${photos.length}`} onClose={onClose} footer={<><button className="btn" disabled={i === 0} onClick={() => setI(i - 1)}>Previous</button><button className="btn" disabled={i === photos.length - 1} onClick={() => setI(i + 1)}>Next</button><button className="btn" onClick={onClose}>Close</button></>}>
      <div className="placeholder-img lg" style={{ width: '100%', height: 220 }} role="img" aria-label={`Placeholder for ${p.name}`}>Image not stored in this prototype</div>
      <p className="strong mt-8">{p.name}</p><p>{p.caption || 'No caption'}</p><p className="small muted">Added {fmtTs(p.uploaded_at)}</p>
    </Dialog>
  )
}

function RoundWorkspace({ round }: { round: R }) {
  const { state: s } = useSnap()
  const st = s!
  const req = st.sample_requests[round.request_id]
  const style = st.styles[req.style_id]
  const me = st.users[st.me]
  const canReview = (me.caps as string[]).includes('technical_review')
  const canDecide = (me.caps as string[]).includes('record_decision')
  const prev = round.previous_round_id ? st.sample_rounds[round.previous_round_id] : null
  const next = (Object.values(st.sample_rounds) as R[]).find(r => r.previous_round_id === round.id)
  const poms: Record<string, R> = Object.fromEntries(style.pom.map((p: R) => [p.id, p]))
  const [rows, setRows] = useState<R[]>(round.measurements)
  const [note, setNote] = useState(round.internal.note || '')
  const [add, setAdd] = useState({ pom_id: style.pom[0]?.id || '', size: req.sizes?.[0] || 'M', colour: req.colourways?.[0] || '' })
  const [corr, setCorr] = useState({ text: '', scope: '' })
  const [verify, setVerify] = useState<{ id: string; evidence: string } | null>(null)
  const [photo, setPhoto] = useState({ name: '', caption: '' })
  const [viewer, setViewer] = useState<number | null>(null)
  const [mov, setMov] = useState(false)
  const [dec, setDec] = useState(false)
  const sm = useSubmit('save_measurements'); const rv = useSubmit('internal_review'); const ac = useSubmit('add_correction'); const vc = useSubmit('verify_correction')
  const ap = useSubmit('add_round_photo'); const nx = useSubmit('start_next_round')
  const dirty = JSON.stringify(rows) !== JSON.stringify(round.measurements)
  useUnsavedGuard(dirty, 'You have unsaved measurements for this review. Discard them?')
  const editable = canReview && round.received > 0 && round.internal.state !== 'passed'
  const photos: R[] = round.photos || []
  const result = (m: R) => { const p = poms[m.pom_id]; if (!p) return ['?', ''] as const; if (m.actual === null || m.actual === '' || m.actual === undefined) return ['Not measured', ''] as const; const v = Number(m.actual) - p.target; const bad = Math.abs(v) > p.tol + 1e-9; return [bad ? `Out of tolerance (${v > 0 ? '+' : ''}${v.toFixed(1)} ${p.unit})` : `In tolerance (${v > 0 ? '+' : ''}${v.toFixed(1)})`, bad ? 'bad' : 'ok'] as const }
  const sizesAvail = [...new Set([...(req.sizes || []), ...round.receipts.map((x: R) => x.size)])]
  const coloursAvail = [...new Set([...(req.colourways || []), ...round.receipts.map((x: R) => x.colour)])]
  const needNext = !next && (round.internal.state === 'changes_requested' || round.external.state === 'rejected')

  return (
    <div className="col gap-16" key={round.id}>
      <section className="panel pad" aria-label="Sample identity">
        <div className="row wrap"><h2 className="grow">{req.type} sample · Round {round.round} · {st.vendors[req.vendor_id].name}</h2><Badge tone="">{receiptState(round)}</Badge><Badge tone={INT[round.internal.state][1]}>{INT[round.internal.state][0]}</Badge><Badge tone={EXT[round.external.state][1]}>{EXT[round.external.state][0]}</Badge></div>
        <p className="small muted mt-8">Made against specification v{req.spec_version} · Owner {personLabel(st, req.owner_id)}{prev && <> · Follows <Link to={`?round=${prev.id}`}>round {prev.round}</Link></>}{next && <> · Next: <Link to={`?round=${next.id}`}>round {next.round}</Link></>}</p>
        {req.prereq && <p className="small mt-8">Prerequisite for this request: {req.prereq}</p>}
        <dl className="kv mt-8"><dt>Pieces</dt><dd>Requested {round.requested} · made {round.made}{round.dates.made && ` (${fmtDate(round.dates.made)})`} · dispatched {round.dispatched}{round.dates.dispatched && ` (${fmtDate(round.dates.dispatched)})`} · received {round.received}{round.dates.received && ` (${fmtDate(round.dates.received)})`}</dd>
          <dt>Tracking</dt><dd>{round.tracking || 'Not recorded'}</dd>
          <dt>Received units</dt><dd>{round.receipts.length ? round.receipts.map((x: R) => `${x.qty}× ${x.colour} ${x.size} (${fmtDate(x.date)})`).join(', ') : 'None received yet'}{round.received < round.dispatched && round.dispatched > 0 && <span className="muted"> · {round.dispatched - round.received} still in transit</span>}</dd></dl>
        {canReview || (me.caps as string[]).includes('edit') ? <button className="btn small mt-8" onClick={() => setMov(true)}>Record movement</button> : null}
      </section>

      <section className="panel" aria-label="Measurements">
        <div className="panel-head"><h3 className="grow">Measurements: target, tolerance and actuals</h3>{dirty && <Badge tone="attention">Unsaved changes</Badge>}</div>
        <div className="panel-body">
          {round.received === 0 ? <div className="muted">No pieces have been received on this round, so there is nothing to measure yet.</div> : (
            <>
              <div className="table-wrap"><table className="t" aria-label="Measurement review"><thead><tr><th>Point of measure</th><th>Size · colour</th><th>Target</th><th>Tolerance</th><th>Actual</th><th>Result</th></tr></thead><tbody>
                {rows.length === 0 && <tr><td colSpan={6} className="muted">No measurements recorded yet. Add the points you measured.</td></tr>}
                {rows.map((m, i) => { const p = poms[m.pom_id]; const [t, k] = result(m); return (
                  <tr key={i}><td>{p?.name}</td><td>{m.size} · {m.colour}</td><td>{p?.target} {p?.unit}</td><td>±{p?.tol} {p?.unit}</td>
                    <td>{editable ? <input type="number" step="0.1" aria-label={`Actual ${p?.name} ${m.size} ${m.colour}`} style={{ width: 100 }} value={m.actual ?? ''} onChange={e => setRows(rows.map((x, j) => j === i ? { ...x, actual: e.target.value === '' ? null : e.target.value } : x))} /> : (m.actual ?? <span className="muted">Not measured</span>)} <span className="muted small">{p?.unit}</span></td>
                    <td style={k === 'bad' ? { color: 'var(--error)', fontWeight: 600, background: 'var(--error-bg)' } : k === 'ok' ? { color: 'var(--success)' } : undefined}>{k === 'bad' ? '⚠ ' : k === 'ok' ? '✓ ' : ''}{t}</td></tr>) })}</tbody></table></div>
              {editable && <div className="row wrap mt-8"><select aria-label="Point of measure to add" value={add.pom_id} onChange={e => setAdd({ ...add, pom_id: e.target.value })} style={{ width: 'auto' }}>{style.pom.map((p: R) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
                <select aria-label="Size" value={add.size} onChange={e => setAdd({ ...add, size: e.target.value })} style={{ width: 90 }}>{sizesAvail.map(z => <option key={z}>{z}</option>)}</select>
                <select aria-label="Colour" value={add.colour} onChange={e => setAdd({ ...add, colour: e.target.value })} style={{ width: 130 }}>{coloursAvail.map(z => <option key={z}>{z}</option>)}</select>
                <button className="btn small" onClick={() => add.pom_id && setRows([...rows, { ...add, actual: null }])}>+ Add measurement</button>
                <button className="btn small primary" disabled={sm.busy || !dirty} onClick={async () => { if (await sm.submit({ round_id: round.id, rows })) toast('Measurements saved as a review draft.') }}>{sm.busy ? 'Saving…' : 'Save measurements'}</button></div>}
              <ErrorBox err={sm.error} />
              <p className="hint mt-8">Actuals never overwrite the specification targets. A blank value is “not measured”, not zero.{!canReview && ' Only a technical reviewer can edit measurements (demo permission).'}</p>
            </>)}
        </div>
      </section>

      <section className="panel" aria-label="Photos">
        <div className="panel-head"><h3 className="grow">Review photos</h3></div>
        <div className="panel-body">
          {photos.length === 0 ? <div className="muted">No review photos attached.</div> : <div className="chip-row">{photos.map((p, i) => <button key={p.id} className="btn small" onClick={() => setViewer(i)}>{p.name}{p.caption ? ` · ${p.caption}` : ''}</button>)}</div>}
          {canReview && <div className="row wrap mt-8"><input type="text" aria-label="Photo file name" placeholder="Photo file name" style={{ maxWidth: 200 }} value={photo.name} onChange={e => setPhoto({ ...photo, name: e.target.value })} /><input type="text" aria-label="Photo caption" placeholder="Caption (what it shows)" style={{ maxWidth: 280 }} value={photo.caption} onChange={e => setPhoto({ ...photo, caption: e.target.value })} />
            <button className="btn small" disabled={!photo.name.trim() || ap.busy} onClick={async () => { if (await ap.submit({ round_id: round.id, ...photo })) { setPhoto({ name: '', caption: '' }); toast('Photo recorded (simulated: no image file is stored).') } }}>Add photo</button></div>}
          <ErrorBox err={ap.error} />
        </div>
      </section>

      <section className="panel" aria-label="Corrections">
        <div className="panel-head"><h3 className="grow">Construction and fit comments / corrections</h3></div>
        <div className="panel-body">
          {round.comments.length === 0 ? <div className="muted">No comments on this round.</div> : <ul className="list">{round.comments.map((c: R) => (
            <li key={c.id} style={{ padding: '8px 0' }}><div className="row wrap"><strong>{c.text}</strong><Badge tone={c.state === 'verified' ? 'success' : 'attention'}>{c.state === 'verified' ? 'Verified' : 'Open'}</Badge></div>
              <div className="small muted">Scope: {c.scope}{c.carried_from && ' · carried forward from the previous round'}{c.state === 'verified' && <> · Verified by {personLabel(st, c.verified_by)} {fmtTs(c.verified_at)} · Evidence: {c.evidence}</>}</div>
              {canReview && c.state !== 'verified' && <div className="mt-8">{verify?.id === c.id ? <div className="inline-form"><Field label="Verification evidence" required hint="A vendor saying it is fixed is not verification."><input type="text" value={verify!.evidence} onChange={e => setVerify({ id: c.id, evidence: e.target.value })} /></Field><ErrorBox err={vc.error} /><div className="row"><button className="btn primary small" disabled={vc.busy || !verify!.evidence.trim()} onClick={async () => { if (await vc.submit({ round_id: round.id, comment_id: c.id, evidence: verify!.evidence })) { setVerify(null); toast('Correction verified.') } }}>Mark verified</button><button className="btn small" onClick={() => setVerify(null)}>Cancel</button></div></div> : <button className="btn small" onClick={() => setVerify({ id: c.id, evidence: '' })}>Verify correction…</button>}</div>}</li>))}</ul>}
          {canReview && round.received > 0 && <div className="inline-form"><div className="form-grid"><Field label="Add actionable comment"><input type="text" value={corr.text} onChange={e => setCorr({ ...corr, text: e.target.value })} /></Field><Field label="Affected scope"><input type="text" value={corr.scope} onChange={e => setCorr({ ...corr, scope: e.target.value })} placeholder="e.g. Navy · M, L" /></Field></div><ErrorBox err={ac.error} />
            <div><button className="btn small" disabled={ac.busy || !corr.text.trim() || !corr.scope.trim()} onClick={async () => { if (await ac.submit({ round_id: round.id, ...corr })) setCorr({ text: '', scope: '' }) }}>Add comment</button></div></div>}
        </div>
      </section>

      <section className="panel pad" aria-label="Internal review">
        <h3>Internal technical / QC review</h3>
        <p className="small muted mt-8">Current: <Badge tone={INT[round.internal.state][1]}>{INT[round.internal.state][0]}</Badge>{round.internal.by && <> · {personLabel(st, round.internal.by)} · {fmtTs(round.internal.at)}</>}{round.internal.draft && ' · draft saved'} {round.internal.note && `· “${round.internal.note}”`}</p>
        {canReview && round.received > 0 && round.internal.state !== 'passed' && <><Field label="Review note"><textarea value={note} onChange={e => setNote(e.target.value)} /></Field>
          <ErrorBox err={rv.error} />
          {rv.error?.extra.problems && <ul className="alert error" style={{ margin: '8px 0', paddingLeft: 28 }}>{rv.error.extra.problems.map((p: string) => <li key={p}>{p}</li>)}</ul>}
          <div className="row wrap mt-8">
            <button className="btn small" disabled={rv.busy} onClick={async () => { if (await rv.submit({ round_id: round.id, result: 'draft', note })) toast('Review draft saved.') }}>Save review draft</button>
            <button className="btn small" disabled={rv.busy} onClick={async () => { if (await rv.submit({ round_id: round.id, result: 'changes', note })) toast('Corrections requested. This round’s result is kept when the next round starts.') }}>Request corrections</button>
            <button className="btn primary small" disabled={rv.busy} onClick={async () => { if (await rv.submit({ round_id: round.id, result: 'pass', note })) toast('Internal QC passed. This is not brand approval or production release.') }}>Pass internal QC</button></div></>}
        {!canReview && <p className="hint mt-8">Only a technical reviewer can record the internal review (demo permission).</p>}
        {canReview && round.received === 0 && <p className="hint mt-8">Review opens once pieces are received.</p>}
      </section>

      <section className="panel pad" aria-label="Brand decision">
        <h3>Brand / external decision</h3>
        {round.external.state === 'pending' ? <p className="muted mt-8">No brand decision recorded for this round. Internal QC passing does not imply brand approval.</p> : (
          <div className="mt-8"><Badge tone={EXT[round.external.state][1]}>{EXT[round.external.state][0]}</Badge>
            <dl className="kv mt-8"><dt>Decided by</dt><dd>{round.external.person_role}</dd><dt>Date</dt><dd>{fmtDate(round.external.date, true)}</dd><dt>Scope</dt><dd>{round.external.scope} (spec v{round.external.version})</dd><dt>Reference</dt><dd>{round.external.ref}</dd>{round.external.conditions && <><dt>Conditions</dt><dd>{round.external.conditions}</dd></>}</dl>
            {round.external.state === 'approved_with_comments' && <p className="small mt-8">Approved with comments is not unconditional approval: Production reads these conditions and their release impact.</p>}</div>)}
        {canDecide && round.received > 0 && <button className="btn small mt-8" onClick={() => setDec(true)}>Record brand decision</button>}
        <p className="hint mt-8">Production readiness (PP meeting, Gate 3) is a separate decision made per allocation in the Production tab.{req.allocation_id && <> <Link to={`/styles/${style.id}/production?alloc=${req.allocation_id}`}>Open production for this allocation</Link>.</>}</p>
      </section>

      {needNext && canReview !== undefined && (me.caps as string[]).includes('edit') && <section className="panel pad"><div className="row"><div className="grow"><strong>Next round</strong><div className="small muted">This round’s result stays on record. Unresolved corrections are carried to the new round with a link back.</div></div>
        <button className="btn primary" disabled={nx.busy} onClick={async () => { const r = await nx.submit({ round_id: round.id, qty: round.requested }); if (r) toast(`Round ${round.round + 1} started.`) }}>Start round {round.round + 1}</button></div><ErrorBox err={nx.error} /></section>}

      {mov && <SampleMovementDialog round={round} onClose={() => setMov(false)} />}
      {dec && <BrandDecisionDialog round={round} onClose={() => setDec(false)} />}
      {viewer !== null && <PhotoViewer photos={photos} start={viewer} onClose={() => setViewer(null)} />}
    </div>
  )
}

export function SamplingTab({ styleId }: { styleId: string }) {
  const { state: s } = useSnap()
  const st = s!
  const [q, setQ] = useSearchParams()
  const [newReq, setNewReq] = useState(false)
  const reqs = (Object.values(st.sample_requests) as R[]).filter(r => r.style_id === styleId)
  const rounds = (Object.values(st.sample_rounds) as R[]).filter(r => reqs.some(x => x.id === r.request_id))
  const selId = q.get('round')
  const def = useMemo(() => [...rounds].sort((a, b) => b.round - a.round).find(r => r.received > r.dispatched || r.internal.state === 'in_progress' || r.internal.state === 'not_started') || rounds[0], [rounds.length])
  const round = (selId && st.sample_rounds[selId]) || def
  const pick = (id: string) => { const n = new URLSearchParams(q); n.set('round', id); setQ(n) }
  const canEdit = (st.users[st.me].caps as string[]).includes('edit')
  if (reqs.length === 0) return <div className="col gap-16"><div className="row"><h2 className="grow">Sampling</h2>{canEdit && <button className="btn primary" onClick={() => setNewReq(true)}>New sample request</button>}</div><Empty title="No sample requests yet">Create a request to start a proto, fit, size-set, PP or TOP sample. Costing is independent.</Empty>{newReq && <NewRequestDialog styleId={styleId} onClose={() => setNewReq(false)} />}</div>
  const byVendor: Record<string, R[]> = {}
  reqs.forEach(r => { (byVendor[r.vendor_id] ||= []).push(r) })
  return (
    <div className="col gap-16">
      <div className="row wrap"><h2 className="grow">Sampling</h2>{canEdit && <button className="btn" onClick={() => setNewReq(true)}>New sample request</button>}</div>
      <div className="grid-main" style={{ gridTemplateColumns: 'minmax(220px, 280px) minmax(0, 1fr)' }}>
        <nav aria-label="Sample requests and rounds" className="panel">
          <div className="small muted" style={{ padding: '10px 12px' }}>Grouped by vendor and sample type. Earlier rounds stay available.</div>
          <label className="sr-only" htmlFor="round-select">Select round</label>
          {Object.entries(byVendor).map(([vid, list]) => (
            <div key={vid} style={{ borderTop: '1px solid var(--divider)' }}>
              <div style={{ padding: '8px 12px' }} className="strong">{st.vendors[vid].name}</div>
              {list.map(rq => (
                <div key={rq.id} style={{ padding: '0 8px 8px' }}>
                  <div className="small muted" style={{ padding: '0 4px' }}>{rq.type} request <Badge>{rq.state}</Badge></div>
                  {rounds.filter(r => r.request_id === rq.id).sort((a, b) => b.round - a.round).map(r => (
                    <button key={r.id} className={`item-btn ${round?.id === r.id ? 'sel' : ''}`} style={{ padding: '6px 10px', borderRadius: 6 }} aria-current={round?.id === r.id ? 'true' : undefined} onClick={() => pick(r.id)}>
                      <strong>Round {r.round}</strong> <span className="small muted">· {receiptState(r)}</span>
                      <div className="small">{INT[r.internal.state][0]} · {EXT[r.external.state][0]}</div></button>))}
                </div>))}
            </div>))}
        </nav>
        <div>{round ? <RoundWorkspace round={round} /> : <Empty title="Select a round" />}</div>
      </div>
      {newReq && <NewRequestDialog styleId={styleId} onClose={() => setNewReq(false)} />}
    </div>
  )
}

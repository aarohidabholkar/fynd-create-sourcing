import { useMemo, useState } from 'react'
import { Link, Navigate, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { PageHead } from '../Shell'
import { FocusDetail } from '../detail/FocusDetail'
import { useRemembered, useScrollMemory } from '../hooks'
import { toast, useSnap, type R } from '../store'
import { Badge, Dialog, Drawer, Empty, ErrorBox, Field, Person, Placeholder, Tabs, useSubmit, useUnsavedGuard } from '../ui'
import { OPEN, TODAY, fmtDate, fmtTs, isOverdue, personLabel, plural } from '../util'

export default function Vendors() {
  return (
    <Routes>
      <Route index element={<VendorDirectory />} />
      <Route path=":vendorId" element={<RedirectOv />} />
      <Route path=":vendorId/:tab" element={<VendorPage />} />
    </Routes>
  )
}
function RedirectOv() { const { vendorId } = useParams(); return <Navigate to={`/vendors/${vendorId}/overview`} replace /> }

const moqText = (m: R | null) => (m ? `${m.qty} pcs ${m.basis}` : 'Not recorded')

function AddVendorDialog({ onClose }: { onClose: () => void }) {
  const nav = useNavigate()
  const [f, setF] = useState({ name: '', location: '', location_unknown: false, category: '' })
  const [distinct, setDistinct] = useState(false)
  const { submit, busy, error } = useSubmit('create_vendor')
  return (
    <Dialog title="Add vendor" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy || !f.name.trim()} onClick={async () => { const r = await submit({ ...f, category: f.category.split(',').map(x => x.trim()).filter(Boolean), confirm_distinct: distinct }); if (r) { toast('Vendor added. You can add capabilities and contacts later; no audit is required.'); onClose(); nav(`/vendors/${r.vendor_id}`) } }}>{distinct ? 'Add as a distinct vendor' : 'Add vendor'}</button></>}>
      <div className="col gap-12">
        <Field label="Vendor name" required><input type="text" value={f.name} onChange={e => { setF({ ...f, name: e.target.value }); setDistinct(false) }} /></Field>
        <Field label="Location" required={!f.location_unknown}><input type="text" disabled={f.location_unknown} value={f.location} onChange={e => setF({ ...f, location: e.target.value })} /></Field>
        <label className="row"><input type="checkbox" checked={f.location_unknown} onChange={e => setF({ ...f, location_unknown: e.target.checked })} /> Location unknown</label>
        <Field label="Categories (optional, comma separated)"><input type="text" value={f.category} onChange={e => setF({ ...f, category: e.target.value })} /></Field>
        {error?.code === 'possible_duplicate' ? <div className="alert warn" role="alert">{error.message}<ul style={{ margin: '4px 0 0 18px' }}>{error.extra.similar.map((v: R) => <li key={v.id}>{v.name} ({v.location || 'location unknown'}) · <button className="link" onClick={() => { onClose(); nav(`/vendors/${v.id}`) }}>Open existing vendor</button></li>)}</ul>{!distinct && <button className="btn small mt-8" onClick={() => setDistinct(true)}>This is a different vendor</button>}</div> : <ErrorBox err={error} />}
      </div>
    </Dialog>
  )
}

function VendorDirectory() {
  const { state: s } = useSnap()
  const st = s!
  const [f, setF] = useRemembered('vendors:filters', { q: '', cat: 'all', loc: 'all', moq: 'any', moqMax: '', assess: 'all', sort: 'name' })
  const [add, setAdd] = useState(false)
  useScrollMemory('vendors')
  const vs = Object.values(st.vendors) as R[]
  const cats = [...new Set(vs.flatMap(v => v.category))].sort()
  const locs = [...new Set(vs.map(v => v.location).filter(Boolean))].sort() as string[]
  const sum = (v: R) => st.derived.vendors[v.id]
  const lastVisit = (v: R) => sum(v).latest_visit_id ? st.visits[sum(v).latest_visit_id] : null
  const lastAudit = (v: R) => sum(v).latest_audit_id ? st.audits[sum(v).latest_audit_id] : null
  const rows = vs.filter(v => {
    const t = f.q.toLowerCase()
    if (t && !(v.name + ' ' + (v.location || '') + ' ' + v.category.join(' ') + ' ' + v.capabilities.map((c: R) => c.label).join(' ')).toLowerCase().includes(t)) return false
    if (f.cat !== 'all' && !v.category.includes(f.cat)) return false
    if (f.loc !== 'all' && v.location !== f.loc) return false
    if (f.moq === 'unknown' && v.moq) return false
    if (f.moq === 'max') { if (!v.moq) return false; if (f.moqMax && v.moq.qty > Number(f.moqMax)) return false }
    if (f.assess === 'none' && sum(v).latest_audit_id) return false
    if (f.assess === 'open' && sum(v).open_findings === 0) return false
    return true
  }).sort((a, b) => {
    if (f.sort === 'visit') return (lastVisit(b)?.date || '').localeCompare(lastVisit(a)?.date || '')
    if (f.sort === 'assess') return (lastAudit(b)?.date || '').localeCompare(lastAudit(a)?.date || '')
    return a.name.localeCompare(b.name)
  })
  const active = f.q || f.cat !== 'all' || f.loc !== 'all' || f.moq !== 'any' || f.assess !== 'all'
  const clear = () => setF({ q: '', cat: 'all', loc: 'all', moq: 'any', moqMax: '', assess: 'all', sort: f.sort })
  return (
    <>
      <PageHead title="Vendors" sub="Find a suitable vendor and see what we actually know about it. Internal records only; vendors do not log in here." actions={<button className="btn primary" onClick={() => setAdd(true)}>+ Add vendor</button>} />
      <div className="page-body">
        <section className="panel">
          <div className="toolbar" role="search">
            <input className="search" style={{ marginLeft: 0 }} type="search" aria-label="Search vendors by name, location or capability" placeholder="Search name, location or capability…" value={f.q} onChange={e => setF({ ...f, q: e.target.value })} />
            <select aria-label="Category" value={f.cat} onChange={e => setF({ ...f, cat: e.target.value })}><option value="all">All categories</option>{cats.map(c => <option key={c}>{c}</option>)}</select>
            <select aria-label="Location" value={f.loc} onChange={e => setF({ ...f, loc: e.target.value })}><option value="all">All locations</option>{locs.map(c => <option key={c}>{c}</option>)}</select>
            <select aria-label="MOQ" value={f.moq} onChange={e => setF({ ...f, moq: e.target.value })}><option value="any">Any MOQ</option><option value="max">MOQ at most…</option><option value="unknown">MOQ not recorded</option></select>
            {f.moq === 'max' && <input type="number" aria-label="Maximum MOQ" placeholder="pcs" style={{ width: 90 }} value={f.moqMax} onChange={e => setF({ ...f, moqMax: e.target.value })} />}
            <select aria-label="Assessment" value={f.assess} onChange={e => setF({ ...f, assess: e.target.value })}><option value="all">Any assessment</option><option value="none">No assessment on file</option><option value="open">Has open findings</option></select>
            <select aria-label="Sort" value={f.sort} onChange={e => setF({ ...f, sort: e.target.value })}><option value="name">Sort: name</option><option value="visit">Sort: latest visit</option><option value="assess">Sort: latest assessment</option></select>
          </div>
          <div className="small muted row" style={{ padding: '8px 16px' }}>{plural(rows.length, 'vendor')} match{active && <button className="link" onClick={clear}>Clear filters</button>}<span>· MOQ compared only on recorded quantity; basis (per colour / per style) is shown, not converted.</span></div>
          <div className="table-wrap"><table className="t"><thead><tr><th>Vendor</th><th>Best suited for</th><th>MOQ</th><th>Latest assessment</th><th>Last visit</th></tr></thead><tbody>
            {rows.length === 0 && <tr><td colSpan={5}><Empty title="No vendors match these filters">Try removing a filter. <button className="link" onClick={clear}>Clear filters</button></Empty></td></tr>}
            {rows.map(v => { const d = sum(v); const lv = lastVisit(v); const la = lastAudit(v); return (
              <tr key={v.id}><td><Link to={`/vendors/${v.id}/overview`} className="strong">{v.name}</Link><div className="small muted">{v.location || 'Location unknown'}</div></td>
                <td className="small">{v.suitability}{v.limitations[0] && <div style={{ color: 'var(--attention)' }}>Restriction: {v.limitations[0]}</div>}</td>
                <td className="small">{moqText(v.moq)}{v.moq?.conditions && <div className="muted">{v.moq.conditions}</div>}</td>
                <td className="small">{d.assessment_label ? <>{d.assessment_label}{!d.mixed_assessments && la && <div className="muted">{fmtDate(la.date, true)} · {la.factory_id ? st.factories[la.factory_id].name : 'Unit not confirmed'}</div>}{d.mixed_assessments && <div className="muted">Open to see each unit</div>}{d.open_findings > 0 && <div><Badge tone="attention">{plural(d.open_findings, 'open finding')}</Badge></div>}</> : <span className="muted">No assessment on file</span>}</td>
                <td className="small">{lv ? <Link to={`/vendors/${v.id}/visits?visit=${lv.id}`}>{fmtDate(lv.date, true)}</Link> : <span className="muted">No published visit</span>}{d.draft_visits > 0 && <div className="muted">+ draft</div>}</td></tr>) })}</tbody></table></div>
        </section>
      </div>
      {add && <AddVendorDialog onClose={() => setAdd(false)} />}
    </>
  )
}

const BASIS: Record<string, [string, string]> = { observed: ['Observed', 'success'], reported: ['Reported', 'info'], planned: ['Planned (not available yet)', 'attention'] }
const CSTATE: Record<string, string> = { available: 'Available', limited: 'Limited', planned: 'Planned', not_offered: 'Not offered' }
const CERT: Record<string, [string, string]> = { reported: ['Reported', 'info'], evidence_attached: ['Evidence attached (not verified)', 'attention'], reviewed: ['Reviewed', 'success'] }

function EditProfile({ v, onClose }: { v: R; onClose: () => void }) {
  const [f, setF] = useState({ suitability: v.suitability, payment_terms: v.payment_terms, moqQty: v.moq ? String(v.moq.qty) : '', moqBasis: v.moq?.basis || 'per colour', moqCond: v.moq?.conditions || '' })
  const { submit, busy, error } = useSubmit('edit_profile')
  const conflict = error?.code === 'conflict'
  return (
    <Dialog title={`Edit profile: ${v.name}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy} onClick={async () => { const fields: R = { suitability: f.suitability, payment_terms: f.payment_terms }; if (f.moqQty) fields.moq = { qty: Number(f.moqQty), basis: f.moqBasis, conditions: f.moqCond }; if (await submit({ vendor_id: v.id, fields, if_rev: v.rev ?? 1 })) { toast('Profile updated; the change is kept in history.'); onClose() } }}>Save changes</button></>}>
      <div className="col gap-12"><p className="hint">Changes are recorded with who, when and the old value. Reported capacity and indicative prices are not commitments or approved quotes.</p>
        <Field label="Suitability: what this vendor makes well"><textarea value={f.suitability} onChange={e => setF({ ...f, suitability: e.target.value })} /></Field>
        <div className="form-grid"><Field label="MOQ (pcs)"><input type="number" value={f.moqQty} onChange={e => setF({ ...f, moqQty: e.target.value })} /></Field><Field label="MOQ basis"><select value={f.moqBasis} onChange={e => setF({ ...f, moqBasis: e.target.value })}><option>per colour</option><option>per style</option><option>per design</option><option>per order</option></select></Field></div>
        <Field label="MOQ conditions"><input type="text" value={f.moqCond} onChange={e => setF({ ...f, moqCond: e.target.value })} /></Field>
        <Field label="Payment terms"><input type="text" value={f.payment_terms} onChange={e => setF({ ...f, payment_terms: e.target.value })} /></Field>
        {conflict ? <div className="alert error" role="alert">{error!.message} Close this dialog and reopen it to see the current values.</div> : <ErrorBox err={error} />}</div>
    </Dialog>
  )
}

function ReviewProfile({ vendorId, onClose }: { vendorId: string; onClose: () => void }) {
  const { state: s } = useSnap()
  const st = s!
  const props = (Object.values(st.profile_proposals) as R[]).filter(p => p.vendor_id === vendorId && p.state === 'pending')
  const dec = useSubmit('decide_profile_change')
  return (
    <Dialog title="Review profile changes" onClose={onClose} footer={<button className="btn" onClick={onClose}>Done</button>}>
      {props.length === 0 ? <p className="muted">No profile changes are waiting for review.</p> : props.map(p => (
        <div key={p.id} className="panel pad mb-8"><strong>{p.field}</strong><div className="small muted">From visit {fmtDate(st.visits[p.visit_id]?.date)}</div>
          <div className="small mt-8">Current: {p.current}</div><div className="small">Proposed: <strong>{p.proposed}</strong></div>
          <div className="row mt-8"><button className="btn primary small" disabled={dec.busy} onClick={() => dec.submit({ proposal_id: p.id, decision: 'apply' }).then(r => r && toast('Applied as “planned”, not available. History recorded.'))}>Apply</button><button className="btn small" disabled={dec.busy} onClick={() => dec.submit({ proposal_id: p.id, decision: 'skip' })}>Skip (visit stays saved)</button></div><ErrorBox err={dec.error} /></div>))}
      <p className="hint">Saving a visit never overwrites the profile on its own. Observed machines are not proof of production capability.</p>
    </Dialog>
  )
}

function VendorOverview({ v }: { v: R }) {
  const { state: s } = useSnap()
  const st = s!
  const nav = useNavigate()
  const [q, setQ] = useSearchParams()
  const [review, setReview] = useState(false)
  const d = st.derived.vendors[v.id]
  const findings = (Object.values(st.findings) as R[]).filter(f => f.vendor_id === v.id && f.state !== 'verified_closed')
  const acts = (Object.values(st.actions) as R[]).filter(a => a.vendor_id === v.id && OPEN.includes(a.status))
  const lv = d.latest_visit_id ? st.visits[d.latest_visit_id] : null
  const la = d.latest_audit_id ? st.audits[d.latest_audit_id] : null
  const pend = (Object.values(st.profile_proposals) as R[]).filter(p => p.vendor_id === v.id && p.state === 'pending')
  const photos = lv ? lv.attachments.filter((a: R) => a.kind === 'photo').slice(0, 3) : []
  return (
    <div className="col gap-16">
      {pend.length > 0 && <div className="alert info row"><span className="grow">{plural(pend.length, 'profile change')} proposed from a visit, waiting for review.</span><button className="btn small" onClick={() => setReview(true)}>Review profile changes</button></div>}
      <section className="panel pad"><h2>Suitability</h2><p className="mt-8" style={{ fontSize: 15 }}>{v.suitability}</p>
        {v.limitations.length > 0 && <><h3 className="mt-16">Limitations and exclusions</h3><ul style={{ margin: '4px 0 0 18px' }}>{v.limitations.map((l: string) => <li key={l}>{l}</li>)}</ul></>}
        <h3 className="mt-16 mb-8">Capabilities</h3>
        {v.capabilities.length === 0 ? <div className="muted">Not recorded.</div> : <table className="t"><thead><tr><th>Capability</th><th>State</th><th>Basis</th><th>Observation</th></tr></thead><tbody>{v.capabilities.map((c: R) => <tr key={c.id}><td><strong>{c.label}</strong><div className="small muted">{c.kind}</div></td><td>{CSTATE[c.state]}</td><td><Badge tone={BASIS[c.basis][1]}>{BASIS[c.basis][0]}</Badge></td><td className="small">{c.note}{c.observed_on ? <> · {fmtDate(c.observed_on, true)}{c.visit_id && <> · <Link to={`/vendors/${v.id}/visits?visit=${c.visit_id}`}>visit</Link></>}</> : <span className="muted"> · no observation date</span>}</td></tr>)}</tbody></table>}</section>

      {(findings.length > 0 || acts.length > 0) && <section className="panel" aria-label="Needs attention"><div className="panel-head"><h2>Needs attention</h2></div><div className="panel-body"><ul className="list">
        {findings.map(f => <li key={f.id} style={{ padding: 0 }}><button className="item-btn" style={{ padding: '8px 0' }} onClick={() => nav(`/vendors/${v.id}/audits?finding=${f.id}`)}><Badge tone={f.state === 'awaiting_verification' ? 'info' : 'attention'}>{f.state === 'awaiting_verification' ? 'Awaiting verification' : 'Open finding'}</Badge> <strong>{f.section}: {f.description}</strong><div className="small muted">{f.factory_id ? st.factories[f.factory_id].name : 'Unit not confirmed'} · Owner {personLabel(st, f.internal_owner_id)} · Target: {f.target}</div></button></li>)}
        {acts.map(a => <li key={a.id} style={{ padding: 0 }}><button className="item-btn" style={{ padding: '8px 0' }} onClick={() => { const n = new URLSearchParams(q); n.set('action', a.id); setQ(n) }}><Badge>Action</Badge> {a.title}<div className="small muted">{personLabel(st, a.assignee_id)} · {a.due ? `Due ${fmtDate(a.due)}` : 'No date set'}{isOverdue(a) && ' · overdue'}</div></button></li>)}</ul></div></section>}

      <div className="grid-2">
        <section className="panel pad"><h2>Commercial terms</h2><dl className="kv mt-8"><dt>MOQ</dt><dd>{moqText(v.moq)}{v.moq?.conditions && <span className="muted"> · {v.moq.conditions}</span>}</dd><dt>Capacity</dt><dd>{v.capacity.text}{v.capacity.observed_on && <span className="muted"> (observed {fmtDate(v.capacity.observed_on)}; not a booking commitment)</span>}</dd><dt>Indicative pricing</dt><dd>{v.indicative_pricing.text}{v.indicative_pricing.date && <span className="muted"> · {fmtDate(v.indicative_pricing.date)}; not an approved style quote</span>}</dd><dt>Payment terms</dt><dd>{v.payment_terms}</dd></dl>
          <h3 className="mt-16 mb-8">Certifications and compliance claims</h3>{v.certifications.length === 0 ? <div className="muted">None recorded.</div> : <ul className="list">{v.certifications.map((c: R) => <li key={c.name} style={{ padding: '6px 0' }}>{c.name} <Badge tone={CERT[c.state][1]}>{CERT[c.state][0]}</Badge><div className="small muted">{c.evidence ? `Evidence: ${c.evidence}` : 'No evidence attached'} · Expiry {c.expiry || 'not recorded'}</div></li>)}</ul>}</section>
        <section className="panel pad"><h2>Contacts, units and recent evidence</h2><dl className="kv mt-8"><dt>Relationship owner</dt><dd>{v.owner_id ? <Person id={v.owner_id} /> : 'Not recorded'}</dd><dt>Contacts</dt><dd>{v.contacts.length ? v.contacts.map((c: R) => `${c.name} (${c.role})`).join('; ') : 'Not recorded'}</dd><dt>Factories / units</dt><dd>{v.factories.length ? v.factories.map((f: string) => `${st.factories[f].name}, ${st.factories[f].location}`).join('; ') : 'Not recorded'}</dd>
          <dt>Latest published visit</dt><dd>{lv ? <Link to={`/vendors/${v.id}/visits?visit=${lv.id}`}>{fmtDate(lv.date, true)}</Link> : 'None'}</dd><dt>Latest assessment</dt><dd>{la ? <Link to={`/vendors/${v.id}/audits?audit=${la.id}`}>{fmtDate(la.date, true)} · {d.assessment_label}</Link> : 'No assessment on file'}</dd></dl>
          {photos.length > 0 && <div className="mt-8"><div className="small muted">From the {fmtDate(lv!.date)} visit:</div><div className="chip-row">{photos.map((p: R) => <Link key={p.id} className="btn small" to={`/vendors/${v.id}/visits?visit=${lv!.id}`}>{p.caption || p.name}</Link>)}</div></div>}</section>
      </div>
      {v.profile_history.length > 0 && <section className="panel pad"><h3>Profile change history</h3><ul className="list">{[...v.profile_history].reverse().map((h: R) => <li key={h.id} style={{ padding: '6px 0' }} className="small">{fmtTs(h.at)} · {personLabel(st, h.by)} · {h.source}: {h.changes.map((c: R) => `${c.field}: ${typeof c.old === 'object' ? JSON.stringify(c.old) : c.old ?? '—'} → ${typeof c.new === 'object' ? JSON.stringify(c.new) : c.new}`).join('; ')}</li>)}</ul></section>}
      {review && <ReviewProfile vendorId={v.id} onClose={() => setReview(false)} />}
    </div>
  )
}

/* ---------- visits ---------- */
function VisitForm({ v, draft, onClose, afterPublish }: { v: R; draft?: R; onClose: () => void; afterPublish: (n: number) => void }) {
  const { state: s } = useSnap()
  const st = s!
  const units = v.factories.map((f: string) => st.factories[f])
  const [f, setF] = useState({ factory_id: draft?.factory_id || (units.length === 1 ? units[0].id : ''), unit_unconfirmed: draft?.unit_unconfirmed || false, date: draft?.date || TODAY, attendees: draft?.attendees || [st.me], not_recorded: draft?.attendees_not_recorded || false, observations: draft?.observations || '', audit_id: draft?.audit_id || '' })
  const [files, setFiles] = useState<{ name: string; kind: string; caption: string }[]>([])
  const [fups, setFups] = useState<{ title: string; assignee_id: string; due: string }[]>([])
  const save = useSubmit('save_visit')
  const dirty = !!(f.observations || files.length || fups.length) && !save.busy
  useUnsavedGuard(dirty, 'Discard this unsaved visit?')
  const body = (publish: boolean) => ({ vendor_id: v.id, visit_id: draft?.id, factory_id: f.factory_id || null, unit_unconfirmed: f.unit_unconfirmed, date: f.date, attendees: f.not_recorded ? [] : f.attendees, attendees_not_recorded: f.not_recorded, observations: f.observations, attachments: files, followups: fups, audit_id: f.audit_id || null, publish })
  const audits = (Object.values(st.audits) as R[]).filter(a => a.vendor_id === v.id)
  const pick = (e: React.ChangeEvent<HTMLInputElement>) => setFiles([...files, ...Array.from(e.target.files || []).map(x => ({ name: x.name, kind: x.type.startsWith('video') ? 'video' : x.type.startsWith('image') ? 'photo' : 'document', caption: '' }))])
  return (
    <Dialog title={draft ? 'Continue draft visit' : `Record visit: ${v.name}`} onClose={onClose} wide footer={<><button className="btn" onClick={onClose}>Cancel</button>
      <button className="btn" disabled={save.busy} onClick={async () => { if (await save.submit(body(false))) { toast('Draft saved. It is visible only to you until published.'); onClose() } }}>Save draft</button>
      <button className="btn primary" disabled={save.busy} onClick={async () => { const r = await save.submit(body(true)); if (r) { toast('Visit saved. Profile is unchanged until you review changes.'); onClose(); afterPublish(r.proposals) } }}>{save.busy ? 'Saving…' : 'Save visit'}</button></>}>
      <div className="col gap-12">
        <p className="hint">A new visit is always its own dated record. To correct an earlier visit, open it and use Edit (history is kept). Drafts are separate from published visits and do not change the profile.</p>
        <div className="form-grid">
          <Field label="Factory / unit" required><select value={f.unit_unconfirmed ? '__u' : f.factory_id} onChange={e => e.target.value === '__u' ? setF({ ...f, factory_id: '', unit_unconfirmed: true }) : setF({ ...f, factory_id: e.target.value, unit_unconfirmed: false })}><option value="">Choose…</option>{units.map((u: R) => <option key={u.id} value={u.id}>{u.name}</option>)}<option value="__u">Unit not confirmed</option></select></Field>
          <Field label="Visit date (actual)" required><input type="date" max={TODAY} value={f.date} onChange={e => setF({ ...f, date: e.target.value })} /></Field></div>
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}><legend className="small muted strong">Visited by</legend>
          <div className="row wrap">{(Object.values(st.users) as R[]).map(u => <label key={u.id} className="row"><input type="checkbox" disabled={f.not_recorded} checked={f.attendees.includes(u.id)} onChange={e => setF({ ...f, attendees: e.target.checked ? [...f.attendees, u.id] : f.attendees.filter((x: string) => x !== u.id) })} />John Doe · {u.role}</label>)}<label className="row"><input type="checkbox" checked={f.not_recorded} onChange={e => setF({ ...f, not_recorded: e.target.checked })} />Not recorded</label></div></fieldset>
        <Field label="Observations" hint="What did you see: capabilities, limitations, concerns?"><textarea style={{ minHeight: 110 }} value={f.observations} onChange={e => setF({ ...f, observations: e.target.value })} /></Field>
        <div><h3 className="mb-8">Photos, videos and documents</h3><input type="file" multiple accept="image/*,video/*,.pdf" aria-label="Add photos, videos or documents" onChange={pick} /><p className="hint">Prototype: file names and captions are recorded; no file is stored. Final size and type limits follow the shared attachment service.</p>
          {files.map((a, i) => <div key={i} className="row wrap mt-8"><Badge>{a.kind}</Badge><span style={{ minWidth: 140 }}>{a.name}</span><input type="text" aria-label={`Caption for ${a.name}`} placeholder="Caption (what it shows)" style={{ flex: 1, minWidth: 180 }} value={a.caption} onChange={e => setFiles(files.map((x, j) => j === i ? { ...x, caption: e.target.value } : x))} /><button className="btn small" onClick={() => setFiles(files.filter((_, j) => j !== i))}>Remove</button></div>)}</div>
        <div><h3 className="mb-8">Follow-ups (optional)</h3>{fups.map((u, i) => <div key={i} className="row wrap mb-8"><input type="text" aria-label="Follow-up" placeholder="Follow-up action" style={{ flex: 2, minWidth: 200 }} value={u.title} onChange={e => setFups(fups.map((x, j) => j === i ? { ...x, title: e.target.value } : x))} /><select aria-label="Assignee" style={{ width: 'auto' }} value={u.assignee_id} onChange={e => setFups(fups.map((x, j) => j === i ? { ...x, assignee_id: e.target.value } : x))}>{(Object.values(st.users) as R[]).map(x => <option key={x.id} value={x.id}>John Doe · {x.role}</option>)}</select><input type="date" aria-label="Due" style={{ width: 150 }} value={u.due} onChange={e => setFups(fups.map((x, j) => j === i ? { ...x, due: e.target.value } : x))} /><button className="btn small" onClick={() => setFups(fups.filter((_, j) => j !== i))}>Remove</button></div>)}
          <button className="btn small" onClick={() => setFups([...fups, { title: '', assignee_id: st.me, due: '' }])}>+ Add follow-up</button></div>
        {audits.length > 0 && <Field label="Related audit (optional)"><select value={f.audit_id} onChange={e => setF({ ...f, audit_id: e.target.value })}><option value="">None</option>{audits.map(a => <option key={a.id} value={a.id}>{fmtDate(a.date)} · {a.factory_id ? st.factories[a.factory_id].name : 'Unit not confirmed'}</option>)}</select></Field>}
        {save.error?.extra.problems ? <div className="alert error" role="alert">{save.error.message}</div> : <ErrorBox err={save.error} />}
      </div>
    </Dialog>
  )
}

function EditVisit({ vis, onClose }: { vis: R; onClose: () => void }) {
  const { state: s } = useSnap()
  const st = s!
  const v = st.vendors[vis.vendor_id]
  const [f, setF] = useState({ observations: vis.observations, date: vis.date, factory_id: vis.factory_id || '', reason: '' })
  const [caps, setCaps] = useState<Record<string, string>>(Object.fromEntries(vis.attachments.map((a: R) => [a.id, a.caption])))
  const [adds, setAdds] = useState<{ name: string; kind: string; caption: string }[]>([])
  const { submit, busy, error } = useSubmit('edit_visit')
  return (
    <Dialog title="Correct this visit (same record)" onClose={onClose} wide footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy || !f.reason.trim()} onClick={async () => { if (await submit({ visit_id: vis.id, if_rev: vis.rev ?? 1, reason: f.reason, fields: { observations: f.observations, date: f.date, factory_id: f.factory_id || null, captions: vis.attachments.map((a: R) => ({ id: a.id, caption: caps[a.id] })) }, add_attachments: adds })) { toast('Visit corrected. Earlier values are kept in Edit history.'); onClose() } }}>Save correction</button></>}>
      <div className="col gap-12"><p className="hint">This updates the same visit; it does not create a second one. For another visit on a different day, record a new visit.</p>
        <div className="form-grid"><Field label="Visit date"><input type="date" max={TODAY} value={f.date} onChange={e => setF({ ...f, date: e.target.value })} /></Field><Field label="Factory / unit"><select value={f.factory_id} onChange={e => setF({ ...f, factory_id: e.target.value })}><option value="">Unit not confirmed</option>{v.factories.map((x: string) => <option key={x} value={x}>{st.factories[x].name}</option>)}</select></Field></div>
        <Field label="Observations"><textarea style={{ minHeight: 100 }} value={f.observations} onChange={e => setF({ ...f, observations: e.target.value })} /></Field>
        {vis.attachments.map((a: R) => <Field key={a.id} label={`Caption: ${a.name}`}><input type="text" value={caps[a.id] || ''} onChange={e => setCaps({ ...caps, [a.id]: e.target.value })} /></Field>)}
        <div><input type="file" multiple aria-label="Add more photos or files" onChange={e => setAdds([...adds, ...Array.from(e.target.files || []).map(x => ({ name: x.name, kind: x.type.startsWith('image') ? 'photo' : 'document', caption: '' }))])} />{adds.map((a, i) => <div key={i} className="row mt-8"><span>{a.name}</span><input type="text" aria-label={`Caption for ${a.name}`} placeholder="Caption" value={a.caption} onChange={e => setAdds(adds.map((x, j) => j === i ? { ...x, caption: e.target.value } : x))} /></div>)}</div>
        <Field label="Reason for the correction" required><input type="text" value={f.reason} onChange={e => setF({ ...f, reason: e.target.value })} /></Field>
        <ErrorBox err={error} /></div>
    </Dialog>
  )
}

function AttachmentViewer({ list, start, onClose }: { list: R[]; start: number; onClose: () => void }) {
  const [i, setI] = useState(start); const a = list[i]
  return <Dialog title={`${a.kind === 'video' ? 'Video' : a.kind === 'photo' ? 'Photo' : 'Document'} ${i + 1} of ${list.length}`} onClose={onClose} footer={<><button className="btn" disabled={i === 0} onClick={() => setI(i - 1)}>Previous</button><button className="btn" disabled={i === list.length - 1} onClick={() => setI(i + 1)}>Next</button><button className="btn" onClick={onClose}>Close</button></>}>
    <div className="placeholder-img lg" style={{ width: '100%', height: 220 }} role="img" aria-label={`Placeholder for ${a.name}`}>Media not stored in this prototype</div><p className="strong mt-8">{a.caption || 'No caption'}</p><p className="small muted">{a.name} · uploaded {fmtTs(a.uploaded_at)} by {a.uploaded_by}</p></Dialog>
}

function VisitsTab({ v }: { v: R }) {
  const { state: s } = useSnap()
  const st = s!
  const [q, setQ] = useSearchParams()
  const [rec, setRec] = useState<null | { draft?: R }>(null)
  const [edit, setEdit] = useState(false)
  const [viewer, setViewer] = useState<number | null>(null)
  const [review, setReview] = useState(false)
  const [unit, setUnit] = useState('all')
  const [term, setTerm] = useState('')
  const visits = (Object.values(st.visits) as R[]).filter(x => x.vendor_id === v.id)
  const pub = visits.filter(x => x.state === 'published' && (unit === 'all' || x.factory_id === unit) && (!term || (x.observations + x.attachments.map((a: R) => a.caption).join(' ')).toLowerCase().includes(term.toLowerCase()))).sort((a, b) => b.date.localeCompare(a.date))
  const drafts = visits.filter(x => x.state === 'draft')
  const selId = q.get('visit'); const sel = selId ? st.visits[selId] : null
  const unitName = (x: R) => x.factory_id ? st.factories[x.factory_id].name : 'Unit not confirmed'
  const open = (id: string | null) => { const n = new URLSearchParams(q); id ? n.set('visit', id) : n.delete('visit'); setQ(n) }
  if (sel && sel.vendor_id === v.id) return (
    <div className="col gap-16">
      <div className="crumbs"><button className="link" onClick={() => open(null)}>All visits</button><span>/</span><strong>{fmtDate(sel.date, true)} · {unitName(sel)}</strong></div>
      <section className="panel pad"><div className="row wrap"><h2 className="grow">Visit on {fmtDate(sel.date, true)}</h2>{sel.state === 'draft' ? <Badge tone="attention">Draft: visible only to you</Badge> : <Badge tone="success">Published</Badge>}{sel.state === 'published' && <button className="btn small" onClick={() => setEdit(true)}>Edit</button>}{sel.state === 'draft' && <button className="btn small primary" onClick={() => setRec({ draft: sel })}>Continue draft</button>}</div>
        <dl className="kv mt-8"><dt>Factory / unit</dt><dd>{unitName(sel)}</dd><dt>Visited by</dt><dd>{sel.attendees.length ? sel.attendees.map((a: string) => personLabel(st, a)).join('; ') : 'Not recorded'}</dd><dt>Recorded</dt><dd>{fmtTs(sel.created_at)} <span className="muted">(visit date and record time are separate)</span></dd>{sel.audit_id && <><dt>Related audit</dt><dd><Link to={`/vendors/${v.id}/audits?audit=${sel.audit_id}`}>{fmtDate(st.audits[sel.audit_id].date, true)} assessment</Link></dd></>}</dl>
        <h3 className="mt-16">Observations</h3><p className="mt-8" style={{ whiteSpace: 'pre-wrap' }}>{sel.observations || <span className="muted">None. This visit records media only.</span>}</p>
        <h3 className="mt-16 mb-8">Attachments</h3>{sel.attachments.length === 0 ? <div className="muted">No attachments.</div> : <ul className="list">{sel.attachments.map((a: R, i: number) => <li key={a.id} className="row" style={{ padding: '8px 0' }}><Placeholder label={a.kind} /><div className="grow"><button className="link strong" onClick={() => setViewer(i)}>{a.caption || a.name}</button><div className="small muted">{a.name} · uploaded {fmtTs(a.uploaded_at)}</div></div></li>)}</ul>}
        <h3 className="mt-16 mb-8">Follow-ups</h3>{sel.followups.length === 0 ? <div className="muted">None.</div> : <ul className="list">{sel.followups.map((f: R) => { const a = st.actions[f.action_id]; return a ? <li key={f.id} style={{ padding: '6px 0' }}><Link to={`/my-work?open=${a.id}`}>{a.title}</Link> <span className="muted small">· {personLabel(st, a.assignee_id)} · {a.status} · {a.due ? `due ${fmtDate(a.due)}` : 'no date'}</span></li> : null })}</ul>}
        <h3 className="mt-16 mb-8">Edit history</h3>{sel.history.length === 0 ? <div className="muted">No corrections have been made to this visit.</div> : <ul className="list">{[...sel.history].reverse().map((h: R) => <li key={h.id} style={{ padding: '6px 0' }}><div className="small muted">{fmtTs(h.ts)} · {personLabel(st, h.editor_id)} · {h.reason}</div>{h.changes.map((c: R, i: number) => <div key={i} className="small">{c.field}: <s>{String(c.old).slice(0, 80)}</s> → {String(c.new).slice(0, 80)}</div>)}</li>)}</ul>}
      </section>
      {edit && <EditVisit vis={sel} onClose={() => setEdit(false)} />}{viewer !== null && <AttachmentViewer list={sel.attachments} start={viewer} onClose={() => setViewer(null)} />}
      {rec && <VisitForm v={v} draft={rec.draft} onClose={() => setRec(null)} afterPublish={() => setReview(true)} />}{review && <ReviewProfile vendorId={v.id} onClose={() => setReview(false)} />}
    </div>)
  return (
    <div className="col gap-16">
      <div className="row wrap"><h2 className="grow">Visits</h2></div>
      {drafts.length > 0 && <section className="panel pad"><h3>Drafts <span className="muted" style={{ fontWeight: 400 }}>(not counted in the latest visit or profile evidence)</span></h3><ul className="list">{drafts.map(d => <li key={d.id} className="row"><span className="grow">{fmtDate(d.date)} · {unitName(d)} · {d.observations.slice(0, 80) || 'No notes yet'}</span><button className="btn small" onClick={() => setRec({ draft: d })}>Continue draft</button></li>)}</ul></section>}
      <section className="panel"><div className="toolbar"><select aria-label="Factory" value={unit} onChange={e => setUnit(e.target.value)}><option value="all">All units</option>{v.factories.map((f: string) => <option key={f} value={f}>{st.factories[f].name}</option>)}</select><input className="search" type="search" aria-label="Search visits" placeholder="Search notes and captions…" value={term} onChange={e => setTerm(e.target.value)} /></div>
        {pub.length === 0 ? <Empty title="No published visits">{visits.length === 0 ? 'Record the first visit. This does not mean nobody has ever visited.' : 'No visits match.'}</Empty> : <ul className="list">{pub.map(x => (
          <li key={x.id} style={{ padding: 0 }}><button className="item-btn" style={{ padding: '12px 16px' }} onClick={() => open(x.id)}><div className="row wrap"><strong>{fmtDate(x.date, true)}</strong><Badge>{unitName(x)}</Badge>{x.history.length > 0 && <Badge tone="info">Edited</Badge>}<span className="small muted">{x.attendees.length ? x.attendees.map((a: string) => st.users[a].role).join(', ') : 'Attendees not recorded'}</span></div>
            <div className="small mt-8">{x.observations.slice(0, 200)}{x.observations.length > 200 && '…'}</div>
            <div className="small muted mt-8">{plural(x.attachments.length, 'attachment')}{x.attachments[0]?.caption && ` · “${x.attachments[0].caption}”`} · {x.followups.length ? `${x.followups.length} follow-up(s)` : 'no follow-ups'}</div></button></li>))}</ul>}</section>
      {rec && <VisitForm v={v} draft={rec.draft} onClose={() => setRec(null)} afterPublish={n => n > 0 && setReview(true)} />}{review && <ReviewProfile vendorId={v.id} onClose={() => setReview(false)} />}
    </div>
  )
}

/* ---------- audits ---------- */
const FST: Record<string, [string, string]> = { open: ['Open', 'attention'], awaiting_verification: ['Awaiting verification', 'info'], verified_closed: ['Verified closed', 'success'], reopened: ['Reopened', 'error'] }

function AuditDialog({ v, onClose, reassessOf }: { v: R; onClose: () => void; reassessOf?: R }) {
  const { state: s } = useSnap()
  const st = s!
  const [f, setF] = useState({ factory_id: reassessOf?.factory_id || (v.factories.length === 1 ? v.factories[0] : ''), unit_unconfirmed: false, date: TODAY, auditor: '', scope: reassessOf ? `Reassessment of ${fmtDate(reassessOf.date)} audit` : '', outcome: '', report: '', critical: '', major: '', minor: '', requires_reaudit: false, visit_id: '' })
  const { submit, busy, error } = useSubmit('record_audit')
  return (
    <Dialog title={reassessOf ? 'Record reassessment (new linked audit)' : 'Record audit'} onClose={onClose} wide footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy || !f.auditor.trim() || !f.scope.trim()} onClick={async () => { const r = await submit({ vendor_id: v.id, factory_id: f.factory_id || null, unit_unconfirmed: !f.factory_id, date: f.date, auditor: f.auditor, scope: f.scope, outcome: f.outcome, outcome_state: f.outcome ? 'recorded' : 'not_recorded', report: f.report || null, reported_totals: f.critical || f.major || f.minor ? { critical: Number(f.critical || 0), major: Number(f.major || 0), minor: Number(f.minor || 0) } : null, requires_reaudit: f.requires_reaudit, visit_id: f.visit_id || null, reassessment_of: reassessOf?.id }); if (r) { toast('Audit recorded. Findings capture is marked incomplete until reviewed.'); onClose() } }}>Record audit</button></>}>
      <div className="col gap-12"><p className="hint">Record the outcome exactly as written in the report. Leave blank if it has not been entered or reviewed: it will show “Outcome not recorded”, never “Approved”. You can save the report before transcribing all findings.</p>
        <div className="form-grid"><Field label="Assessed unit" required><select value={f.factory_id} onChange={e => setF({ ...f, factory_id: e.target.value })}><option value="">Unit not confirmed</option>{v.factories.map((x: string) => <option key={x} value={x}>{st.factories[x].name}</option>)}</select></Field><Field label="Audit date" required><input type="date" max={TODAY} value={f.date} onChange={e => setF({ ...f, date: e.target.value })} /></Field><Field label="Auditor" required><input type="text" value={f.auditor} onChange={e => setF({ ...f, auditor: e.target.value })} /></Field></div>
        <Field label="Scope and exclusions" required><input type="text" value={f.scope} onChange={e => setF({ ...f, scope: e.target.value })} /></Field>
        <Field label="Outcome as written (optional)"><input type="text" value={f.outcome} onChange={e => setF({ ...f, outcome: e.target.value })} placeholder="e.g. Grade C: corrective actions required" /></Field>
        <div className="form-grid"><Field label="Report (file name or reference)"><input type="text" value={f.report} onChange={e => setF({ ...f, report: e.target.value })} /></Field><Field label="Reported critical"><input type="number" value={f.critical} onChange={e => setF({ ...f, critical: e.target.value })} /></Field><Field label="Reported major"><input type="number" value={f.major} onChange={e => setF({ ...f, major: e.target.value })} /></Field><Field label="Reported minor"><input type="number" value={f.minor} onChange={e => setF({ ...f, minor: e.target.value })} /></Field></div>
        <label className="row"><input type="checkbox" checked={f.requires_reaudit} onChange={e => setF({ ...f, requires_reaudit: e.target.checked })} /> The report requires a re-audit before closure can be verified</label>
        <ErrorBox err={error} /></div>
    </Dialog>
  )
}

function FindingDialog({ audit, onClose }: { audit: R; onClose: () => void }) {
  const [f, setF] = useState({ section: '', checkpoint: '', description: '', severity: 'Critical', corrective_action: '', vendor_responsible: '', internal_owner_id: '', target: '', create_action: true })
  const { submit, busy, error } = useSubmit('add_finding')
  return (
    <Dialog title="Add finding" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy || !f.section.trim() || !f.description.trim() || !f.corrective_action.trim()} onClick={async () => { if (await submit({ audit_id: audit.id, ...f, internal_owner_id: f.internal_owner_id || null })) { toast('Finding added.'); onClose() } }}>Add finding</button></>}>
      <div className="col gap-12"><div className="form-grid"><Field label="Section" required><input type="text" value={f.section} onChange={e => setF({ ...f, section: e.target.value })} /></Field><Field label="Checkpoint"><input type="text" value={f.checkpoint} onChange={e => setF({ ...f, checkpoint: e.target.value })} /></Field><Field label="Severity (as recorded in the report)" required><input type="text" value={f.severity} onChange={e => setF({ ...f, severity: e.target.value })} /></Field></div>
        <Field label="Finding" required><textarea value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></Field><Field label="Required corrective action" required><textarea value={f.corrective_action} onChange={e => setF({ ...f, corrective_action: e.target.value })} /></Field>
        <div className="form-grid"><Field label="Vendor responsible person"><input type="text" value={f.vendor_responsible} onChange={e => setF({ ...f, vendor_responsible: e.target.value })} /></Field><Field label="Internal follow-up owner"><select value={f.internal_owner_id} onChange={e => setF({ ...f, internal_owner_id: e.target.value })}><option value="">Not assigned</option>{['u_head', 'u_merch1', 'u_merch2', 'u_qa'].map(u => <option key={u} value={u}>John Doe · {({ u_head: 'Sourcing head', u_merch1: 'Merchandiser (Argo Navis)', u_merch2: 'Merchandiser (V-Mart, Jaal)', u_qa: 'QA lead' } as R)[u]}</option>)}</select></Field><Field label="Target (as written)"><input type="text" value={f.target} onChange={e => setF({ ...f, target: e.target.value })} placeholder="e.g. Within 30 days of report" /></Field></div>
        <label className="row"><input type="checkbox" checked={f.create_action} onChange={e => setF({ ...f, create_action: e.target.checked })} /> Create a corrective-action task for the internal owner (appears in My Work)</label><ErrorBox err={error} /></div>
    </Dialog>
  )
}

function FindingPanel({ f }: { f: R }) {
  const { state: s } = useSnap()
  const st = s!
  const me = st.users[st.me]
  const [mode, setMode] = useState<null | 'submit' | 'verify' | 'more' | 'reopen'>(null)
  const [note, setNote] = useState(''); const [files, setFiles] = useState(''); const [exist, setExist] = useState('')
  const sub = useSubmit('submit_closure'); const ver = useSubmit('verify_closure'); const reo = useSubmit('reopen_finding')
  const audit = st.audits[f.audit_id]
  const [state, tone] = FST[f.state]
  const act = f.action_id ? st.actions[f.action_id] : null
  const reaudits = (Object.values(st.audits) as R[]).filter(a => a.reassessment_of === audit.id)
  return (
    <div className="panel pad sel" style={{ borderColor: 'var(--teal)' }} id={`finding-${f.id}`}>
      <div className="row wrap"><h3 className="grow">{f.section} {f.checkpoint && `(${f.checkpoint})`}</h3><Badge>{f.severity} (as recorded)</Badge><Badge tone={tone}>{state}</Badge></div>
      <p className="mt-8">{f.description}</p>
      <dl className="kv mt-8"><dt>Corrective action</dt><dd>{f.corrective_action}</dd><dt>Vendor responsible</dt><dd>{f.vendor_responsible}</dd><dt>Internal owner</dt><dd>{f.internal_owner_id ? <Person id={f.internal_owner_id} /> : 'Not assigned'}</dd><dt>Target</dt><dd>{f.target}{f.target_date && <span className="muted"> (derived {fmtDate(f.target_date)} from the report date; original wording kept)</span>}</dd>
        <dt>Corrective task</dt><dd>{act ? <><Link to={`/my-work?open=${act.id}`}>{act.title}</Link> · {act.status}{isOverdue(act) && ' · overdue'} <span className="muted">(task status is separate from finding state)</span></> : 'No task linked'}</dd>
        {f.requires_reaudit && <><dt>Re-audit</dt><dd><Badge tone="attention">Required</Badge> {reaudits.length ? `Reassessment recorded ${fmtDate(reaudits[0].date)}` : 'Not yet recorded. Evidence alone cannot bypass it.'}</dd></>}</dl>
      {f.submissions.length > 0 && <><h4 className="mt-16 mb-8" style={{ fontSize: 13 }}>Closure submissions</h4><ul className="list">{f.submissions.map((x: R) => <li key={x.id} style={{ padding: '6px 0' }}><div className="small muted">{fmtTs(x.ts)} · {personLabel(st, x.by)}</div><div>{x.note}</div><div className="small muted">Evidence: {x.attachments.map((a: R) => a.name).join(', ') || x.existing_evidence}</div>{x.response && <div className="small" style={{ marginTop: 4 }}><strong>{x.response.decision === 'verified' ? 'Verified' : 'More evidence requested'}</strong> by {personLabel(st, x.response.by)} · {fmtTs(x.response.at)}: {x.response.note}</div>}</li>)}</ul></>}
      {f.history.length > 0 && <div className="small muted mt-8">Earlier closure retained: {f.history.map((h: R) => `reopened ${fmtTs(h.reopened_at)}: ${h.reason}`).join('; ')}</div>}
      {f.verified && <div className="alert success mt-8">Verified closed by {personLabel(st, f.verified.by)} · {fmtTs(f.verified.at)}: {f.verified.note}. The audit’s recorded outcome (“{audit.outcome}”) is unchanged.</div>}
      <div className="row wrap mt-16">
        {['open', 'reopened'].includes(f.state) && me.caps.includes('edit') && <button className="btn small" onClick={() => setMode('submit')}>Submit closure evidence</button>}
        {f.state === 'awaiting_verification' && me.caps.includes('verify_closure') && <><button className="btn small primary" onClick={() => setMode('verify')}>Verify closure</button><button className="btn small" onClick={() => setMode('more')}>Request more evidence</button></>}
        {f.state === 'awaiting_verification' && !me.caps.includes('verify_closure') && <span className="small muted">Waiting for an authorised verifier (demo permission).</span>}
        {f.state === 'verified_closed' && me.caps.includes('reopen') && <button className="btn small" onClick={() => setMode('reopen')}>Reopen finding</button>}
      </div>
      {mode === 'submit' && <div className="inline-form"><Field label="Correction note" required><textarea value={note} onChange={e => setNote(e.target.value)} /></Field><Field label="Supporting attachment (file name)"><input type="text" value={files} onChange={e => setFiles(e.target.value)} placeholder="e.g. needle-log.pdf (names only; nothing is uploaded)" /></Field><Field label="…or reference to existing evidence"><input type="text" value={exist} onChange={e => setExist(e.target.value)} /></Field><ErrorBox err={sub.error} /><div className="row"><button className="btn primary small" disabled={sub.busy || !note.trim()} onClick={async () => { if (await sub.submit({ finding_id: f.id, note, attachments: files.trim() ? [{ name: files }] : [], existing_evidence: exist || null })) { toast('Closure evidence submitted. It is not verified yet.'); setMode(null); setNote(''); setFiles('') } }}>Submit</button><button className="btn small" onClick={() => setMode(null)}>Cancel</button></div></div>}
      {(mode === 'verify' || mode === 'more') && <div className="inline-form"><Field label={mode === 'verify' ? 'Verification note' : 'What more is needed?'} required><textarea value={note} onChange={e => setNote(e.target.value)} /></Field>{ver.error?.code === 'reaudit_required' ? <div className="alert warn" role="alert">{ver.error.message}</div> : <ErrorBox err={ver.error} />}<div className="row"><button className="btn primary small" disabled={ver.busy || !note.trim()} onClick={async () => { if (await ver.submit({ finding_id: f.id, decision: mode === 'verify' ? 'verify' : 'more_evidence', note })) { toast(mode === 'verify' ? 'Closure verified.' : 'More evidence requested.'); setMode(null); setNote('') } }}>{mode === 'verify' ? 'Verify closure' : 'Request more evidence'}</button><button className="btn small" onClick={() => setMode(null)}>Cancel</button></div></div>}
      {mode === 'reopen' && <div className="inline-form"><Field label="Reason for reopening (same finding ID)" required><input type="text" value={note} onChange={e => setNote(e.target.value)} /></Field><ErrorBox err={reo.error} /><div className="row"><button className="btn primary small" disabled={reo.busy || !note.trim()} onClick={async () => { if (await reo.submit({ finding_id: f.id, reason: note })) { toast('Finding reopened; the earlier closure stays in history.'); setMode(null); setNote('') } }}>Reopen</button><button className="btn small" onClick={() => setMode(null)}>Cancel</button></div></div>}
    </div>
  )
}

function AuditsTab({ v }: { v: R }) {
  const { state: s } = useSnap()
  const st = s!
  const [q, setQ] = useSearchParams()
  const [dlg, setDlg] = useState<null | { reassess?: R }>(null)
  const [addF, setAddF] = useState<R | null>(null)
  const cap = useSubmit('mark_capture_complete')
  const audits = (Object.values(st.audits) as R[]).filter(a => a.vendor_id === v.id).sort((a, b) => b.date.localeCompare(a.date))
  const selA = q.get('audit') || (q.get('finding') ? st.findings[q.get('finding')!]?.audit_id : null)
  const audit = selA ? st.audits[selA] : null
  const canEdit = (st.users[st.me].caps as string[]).includes('edit')
  const open = (id: string | null) => { const n = new URLSearchParams(); if (id) n.set('audit', id); setQ(n) }
  if (audit) {
    const fs = (Object.values(st.findings) as R[]).filter(f => f.audit_id === audit.id)
    const sf = q.get('finding')
    const rt = audit.reported_totals
    return (
      <div className="col gap-16">
        <div className="crumbs"><button className="link" onClick={() => open(null)}>All audits</button><span>/</span><strong>{fmtDate(audit.date, true)} · {audit.factory_id ? st.factories[audit.factory_id].name : 'Unit not confirmed'}</strong></div>
        <section className="panel pad"><div className="row wrap"><h2 className="grow">{audit.type}</h2>{audit.reassessment_of && <Badge tone="info">Reassessment of {fmtDate(st.audits[audit.reassessment_of]?.date)}</Badge>}</div>
          <dl className="kv mt-8"><dt>Unit</dt><dd>{audit.factory_id ? st.factories[audit.factory_id].name : 'Unit not confirmed'}</dd><dt>Audit date</dt><dd>{fmtDate(audit.date, true)} <span className="muted">· report {audit.report_date ? fmtDate(audit.report_date) : 'date not recorded'} · uploaded {fmtTs(audit.uploaded_at)}</span></dd><dt>Auditor</dt><dd>{audit.auditor}</dd><dt>Scope</dt><dd>{audit.scope}</dd>
            <dt>Recorded outcome</dt><dd>{audit.outcome ? <><strong>{audit.outcome}</strong> <span className="muted">(as written; not recalculated)</span></> : <Badge tone="attention">{audit.outcome_state === 'pending_review' ? 'Pending review' : 'Outcome not recorded'}</Badge>}</dd>
            <dt>Original report</dt><dd>{audit.report ? <>{audit.report} <span className="muted small">(no file stored in this prototype)</span></> : 'Not attached'}</dd>
            {audit.not_assessed?.length > 0 && <><dt>Not assessed</dt><dd>{audit.not_assessed.join(', ')} <span className="muted">(not the same as failed)</span></dd></>}{audit.na?.length > 0 && <><dt>Not applicable</dt><dd>{audit.na.join(', ')}</dd></>}
            {audit.visit_id && <><dt>Linked visit</dt><dd><Link to={`/vendors/${v.id}/visits?visit=${audit.visit_id}`}>Open visit</Link></dd></>}</dl>
          <div className={`alert ${audit.capture_complete ? 'success' : 'warn'} mt-8`} role="status">{audit.capture_complete ? 'Findings capture marked complete after review.' : <>Findings capture incomplete. {rt ? `Report states ${rt.critical} critical, ${rt.major} major, ${rt.minor} minor; ` : 'Reported totals not recorded; '}{fs.length} finding(s) transcribed so far. A short list does not mean fewer findings.</>} {canEdit && !audit.capture_complete && <button className="btn small" disabled={cap.busy} onClick={async () => { if (window.confirm('Mark findings capture complete? Only do this after checking the list against the original report.')) { await cap.submit({ audit_id: audit.id }) } }}>Mark capture complete</button>}</div>
          <div className="row wrap mt-8">{canEdit && <button className="btn small" onClick={() => setAddF(audit)}>+ Add finding</button>}{canEdit && <button className="btn small" onClick={() => setDlg({ reassess: audit })}>Record reassessment</button>}</div>
          <p className="hint mt-8">Closing findings never approves the factory or rewrites this audit; a reassessment is a new, linked assessment.</p></section>
        <section className="col"><h2>Findings</h2>{fs.length === 0 && <Empty title="No findings transcribed yet">This does not mean there were none.</Empty>}
          {fs.map(f => sf === f.id ? <FindingPanel key={f.id} f={f} /> : (
            <button key={f.id} className="panel pad item-btn" style={{ padding: 14 }} onClick={() => { const n = new URLSearchParams(q); n.set('finding', f.id); setQ(n) }}><div className="row wrap"><strong className="grow">{f.section}: {f.description.slice(0, 90)}</strong><Badge>{f.severity}</Badge><Badge tone={FST[f.state][1]}>{FST[f.state][0]}</Badge></div><div className="small muted">Owner {f.internal_owner_id ? personLabel(st, f.internal_owner_id) : 'not assigned'} · Target: {f.target}</div></button>))}</section>
        {addF && <FindingDialog audit={addF} onClose={() => setAddF(null)} />}{dlg && <AuditDialog v={v} reassessOf={dlg.reassess} onClose={() => setDlg(null)} />}
      </div>)
  }
  return (
    <div className="col gap-16"><div className="row wrap"><h2 className="grow">Audits</h2>{canEdit && <button className="btn primary" onClick={() => setDlg({})}>+ Record audit</button>}</div>
      <section className="panel">{audits.length === 0 ? <Empty title="No assessment on file">This does not mean the factory is approved or rejected.</Empty> : (
        <div className="table-wrap"><table className="t"><thead><tr><th>Date</th><th>Unit</th><th>Auditor · type</th><th>Recorded outcome</th><th>Report</th><th>Findings</th></tr></thead><tbody>
          {audits.map(a => { const fs = (Object.values(st.findings) as R[]).filter(f => f.audit_id === a.id); const openN = fs.filter(f => f.state !== 'verified_closed').length; return (
            <tr key={a.id} className="clickable" onClick={() => open(a.id)}><td><button className="link strong" onClick={e => { e.stopPropagation(); open(a.id) }}>{fmtDate(a.date, true)}</button></td><td>{a.factory_id ? st.factories[a.factory_id].name : 'Unit not confirmed'}</td><td className="small">{a.auditor}<div className="muted">{a.type}</div></td>
              <td>{a.outcome || <Badge tone="attention">{a.outcome_state === 'pending_review' ? 'Pending review' : 'Outcome not recorded'}</Badge>}</td><td className="small">{a.report || 'Not attached'}</td>
              <td className="small">{fs.length} captured{a.reported_totals && ` of ${a.reported_totals.critical + a.reported_totals.major + a.reported_totals.minor} reported`}{!a.capture_complete && <div style={{ color: 'var(--attention)' }}>capture incomplete</div>}{openN > 0 && <div><Badge tone="attention">{openN} not closed</Badge></div>}</td></tr>) })}</tbody></table></div>)}</section>
      {dlg && <AuditDialog v={v} onClose={() => setDlg(null)} />}</div>
  )
}

function StylesOrdersTab({ v }: { v: R }) {
  const { state: s } = useSnap()
  const st = s!
  const [brand, setBrand] = useState('all')
  const rows = (st.derived.vendors[v.id].work as R[]).filter(r => brand === 'all' || st.styles[r.style_id].brand_id === brand)
  return (
    <div className="col gap-16"><div className="row wrap"><h2 className="grow">Styles &amp; Orders</h2><select aria-label="Brand" style={{ width: 'auto' }} value={brand} onChange={e => setBrand(e.target.value)}><option value="all">All brands</option>{(Object.values(st.brands) as R[]).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
      {rows.length === 0 ? <Empty title="No platform work is linked to this vendor">This does not mean there was no historical business with them.</Empty> : (
        <section className="panel"><div className="table-wrap"><table className="t"><thead><tr><th>Style</th><th>Brand</th><th>Relationship</th><th>Stage</th><th>Order / allocation</th><th>Next action</th></tr></thead><tbody>
          {rows.map(r => { const sty = st.styles[r.style_id]; return (<tr key={r.style_id}><td><div className="row"><Placeholder /><div><Link to={`/styles/${sty.id}/overview`} className="strong">{sty.name}</Link><div className="small muted">{sty.id}</div></div></div></td><td className="small">{st.brands[sty.brand_id].name}</td>
            <td className="small">{r.roles.map((x: string) => <div key={x}><Badge tone={x.startsWith('Production') ? 'success' : ''}>{x}</Badge></div>)}</td><td className="small">{r.stage}</td>
            <td className="small">{r.order_id ? <><Link to={`/brands/${sty.brand_id}/orders?order=${r.order_id}`}>{st.orders[r.order_id].ref}</Link><div><Link to={`/styles/${sty.id}/production?alloc=${r.allocation_id}`}>Open allocation / inspections</Link></div></> : <span className="muted">None: a quote or sample is not an allocation</span>}</td>
            <td className="small">{r.next_action ? <>{r.next_action.title}<div className="muted">{personLabel(st, r.next_action.assignee_id)} · {r.next_action.due ? `due ${fmtDate(r.next_action.due)}` : 'no date'}</div></> : <span className="muted">None</span>}</td></tr>) })}</tbody></table></div></section>)}
      <p className="hint">Production inspections (inline, final, AQL) are recorded per order and lot under Styles → Production; they are not copied into factory audits.</p></div>
  )
}

function VendorPage() {
  const { vendorId, tab = 'overview' } = useParams()
  const { state: s } = useSnap()
  const st = s!
  const nav = useNavigate()
  const [q, setQ] = useSearchParams()
  const [edit, setEdit] = useState(false)
  const [rec, setRec] = useState(false)
  const v = st.vendors[vendorId!]
  const actionId = q.get('action')
  if (!v) return <div className="page-body"><Empty title="Vendor not found"><Link to="/vendors">Back to Vendors</Link></Empty></div>
  const units = v.factories.map((f: string) => st.factories[f].name)
  return (
    <>
      <PageHead title={v.name} crumbs={<><Link to="/vendors">Vendors</Link><span>/</span><span>{v.name}</span></>}
        sub={<>{v.location || 'Location unknown'}{units.length > 0 && ` · ${units.join(', ')}`} · Relationship owner: {v.owner_id ? <Person id={v.owner_id} /> : 'Not recorded'}</>}
        actions={<><button className="btn" onClick={() => setEdit(true)}>Edit profile</button><button className="btn primary" onClick={() => setRec(true)}>+ Record visit</button></>}>
        <Tabs label="Vendor sections" value={tab} onChange={t => nav(`/vendors/${v.id}/${t}`)} tabs={[{ id: 'overview', label: 'Overview' }, { id: 'visits', label: 'Visits' }, { id: 'audits', label: 'Audits' }, { id: 'styles', label: 'Styles & Orders' }]} />
      </PageHead>
      <div className="page-body">
        {tab === 'overview' && <VendorOverview v={v} />}{tab === 'visits' && <VisitsTab v={v} />}{tab === 'audits' && <AuditsTab v={v} />}{tab === 'styles' && <StylesOrdersTab v={v} />}
      </div>
      {actionId && st.actions[actionId] && <Drawer title="Action details" onClose={() => { const n = new URLSearchParams(q); n.delete('action'); setQ(n) }}><FocusDetail workId={st.actions[actionId].work_id} mode="panel" focus={{ actionId }} /></Drawer>}
      {edit && <EditProfile v={v} onClose={() => setEdit(false)} />}
      {rec && <VisitForm v={v} onClose={() => setRec(false)} afterPublish={() => {}} />}
    </>
  )
}

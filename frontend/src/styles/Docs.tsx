import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast, useSnap, type R } from '../store'
import { Badge, Dialog, ErrorBox, Field, PersonPicker, useSubmit } from '../ui'
import { fmtDate, personLabel } from '../util'

export function LockNotice({ locks }: { locks: R[] }) {
  if (!locks.length) return null
  return <div className="alert warn" role="status"><strong>Controlled fields are locked.</strong> Active requests: {locks.map(l => `${l.id} (${l.kind})`).join(', ')}. Operational updates, sample measurements, comments and evidence stay possible; completing one request does not unlock fields still protected by another.</div>
}

function useStyle(id: string) {
  const { state: s } = useSnap()
  const st = s!
  return { st, style: st.styles[id] as R, d: st.derived.styles[id] as R }
}

const TP_LABELS: Record<string, string> = { construction: 'Construction details', stitching: 'Stitching and seams', artwork: 'Artwork and placement', labels: 'Labels', care: 'Care information', packing: 'Packing requirements' }
const TP_STATE: Record<string, [string, string]> = { not_started: ['Not reviewed yet', ''], in_review: ['Review in progress (draft)', 'info'], approved: ['Signed off', 'success'], changes_requested: ['Changes requested', 'attention'], stale: ['Content changed after sign-off: re-review needed', 'attention'] }
const CHECKS: [string, string][] = [['complete', 'Tech pack is complete (flats, construction, BOM, measurements)'], ['prior', 'Previous comments are addressed'], ['feasible', 'Construction is feasible at the intended vendors'], ['queries', 'No unresolved queries'], ['attachments', 'Required attachments are present']]

export function TechPackDialog({ styleId, onClose, initialTab = 'contents' }: { styleId: string; onClose: () => void; initialTab?: 'contents' | 'review' | 'versions' }) {
  const { st, style, d } = useStyle(styleId)
  const caps = st.users[st.me].caps as string[]
  const canEdit = caps.includes('edit'); const canReview = caps.includes('technical_review')
  const [tab, setTab] = useState(initialTab)
  const [sec, setSec] = useState<Record<string, string>>({ ...style.techpack_content })
  const [reason, setReason] = useState(''); const [changed, setChanged] = useState('')
  const rv = style.techpack_review
  const [checks, setChecks] = useState<Record<string, { state: string; note: string }>>(Object.fromEntries(CHECKS.map(([k]) => { const c = (rv.checklist || []).find((x: R) => x.key === k); return [k, { state: c?.state || '', note: c?.note || '' }] })))
  const [note, setNote] = useState(rv.note || '')
  const rel = useSubmit('release_spec'); const save = useSubmit('save_techpack_content'); const review = useSubmit('review_techpack')
  const dirty = JSON.stringify(sec) !== JSON.stringify(style.techpack_content)
  const hasContent = Object.values(style.techpack_content as Record<string, string>).some(v => v.trim())
  const locked = d.locks.length > 0 && hasContent
  const empty = Object.keys(TP_LABELS).filter(k => !(style.techpack_content[k] || '').trim())
  const prereq: [boolean, string][] = [[style.bom.items.length > 0, 'BOM recorded'], [style.pom.length > 0, 'Measurements (POM) recorded'], [empty.length === 0, 'All tech pack sections filled in']]
  const [rs, rt] = TP_STATE[rv.state] || TP_STATE.not_started
  const payload = (result: string) => ({ style_id: styleId, result, note, checklist: CHECKS.map(([k]) => ({ key: k, ...checks[k] })) })
  return (
    <Dialog title={`Tech pack: ${style.name}`} onClose={onClose} wide footer={<button className="btn" onClick={onClose}>Close</button>}>
      <div className="col gap-16">
        <div className="row wrap"><Badge tone={rt}>{rs}</Badge><span className="small muted">{rv.version ? `Reviewed against v${rv.version}` : 'No version reviewed yet'}{rv.by && ` · ${personLabel(st, rv.by)} · ${fmtDate(rv.at)}`}</span></div>
        <div className="row" role="tablist" aria-label="Tech pack sections">{([['contents', 'Contents'], ['review', 'Technical review'], ['versions', 'Versions']] as const).map(([k, l]) => <button key={k} role="tab" className="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>)}</div>
        <LockNotice locks={d.locks} />

        {tab === 'contents' && (
          <div className="col gap-12">
            <p className="hint">Flats, sketches and pattern files are not stored in this prototype; the written specification below is. BOM and measurements are edited from their own buttons in the style header.</p>
            <table className="t"><tbody>
              <tr><td className="strong">BOM</td><td>{style.bom.items.length ? `Version ${style.bom.version}, ${style.bom.items.length} items` : <span className="muted">Not recorded</span>}</td></tr>
              <tr><td className="strong">Measurements</td><td>{style.pom.length ? `${style.pom.length} points of measure` : <span className="muted">Not recorded</span>}</td></tr>
              <tr><td className="strong">Files</td><td>{style.files.length ? style.files.map((f: R) => f.name).join(', ') : <span className="muted">None linked</span>} <span className="muted small">(listed only)</span></td></tr></tbody></table>
            {Object.keys(TP_LABELS).map(k => <Field key={k} label={TP_LABELS[k]} required={false}><textarea value={sec[k] || ''} disabled={!canEdit || locked} onChange={e => setSec({ ...sec, [k]: e.target.value })} placeholder={canEdit ? 'Not filled in yet' : ''} /></Field>)}
            <ErrorBox err={save.error} />
            {canEdit ? <div className="row"><button className="btn primary" disabled={save.busy || !dirty || locked} onClick={async () => { const r = await save.submit({ style_id: styleId, sections: sec }); if (r) toast(r.stale ? 'Content saved. The earlier sign-off no longer covers it; it needs re-review.' : 'Tech pack content saved.') }}>{save.busy ? 'Saving…' : 'Save tech pack content'}</button>{dirty && <span className="small" style={{ color: 'var(--attention)' }}>Unsaved changes</span>}{locked && <span className="small muted">Locked while requests are active</span>}</div> : <p className="hint">You can read the tech pack; editing needs edit permission (demo role).</p>}
          </div>)}

        {tab === 'review' && (
          <div className="col gap-12">
            <p className="hint">This is the design/technical quick check before the pack goes to a vendor. Signing it off does <strong>not</strong> approve any sample and does not release production.</p>
            <div className="panel pad"><h3>Before sign-off</h3><ul style={{ margin: '6px 0 0 4px', padding: 0, listStyle: 'none' }}>{prereq.map(([ok, l]) => <li key={l}><span className={ok ? 'check-ok' : 'check-wait'}>{ok ? '✓' : '○'}</span> {l}{!ok && l.startsWith('All tech') && <span className="muted small"> (empty: {empty.map(k => TP_LABELS[k].toLowerCase()).join(', ')}) <button className="link" onClick={() => setTab('contents')}>Fill in</button></span>}</li>)}</ul></div>
            <h3>Design / technical checklist</h3>
            {CHECKS.map(([k, l]) => (
              <fieldset key={k} className="panel pad" style={{ margin: 0 }}><legend className="small strong" style={{ padding: '0 6px' }}>{l}</legend>
                <div className="row wrap">{[['ok', 'OK'], ['issue', 'Issue'], ['na', 'Not applicable']].map(([v, t]) => <label key={v} className="row"><input type="radio" name={`chk-${k}`} disabled={!canReview} checked={checks[k].state === v} onChange={() => setChecks({ ...checks, [k]: { ...checks[k], state: v } })} />{t}</label>)}
                  <input type="text" aria-label={`Note for: ${l}`} placeholder={checks[k].state === 'na' ? 'Reason required' : 'Note (what is the issue?)'} disabled={!canReview} style={{ flex: 1, minWidth: 200 }} value={checks[k].note} onChange={e => setChecks({ ...checks, [k]: { ...checks[k], note: e.target.value } })} /></div></fieldset>))}
            <Field label="Overall review note"><textarea value={note} disabled={!canReview} onChange={e => setNote(e.target.value)} /></Field>
            {review.error?.extra.problems ? <div className="alert error" role="alert"><strong>Cannot sign off yet:</strong><ul style={{ margin: '4px 0 0 18px' }}>{review.error.extra.problems.map((p: string) => <li key={p}>{p}</li>)}</ul></div> : <ErrorBox err={review.error} />}
            {canReview ? <div className="row wrap">
              <button className="btn" disabled={review.busy} onClick={async () => { if (await review.submit(payload('draft'))) toast('Review draft saved.') }}>Save review draft</button>
              <button className="btn" disabled={review.busy} onClick={async () => { if (await review.submit(payload('changes'))) toast('Changes requested. A follow-up task was created for the style owner.') }}>Request changes</button>
              <button className="btn primary" disabled={review.busy} onClick={async () => { if (await review.submit(payload('approve'))) toast('Tech pack signed off. This is not sample approval or production release.') }}>Sign off tech pack</button></div>
              : <p className="hint">Only a technical reviewer can sign off the tech pack (demo permission). It is waiting for review.</p>}
            {rv.history.length > 0 && <div><h3 className="mb-8">Review history</h3><ul className="list">{[...rv.history].reverse().map((h: R, i: number) => <li key={i} style={{ padding: '6px 0' }}><Badge tone={(TP_STATE[h.state] || TP_STATE.not_started)[1]}>{(TP_STATE[h.state] || TP_STATE.not_started)[0]}</Badge> <span className="small muted">v{h.version ?? '–'} · {personLabel(st, h.by)} · {fmtDate(h.at)}</span>{h.note && <div className="small">{h.note}</div>}</li>)}</ul></div>}
          </div>)}

        {tab === 'versions' && (
          <div className="col gap-12">
            {style.spec_versions.length === 0 ? <p className="muted">No tech pack version has been released yet. A BOM is mandatory before a specification can be released.</p> : (
              <table className="t"><thead><tr><th>Version</th><th>State</th><th>Date</th><th>Author</th><th>Reason and changes</th></tr></thead><tbody>
                {[...style.spec_versions].reverse().map((v: R) => <tr key={v.v}><td><strong>v{v.v}</strong></td><td><Badge tone={v.state === 'released' ? 'success' : ''}>{v.state}{v.frozen ? ' · frozen' : ''}</Badge></td><td>{fmtDate(v.date, true)}</td><td>{personLabel(st, v.author_id)}</td>
                  <td>{v.reason}{v.changed.length > 0 && <ul style={{ margin: '4px 0 0 18px', padding: 0 }}>{v.changed.map((c: string) => <li key={c}>{c}</li>)}</ul>}</td></tr>)}</tbody></table>)}
            <p className="hint">A newly uploaded or edited document is not released, frozen or approved. Requests keep the version snapshot they were issued with.</p>
            {canEdit && style.bom.items.length > 0 && (
              <div className="inline-form"><h3>Release a new version</h3>
                {d.locks.length > 0 ? <p className="small">Releasing is blocked while requests are active (see above).</p> : <>
                  <Field label="Reason for the change" required><input type="text" value={reason} onChange={e => setReason(e.target.value)} /></Field>
                  <Field label="What changed (one per line)"><textarea value={changed} onChange={e => setChanged(e.target.value)} placeholder="e.g. Body length +1 cm" /></Field>
                  <div className="hint">Affected quotes and allocations are flagged for review; commercial terms are not recalculated automatically.</div>
                  <ErrorBox err={rel.error} />
                  <div><button className="btn primary small" disabled={rel.busy || !reason.trim()} onClick={async () => { const r = await rel.submit({ style_id: styleId, reason, changed: changed.split('\n').map(x => x.trim()).filter(Boolean) }); if (r) { toast(`Specification v${r.version} released.${r.affected.length ? ' Flagged for review: ' + r.affected.join('; ') : ''}`); setReason(''); setChanged('') } }}>Release version</button></div></>}
              </div>)}
          </div>)}
      </div>
    </Dialog>
  )
}

export function BomDialog({ styleId, onClose }: { styleId: string; onClose: () => void }) {
  const { st, style, d } = useStyle(styleId)
  const [rows, setRows] = useState<{ kind: string; name: string; consumption: string; unit: string }[]>(style.bom.items.length ? style.bom.items.map((i: R) => ({ kind: i.kind, name: i.name, consumption: String(i.consumption), unit: i.unit })) : [{ kind: 'Fabric', name: '', consumption: '', unit: 'm/pc' }])
  const [edit, setEdit] = useState(style.bom.items.length === 0)
  const save = useSubmit('set_bom')
  const canEdit = (st.users[st.me].caps as string[]).includes('edit')
  const locked = d.locks.length > 0 && style.bom.items.length > 0
  return (
    <Dialog title={`BOM: ${style.name}`} onClose={onClose} wide footer={<button className="btn" onClick={onClose}>Close</button>}>
      <div className="col gap-12">
        <LockNotice locks={d.locks} />
        <div className="small muted">BOM version {style.bom.version}. Consumption is per piece; unknown is not zero.</div>
        {!edit ? (
          <table className="t"><thead><tr><th>Type</th><th>Item</th><th>Consumption</th></tr></thead><tbody>{style.bom.items.map((i: R) => <tr key={i.id}><td>{i.kind}</td><td>{i.name}</td><td>{i.consumption} {i.unit}</td></tr>)}</tbody></table>
        ) : (
          <div className="col">{rows.map((r, i) => (
            <div key={i} className="row wrap"><select aria-label="Type" style={{ width: 120 }} value={r.kind} onChange={e => setRows(rows.map((x, j) => j === i ? { ...x, kind: e.target.value } : x))}><option>Fabric</option><option>Trim</option><option>Packing</option><option>Material</option></select>
              <input type="text" aria-label="Item name" placeholder="Item" style={{ flex: 2, minWidth: 160 }} value={r.name} onChange={e => setRows(rows.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
              <input type="number" aria-label="Consumption" placeholder="Consumption" style={{ width: 120 }} value={r.consumption} onChange={e => setRows(rows.map((x, j) => j === i ? { ...x, consumption: e.target.value } : x))} />
              <input type="text" aria-label="Unit" placeholder="Unit" style={{ width: 90 }} value={r.unit} onChange={e => setRows(rows.map((x, j) => j === i ? { ...x, unit: e.target.value } : x))} />
              <button className="btn small" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label="Remove row">Remove</button></div>))}
            <div><button className="btn small" onClick={() => setRows([...rows, { kind: 'Trim', name: '', consumption: '', unit: 'pcs/pc' }])}>+ Add row</button></div>
            <ErrorBox err={save.error} />
            <div className="row"><button className="btn primary small" disabled={save.busy} onClick={async () => { if (await save.submit({ style_id: styleId, items: rows.filter(r => r.name.trim() || r.consumption).map(r => ({ ...r, consumption: r.consumption })) })) { toast('BOM saved.'); setEdit(false) } }}>{save.busy ? 'Saving…' : 'Save BOM'}</button>{style.bom.items.length > 0 && <button className="btn small" onClick={() => setEdit(false)}>Cancel</button>}</div></div>
        )}
        {!edit && canEdit && <div><button className="btn small" disabled={locked} onClick={() => setEdit(true)} title={locked ? 'Locked while requests are active' : ''}>Edit BOM{locked ? ' (locked)' : ''}</button></div>}
      </div>
    </Dialog>
  )
}

export function MeasurementsDialog({ styleId, onClose }: { styleId: string; onClose: () => void }) {
  const { st, style, d } = useStyle(styleId)
  const [edit, setEdit] = useState(style.pom.length === 0)
  const [rows, setRows] = useState<{ name: string; target: string; tol: string; unit: string }[]>(style.pom.length ? style.pom.map((p: R) => ({ name: p.name, target: String(p.target), tol: String(p.tol), unit: p.unit })) : [{ name: '', target: '', tol: '', unit: 'cm' }])
  const save = useSubmit('set_pom')
  const canEdit = (st.users[st.me].caps as string[]).includes('edit')
  const locked = d.locks.length > 0 && style.pom.length > 0
  return (
    <Dialog title={`Measurements (POM): ${style.name}`} onClose={onClose} wide footer={<button className="btn" onClick={onClose}>Close</button>}>
      <div className="col gap-12"><LockNotice locks={d.locks} />
        <div className="small muted">Targets and tolerances are the specification. Sample actuals are recorded on each sample round and never overwrite these targets.</div>
        {!edit ? <table className="t"><thead><tr><th>Point of measure</th><th>Base size</th><th>Target</th><th>Tolerance (±)</th></tr></thead><tbody>{style.pom.map((p: R) => <tr key={p.id}><td>{p.name}</td><td>{p.base_size}</td><td>{p.target} {p.unit}</td><td>{p.tol} {p.unit}</td></tr>)}</tbody></table> : (
          <div className="col">{rows.map((r, i) => <div key={i} className="row wrap"><input type="text" aria-label="Point of measure" placeholder="Point of measure" style={{ flex: 2, minWidth: 180 }} value={r.name} onChange={e => setRows(rows.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
            <input type="number" aria-label="Target" placeholder="Target" style={{ width: 100 }} value={r.target} onChange={e => setRows(rows.map((x, j) => j === i ? { ...x, target: e.target.value } : x))} />
            <input type="number" aria-label="Tolerance" placeholder="± Tol" style={{ width: 100 }} value={r.tol} onChange={e => setRows(rows.map((x, j) => j === i ? { ...x, tol: e.target.value } : x))} />
            <button className="btn small" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label="Remove row">Remove</button></div>)}
            <div><button className="btn small" onClick={() => setRows([...rows, { name: '', target: '', tol: '', unit: 'cm' }])}>+ Add point</button></div><ErrorBox err={save.error} />
            <div className="row"><button className="btn primary small" disabled={save.busy} onClick={async () => { if (await save.submit({ style_id: styleId, rows: rows.filter(r => r.name.trim()) })) { toast('Measurements saved.'); setEdit(false) } }}>Save measurements</button></div></div>)}
        <div className="muted small">Graded all-size specification: not recorded in this prototype (base size only).</div>
        {!edit && canEdit && <div><button className="btn small" disabled={locked} onClick={() => setEdit(true)}>Edit measurements{locked ? ' (locked)' : ''}</button></div>}
      </div>
    </Dialog>
  )
}

export function FilesDialog({ styleId, onClose }: { styleId: string; onClose: () => void }) {
  const { style } = useStyle(styleId)
  return (
    <Dialog title={`Files: ${style.name}`} onClose={onClose} footer={<button className="btn" onClick={onClose}>Close</button>}>
      {style.files.length === 0 ? <p className="muted">No files are linked to this style.</p> : <ul className="list">{style.files.map((f: R) => <li key={f.name}><strong>{f.name}</strong> <Badge>{f.kind}</Badge><div className="small muted">Listed only: this prototype has no file storage, so there is nothing to download.</div></li>)}</ul>}
    </Dialog>
  )
}

export function InfoDialog({ styleId, onClose }: { styleId: string; onClose: () => void }) {
  const { st, style, d } = useStyle(styleId)
  const nav = useNavigate()
  const [owner, setOwner] = useState(style.owner_id); const [why, setWhy] = useState('')
  const ow = useSubmit('set_style_owner')
  const R_ = d.readiness
  const labels: Record<string, string> = { sourcing_ready: 'Sourcing-ready', costing_ready: 'Costing ready', sampling_ready: 'Sampling ready', vendor_ready: 'Vendor ready', order_ready: 'Order ready' }
  const tabFor: Record<string, string> = { costing: 'costing', sampling: 'sampling' }
  return (
    <Dialog title={`Style information: ${style.name}`} onClose={onClose} footer={<button className="btn" onClick={onClose}>Close</button>}>
      <dl className="kv"><dt>Style ID</dt><dd>{style.id}</dd><dt>Brand</dt><dd>{st.brands[style.brand_id].name}</dd><dt>Project</dt><dd>{style.work_id ? st.works[style.work_id].title : 'Not linked'}</dd><dt>Category</dt><dd>{style.category}</dd><dt>Season</dt><dd>{style.season || 'Not recorded'}</dd><dt>Lifecycle</dt><dd>{style.lifecycle}</dd><dt>Owner</dt><dd>{personLabel(st, style.owner_id)}</dd><dt>Description</dt><dd>{style.description || 'Not recorded'}</dd></dl>
      <h3 className="mt-16 mb-8">Readiness checks</h3>
      <p className="hint mb-8">Derived from the record. There is no manual tick that bypasses these requirements, and readiness is not approval.</p>
      {Object.keys(labels).map(k => <div key={k} className="mb-8"><div className="row"><Badge tone={R_[k].ready ? 'success' : 'attention'}>{R_[k].ready ? 'Ready' : 'Not ready'}</Badge><strong>{labels[k]}</strong></div>
        {R_[k].missing.map((m: R) => <div key={m.label} className="small" style={{ marginLeft: 8 }}>• {m.label} {['bom', 'pom', 'techpack'].includes(m.target) ? <span className="muted">(use the {m.target === 'bom' ? 'BOM' : m.target === 'pom' ? 'Measurements' : 'Tech pack'} button in the header)</span> : <button className="link" onClick={() => { onClose(); nav(`/styles/${style.id}/${tabFor[m.target] || 'overview'}`) }}>Open {m.target}</button>}</div>)}</div>)}
      <h3 className="mt-16 mb-8">Style owner</h3>
      <div className="form-grid"><Field label="New owner"><PersonPicker value={owner} onChange={setOwner} label="New owner" /></Field><Field label="Reason"><input type="text" value={why} onChange={e => setWhy(e.target.value)} /></Field></div>
      <div className="hint mt-8">Changing the style owner does not reassign linked tasks. {style.owner_history.length > 0 && `History: ${style.owner_history.map((h: R) => `${personLabel(st, h.from, false)}→${personLabel(st, h.to, false)}`).join(', ')}`}</div>
      <ErrorBox err={ow.error} /><div className="mt-8"><button className="btn small" disabled={ow.busy || owner === style.owner_id || !why.trim()} onClick={async () => { if (await ow.submit({ style_id: style.id, owner_id: owner, reason: why })) toast('Style owner changed. Linked tasks are unchanged.') }}>Change owner</button></div>
    </Dialog>
  )
}

export function CreateStyleDialog({ onClose, brandId }: { onClose: () => void; brandId?: string }) {
  const { state: s } = useSnap()
  const st = s!
  const nav = useNavigate()
  const [f, setF] = useState({ brand_id: brandId || '', work_id: '', name: '', category: '', season: '' })
  const [dup, setDup] = useState<string | null>(null)
  const { submit, busy, error } = useSubmit('create_style')
  const works = (Object.values(st.works) as R[]).filter(w => w.brand_id === f.brand_id)
  return (
    <Dialog title="Create style" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy || !f.brand_id || !f.name.trim() || !f.category.trim()} onClick={async () => {
      const r = await submit({ ...f, work_id: f.work_id || null, confirm_not_duplicate: !!dup && error?.code === 'possible_duplicate' && dup === 'confirmed' })
      if (r) { toast('Style created as a draft. Add a BOM to make it sourcing-ready.'); onClose(); nav(`/styles/${r.style_id}`) }
    }}>{busy ? 'Creating…' : dup === 'confirmed' ? 'Create anyway (different style)' : 'Create style'}</button></>}>
      <div className="col gap-12"><p className="hint">You do not need to create a duplicate style to request another vendor quote, sample round or repeat order.</p>
        <div className="form-grid"><Field label="Brand" required><select value={f.brand_id} onChange={e => setF({ ...f, brand_id: e.target.value, work_id: '' })}><option value="">Choose…</option>{(Object.values(st.brands) as R[]).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
          <Field label="Project / work (optional)"><select value={f.work_id} onChange={e => setF({ ...f, work_id: e.target.value })}><option value="">None</option>{works.map(w => <option key={w.id} value={w.id}>{w.title}</option>)}</select></Field></div>
        <div className="form-grid"><Field label="Style name" required><input type="text" value={f.name} onChange={e => { setF({ ...f, name: e.target.value }); setDup(null) }} /></Field><Field label="Category" required><input type="text" value={f.category} onChange={e => setF({ ...f, category: e.target.value })} placeholder="e.g. Menswear / Shirts / Casual" /></Field><Field label="Season"><input type="text" value={f.season} onChange={e => setF({ ...f, season: e.target.value })} /></Field></div>
        {error?.code === 'possible_duplicate' ? <div className="alert warn" role="alert">{error.message} <button className="link" onClick={() => nav(`/styles/${error.extra.style_id}`)}>Open existing style</button>{dup !== 'confirmed' && <> · <button className="link" onClick={() => setDup('confirmed')}>This is a different style</button></>}</div> : <ErrorBox err={error} />}
      </div>
    </Dialog>
  )
}

export function ImportDialog({ onClose }: { onClose: () => void }) {
  const { state: s } = useSnap()
  const st = s!
  const [brand, setBrand] = useState('')
  const [text, setText] = useState('name,category,season\nImport sample tee,Menswear / Tees,SS27\n,Menswear / Tees,SS27\nMeadow shirt,Menswear / Shirts,AW27')
  const [res, setRes] = useState<R | null>(null)
  const { submit, busy, error } = useSubmit('import_styles')
  const rows = () => text.split('\n').slice(1).filter(l => l.trim() || true).map(l => { const [name, category, season] = l.split(','); return { name: name?.trim(), category: category?.trim(), season: season?.trim() } }).filter(r => r.name || r.category)
  return (
    <Dialog title="Bulk import styles" onClose={onClose} wide footer={<><button className="btn" onClick={onClose}>Close</button><button className="btn primary" disabled={busy || !brand} onClick={async () => { const r = await submit({ brand_id: brand, rows: rows() }); if (r) setRes(r) }}>{busy ? 'Importing…' : 'Import to Drafts'}</button></>}>
      <div className="col gap-12">
        <p className="hint">Prototype import: paste CSV text. Valid rows become <strong>Drafts</strong>; problems are listed per row, and valid rows are kept without re-importing everything.</p>
        <Field label="Brand" required><select value={brand} onChange={e => setBrand(e.target.value)}><option value="">Choose…</option>{(Object.values(st.brands) as R[]).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
        <Field label="Rows (name, category, season)"><textarea style={{ minHeight: 120, fontFamily: 'monospace' }} value={text} onChange={e => setText(e.target.value)} /></Field>
        <ErrorBox err={error} />
        {res && <div className="alert success" role="status">Created {res.created.length} draft style(s).</div>}
        {res && res.errors.length > 0 && <div className="alert warn"><strong>{res.errors.length} row(s) need correction:</strong><ul style={{ margin: '4px 0 0 18px' }}>{res.errors.map((e: R) => <li key={e.row}>Row {e.row}{e.name ? ` (${e.name})` : ''}: {e.problems.join('; ')}</li>)}</ul></div>}
      </div>
    </Dialog>
  )
}

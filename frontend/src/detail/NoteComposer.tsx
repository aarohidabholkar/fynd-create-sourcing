import { useState } from 'react'
import { toast, useSnap, type R } from '../store'
import { Dialog, ErrorBox, Field, useSubmit, useUnsavedGuard } from '../ui'
import { TODAY } from '../util'

/** Two explicit outcomes: Save privately (only the author) or Post update (shared to chosen records). */
export function NoteComposer({ onClose, initial, note }: { onClose: () => void; initial?: R; note?: R }) {
  const { state: s } = useSnap()
  const st = s!
  const [title, setTitle] = useState(note?.title || '')
  const [body, setBody] = useState(note?.body || '')
  const [date, setDate] = useState(note?.event_date || TODAY)
  const [links, setLinks] = useState<R>(note?.links || initial || {})
  const [files, setFiles] = useState<string[]>([])
  const [posting, setPosting] = useState(false)
  const [dest, setDest] = useState<{ work_ids: string[]; vendor_ids: string[]; style_ids: string[]; brand_ids: string[] }>({
    work_ids: links.work_id ? [links.work_id] : [], vendor_ids: links.vendor_id ? [links.vendor_id] : [], style_ids: links.style_id ? [links.style_id] : [],
    brand_ids: links.brand_id && !links.work_id ? [links.brand_id] : [],
  })
  const save = useSubmit('save_note')
  const post = useSubmit('post_note')
  const dirty = !!(title || body) && !save.busy
  useUnsavedGuard(dirty && !posting, 'Discard this unsaved note?')
  const toggle = (k: keyof typeof dest, id: string) => setDest(d => ({ ...d, [k]: d[k].includes(id) ? d[k].filter(x => x !== id) : [...d[k], id] }))
  const works = Object.values(st.works) as R[]
  const chosenWorks = works.filter(w => dest.work_ids.includes(w.id))
  const styleOptions = chosenWorks.flatMap(w => w.style_ids.slice(0, 6)).filter((v, i, a) => a.indexOf(v) === i)
  const where = [
    ...chosenWorks.map(w => `${w.title} (work)`),
    ...dest.vendor_ids.map(v => `${st.vendors[v].name} (vendor)`),
    ...dest.style_ids.map(x => `${st.styles[x].name} (style)`),
    ...dest.brand_ids.map(b => `${st.brands[b].name} (brand Activity)`),
  ]
  const hasDest = where.length > 0
  const privatePayload = { note_id: note?.id, title, body, event_date: date, links }
  const body_ok = body.trim().length > 0

  return (
    <Dialog title={posting ? 'Post update' : note ? 'Private note' : 'Add note'} onClose={onClose} wide
      footer={!posting ? (
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={!body_ok || save.busy} onClick={async () => {
            const r = await save.submit(privatePayload)
            if (r) { toast('Saved privately. Only you can see this note.'); onClose() }
          }}>{save.busy ? 'Saving…' : 'Save privately'}</button>
          <button className="btn primary" disabled={!body_ok} onClick={() => setPosting(true)}>Post update…</button>
        </>
      ) : (
        <>
          <button className="btn" onClick={() => setPosting(false)}>Back</button>
          <button className="btn primary" disabled={!hasDest || post.busy} onClick={async () => {
            const r = await post.submit({ ...privatePayload, targets: dest })
            if (r) { toast('Update posted. It now appears in the linked timelines (one record).'); onClose() }
          }}>{post.busy ? 'Posting…' : 'Post update'}</button>
        </>
      )}>
      {!posting ? (
        <div className="col gap-12">
          <div className="alert info">Saving privately keeps this note <strong>Private · Only you</strong>, even if you link it to a brand or vendor. Nothing is shared until you choose Post update.</div>
          <Field label="Title (optional)"><input type="text" value={title} onChange={e => setTitle(e.target.value)} /></Field>
          <Field label="Note" required><textarea style={{ minHeight: 120 }} value={body} onChange={e => setBody(e.target.value)} placeholder="Write rough notes after a call or visit…" /></Field>
          <div className="form-grid">
            <Field label="Call / visit date"><input type="date" max={TODAY} value={date} onChange={e => setDate(e.target.value)} /></Field>
            <Field label="Link to work (suggestion only)"><select value={links.work_id || ''} onChange={e => setLinks({ ...links, work_id: e.target.value || undefined, brand_id: e.target.value ? st.works[e.target.value].brand_id : links.brand_id })}>
              <option value="">None</option>{works.map(w => <option key={w.id} value={w.id}>{st.brands[w.brand_id].name} · {w.title}</option>)}</select></Field>
            <Field label="Link to vendor"><select value={links.vendor_id || ''} onChange={e => setLinks({ ...links, vendor_id: e.target.value || undefined })}>
              <option value="">None</option>{(Object.values(st.vendors) as R[]).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></Field>
          </div>
          <Field label="Photos or files (optional)" hint="Prototype: only file names are recorded; nothing is uploaded.">
            <input type="file" multiple onChange={e => setFiles(Array.from(e.target.files || []).map(f => f.name))} />
          </Field>
          {files.length > 0 && <div className="small muted">Attached (names only): {files.join(', ')}</div>}
          <ErrorBox err={save.error} />
        </div>
      ) : (
        <div className="col gap-12">
          <h3>Add this update to…</h3>
          <p className="hint">Choose where this update will appear. Suggestions come from your links; you decide. It stays one shared record linked in several places.</p>
          <fieldset className="col" style={{ border: 0, padding: 0, margin: 0 }}><legend className="strong small">Work</legend>
            {works.map(w => <label key={w.id} className="row"><input type="checkbox" checked={dest.work_ids.includes(w.id)} onChange={() => toggle('work_ids', w.id)} />{st.brands[w.brand_id].name} · {w.title}</label>)}</fieldset>
          {styleOptions.length > 0 && <fieldset className="col" style={{ border: 0, padding: 0, margin: 0 }}><legend className="strong small">Specific styles in the selected work</legend>
            {styleOptions.map(x => <label key={x} className="row"><input type="checkbox" checked={dest.style_ids.includes(x)} onChange={() => toggle('style_ids', x)} />{st.styles[x].name} <span className="muted">({x})</span></label>)}</fieldset>}
          <fieldset className="col" style={{ border: 0, padding: 0, margin: 0 }}><legend className="strong small">Vendor</legend>
            {(Object.values(st.vendors) as R[]).map(v => <label key={v.id} className="row"><input type="checkbox" checked={dest.vendor_ids.includes(v.id)} onChange={() => toggle('vendor_ids', v.id)} />{v.name}</label>)}</fieldset>
          <fieldset className="col" style={{ border: 0, padding: 0, margin: 0 }}><legend className="strong small">Brand-level (no specific work)</legend>
            {(Object.values(st.brands) as R[]).map(b => <label key={b.id} className="row"><input type="checkbox" checked={dest.brand_ids.includes(b.id)} onChange={() => toggle('brand_ids', b.id)} />{b.name}</label>)}</fieldset>
          <div className="alert warn">{hasDest ? <>Will appear in: <strong>{where.join(' · ')}</strong>. Visible to people who have access to those records. Posting shares this statement; it does not change dates, approve samples or assign work.</> : 'Select at least one place before posting.'}</div>
          <ErrorBox err={post.error} />
        </div>
      )}
    </Dialog>
  )
}

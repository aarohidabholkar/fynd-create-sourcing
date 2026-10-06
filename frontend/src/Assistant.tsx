import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { toggleAssistant, useSnap, type R } from './store'
import { fmtDate, personLabel } from './util'

interface Answer { text: string; links: { label: string; to: string }[] }

/** Demo assistant: deterministic rules over the recorded data. It cites records, never confirms orders, approves samples,
 *  changes dates or sends messages, and says plainly when the data cannot answer. */
function answer(q: string, st: R, path: string): Answer {
  const t = q.toLowerCase()
  const links: Answer['links'] = []
  const m = path.match(/^\/(styles|brands|vendors)\/([^/]+)/)
  if (/attention|intervention|problem|risk/.test(t)) {
    const att = st.derived.attention as R[]
    if (!att.length) return { text: 'No issues currently qualify as needing intervention in the recorded data.', links }
    att.forEach(a => { const w = st.works[a.work_id]; const i = a.kind === 'issue' ? st.issues[a.issue_id] : null; links.push({ label: `${st.brands[w.brand_id].name}: ${i ? i.title : 'Reply overdue'}`, to: `/overview/work/${w.id}${i ? `?issue=${i.id}` : ''}` }) })
    return { text: `${att.length} item(s) need intervention according to recorded issues, overdue actions and overdue replies:`, links }
  }
  if (/wait|pending reply|response/.test(t)) {
    const w = (Object.values(st.waiting) as R[]).filter(x => x.tracker_id === st.me && x.state === 'open')
    const r = (Object.values(st.requests) as R[]).filter(x => x.requester_id === st.me && x.state === 'awaiting')
    w.forEach(x => links.push({ label: `${x.description}: ${x.party.name}`, to: `/my-work?open=${x.action_id}` }))
    r.forEach(x => links.push({ label: `Update request: ${st.actions[x.action_id].title}`, to: `/my-work?open=${x.action_id}` }))
    return { text: w.length + r.length ? `You are waiting on ${w.length} dependency(ies) and ${r.length} update request(s):` : 'You are not recorded as waiting on anything.', links }
  }
  if (m) {
    const [, kind, id] = m
    if (kind === 'styles' && st.styles[id]) {
      const s = st.styles[id]; const d = st.derived.styles[id]
      links.push({ label: 'Open Sampling', to: `/styles/${id}/sampling` }, { label: 'Open Production', to: `/styles/${id}/production` })
      const conflicts = (Object.values(st.commitments) as R[]).filter(c => c.style_id === id && c.proposed)
      return { text: `${s.name}: ${d.position}. ${conflicts.length ? `${conflicts.length} proposed date(s) are NOT agreed yet (recorded agreed date remains in force). ` : ''}${d.locks.length ? `Specification is locked by ${d.locks.length} active request(s). ` : ''}Based on recorded state only; I have not confirmed anything.`, links }
    }
    if (kind === 'brands' && st.brands[id]) {
      const ws = (Object.values(st.works) as R[]).filter(w => w.brand_id === id)
      ws.forEach(w => links.push({ label: w.title, to: `/brands/${id}/work?work=${w.id}` }))
      return { text: `${st.brands[id].name}: ${st.brands[id].summary}`, links }
    }
    if (kind === 'vendors' && st.vendors[id]) {
      const v = st.vendors[id]; const d = st.derived.vendors[id]
      return { text: `${v.name}: ${v.suitability} ${v.limitations.length ? 'Limitations: ' + v.limitations.join(' ') + ' ' : ''}Latest assessment: ${d.assessment_label || 'none on file'}. Open findings: ${d.open_findings}. Capabilities marked planned are not available yet.`, links: [{ label: 'Audits', to: `/vendors/${id}/audits` }] }
    }
  }
  const words = t.split(/\W+/).filter(w => w.length > 3)
  ;(Object.values(st.styles) as R[]).forEach(s => { if (words.some(w => (s.name + s.id).toLowerCase().includes(w)) && links.length < 6) links.push({ label: `Style: ${s.name}`, to: `/styles/${s.id}/overview` }) })
  ;(Object.values(st.vendors) as R[]).forEach(v => { if (words.some(w => v.name.toLowerCase().includes(w) || v.capabilities.some((c: R) => c.label.toLowerCase().includes(w))) && links.length < 8) links.push({ label: `Vendor: ${v.name}`, to: `/vendors/${v.id}/overview` }) })
  ;(Object.values(st.works) as R[]).forEach(w => { if (words.some(x => w.title.toLowerCase().includes(x)) && links.length < 10) links.push({ label: `Work: ${w.title}`, to: `/overview/work/${w.id}` }) })
  if (links.length) return { text: 'These records match your question. Open one to see the evidence:', links }
  return { text: 'I cannot answer that from the recorded data. Try “What needs attention?”, “What am I waiting for?”, or open a style, brand or vendor and ask for a summary.', links }
}

export function Assistant() {
  const { state: st } = useSnap()
  const loc = useLocation()
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [log, setLog] = useState<{ q: string; a: Answer }[]>([])
  const ask = (text: string) => { if (!text.trim()) return; setLog([...log, { q: text, a: answer(text, st!, loc.pathname) }]); setQ('') }
  return (
    <div className="assistant" role="dialog" aria-label="Assistant (demo)">
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--divider)' }}><strong>Assistant</strong> <span className="badge demo">Demo: rule-based</span>
        <div className="small muted">Answers come only from recorded data and link to it. It never confirms orders, approves samples, changes dates or sends messages.</div></div>
      <div style={{ overflow: 'auto', padding: 16, flex: 1 }} aria-live="polite">
        {log.length === 0 && <div className="chip-row">{['What needs attention?', 'What am I waiting for?', 'Summarise this page'].map(c => <button key={c} className="btn small" onClick={() => ask(c)}>{c}</button>)}</div>}
        {log.map((x, i) => <div key={i} className="mb-16"><div className="small muted">You: {x.q}</div><div className="mt-8">{x.a.text}</div><ul className="list">{x.a.links.map((l, j) => <li key={j} style={{ padding: '4px 0' }}><button className="link" onClick={() => { toggleAssistant(false); nav(l.to) }}>{l.label}</button></li>)}</ul></div>)}
      </div>
      <form onSubmit={e => { e.preventDefault(); ask(q) }} style={{ padding: 12, borderTop: '1px solid var(--divider)', display: 'flex', gap: 8 }}>
        <input type="text" aria-label="Ask the assistant" placeholder="Ask about recorded work…" value={q} onChange={e => setQ(e.target.value)} /><button className="btn primary" type="submit">Ask</button></form>
    </div>
  )
}
export { fmtDate, personLabel }

import { useState } from 'react'
import { Dialog } from '../ui'
import { TODAY } from '../util'

export function CalendarDialog({ agenda, onClose, onOpen, title = 'Your calendar (work deadlines)', hint }: { agenda: any[]; onClose: () => void; onOpen: (x: any) => void; title?: string; hint?: string }) {
  const [month, setMonth] = useState(TODAY.slice(0, 7))
  const [y, m] = month.split('-').map(Number)
  const first = `${month}-01`
  const lead = (new Date(first + 'T00:00:00Z').getUTCDay() + 6) % 7
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const cells = Array.from({ length: lead + days }, (_, i) => (i < lead ? null : `${month}-${String(i - lead + 1).padStart(2, '0')}`))
  const shift = (n: number) => { const t = new Date(Date.UTC(y, m - 1 + n, 1)); setMonth(t.toISOString().slice(0, 7)) }
  return (
    <Dialog title={title} onClose={onClose} wide footer={<button className="btn" onClick={onClose}>Close</button>}>
      <div className="row mb-8"><button className="btn small" onClick={() => shift(-1)}>‹ Previous</button><strong className="grow" style={{ textAlign: 'center' }}>{new Date(first + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</strong><button className="btn small" onClick={() => shift(1)}>Next ›</button></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0,1fr))', gap: 4 }} role="grid" aria-label="Month">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => <div key={d} className="small muted" style={{ textAlign: 'center' }}>{d}</div>)}
        {cells.map((d, i) => d === null ? <div key={i} /> : (
          <div key={d} role="gridcell" className="panel" style={{ minHeight: 72, padding: 4, background: d === TODAY ? 'var(--subtle)' : undefined }}>
            <div className="small"><strong>{Number(d.slice(8))}</strong></div>
            {agenda.filter(x => x.date === d).map((x, j) => <button key={j} className="link small trunc" style={{ display: 'block', maxWidth: '100%', textAlign: 'left' }} onClick={() => onOpen(x)} title={`${x.kind}: ${x.title}`}>{x.kind === 'Reply due' ? '↩ ' : x.kind === 'Commitment' ? '◆ ' : '● '}{x.title}</button>)}
          </div>))}
      </div>
      <p className="hint mt-8">{hint || "● task due · ↩ reply due · ◆ commitment. Undated work stays in your task list under “No date set”."}</p>
    </Dialog>
  )
}

import { useState } from 'react'
import { toast, useSnap, type R } from '../store'
import { Badge, ErrorBox, Field, useSubmit } from '../ui'
import { TODAY, fmtDate, personLabel } from '../util'

/** Milestones with baseline, agreed, proposed and actual dates kept separate. */
export function TnaTable({ allocationId, canEdit }: { allocationId: string; canEdit?: boolean }) {
  const { state: s } = useSnap()
  const st = s!
  const ms = (Object.values(st.milestones) as R[]).filter(m => m.allocation_id === allocationId)
  const [mode, setMode] = useState<{ id: string; kind: 'propose' | 'accept' | 'reject' } | null>(null)
  const [a, setA] = useState(''); const [b, setB] = useState('')
  const prop = useSubmit('propose_milestone'); const dec = useSubmit('decide_milestone')
  const can = canEdit && (st.users[st.me].caps as string[]).includes('edit')
  const canDecide = (st.users[st.me].caps as string[]).includes('gate_signoff')
  const name = (id: string) => ms.find(m => m.id === id)?.name || id
  return (
    <div className="table-wrap">
      <table className="t" aria-label="Milestones and dates">
        <thead><tr><th>Milestone</th><th>Baseline</th><th>Agreed</th><th>Proposed</th><th>Actual</th><th>State</th><th>Depends on</th></tr></thead>
        <tbody>
          {ms.map(m => {
            const delayed = !m.actual && m.agreed && m.agreed < TODAY
            return (
              <tr key={m.id}>
                <td><strong>{m.name}</strong><div className="small muted">{personLabel(st, m.owner_id, false)} · {st.users[m.owner_id].role}</div>{m.reason && <div className="small">{m.reason}</div>}</td>
                <td>{fmtDate(m.baseline)}</td><td>{fmtDate(m.agreed)}{delayed && <> <Badge tone="error">Past agreed date</Badge></>}</td>
                <td>{m.proposed ? <><strong>{fmtDate(m.proposed)}</strong><div className="small muted">not agreed</div></> : '–'}</td>
                <td>{m.actual ? fmtDate(m.actual) : 'Not yet'}</td>
                <td><Badge tone={m.state === 'done' ? 'success' : m.state === 'late' || m.state === 'blocked' ? 'error' : ''}>{m.state === 'done' ? 'Done' : m.state === 'late' ? 'Late' : m.state === 'blocked' ? 'Blocked' : 'Open'}</Badge></td>
                <td className="small">{m.deps.length ? m.deps.map(name).join(', ') : '–'}
                  <div className="row wrap mt-8">
                    {can && !m.actual && !m.proposed && <button className="btn small" onClick={() => { setMode({ id: m.id, kind: 'propose' }); setA(''); setB('') }}>Propose date</button>}
                    {m.proposed && canDecide && <><button className="btn small" onClick={() => { setMode({ id: m.id, kind: 'accept' }); setA('') }}>Accept</button><button className="btn small" onClick={() => { setMode({ id: m.id, kind: 'reject' }); setA('') }}>Reject</button></>}
                  </div>
                  {mode && mode.id === m.id && (
                    <div className="inline-form">
                      {mode.kind === 'propose' && <><Field label="Proposed date" required><input type="date" value={a} onChange={e => setA(e.target.value)} /></Field><Field label="Reason" required><input type="text" value={b} onChange={e => setB(e.target.value)} /></Field>
                        <div className="hint">The agreed date stays in force until an authorised decision accepts this. Dependent milestones are listed for review.</div><ErrorBox err={prop.error} />
                        <div className="row"><button className="btn primary small" disabled={prop.busy || !a || !b.trim()} onClick={async () => { const r = await prop.submit({ milestone_id: m.id, date: a, reason: b }); if (r) { toast(r.affected?.length ? `Proposal recorded. Would affect: ${r.affected.join(', ')}` : 'Proposal recorded; not yet agreed.'); setMode(null) } }}>Record proposal</button><button className="btn small" onClick={() => setMode(null)}>Cancel</button></div></>}
                      {mode.kind === 'accept' && <><Field label="Agreement evidence" required><input type="text" value={a} onChange={e => setA(e.target.value)} /></Field><ErrorBox err={dec.error} />
                        <div className="row"><button className="btn primary small" disabled={dec.busy || !a.trim()} onClick={async () => { if (await dec.submit({ milestone_id: m.id, decision: 'accept', evidence: a })) { toast('Revised date agreed; baseline retained.'); setMode(null) } }}>Record agreement</button><button className="btn small" onClick={() => setMode(null)}>Cancel</button></div></>}
                      {mode.kind === 'reject' && <><Field label="Reason" required><input type="text" value={a} onChange={e => setA(e.target.value)} /></Field><ErrorBox err={dec.error} />
                        <div className="row"><button className="btn primary small" disabled={dec.busy || !a.trim()} onClick={async () => { if (await dec.submit({ milestone_id: m.id, decision: 'reject', reason: a })) setMode(null) }}>Record decision</button><button className="btn small" onClick={() => setMode(null)}>Cancel</button></div></>}
                    </div>
                  )}
                </td>
              </tr>)
          })}
        </tbody>
      </table>
    </div>
  )
}

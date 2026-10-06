import type { R } from './store'

/** Exact-record deep links for an event, so users land on the record, not a generic page. */
export function eventLinks(ev: R, st: R): { label: string; to: string }[] {
  const sc = ev.scope || {}
  const out: { label: string; to: string }[] = []
  const style = sc.style_id ? st.styles[sc.style_id] : null
  if (sc.sample_round_id && style) out.push({ label: 'Open sample round', to: `/styles/${style.id}/sampling?round=${sc.sample_round_id}` })
  if (sc.quote_id && style) out.push({ label: 'Open quote', to: `/styles/${style.id}/costing?quote=${sc.quote_id}` })
  if (sc.allocation_id) { const a = st.allocations[sc.allocation_id]; if (a) out.push({ label: 'Open production allocation', to: `/styles/${a.style_id}/production?alloc=${a.id}` }) }
  if (sc.order_id && sc.brand_id) out.push({ label: 'Open order', to: `/brands/${sc.brand_id}/orders?order=${sc.order_id}` })
  if (sc.finding_id && sc.vendor_id) out.push({ label: 'Open finding', to: `/vendors/${sc.vendor_id}/audits?finding=${sc.finding_id}` })
  else if (sc.audit_id && sc.vendor_id) out.push({ label: 'Open audit', to: `/vendors/${sc.vendor_id}/audits?audit=${sc.audit_id}` })
  if (sc.visit_id && sc.vendor_id) out.push({ label: 'Open visit', to: `/vendors/${sc.vendor_id}/visits?visit=${sc.visit_id}` })
  if ((sc.issue_id || sc.action_id || sc.request_id) && sc.work_id && sc.brand_id)
    out.push({ label: 'Open issue / action', to: `/brands/${sc.brand_id}/work?work=${sc.work_id}${sc.issue_id ? `&issue=${sc.issue_id}` : ''}${sc.action_id ? `&action=${sc.action_id}` : ''}` })
  else if (sc.work_id && sc.brand_id && !out.length) out.push({ label: 'Open work', to: `/brands/${sc.brand_id}/work?work=${sc.work_id}` })
  if (style && !out.some(o => o.to.startsWith('/styles'))) out.push({ label: 'Open style', to: `/styles/${style.id}` })
  if (!sc.finding_id && !sc.audit_id && !sc.visit_id && sc.vendor_id && sc.note_id) out.push({ label: 'Open vendor', to: `/vendors/${sc.vendor_id}` })
  return out
}

export const CONVERSATION_KINDS = ['conversation', 'meeting', 'document', 'note_posted']
export function eventType(ev: R, st: R): string {
  const src = ev.source_id ? st.sources[ev.source_id] : null
  if (src) return src.author?.includes('brand contact') ? 'Brand communication' : 'Internal discussion'
  if (ev.kind === 'note_posted') return 'Published note'
  return 'Work update'
}

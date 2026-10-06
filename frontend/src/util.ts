import type { R } from './store'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const TODAY = '2026-10-06'

export function fmtDate(d?: string | null, withYear = false): string {
  if (!d) return 'Not recorded'
  const [y, m, day] = d.slice(0, 10).split('-').map(Number)
  const base = `${day} ${MONTHS[m - 1]}`
  return withYear || y !== 2026 ? `${base} ${y}` : base
}
export function fmtTs(ts?: string | null): string {
  if (!ts) return ''
  const d = ts.slice(0, 10)
  const label = d === TODAY ? 'Today' : d === addDays(TODAY, -1) ? 'Yesterday' : fmtDate(d)
  return `${label} · ${ts.slice(11, 16)}`
}
export function addDays(d: string, n: number): string {
  const t = new Date(d + 'T00:00:00Z')
  t.setUTCDate(t.getUTCDate() + n)
  return t.toISOString().slice(0, 10)
}
export function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / 86400000)
}
export function relDay(d?: string | null): string {
  if (!d) return 'No date set'
  const n = daysBetween(TODAY, d)
  if (n === 0) return 'Today'
  if (n === 1) return 'Tomorrow'
  if (n === -1) return 'Yesterday'
  return fmtDate(d)
}
export const effDate = (c: R) => c.agreed || c.planned || c.original

export function personLabel(s: R, id?: string | null, role = true) {
  const u = s.users[id || '']
  if (!u) return 'Not recorded'
  return role ? `John Doe · ${u.role}` : 'John Doe'
}
export function initials(s: R, id: string) {
  const u = s.users[id]
  return u ? 'JD' : '?'
}
export const can = (s: R, cap: string) => (s.users[s.me]?.caps || []).includes(cap)
export const OPEN = ['open', 'blocked', 'awaiting_review']
export const isOverdue = (a: R) => OPEN.includes(a.status) && !!a.due && a.due < TODAY
export function sum(o: Record<string, number>) { return Object.values(o).reduce((a, b) => a + b, 0) }
export function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36) }
export function plural(n: number, one: string, many?: string) { return `${n} ${n === 1 ? one : many || one + 's'}` }

export const STATE_LABEL: Record<string, string> = {
  open: 'Open', blocked: 'Blocked', awaiting_review: 'Awaiting review', completed: 'Completed', cancelled: 'Cancelled',
  awaiting: 'Awaiting response', responded: 'Responded', withdrawn: 'Withdrawn',
  proposed: 'Proposed (not agreed)', agreed: 'Agreed', planned: 'Planned', done: 'Done',
  awaiting_verification: 'Awaiting verification', verified_closed: 'Verified closed', reopened: 'Reopened',
}

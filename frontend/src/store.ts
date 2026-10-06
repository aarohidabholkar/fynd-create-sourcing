import { useSyncExternalStore } from 'react'

export type R = Record<string, any>

export class ApiError extends Error {
  status: number
  code?: string
  extra: R
  constructor(status: number, detail: string, code?: string, extra: R = {}) {
    super(detail)
    this.status = status
    this.code = code
    this.extra = extra
  }
}

interface Snap { state: R | null; userId: string; simulateFail: boolean; loadError: string | null; version: number }
let snap: Snap = {
  state: null,
  userId: localStorage.getItem('fcs_user') || 'u_head',
  simulateFail: localStorage.getItem('fcs_fail') === '1',
  loadError: null,
  version: 0,
}
const listeners = new Set<() => void>()
function set(p: Partial<Snap>) {
  snap = { ...snap, ...p, version: snap.version + 1 }
  listeners.forEach(l => l())
}
export function useSnap() {
  return useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb) }, () => snap)
}
export const getSnap = () => snap

function headers(extra: Record<string, string> = {}) {
  const h: Record<string, string> = { 'Content-Type': 'application/json', 'X-Demo-User': snap.userId, ...extra }
  return h
}

async function parse(r: Response) {
  let data: R = {}
  try { data = await r.json() } catch { /* empty */ }
  if (!r.ok) {
    const { detail, code, ...extra } = data
    throw new ApiError(r.status, typeof detail === 'string' ? detail : 'Something went wrong.', code, extra)
  }
  return data
}

export async function loadState() {
  try {
    const r = await fetch('/api/state', { headers: headers() })
    set({ state: await parse(r), loadError: null })
  } catch (e: any) {
    set({ loadError: e instanceof ApiError ? e.message : 'The prototype server could not be reached. Check that the backend is running.' })
  }
}

/** Run a business operation on the server. State is replaced only after the server confirms persistence. */
export async function run(name: string, body: R = {}, key?: string): Promise<R> {
  const h = headers(snap.simulateFail ? { 'X-Simulate-Failure': '1' } : {})
  if (key) h['Idempotency-Key'] = key
  let r: Response
  try {
    r = await fetch(`/api/ops/${name}`, { method: 'POST', headers: h, body: JSON.stringify(body) })
  } catch {
    throw new ApiError(0, 'Could not reach the server. Nothing was saved; your input is kept.', 'network')
  }
  const data = await parse(r)
  set({ state: data.state })
  return data.result
}

export function switchUser(id: string) {
  localStorage.setItem('fcs_user', id)
  set({ userId: id })
  loadState()
}
export function setSimulateFail(v: boolean) {
  localStorage.setItem('fcs_fail', v ? '1' : '0')
  set({ simulateFail: v })
}
export async function resetDemo() {
  const r = await fetch('/api/demo/reset', { method: 'POST', headers: headers() })
  set({ state: await parse(r) })
}

// ---- toasts & global overlays (source viewer) ----
interface Ui { toasts: { id: number; text: string; tone: string }[]; source: string | null; sourceCtx: R | null; assistant: boolean }
let ui: Ui = { toasts: [], source: null, sourceCtx: null, assistant: false }
const uiL = new Set<() => void>()
function setUi(p: Partial<Ui>) { ui = { ...ui, ...p }; uiL.forEach(l => l()) }
export function useUi() { return useSyncExternalStore(cb => { uiL.add(cb); return () => uiL.delete(cb) }, () => ui) }
let tid = 0
export function toast(text: string, tone = 'success') {
  const id = ++tid
  setUi({ toasts: [...ui.toasts, { id, text, tone }] })
  setTimeout(() => setUi({ toasts: ui.toasts.filter(t => t.id !== id) }), 4500)
}
export function openSource(id: string, ctx: R | null = null) { setUi({ source: id, sourceCtx: ctx }) }
export function closeSource() { setUi({ source: null, sourceCtx: null }) }
export function toggleAssistant(v?: boolean) { setUi({ assistant: v ?? !ui.assistant }) }

// ---- remembered navigation state (filters, expanded sections, scroll) survives opening/closing details ----
const mem = new Map<string, any>()
export const remember = {
  get<T>(k: string, d: T): T { return mem.has(k) ? mem.get(k) : d },
  set(k: string, v: any) { mem.set(k, v) },
}

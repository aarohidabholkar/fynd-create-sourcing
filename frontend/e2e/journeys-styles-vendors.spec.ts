import { expect, test } from '@playwright/test'
import { actAs, resetDemo } from './helpers'

test.beforeEach(async ({ page }) => { await resetDemo(page) })

test('Overview → brand project → record sample dispatch + receipt updates every connected view', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message))
  await page.goto('/overview/work/w_orbit?issue=i_sleeve')
  await page.getByRole('link', { name: 'View all brand details' }).click()
  await expect(page).toHaveURL(/\/brands\/b_argo\/work\?work=w_orbit&issue=i_sleeve/)
  await expect(page.getByRole('dialog').getByText('Sleeve correction unresolved')).toBeVisible()   // exact issue selected, no re-search
  await page.keyboard.press('Escape')
  await expect(page.getByText('Pieces: 5 made · 5 dispatched · 5 received')).toBeVisible()

  // Receipt before dispatch is refused with a plain explanation
  await page.getByRole('button', { name: 'Record movement' }).click()
  await page.getByLabel('What happened?').selectOption('received')
  await page.getByRole('textbox', { name: 'Colour' }).fill('Khaki')
  await page.getByRole('button', { name: 'Record', exact: true }).click()
  await expect(page.getByText(/Nothing has been dispatched/)).toBeVisible()
  await page.getByLabel('What happened?').selectOption('dispatched')
  await page.getByRole('spinbutton', { name: 'Pieces' }).fill('2')
  await page.getByRole('button', { name: 'Record', exact: true }).click()
  await expect(page.getByText(/Pieces: 5 made · 7 dispatched|Pieces: 7 made · 7 dispatched/)).toBeVisible()

  await page.getByRole('button', { name: 'Record receipt' }).click()
  await page.getByRole('spinbutton', { name: 'Pieces' }).fill('2')
  await page.getByRole('textbox', { name: 'Colour' }).fill('Khaki')
  await expect(page.getByText(/will be completed \(it exists to track this receipt\)/)).toBeVisible()
  await expect(page.getByText(/NOT triggered/)).toBeVisible()
  await page.getByRole('button', { name: 'Record', exact: true }).click()
  await expect(page.getByText(/received 2/).first()).toBeVisible()

  // Connected consequences: waiting item closed, action completed, but issue and review remain open
  const s = await (await page.request.get('/api/state', { headers: { 'X-Demo-User': 'u_head' } })).json()
  expect(s.actions.a_resubmit.status).toBe('completed')
  expect(s.waiting.wt_kaveri.state).toBe('closed')
  expect(s.issues.i_sleeve.state).toBe('open')
  expect(s.actions.a_tech_review.status).toBe('open')
  expect(s.sample_rounds.sr_orbit_3.internal.state).toBe('not_started')
  expect(errors).toEqual([])
})

test('Sampling: internal pass is blocked by out-of-tolerance values; QC pass is not brand approval', async ({ page }) => {
  await actAs(page, /Technical reviewer/)
  await page.goto('/styles/s_orbit/sampling?round=sr_orbit_2')
  await expect(page.getByText(/Out of tolerance/).first()).toBeVisible()
  await page.getByRole('button', { name: 'Pass internal QC' }).click()
  await expect(page.getByText(/out of tolerance/i).first()).toBeVisible()
  await expect(page.getByText('Brand decision pending').first()).toBeVisible()
  // fixing the measurement and verifying the correction allows a pass, still without brand approval
  await page.getByLabel(/Actual Sleeve length M Khaki/).fill('62.3')
  await page.getByRole('button', { name: 'Save measurements' }).click()
  await page.getByRole('button', { name: 'Verify correction…' }).click()
  await page.getByLabel('Verification evidence').fill('Re-measured on corrected piece')
  await page.getByRole('button', { name: 'Mark verified' }).click()
  await page.getByRole('button', { name: 'Pass internal QC' }).click()
  await expect(page.getByText(/Internal QC passed\. This is not brand approval/)).toBeVisible()
  await expect(page.getByText('Brand decision pending').first()).toBeVisible()
})

test('Costing: non-comparable vendors are flagged and a new revision never overwrites the approved quote', async ({ page }) => {
  await page.goto('/styles/s_meadow/costing')
  await page.getByRole('tab', { name: 'Compare vendors' }).click()
  await expect(page.getByText(/no “cheapest” is declared/)).toBeVisible()
  await page.getByRole('button', { name: 'Record quote' }).first().click()
  await page.getByLabel('Quantity basis (pcs)').fill('700')
  await page.getByLabel('Fabric').fill('280')
  await page.getByLabel(/Vendor-stated total/).fill('620')
  await page.getByRole('button', { name: 'Record quote' }).last().click()
  await expect(page.getByText(/new version/)).toBeVisible()
  const s = await (await page.request.get('/api/state', { headers: { 'X-Demo-User': 'u_head' } })).json()
  expect(s.quotes.q_a2.state).toBe('approved')
})

test('Production: failed lot stays failed, only re-inspected quantity is cleared, other allocation unaffected', async ({ page }) => {
  await actAs(page, /QA lead/)
  await page.goto('/styles/s_meadow/production?alloc=al_b')
  await page.getByRole('tab', { name: 'Quality checks' }).click()
  await expect(page.getByText('✕ Fail').first()).toBeVisible()
  await page.getByRole('button', { name: 'Record inspection' }).click()
  const form = page.getByRole('group', { name: 'Record inspection' })
  await form.getByLabel('Lot quantity inspected').fill('410')
  await form.getByLabel('Sampling plan reference (buyer-approved)').fill('Buyer-approved plan (demo)')
  await form.getByLabel('This is a re-inspection of a failed inspection').selectOption({ index: 1 })
  await form.getByLabel('What exactly was re-checked').fill('Reworked 410 collars only')
  await form.getByLabel(/Quantity cleared/).fill('410')
  await form.getByRole('button', { name: 'Record inspection' }).click()
  await expect(page.getByText('Cleared quantity: 410 pcs')).toBeVisible()
  await expect(page.getByText('✕ Fail').first()).toBeVisible()          // original failure retained
  const s = await (await page.request.get('/api/state', { headers: { 'X-Demo-User': 'u_head' } })).json()
  expect(s.derived.allocations.al_a.release_blocked ?? true).toBeTruthy()
  expect(s.allocations.al_a.gate3.state).toBe('pending')               // A not released by B's progress
})

test('Order: draft is not confirmed demand and cannot be confirmed without evidence', async ({ page }) => {
  await page.goto('/styles/s_meadow/order?order=o_meadow_repeat')
  await expect(page.getByText('Draft: not confirmed demand').first()).toBeVisible()
  await page.getByRole('button', { name: 'Confirm order…' }).click()
  await page.getByRole('button', { name: 'Confirm order', exact: true }).click()
  await expect(page.getByText('PO / acceptance evidence').last()).toBeVisible()
})

test('Vendors: draft vs published visit, filters combine, finding closure and verification stay separate', async ({ page }) => {
  await page.goto('/vendors')
  await page.getByLabel('Category').selectOption('Shirts')
  await page.getByLabel('MOQ', { exact: true }).selectOption('unknown')
  await expect(page.getByRole('link', { name: 'Lotus Knit Works' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Sunrise Garments' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Clear filters' }).click()
  await expect(page.getByText('Mixed / unit-specific assessments')).toBeVisible()

  // publish needs enough context; a draft can be saved
  await page.goto('/vendors/v_kaveri/visits')
  await page.getByRole('button', { name: '+ Record visit' }).click()
  await page.getByRole('button', { name: 'Save visit' }).click()
  await expect(page.getByText(/To publish, add/)).toBeVisible()
  await page.getByLabel('Observations').fill('Checked the sleeve pattern table.')
  await page.getByRole('button', { name: 'Save visit' }).click()
  await expect(page.getByText(/Visit saved/)).toBeVisible()

  // Audit: evidence submission is not verification; verifier role required
  await actAs(page, /Merchandiser \(Argo Navis\)/)
  await page.goto('/vendors/v_sunrise/audits?finding=f_sunrise_2')
  await page.getByRole('button', { name: 'Submit closure evidence' }).click()
  await page.getByLabel('Correction note').fill('Hem check added at finishing.')
  await page.getByLabel('Supporting attachment (file name)').fill('hem-check.pdf')
  await page.getByRole('button', { name: 'Submit', exact: true }).click()
  await expect(page.getByText('Awaiting verification').first()).toBeVisible()
  await expect(page.getByText(/Waiting for an authorised verifier/)).toBeVisible()
  const s = await (await page.request.get('/api/state', { headers: { 'X-Demo-User': 'u_head' } })).json()
  expect(s.actions.a_vendor_review.status).toBe('open')
  expect(s.audits.au_sun2.outcome).toMatch(/Grade C/)
})

test('Mobile: navigation and key content remain reachable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 })
  await page.goto('/my-work')
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
  await expect(page.getByRole('button', { name: '+ Add note' })).toBeVisible()
  await page.getByRole('link', { name: 'Vendors' }).click()
  await expect(page.getByRole('link', { name: 'Kaveri Apparels' })).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(2)
})

test('Assistant answers from recorded data and links to it', async ({ page }) => {
  await page.goto('/overview')
  await page.getByRole('button', { name: 'Open assistant' }).click()
  await page.getByRole('button', { name: 'What needs attention?' }).click()
  await expect(page.getByRole('button', { name: /Sleeve correction unresolved/ }).last()).toBeVisible()
  await expect(page.getByText(/never confirms orders/)).toBeVisible()
})

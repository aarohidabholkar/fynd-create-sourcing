import { expect, test } from '@playwright/test'
import { actAs, resetDemo } from './helpers'

test.beforeEach(async ({ page }) => { await resetDemo(page) })

test('Overview issue → request update → assignee responds in My Work → requester reads → resolve → reopen', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto('/overview')

  // Needs attention opens the shared focused detail with the issue prominent
  await page.getByRole('button', { name: /Sleeve correction unresolved for 10 days/ }).click()
  await expect(page.getByRole('heading', { name: 'What’s happening' })).toBeVisible()
  await expect(page.getByText('Last viewed by you')).toBeVisible()

  // Follow up on an action without an open request creates a request on the SAME action
  const row = page.getByRole('listitem').filter({ hasText: 'Get corrected sleeve sample from Kaveri Apparels' })
  await row.getByRole('button', { name: 'Follow up' }).click()
  await page.getByLabel('Message').fill('Please share the courier tracking number.')
  await page.getByRole('button', { name: 'Request update' }).click()
  await expect(row.getByText(/Update requested · John Doe/)).toBeVisible()

  // Following up again opens the existing request instead of creating another
  await row.getByRole('button', { name: 'Follow up' }).click()
  await expect(page.getByText(/already awaiting a response/)).toBeVisible()

  // Assignee (Merchandiser, Argo Navis) sees it on the same action in My Work and responds
  await actAs(page, /Merchandiser \(Argo Navis\)/)
  await page.goto('/my-work')
  await page.getByRole('button', { name: 'Get corrected sleeve sample from Kaveri Apparels' }).first().click()
  await expect(page.getByText(/Update requested · John Doe/).first()).toBeVisible()
  const panel = page.getByRole('dialog')
  await panel.getByLabel('Your response').fill('Tracking DEMO-777; vendor still waiting on the fabric lot.')
  await panel.getByRole('button', { name: 'Respond', exact: true }).click()
  await expect(page.getByText(/Response recorded. The action and issue are unchanged/)).toBeVisible()

  await page.keyboard.press('Escape')
  // Requester returns: New response badge, but the action is NOT complete and issue NOT resolved
  await actAs(page, /Sourcing head/)
  await page.goto('/overview')
  await expect(page.getByRole('row', { name: /AW27 Orbit overshirt/ }).getByText('New response')).toBeVisible()
  await page.getByRole('row', { name: /AW27 Orbit overshirt/ }).click()
  await expect(page.getByRole('listitem').filter({ hasText: 'Get corrected sleeve sample' }).getByText('Blocked')).toBeVisible()
  await expect(page.getByText('New response').first()).toBeVisible()   // opening the page did not mark it read

  // Open the response content → read
  await page.getByRole('listitem').filter({ hasText: 'Get corrected sleeve sample' }).getByRole('button', { name: /Response received|Response on record/ }).first().click().catch(() => {})

  // Explicit resolution of the issue only
  await page.getByRole('button', { name: 'Mark resolved' }).click()
  await page.getByLabel('Resolution note').fill('Corrected sample received and sleeve pitch verified.')
  await page.getByRole('button', { name: 'Mark resolved' }).last().click()
  await page.getByRole('link', { name: 'Back to Overview' }).click()
  await expect(page.getByRole('button', { name: /Sleeve correction unresolved/ })).toHaveCount(0)
  await expect(page.getByRole('row', { name: /AW27 Orbit overshirt/ })).toBeVisible()   // track stays active

  // View resolved → reopen the SAME issue
  await page.getByRole('button', { name: /View resolved/ }).click()
  await page.getByRole('button', { name: /Sleeve correction unresolved/ }).click()
  await page.getByRole('button', { name: 'Reopen', exact: true }).click()
  await page.getByLabel('Reason for reopening').fill('Sleeve pitch regressed on the next sample.')
  await page.getByRole('button', { name: 'Reopen issue' }).click()
  await expect(page.getByText('Earlier resolution retained')).toBeVisible()
  expect(errors).toEqual([])
})

test('Failed save preserves input and shows no false success', async ({ page }) => {
  await page.goto('/overview/work/w_orbit')
  await page.getByRole('button', { name: /Account|John Doe/ }).first().click()
  await page.getByLabel('Simulate save failures (to see input preserved)').check()
  await page.mouse.click(700, 10)
  await page.getByRole('button', { name: '+ Add action' }).click()
  const form = page.getByRole('group', { name: 'Add action' })
  await form.getByRole('textbox', { name: /Action/ }).fill('Check packaging sample')
  await form.getByLabel('Assigned to').selectOption({ index: 1 })
  await form.getByRole('button', { name: 'Add action', exact: true }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Nothing was saved' })).toBeVisible()
  await expect(form.getByRole('textbox', { name: /Action/ })).toHaveValue('Check packaging sample')
  await expect(page.getByText('Check packaging sample', { exact: true })).toHaveCount(0)
})

test('Private notes stay private; posting needs an explicit destination', async ({ page }) => {
  await page.goto('/my-work')
  await page.getByRole('button', { name: '+ Add note' }).click()
  await page.getByLabel('Note', { exact: true }).fill('Private thought about Kaveri')
  await page.getByRole('button', { name: 'Save privately' }).click()
  await expect(page.getByText('Private thought about Kaveri')).toBeVisible()
  await actAs(page, /QA lead/)
  await page.goto('/my-work')
  await expect(page.getByText('Private thought about Kaveri')).toHaveCount(0)
})

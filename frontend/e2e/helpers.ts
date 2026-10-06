import { expect, type Page } from '@playwright/test'

export async function resetDemo(page: Page) {
  await page.addInitScript(() => { if (!sessionStorage.getItem('e2e-init')) { localStorage.clear(); sessionStorage.setItem('e2e-init', '1') } })
  await page.request.post('http://127.0.0.1:8000/api/demo/reset')
}
export async function actAs(page: Page, role: RegExp | string) {
  if (page.url() === 'about:blank') await page.goto('/overview')
  await page.getByRole('button', { name: /John Doe/ }).first().click()
  await page.getByLabel('Demo role (acting as)').selectOption({ label: typeof role === 'string' ? role : (await page.getByLabel('Demo role (acting as)').locator('option').allTextContents()).find(t => role.test(t))! })
  await page.keyboard.press('Escape')
  await page.mouse.click(700, 10)
}
export const expectNoErrors = (errors: string[]) => expect(errors.filter(e => !/favicon/.test(e))).toEqual([])

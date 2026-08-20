import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Reset demo data/i }).click()
})

test('customer can reserve, pay, and receive tickets', async ({ page }) => {
  await page.getByRole('button', { name: /Section D, row 1, seat 8,.*available/i }).click()
  const desktopContinue = page.getByRole('button', { name: 'Reserve and continue' })
  if (await desktopContinue.isVisible()) await desktopContinue.click()
  else await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Your details' })).toBeVisible()
  await page.getByLabel('Full name').fill('End to End Guest')
  await page.getByLabel('Email').fill('e2e@example.test')
  await page.getByRole('button', { name: /^Pay / }).click()
  await expect(page.getByRole('heading', { name: 'Your tickets are ready' })).toBeVisible()
  await expect(page.locator('.ticket-card')).toHaveCount(1)
})

test('admin sees orders and scanner enforces single use', async ({ page }) => {
  await page.getByRole('link', { name: 'Admin' }).click()
  await expect(page.getByRole('heading', { name: 'Event overview' })).toBeVisible()
  await expect(page.getByText('TUM-2027-00001')).toBeVisible()
  await page.getByRole('link', { name: /Check-in/ }).click()
  await page.getByRole('button', { name: 'Validate' }).click()
  await expect(page.getByText('CHECKED IN', { exact: true })).toBeVisible()
  await page.getByPlaceholder('TUM-00001-1 or QR token').fill('TUM-DEMO-001')
  await page.getByRole('button', { name: 'Validate' }).click()
  await expect(page.getByText('ALREADY USED', { exact: true })).toBeVisible()
})

import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Reset demo data/i }).click()
})

test('dense and angled seat cells remain independently clickable', async ({ page }) => {
  await page.getByRole('button', { name: /Section D, row 1, seat 8,.*available/i }).click()
  await page.getByRole('button', { name: /Section D, row 1, seat 7,.*available/i }).click()
  await page.getByRole('button', { name: /Section L, row 4, seat 5,.*available/i }).click()

  await page.locator('[data-seat-id="seat-M-left-6-12"]').click()
  await page.locator('[data-seat-id="seat-M-right-6-12"]').click()

  await expect(page.locator('.seat-block[aria-pressed="true"]')).toHaveCount(5)
})

test('the current session restores its held seats when returning to the map', async ({ page }) => {
  const heldSeat = page.getByRole('button', { name: /Section D, row 1, seat 8,.*available/i })
  await heldSeat.click()
  const reserve = page.getByRole('button', { name: 'Reserve and continue' })
  if (await reserve.isVisible()) await reserve.click()
  else await page.getByRole('button', { name: 'Continue', exact: true }).click()

  await expect(page.getByRole('heading', { name: 'Your details' })).toBeVisible()
  await page.evaluate(() => {
    sessionStorage.removeItem('tumbao:active-order')
    sessionStorage.removeItem('tumbao:active-order-migrated')
  })
  await page.goto('/')

  await expect(page.locator('.selection-summary h2')).toHaveText('1 held seat')
  await expect(page.locator('[data-seat-id="seat-D-1-8"]')).toHaveClass(/seat-owned-held/)
  await expect(page.locator('.selection-summary')).toContainText(/held for this browser session/i)
  await page.getByRole('button', { name: 'Continue checkout' }).click()
  await expect(page.getByRole('heading', { name: 'Your details' })).toBeVisible()
})

test('customer can reserve, pay, and receive tickets', async ({ page }) => {
  await expect(page.locator('svg[viewBox="0 0 900 400"] [data-testid="interactive-venue-plan"]')).toBeVisible()
  await page.getByRole('button', { name: /Section D, row 1, seat 8,.*available/i }).click()
  const desktopContinue = page.getByRole('button', { name: 'Reserve and continue' })
  if (await desktopContinue.isVisible()) await desktopContinue.click()
  else {
    const mobileContinue = page.getByRole('button', { name: 'Continue', exact: true })
    const box = await mobileContinue.boundingBox()
    expect(box).not.toBeNull()
    await page.touchscreen.tap(box!.x + box!.width / 2, box!.y + box!.height / 2)
  }
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

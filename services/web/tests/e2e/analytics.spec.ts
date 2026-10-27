import { expect, test } from '@playwright/test'

/** Llama a `startAnalytics` del módulo real (el servidor de desarrollo lo sirve tal cual) con una configuración. */
const start = (page: import('@playwright/test').Page, env: Record<string, string>) =>
  page.evaluate(async (e) => {
    const m = await import('/src/analytics.ts' as string)
    m.startAnalytics(e)
  }, env)

test.describe('Cota usage statistics (optional)', () => {
  test('nothing is sent without configuration; Google loads only after consent and never after a refusal', async ({ page }) => {
    const external: string[] = []
    await page.route(/googletagmanager\.com|goatcounter\.com/, (route) => {
      external.push(route.request().url())
      return route.fulfill({ status: 204, body: '' })
    })
    await page.goto('/')
    await expect(page.getByTestId('command-input')).toBeVisible()
    await start(page, {})
    await start(page, { VITE_ANALYTICS_GA4: 'javascript:alert(1)', VITE_ANALYTICS_GOATCOUNTER: 'https://evil.example/count' })
    expect(external).toEqual([])

    await start(page, { VITE_ANALYTICS_GA4: 'G-ABC123XYZ' })
    await expect(page.getByTestId('analytics-consent')).toBeVisible()
    expect(external).toEqual([]) // el aviso todavía no fue respondido
    await page.getByTestId('analytics-allow').click()
    await expect.poll(() => external.some((u) => u.includes('gtag/js?id=G-ABC123XYZ'))).toBe(true)
    await start(page, { VITE_ANALYTICS_GA4: 'G-ABC123XYZ' })
    await expect(page.getByTestId('analytics-consent')).toHaveCount(0) // la respuesta se recuerda

    await page.evaluate(() => localStorage.setItem('cota.analyticsConsent', 'no'))
    external.length = 0
    await start(page, { VITE_ANALYTICS_GA4: 'G-ABC123XYZ' })
    await expect(page.getByTestId('analytics-consent')).toHaveCount(0)
    expect(external).toEqual([])
  })

  test('GoatCounter counts the visit with a single request, without cookies or third-party code', async ({ page }) => {
    const hits: string[] = []
    await page.route(/goatcounter\.com/, (route) => {
      hits.push(route.request().url())
      return route.fulfill({ status: 204, body: '' })
    })
    await page.goto('/')
    await expect(page.getByTestId('command-input')).toBeVisible()
    await start(page, { VITE_ANALYTICS_GOATCOUNTER: 'https://cota.goatcounter.com/count' })
    await expect.poll(() => hits.length).toBe(1)
    expect(hits[0]).toMatch(/^https:\/\/cota\.goatcounter\.com\/count\?p=%2F/)
    expect(await page.locator('script[src*="goatcounter"], script[src*="zgo.at"]').count()).toBe(0)
    expect(await page.context().cookies()).toEqual([])
  })
})

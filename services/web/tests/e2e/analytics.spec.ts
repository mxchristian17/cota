import { expect, test, type Page } from '@playwright/test'

/** Llama a `startAnalytics` del módulo real (el servidor de desarrollo lo sirve tal cual) con una configuración. */
const start = (page: Page, env: Record<string, string>) =>
  page.evaluate(async (e) => {
    const m = await import('/src/analytics.ts' as string)
    m.startAnalytics(e)
  }, env)

const SITE = '2f0e5b1c-9a7d-4c3e-8f61-0b2d4a6c8e10'

test.describe('Cota usage statistics (optional, cookieless)', () => {
  test('nothing is sent without a valid configuration', async ({ page }) => {
    const external: string[] = []
    await page.route(/umami/, (route) => {
      external.push(route.request().url())
      return route.fulfill({ status: 200, body: '{}' })
    })
    await page.goto('/')
    await expect(page.getByTestId('command-input')).toBeVisible()
    await start(page, {})
    await start(page, { VITE_ANALYTICS_UMAMI: 'not-an-id' })
    await start(page, { VITE_ANALYTICS_UMAMI: SITE, VITE_ANALYTICS_UMAMI_HOST: 'javascript:alert(1)' })
    await page.waitForTimeout(300)
    expect(external).toEqual([])
  })

  test('a visit is one request, leaving sends the end of the visit; no cookies and no third-party code', async ({ page }) => {
    const sent: Array<{ url: string; body: { type: string; payload: Record<string, string> } }> = []
    await page.route(/gateway\.umami\.is/, (route) => {
      sent.push({ url: route.request().url(), body: route.request().postDataJSON() })
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}', headers: { 'access-control-allow-origin': '*' } })
    })
    await page.goto('/?utm_source=linkedin')
    await expect(page.getByTestId('command-input')).toBeVisible()
    await start(page, { VITE_ANALYTICS_UMAMI: SITE })
    await expect.poll(() => sent.length).toBe(1)
    expect(sent[0].url).toBe('https://gateway.umami.is/api/send')
    expect(sent[0].body.type).toBe('event')
    expect(sent[0].body.payload.website).toBe(SITE)
    expect(sent[0].body.payload.url).toBe('/?utm_source=linkedin') // la atribución del enlace
    expect(sent[0].body.payload.name).toBeUndefined()
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')))
    await expect.poll(() => sent.length).toBe(2)
    expect(sent[1].body.payload.name).toBe('leave')
    expect(await page.locator('script[src*="umami"]').count()).toBe(0)
    expect(await page.context().cookies()).toEqual([])
  })
})

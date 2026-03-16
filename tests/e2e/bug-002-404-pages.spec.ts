import { test, expect } from '@playwright/test';
import { BASE_URL, CANONICAL_PAGES } from '../utils/constants';

/**
 * BUG-002: 6 kanonických URL vracia HTTP 404
 * Tieto URL sú linkované v hlavnej navigácii alebo sitemap.
 * Dopad: strata tržieb, SEO degradácia, PPC waste.
 */

test.describe('BUG-002: Kontrola 404 stránok z hlavnej navigácie', () => {
  for (const page of CANONICAL_PAGES) {
    test(`should_return_200 — ${page.name} (${page.path})`, async ({ request }) => {
      const response = await request.get(`${BASE_URL}${page.path}`);
      const status = response.status();

      if (status === 404) {
        console.error(`[BUG-002] ${page.path} vracia 404 — očakávaný obsah: ${page.name}`);
      }

      expect(status, `URL ${page.path} vracia ${status} namiesto 200`).toBe(200);
    });
  }

  test('should_have_navigation_links — všetky URL odkazované z homepage', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

    const allLinks = await page.evaluate(() => {
      const anchors = document.querySelectorAll('a[href]');
      return Array.from(anchors).map((a) => {
        try {
          return new URL(a.getAttribute('href') || '', document.baseURI).pathname;
        } catch {
          return a.getAttribute('href') || '';
        }
      });
    });

    const missing: string[] = [];
    for (const p of CANONICAL_PAGES) {
      const found = allLinks.some((link) => link === p.path || link.startsWith(p.path + '/'));
      if (!found) missing.push(`${p.name} (${p.path})`);
    }

    expect(missing, `Chýbajúce URL v navigácii:\n${missing.join('\n')}`).toHaveLength(0);
  });
});

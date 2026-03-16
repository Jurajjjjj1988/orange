import { test, expect, APIRequestContext } from '@playwright/test';
import { BASE_URL, HSTS_MIN_MAX_AGE } from '../utils/constants';

/**
 * BUG-001: HTTP Downgrade pri Trailing Slash
 * OWASP A02:2021 — Cryptographic Failures
 *
 * Každá URL s koncovým lomítkom vracia 301 presmerovanie na http://
 * namiesto https://. Prehliadač väčšinou zachytí druhý redirect,
 * ale toto okno je reálny exploit vektor (SSL stripping).
 */

const TRAILING_SLASH_URLS = [
  '/',
  '/e-shop/',
  '/volania-a-pausaly/',
  '/moj-orange/',
];

test.describe('BUG-001: HTTP downgrade pri presmerovaní URL s koncovým lomítkom', () => {
  let context: APIRequestContext;

  test.beforeAll(async ({ playwright }) => {
    context = await playwright.request.newContext({
      baseURL: BASE_URL,
      ignoreHTTPSErrors: true,
      maxRedirects: 0,
    });
  });

  test.afterAll(async () => {
    await context.dispose();
  });

  for (const path of TRAILING_SLASH_URLS) {
    test(`should_not_downgrade_to_http — presmerovanie pre "${path}"`, async () => {
      const response = await context.get(path);
      const status = response.status();
      const locationHeader = response.headers()['location'];

      if (status >= 300 && status < 400) {
        expect(locationHeader, `Chýba Location hlavička pre ${path}`).toBeDefined();
        expect(
          locationHeader,
          `BUG-001: Presmerovanie pre ${path} používa http:// namiesto https://. Location: ${locationHeader}`,
        ).not.toMatch(/^http:\/\//);

        if (locationHeader?.startsWith('http')) {
          expect(locationHeader, `Location hlavička pre ${path} musí začínať na https://`).toMatch(/^https:\/\//);
        }
      }
    });

    test(`should_have_valid_hsts — HSTS hlavička pre "${path}"`, async () => {
      const response = await context.get(path);
      const hstsHeader = response.headers()['strict-transport-security'];

      expect(hstsHeader, `Chýba Strict-Transport-Security hlavička pre ${path}`).toBeDefined();

      const maxAgeMatch = hstsHeader?.match(/max-age=(\d+)/);
      expect(maxAgeMatch, `HSTS hlavička pre ${path} neobsahuje platnú max-age hodnotu`).not.toBeNull();

      const maxAge = parseInt(maxAgeMatch![1], 10);
      expect(maxAge, `HSTS max-age pre ${path} je príliš nízky: ${maxAge}s`).toBeGreaterThanOrEqual(HSTS_MIN_MAX_AGE);
    });
  }
});

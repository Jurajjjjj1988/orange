import { test, expect, APIRequestContext } from '@playwright/test';

// BUG-001: HTTP Downgrade pri Trailing Slash
// KaÅ¾dÃ¡ URL s koncovÃ½m lomÃ­tkom vracia 301 presmerovanie na http:// namiesto https://.
// Tento test overuje, Å¾e presmerovanie pouÅ¾Ã­va https:// a Å¾e sÃº nastavenÃ© HSTS hlaviÄky.

const BASE_URL = 'https://www.orange.sk';

const TRAILING_SLASH_URLS = [
  '/',
  '/e-shop/',
  '/volania-a-pausaly/',
  '/moj-orange/',
];

test.describe('BUG-001: HTTP downgrade pri presmerovanÃ­ URL s koncovÃ½m lomÃ­tkom', () => {
  let context: APIRequestContext;

  test.beforeAll(async ({ playwright }) => {
    // VytvorÃ­me HTTP kontext bez automatickÃ©ho sledovania presmerovanÃ­,
    // aby sme mohli skontrolovaÅ¥ Location hlaviÄku prvÃ©ho presmerovania.
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
    test(`presmerovanie pre "${path}" musÃ­ pouÅ¾Ã­vaÅ¥ https://, nie http://`, async () => {
      // OdoÅ¡leme GET poÅ¾iadavku na danÃº URL s koncovÃ½m lomÃ­tkom
      const response = await context.get(path);
      const status = response.status();
      const locationHeader = response.headers()['location'];

      // Ak server vrÃ¡ti presmerovanie (3xx), Location hlaviÄka nesmie obsahovaÅ¥ http://
      if (status >= 300 && status < 400) {
        expect(
          locationHeader,
          `Presmerovanie pre ${path} nemÃ¡ nastavenÃº Location hlaviÄku`,
        ).toBeDefined();

        // HlavnÃ¡ kontrola: Location nesmie zaÄÃ­naÅ¥ na http:// (musÃ­ byÅ¥ https://)
        expect(
          locationHeader,
          `BUG-001: Presmerovanie pre ${path} pouÅ¾Ã­va http:// namiesto https://. Location: ${locationHeader}`,
        ).not.toMatch(/^http:\/\//);

        // Ak je Location absolÃºtna URL, musÃ­ zaÄÃ­naÅ¥ na https://
        if (locationHeader && locationHeader.startsWith('http')) {
          expect(
            locationHeader,
            `Location hlaviÄka pre ${path} musÃ­ zaÄÃ­naÅ¥ na https://`,
          ).toMatch(/^https:\/\//);
        }
      }

      // Ak server vrÃ¡ti 200, presmerovanie sa nekonÃ¡ â to je v poriadku
      // StÃ¡le vÅ¡ak overÃ­me HSTS hlaviÄku
    });

    test(`HSTS hlaviÄka pre "${path}" musÃ­ byÅ¥ prÃ­tomnÃ¡ s dostatoÄnÃ½m max-age`, async () => {
      // OdoÅ¡leme poÅ¾iadavku a skontrolujeme Strict-Transport-Security hlaviÄku
      const response = await context.get(path);
      const hstsHeader = response.headers()['strict-transport-security'];

      // HSTS hlaviÄka musÃ­ byÅ¥ prÃ­tomnÃ¡
      expect(
        hstsHeader,
        `ChÃ½ba Strict-Transport-Security hlaviÄka pre ${path}`,
      ).toBeDefined();

      // Extrahujeme max-age hodnotu a overÃ­me, Å¾e je dostatoÄne vysokÃ¡ (min. 1 rok = 31536000)
      const maxAgeMatch = hstsHeader?.match(/max-age=(\d+)/);
      expect(
        maxAgeMatch,
        `HSTS hlaviÄka pre ${path} neobsahuje platnÃº max-age hodnotu. Hodnota: ${hstsHeader}`,
      ).not.toBeNull();

      const maxAge = parseInt(maxAgeMatch![1], 10);
      const ONE_YEAR_IN_SECONDS = 31_536_000;

      expect(
        maxAge,
        `HSTS max-age pre ${path} je prÃ­liÅ¡ nÃ­zky: ${maxAge}s (minimum: ${ONE_YEAR_IN_SECONDS}s)`,
      ).toBeGreaterThanOrEqual(ONE_YEAR_IN_SECONDS);
    });
  }
});

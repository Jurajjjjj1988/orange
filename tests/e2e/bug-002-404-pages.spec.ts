import { test, expect } from '@playwright/test';

/**
 * BUG-002: 6 kanonickÃ½ch URL vracia HTTP 404.
 * Tieto URL sÃº odkazovanÃ© z hlavnej navigÃ¡cie / sitemapy.
 */

const BASE_URL = 'https://www.orange.sk';

// Zoznam URL, ktorÃ© by mali vracaÅ¥ 200, ale vracajÃº 404
const PAGES = [
  {
    path: '/volania-a-pausal/pausal',
    name: 'PauÅ¡Ã¡lne tarify',
    description: 'StrÃ¡nka s pauÅ¡Ã¡lnymi tarifami',
  },
  {
    path: '/telefony-a-zariadenia/smartfony',
    name: 'SmartfÃ³ny eshop',
    description: 'StrÃ¡nka s ponukou smartfÃ³nov',
  },
  {
    path: '/internetatv/internet',
    name: 'Internet sekcia',
    description: 'StrÃ¡nka so sekciou internetu',
  },
  {
    path: '/pre-biznis',
    name: 'Business sekcia',
    description: 'StrÃ¡nka pre firemnÃ½ch zÃ¡kaznÃ­kov',
  },
  {
    path: '/eshop',
    name: 'HlavnÃ½ e-shop',
    description: 'HlavnÃ¡ strÃ¡nka e-shopu',
  },
  {
    path: '/obchody',
    name: 'Zoznam predajnÃ­',
    description: 'StrÃ¡nka so zoznamom predajnÃ­ Orange',
  },
];

test.describe('BUG-002: Kontrola 404 strÃ¡nok z hlavnej navigÃ¡cie', () => {
  // Kontrola HTTP statusu kaÅ¾dej URL pomocou request kontextu
  for (const page of PAGES) {
    test(`${page.name} (${page.path}) by mala vracaÅ¥ HTTP 200`, async ({ request }) => {
      const url = `${BASE_URL}${page.path}`;

      // Odoslanie GET poÅ¾iadavky na danÃº URL
      const response = await request.get(url);
      const status = response.status();

      // Ak je 404, zalogujeme detaily o chybe
      if (status === 404) {
        console.error(
          `[BUG-002] ZLYHANIE: ${url} vracia 404\n` +
          `  OÄakÃ¡vanÃ½ obsah: ${page.description}\n` +
          `  NÃ¡zov strÃ¡nky: ${page.name}`
        );
      }

      // Overenie, Å¾e strÃ¡nka vracia 200 a nie 404
      expect(status, `URL ${url} vracia ${status} namiesto 200. OÄakÃ¡vanÃ½ obsah: ${page.description}`).toBe(200);
    });
  }

  // BonusovÃ½ test: overenie, Å¾e tieto URL sÃº skutoÄne odkazovanÃ© z hlavnej navigÃ¡cie
  test('VÅ¡etky URL by mali byÅ¥ odkazovanÃ© z navigÃ¡cie na domovskej strÃ¡nke', async ({ browser }) => {
    const context = await browser.newContext();
    const browserPage = await context.newPage();

    // NaÄÃ­tanie domovskej strÃ¡nky
    await browserPage.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

    // Zozbieranie vÅ¡etkÃ½ch odkazov z navigÃ¡cie a celej strÃ¡nky
    const allLinks = await browserPage.evaluate(() => {
      const anchors = document.querySelectorAll('a[href]');
      return Array.from(anchors).map((a) => a.getAttribute('href') || '');
    });

    // NormalizÃ¡cia odkazov â relatÃ­vne aj absolÃºtne
    const normalizedLinks = allLinks.map((href) => {
      try {
        const url = new URL(href, window.origin || 'https://www.orange.sk');
        return url.pathname;
      } catch {
        return href;
      }
    });

    // Overenie prÃ­tomnosti kaÅ¾dej URL v navigÃ¡cii
    const chybajuce: string[] = [];

    for (const page of PAGES) {
      const found = normalizedLinks.some(
        (link) => link === page.path || link.startsWith(page.path + '/')
      );

      if (!found) {
        chybajuce.push(`${page.name} (${page.path})`);
        console.warn(`[BUG-002] Odkaz na ${page.path} (${page.name}) sa nenaÅ¡iel na domovskej strÃ¡nke`);
      }
    }

    // VÅ¡etky URL by mali byÅ¥ prÃ­tomnÃ© v navigÃ¡cii
    expect(
      chybajuce,
      `NasledujÃºce URL chÃ½bajÃº v navigÃ¡cii na domovskej strÃ¡nke:\n${chybajuce.join('\n')}`
    ).toHaveLength(0);

    await context.close();
  });
});

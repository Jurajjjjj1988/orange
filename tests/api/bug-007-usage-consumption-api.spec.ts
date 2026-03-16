import { test, expect, APIRequestContext } from '@playwright/test';

/**
 * BUG-007: GET /api/usageConsumption/v1/usageConsumptionReport
 *
 * Endpoint vracia HTTP 500 Internal Server Error s internym chybovym kodom 1001
 * namiesto ocakavaneho HTTP 200 s udajmi o spotrebe.
 */

// Zakladna URL a spolocne hlavicky
const BASE_URL = 'https://apis.ocp.orange.sk';
const ENDPOINT = '/api/usageConsumption/v1/usageConsumptionReport';

const COMMON_HEADERS = {
  Host: 'apis.ocp.orange.sk',
  Accept: 'application/json; charset=utf-8',
  'Content-Type': 'application/json; charset=utf-8',
  Origin: 'https://www.orange.sk',
  Referer: 'https://www.orange.sk/',
};

// Rozne hodnoty publicKey na testovanie
const PUBLIC_KEYS = [
  '421583969091',
  '421901234567',
  '421902345678',
];

// Ocakavana schema odpovede pre usageConsumptionReport
function validateResponseSchema(body: Record<string, unknown>) {
  // Hlavny objekt musi obsahovat usageConsumptionReport
  expect(body).toHaveProperty('usageConsumptionReport');

  const report = body.usageConsumptionReport as Record<string, unknown>;

  // Overenie prÃ­tomnosti klucovych kategorii spotreby
  expect(report).toHaveProperty('voice');
  expect(report).toHaveProperty('sms');
  expect(report).toHaveProperty('data');
  expect(report).toHaveProperty('bucket');
}

test.describe('BUG-007: UsageConsumption API - GET usageConsumptionReport', () => {
  let apiContext: APIRequestContext;

  test.beforeAll(async ({ playwright }) => {
    apiContext = await playwright.request.newContext({
      baseURL: BASE_URL,
      extraHTTPHeaders: COMMON_HEADERS,
    });
  });

  test.afterAll(async () => {
    await apiContext.dispose();
  });

  // Hlavny test - endpoint by mal vratit 200, nie 500
  test('BUG-007: endpoint by mal vratit HTTP 200 pre platny publicKey', async () => {
    const response = await apiContext.get(`${ENDPOINT}?publicKey=421583969091`);
    const status = response.status();

    // Ak dostaneme 500, skontrolujeme interny chybovy kod
    if (status === 500) {
      const body = await response.json();
      // Overenie ci odpoved obsahuje interny chybovy kod 1001
      const hasErrorCode1001 =
        body?.error?.code === 1001 ||
        body?.errorCode === 1001 ||
        body?.code === 1001;

      // Zaznamenanie detailov chyby pre diagnostiku
      console.error('BUG-007 reprodukovany: Server vracia 500 s telom:', JSON.stringify(body));

      if (hasErrorCode1001) {
        console.error('Potvrdeny interny chybovy kod 1001');
      }
    }

    // Ocakavame uspesnu odpoved
    expect(status, 'Endpoint vracia 500 namiesto 200 - BUG-007 stale existuje').toBe(200);
  });

  // Overenie struktury odpovede ak je uspesna
  test('odpoved by mala obsahovat platnu schemu usageConsumptionReport', async () => {
    const response = await apiContext.get(`${ENDPOINT}?publicKey=421583969091`);

    // Preskocime validaciu schemy ak server vracia chybu
    test.skip(response.status() !== 200, 'Nie je mozne validovat schemu - server vracia chybu');

    const body = await response.json();
    validateResponseSchema(body);
  });

  // Test s roznymi hodnotami publicKey
  for (const publicKey of PUBLIC_KEYS) {
    test(`endpoint by mal fungovat pre publicKey=${publicKey}`, async () => {
      const response = await apiContext.get(`${ENDPOINT}?publicKey=${publicKey}`);
      const status = response.status();

      if (status === 500) {
        const body = await response.json();
        console.error(`publicKey=${publicKey}: Server vracia 500, telo:`, JSON.stringify(body));
      }

      // Ocakavame 200 alebo 404 (neexistujuci kluc), ale nie 500
      expect(
        status,
        `Server vracia 500 pre publicKey=${publicKey} - BUG-007`
      ).not.toBe(500);
    });
  }

  // Meranie casu odpovede
  test('cas odpovede by mal byt v akceptovatelnom rozsahu', async () => {
    const start = Date.now();
    const response = await apiContext.get(`${ENDPOINT}?publicKey=421583969091`);
    const duration = Date.now() - start;

    console.log(`Cas odpovede: ${duration} ms, status: ${response.status()}`);

    // Odpoved by mala prist do 5 sekund aj pri chybe
    expect(duration, `Odpoved trvala prilis dlho: ${duration} ms`).toBeLessThan(5000);
  });

  // Test opakovania - zistenie ci sa endpoint zotavi po chybe
  test('BUG-007: test opakovania - endpoint by sa mal zotavit pri opakovanych poziadavkach', async () => {
    const maxRetries = 3;
    const results: { attempt: number; status: number; duration: number }[] = [];

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const start = Date.now();
      const response = await apiContext.get(`${ENDPOINT}?publicKey=421583969091`);
      const duration = Date.now() - start;

      results.push({
        attempt,
        status: response.status(),
        duration,
      });

      // Ak uspeje, nemusime pokracovat
      if (response.status() === 200) {
        break;
      }

      // Kratka pauza medzi opakovaniami
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    console.log('Vysledky opakovani:', JSON.stringify(results, null, 2));

    // Aspon jeden pokus by mal byt uspesny
    const anySuccess = results.some((r) => r.status === 200);

    if (!anySuccess) {
      console.error(
        'BUG-007: Endpoint sa nezotavil ani po opakovanych pokusoch - vsetky vratili chybu'
      );
    }

    expect(
      anySuccess,
      'Endpoint sa nezotavil ani po opakovanych pokusoch - BUG-007 je konzistentny'
    ).toBe(true);
  });

  // Overenie chyboveho kodu 1001 v roznych formatoch odpovede
  test('BUG-007: identifikacia chyboveho kodu 1001 v odpovedi', async () => {
    const response = await apiContext.get(`${ENDPOINT}?publicKey=421583969091`);

    // Tento test je relevantny len ak server vracia 500
    test.skip(response.status() !== 500, 'Server nevracia 500 - bug moze byt opraveny');

    const body = await response.json();

    // Hladame chybovy kod 1001 v roznych moznych strukturach
    const errorCode =
      body?.error?.code ??
      body?.errorCode ??
      body?.code ??
      body?.errors?.[0]?.code ??
      null;

    console.error('Struktura chybovej odpovede:', JSON.stringify(body, null, 2));
    console.error('Najdeny chybovy kod:', errorCode);

    expect(errorCode, 'Ocakavany interny chybovy kod 1001').toBe(1001);
  });
});

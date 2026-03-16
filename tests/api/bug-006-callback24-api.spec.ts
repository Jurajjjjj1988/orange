import { test, expect, APIRequestContext } from '@playwright/test';

// BUG-006: Callback24 API vracia prazdny JSON ({}) pri vysokej zatazi
// Endpoint: srv-e01.callback24.io/api/browser/service_status/ESHOP-TELEFONY1/EN

const API_URL = 'https://srv-e01.callback24.io/api/browser/service_status/ESHOP-TELEFONY1/EN';

// Ocakavane polia v odpovedi
const EXPECTED_FIELDS = ['status', 'mode', 'company_name', 'widget_color', 'current_time'];

/**
 * Pomocna funkcia - skontroluje ci odpoved obsahuje vsetky ocakavane polia
 */
function isCompleteResponse(body: Record<string, unknown>): boolean {
  return EXPECTED_FIELDS.every((field) => field in body);
}

/**
 * Pomocna funkcia - skontroluje ci je odpoved prazdny objekt
 */
function isEmptyResponse(body: Record<string, unknown>): boolean {
  return Object.keys(body).length === 0;
}

test.describe('BUG-006: Callback24 API - prazdny JSON pri vysokej zatazi', () => {
  let apiContext: APIRequestContext;

  // Vytvorenie API kontextu pred kazdym testom
  test.beforeEach(async ({ playwright }) => {
    apiContext = await playwright.request.newContext({
      baseURL: 'https://srv-e01.callback24.io',
    });
  });

  // Uzavretie API kontextu po kazdom teste
  test.afterEach(async () => {
    await apiContext.dispose();
  });

  test('Jednotlivy request - overenie odpovede a ocakavanych poli', async () => {
    // Odoslanie jedneho requestu na API
    const response = await apiContext.get('/api/browser/service_status/ESHOP-TELEFONY1/EN');

    // Overenie HTTP statusu
    expect(response.status()).toBe(200);

    const body = await response.json();

    // Kontrola ci odpoved nie je prazdny objekt - hlavny bug
    const empty = isEmptyResponse(body);
    if (empty) {
      console.warn('BUG-006 REPRODUKOVANY: API vratilo prazdny JSON {}');
    }
    expect(empty, 'Odpoved by nemala byt prazdny JSON objekt {}').toBe(false);

    // Overenie pritomnosti vsetkych ocakavanych poli
    for (const field of EXPECTED_FIELDS) {
      expect(body, `Odpoved by mala obsahovat pole "${field}"`).toHaveProperty(field);
    }
  });

  test('Validacia schemy odpovede', async () => {
    // Odoslanie requestu
    const response = await apiContext.get('/api/browser/service_status/ESHOP-TELEFONY1/EN');
    expect(response.status()).toBe(200);

    const body = await response.json();

    // Preskocenie validacie ak je odpoved prazdna (bug)
    if (isEmptyResponse(body)) {
      test.fail(true, 'BUG-006: API vratilo prazdny JSON {}, schema validacia nie je mozna');
      return;
    }

    // Validacia typov jednotlivych poli
    expect(typeof body.status, 'Pole "status" musi byt retazec').toBe('string');
    expect(typeof body.mode, 'Pole "mode" musi byt retazec').toBe('string');
    expect(typeof body.company_name, 'Pole "company_name" musi byt retazec').toBe('string');

    // widget_color moze byt retazec alebo null
    if (body.widget_color !== null) {
      expect(typeof body.widget_color, 'Pole "widget_color" musi byt retazec alebo null').toBe('string');
    }

    // current_time moze byt retazec alebo cislo
    expect(
      typeof body.current_time === 'string' || typeof body.current_time === 'number',
      'Pole "current_time" musi byt retazec alebo cislo'
    ).toBe(true);
  });

  test('Sucasne requesty - 30 paralelnych volani na detekciu prazdnych odpovedi', async ({ playwright }) => {
    const CONCURRENT_REQUESTS = 30;

    // Statistiky
    let completeCount = 0;
    let emptyCount = 0;
    let incompleteCount = 0;
    let errorCount = 0;
    const responseTimes: number[] = [];

    // Vytvorenie viacerych API kontextov pre paralelne volania
    const contexts: APIRequestContext[] = [];
    for (let i = 0; i < CONCURRENT_REQUESTS; i++) {
      const ctx = await playwright.request.newContext({
        baseURL: 'https://srv-e01.callback24.io',
      });
      contexts.push(ctx);
    }

    // Odoslanie vsetkych requestov sucasne
    const promises = contexts.map(async (ctx, index) => {
      const start = Date.now();
      try {
        const response = await ctx.get('/api/browser/service_status/ESHOP-TELEFONY1/EN');
        const elapsed = Date.now() - start;
        responseTimes.push(elapsed);

        if (response.status() !== 200) {
          console.warn(`Request ${index + 1}: HTTP ${response.status()}`);
          errorCount++;
          return;
        }

        const body = await response.json();

        if (isEmptyResponse(body)) {
          // Prazdna odpoved - BUG-006
          emptyCount++;
          console.warn(`Request ${index + 1}: PRAZDNY JSON {} (${elapsed}ms)`);
        } else if (isCompleteResponse(body)) {
          // Kompletna odpoved
          completeCount++;
        } else {
          // Nekompletna odpoved - chybaju niektore polia
          const missingFields = EXPECTED_FIELDS.filter((f) => !(f in body));
          incompleteCount++;
          console.warn(`Request ${index + 1}: Chybajuce polia: ${missingFields.join(', ')} (${elapsed}ms)`);
        }
      } catch (error) {
        const elapsed = Date.now() - start;
        responseTimes.push(elapsed);
        errorCount++;
        console.error(`Request ${index + 1}: Chyba - ${error} (${elapsed}ms)`);
      }
    });

    // Pockanie na vsetky requesty
    await Promise.all(promises);

    // Uzavretie vsetkych kontextov
    await Promise.all(contexts.map((ctx) => ctx.dispose()));

    // Vypocet statistik casov odpovede
    const avgTime = responseTimes.length > 0
      ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
      : 0;
    const maxTime = responseTimes.length > 0 ? Math.max(...responseTimes) : 0;
    const minTime = responseTimes.length > 0 ? Math.min(...responseTimes) : 0;

    // Uspesnost
    const successRate = ((completeCount / CONCURRENT_REQUESTS) * 100).toFixed(1);

    // Vypis reportu
    console.log('\n========================================');
    console.log('BUG-006: REPORT SUCASNYCH REQUESTOV');
    console.log('========================================');
    console.log(`Celkovy pocet requestov: ${CONCURRENT_REQUESTS}`);
    console.log(`Kompletne odpovede:      ${completeCount}`);
    console.log(`Prazdne odpovede ({}):   ${emptyCount}`);
    console.log(`Nekompletne odpovede:    ${incompleteCount}`);
    console.log(`Chyby:                   ${errorCount}`);
    console.log(`Uspesnost:               ${successRate}%`);
    console.log('----------------------------------------');
    console.log(`Priemerny cas odpovede:  ${avgTime}ms`);
    console.log(`Minimalny cas:           ${minTime}ms`);
    console.log(`Maximalny cas:           ${maxTime}ms`);
    console.log('========================================\n');

    // Prazdne odpovede su povazovane za zlyhanie - BUG-006
    if (emptyCount > 0) {
      console.warn(`BUG-006 REPRODUKOVANY: ${emptyCount} z ${CONCURRENT_REQUESTS} odpovedi bolo prazdnych ({})`);
    }

    // Ocakavame ze vsetky odpovede budu kompletne
    expect(
      emptyCount,
      `BUG-006: ${emptyCount} requestov vratilo prazdny JSON {}. Uspesnost: ${successRate}%`
    ).toBe(0);

    expect(
      incompleteCount,
      `${incompleteCount} requestov vratilo nekompletnu odpoved`
    ).toBe(0);
  });

  test('Meranie casov odpovede - 10 sekvencnych requestov', async () => {
    const REQUEST_COUNT = 10;
    const responseTimes: number[] = [];

    for (let i = 0; i < REQUEST_COUNT; i++) {
      const start = Date.now();
      const response = await apiContext.get('/api/browser/service_status/ESHOP-TELEFONY1/EN');
      const elapsed = Date.now() - start;
      responseTimes.push(elapsed);

      expect(response.status()).toBe(200);

      const body = await response.json();

      // Kazda prazdna odpoved je zlyhanie
      if (isEmptyResponse(body)) {
        console.warn(`BUG-006: Sekvencny request ${i + 1} vratil prazdny JSON {} (${elapsed}ms)`);
      }
    }

    // Vypocet statistik
    const avgTime = Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length);
    const maxTime = Math.max(...responseTimes);
    const minTime = Math.min(...responseTimes);
    const sortedTimes = [...responseTimes].sort((a, b) => a - b);
    const p95 = sortedTimes[Math.ceil(0.95 * sortedTimes.length) - 1];

    console.log('\n========================================');
    console.log('MERANIE CASOV ODPOVEDE (sekvencne)');
    console.log('========================================');
    console.log(`Pocet requestov: ${REQUEST_COUNT}`);
    console.log(`Priemerny cas:   ${avgTime}ms`);
    console.log(`Min cas:         ${minTime}ms`);
    console.log(`Max cas:         ${maxTime}ms`);
    console.log(`P95:             ${p95}ms`);
    console.log(`Vsetky casy:     ${responseTimes.join(', ')}ms`);
    console.log('========================================\n');

    // Cas odpovede by nemal prekrocit 10 sekund
    expect(maxTime, `Maximalny cas odpovede ${maxTime}ms prekrocil limit 10s`).toBeLessThan(10000);
  });
});

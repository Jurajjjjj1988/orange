import { test, expect, APIRequestContext } from '@playwright/test';

/**
 * BUG-007: API 500 Internal Server Error — usageConsumptionReport
 *
 * GET /api/usageConsumption/v1/usageConsumptionReport?publicKey=421583969091
 * Host: apis.ocp.orange.sk
 *
 * Endpoint vracia HTTP 500 s interným error kódom 1001.
 * Zákazníci nevidia spotrebu v Môj Orange.
 */

const API_BASE = 'https://apis.ocp.orange.sk';
const ENDPOINT = '/api/usageConsumption/v1/usageConsumptionReport';

const API_HEADERS = {
  Host: 'apis.ocp.orange.sk',
  Accept: 'application/json; charset=utf-8',
  'Content-Type': 'application/json; charset=utf-8',
  Origin: 'https://www.orange.sk',
  Referer: 'https://www.orange.sk/',
};

const PUBLIC_KEYS = ['421583969091', '421901234567', '421902345678'];

test.describe('BUG-007: UsageConsumption API — GET usageConsumptionReport', () => {
  let apiContext: APIRequestContext;

  test.beforeAll(async ({ playwright }) => {
    apiContext = await playwright.request.newContext({
      baseURL: API_BASE,
      extraHTTPHeaders: API_HEADERS,
    });
  });

  test.afterAll(async () => {
    await apiContext.dispose();
  });

  test('should_return_200 — endpoint musí vrátiť HTTP 200', async () => {
    const response = await apiContext.get(`${ENDPOINT}?publicKey=${PUBLIC_KEYS[0]}`);
    const status = response.status();

    if (status === 500) {
      const body = await response.json();
      const errorCode = body?.code ?? body?.error?.code ?? body?.errorCode ?? null;
      console.error(`BUG-007: Server vracia 500 — error code: ${errorCode}, body: ${JSON.stringify(body)}`);
    }

    expect(status, 'BUG-007: Endpoint vracia 500 namiesto 200').toBe(200);
  });

  test('should_have_valid_schema — validácia schémy odpovede', async () => {
    const response = await apiContext.get(`${ENDPOINT}?publicKey=${PUBLIC_KEYS[0]}`);
    test.skip(response.status() !== 200, 'Server vracia chybu — schema validácia nie je možná');

    const body = await response.json();
    expect(body).toHaveProperty('usageConsumptionReport');

    const report = body.usageConsumptionReport;
    expect(report).toHaveProperty('voice');
    expect(report).toHaveProperty('sms');
    expect(report).toHaveProperty('data');
    expect(report).toHaveProperty('bucket');
  });

  for (const publicKey of PUBLIC_KEYS) {
    test(`should_not_return_500 — publicKey=${publicKey}`, async () => {
      const response = await apiContext.get(`${ENDPOINT}?publicKey=${publicKey}`);
      expect(response.status(), `Server vracia 500 pre publicKey=${publicKey}`).not.toBe(500);
    });
  }

  test('should_respond_within_timeout — čas odpovede < 5s', async () => {
    const start = Date.now();
    const response = await apiContext.get(`${ENDPOINT}?publicKey=${PUBLIC_KEYS[0]}`);
    const duration = Date.now() - start;
    console.log(`Čas odpovede: ${duration}ms, status: ${response.status()}`);
    expect(duration, `Odpoveď trvala ${duration}ms`).toBeLessThan(5_000);
  });

  test('should_recover_on_retry — endpoint sa musí zotaviť', async () => {
    const results: { attempt: number; status: number; duration: number }[] = [];

    for (let attempt = 1; attempt <= 3; attempt++) {
      const start = Date.now();
      const response = await apiContext.get(`${ENDPOINT}?publicKey=${PUBLIC_KEYS[0]}`);
      results.push({ attempt, status: response.status(), duration: Date.now() - start });

      if (response.status() === 200) break;
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }

    console.log('Retry výsledky:', JSON.stringify(results));
    const anySuccess = results.some((r) => r.status === 200);
    expect(anySuccess, 'Endpoint sa nezotavil ani po 3 pokusoch').toBe(true);
  });

  test('should_identify_error_code_1001 — identifikácia chybového kódu', async () => {
    const response = await apiContext.get(`${ENDPOINT}?publicKey=${PUBLIC_KEYS[0]}`);
    test.skip(response.status() !== 500, 'Server nevracia 500 — bug môže byť opravený');

    const body = await response.json();
    const errorCode = body?.code ?? body?.error?.code ?? body?.errorCode ?? body?.errors?.[0]?.code ?? null;
    console.error('Chybová odpoveď:', JSON.stringify(body, null, 2));
    expect(errorCode, 'Očakávaný interný chybový kód 1001').toBe(1001);
  });
});

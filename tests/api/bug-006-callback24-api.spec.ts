import { test, expect, APIRequestContext } from '@playwright/test';

/**
 * BUG-006: Callback24 API vracia prázdny JSON ({}) pri vysokej záťaži
 * Endpoint: srv-e01.callback24.io/api/browser/service_status/ESHOP-TELEFONY1/EN
 */

const API_BASE = 'https://srv-e01.callback24.io';
const API_PATH = '/api/browser/service_status/ESHOP-TELEFONY1/EN';
const EXPECTED_FIELDS = ['status', 'mode', 'company_name', 'widget_color', 'current_time'] as const;

function isCompleteResponse(body: Record<string, unknown>): boolean {
  return EXPECTED_FIELDS.every((field) => field in body);
}

function isEmptyResponse(body: Record<string, unknown>): boolean {
  return Object.keys(body).length === 0;
}

test.describe('BUG-006: Callback24 API — prázdny JSON pri vysokej záťaži', () => {
  let apiContext: APIRequestContext;

  test.beforeEach(async ({ playwright }) => {
    apiContext = await playwright.request.newContext({ baseURL: API_BASE });
  });

  test.afterEach(async () => {
    await apiContext.dispose();
  });

  test('should_return_complete_response — overenie odpovede a očakávaných polí', async () => {
    const response = await apiContext.get(API_PATH);
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(isEmptyResponse(body), 'Odpoveď je prázdny JSON {}').toBe(false);

    for (const field of EXPECTED_FIELDS) {
      expect(body, `Chýba pole "${field}"`).toHaveProperty(field);
    }
  });

  test('should_have_valid_schema — validácia schémy odpovede', async () => {
    const response = await apiContext.get(API_PATH);
    expect(response.status()).toBe(200);

    const body = await response.json();
    if (isEmptyResponse(body)) {
      test.fail(true, 'BUG-006: API vrátilo prázdny JSON {}');
      return;
    }

    expect(typeof body.status).toBe('string');
    expect(typeof body.mode).toBe('string');
    expect(typeof body.company_name).toBe('string');
    if (body.widget_color !== null) {
      expect(typeof body.widget_color).toBe('string');
    }
    expect(['string', 'number']).toContain(typeof body.current_time);
  });

  test('should_handle_concurrent_requests — 30 paralelných volaní', async ({ playwright }) => {
    const CONCURRENT = 30;
    let completeCount = 0;
    let emptyCount = 0;
    let incompleteCount = 0;
    let errorCount = 0;
    const responseTimes: number[] = [];

    const contexts: APIRequestContext[] = [];
    for (let i = 0; i < CONCURRENT; i++) {
      contexts.push(await playwright.request.newContext({ baseURL: API_BASE }));
    }

    await Promise.all(contexts.map(async (ctx, index) => {
      const start = Date.now();
      try {
        const response = await ctx.get(API_PATH);
        responseTimes.push(Date.now() - start);

        if (response.status() !== 200) { errorCount++; return; }

        const body = await response.json();
        if (isEmptyResponse(body)) { emptyCount++; }
        else if (isCompleteResponse(body)) { completeCount++; }
        else { incompleteCount++; }
      } catch {
        responseTimes.push(Date.now() - start);
        errorCount++;
      }
    }));

    await Promise.all(contexts.map((ctx) => ctx.dispose()));

    const successRate = ((completeCount / CONCURRENT) * 100).toFixed(1);
    console.log(`Výsledky: ${completeCount} OK, ${emptyCount} prázdne, ${incompleteCount} neúplné, ${errorCount} chyby — ${successRate}%`);

    if (responseTimes.length > 0) {
      const avg = Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length);
      console.log(`Časy: avg=${avg}ms, min=${Math.min(...responseTimes)}ms, max=${Math.max(...responseTimes)}ms`);
    }

    expect(emptyCount, `BUG-006: ${emptyCount}/${CONCURRENT} prázdnych odpovedí`).toBe(0);
    expect(incompleteCount, `${incompleteCount} neúplných odpovedí`).toBe(0);
  });

  test('should_respond_within_timeout — meranie časov odpovede', async () => {
    const responseTimes: number[] = [];

    for (let i = 0; i < 10; i++) {
      const start = Date.now();
      const response = await apiContext.get(API_PATH);
      responseTimes.push(Date.now() - start);
      expect(response.status()).toBe(200);
    }

    const sorted = [...responseTimes].sort((a, b) => a - b);
    const p95 = sorted[Math.ceil(0.95 * sorted.length) - 1];
    console.log(`P95: ${p95}ms, Max: ${Math.max(...responseTimes)}ms`);

    expect(Math.max(...responseTimes), 'Odpoveď trvala viac ako 10s').toBeLessThan(10_000);
  });
});

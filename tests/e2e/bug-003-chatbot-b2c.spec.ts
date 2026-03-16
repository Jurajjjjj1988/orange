import { test, expect, Page } from '@playwright/test';
import { BASE_URL, B2B_URL } from '../utils/constants';
import { acceptCookiesIfPresent } from '../utils/helpers';

/**
 * BUG-003: Chatbot len na B2B, chýba na B2C
 *
 * Chat widget je dostupný iba na B2B portáli (orange.sk/biznis),
 * ale na hlavnom B2C portáli (orange.sk) úplne chýba.
 * B2C zákazníci nemajú prístup k online podpore cez chat.
 */

const CHAT_WIDGET_SELECTORS = [
  '.cx-widget', '.cx-webchat', '#cx-webchat', '[class*="cx-widget"]',
  '[id*="chat-widget"]', '[class*="chat-widget"]',
  '[id*="chatbot"]', '[class*="chatbot"]',
  'iframe[src*="chat"]', 'iframe[title*="chat" i]',
  '[class*="chat-button"]', '[class*="chat-launcher"]',
];

const CHAT_BUTTON_TEXTS = ['chat', 'Chat', 'Sme online', 'Online', 'Napíšte nám', 'Potrebujete pomoc'];

async function findChatWidget(page: Page): Promise<{ found: boolean; method: string; details: string }> {
  for (const selector of CHAT_WIDGET_SELECTORS) {
    try {
      const element = page.locator(selector).first();
      if (await element.isVisible({ timeout: 2_000 })) {
        return { found: true, method: 'css-selector', details: `Nájdený: ${selector}` };
      }
    } catch { /* skip */ }
  }

  for (const text of CHAT_BUTTON_TEXTS) {
    try {
      const button = page.locator(`button:has-text("${text}")`).first();
      if (await button.isVisible({ timeout: 1_000 })) {
        return { found: true, method: 'button-text', details: `Nájdené tlačidlo: "${text}"` };
      }
    } catch { /* skip */ }
  }

  const chatScriptPresent = await page.evaluate(() =>
    Array.from(document.querySelectorAll('script[src]')).some((s) =>
      ['chat', 'cx-webchat', 'genesys', 'livechat'].some((kw) => s.getAttribute('src')?.includes(kw)),
    ),
  );

  if (chatScriptPresent) {
    return { found: true, method: 'script-tag', details: 'Chat skript nájdený v DOM' };
  }

  return { found: false, method: 'none', details: 'Chat widget nebol nájdený' };
}

async function loadPageWithChat(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await acceptCookiesIfPresent(page);
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  // Wait for lazy-loaded chat widget
  await page.waitForSelector('.cx-widget, [class*="chat"]', { timeout: 10_000 }).catch(() => {});
}

test.describe('BUG-003: Chat widget dostupnosť na B2C vs B2B portáli', () => {
  test.setTimeout(60_000);

  test('should_have_chat_widget_on_b2c — B2C portál musí mať chat', async ({ page }) => {
    await loadPageWithChat(page, BASE_URL);
    const result = await findChatWidget(page);
    expect(result.found, `Chat widget chýba na B2C: ${result.details}`).toBe(true);
  });

  test('should_have_chat_widget_on_b2b — B2B portál musí mať chat', async ({ page }) => {
    await loadPageWithChat(page, B2B_URL);
    const result = await findChatWidget(page);
    expect(result.found, `Chat widget chýba na B2B: ${result.details}`).toBe(true);
  });

  test('should_have_chat_on_both_portals — konzistencia B2C vs B2B', async ({ page }) => {
    await loadPageWithChat(page, B2B_URL);
    const b2bResult = await findChatWidget(page);

    await loadPageWithChat(page, BASE_URL);
    const b2cResult = await findChatWidget(page);

    if (b2bResult.found && !b2cResult.found) {
      expect(false, `BUG-003: Chat je na B2B (${b2bResult.details}) ale CHÝBA na B2C`).toBe(true);
    }

    expect(b2cResult.found, 'B2C nemá chat widget').toBe(true);
    expect(b2bResult.found, 'B2B nemá chat widget').toBe(true);
  });
});

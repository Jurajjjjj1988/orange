import { test, expect, Page } from '@playwright/test';

/**
 * BUG-003: Chatbot/live chat widget chÃ½ba na B2C portÃ¡li
 *
 * Popis: Chat widget (napr. "Sme online") je dostupnÃ½ iba na B2B portÃ¡li (orange.sk/biznis),
 * ale na hlavnom B2C portÃ¡li (orange.sk) Ãºplne chÃ½ba.
 *
 * Dopad na biznis:
 *   - B2C zÃ¡kaznÃ­ci nemajÃº prÃ­stup k online podpore cez chat
 *   - ZvÃ½Å¡enÃ¡ zÃ¡Å¥aÅ¾ na call centrum, pretoÅ¾e zÃ¡kaznÃ­ci nemajÃº alternatÃ­vny kanÃ¡l
 *   - HorÅ¡ia zÃ¡kaznÃ­cka skÃºsenosÅ¥ a potenciÃ¡lna strata konverziÃ­
 *   - NekonzistentnÃ© sprÃ¡vanie medzi B2B a B2C portÃ¡lom
 */

// Selektory pre beÅ¾nÃ© chat widgety pouÅ¾Ã­vanÃ© na orange.sk
const CHAT_WIDGET_SELECTORS = [
  // CX (Genesys/PureConnect) chat widget
  '.cx-widget',
  '.cx-webchat',
  '#cx-webchat',
  '[class*="cx-widget"]',
  // VÅ¡eobecnÃ© chat selektory
  '[id*="chat-widget"]',
  '[class*="chat-widget"]',
  '[id*="chatbot"]',
  '[class*="chatbot"]',
  '[id*="livechat"]',
  '[class*="livechat"]',
  // Chat iframe
  'iframe[src*="chat"]',
  'iframe[title*="chat" i]',
  'iframe[title*="Chat" i]',
  // Floating chat button
  '[class*="chat-button"]',
  '[class*="chat-launcher"]',
  '[id*="chat-button"]',
  '[id*="chat-launcher"]',
];

// TextovÃ© patterny, ktorÃ© sa mÃ´Å¾u nachÃ¡dzaÅ¥ na chat tlaÄidle
const CHAT_BUTTON_TEXTS = [
  'chat',
  'Chat',
  'Sme online',
  'Online',
  'online',
  'NapÃ­Å¡te nÃ¡m',
  'Potrebujete pomoc',
];

/**
 * PomocnÃ¡ funkcia: akceptuje cookies banner ak sa zobrazÃ­
 * Cookies banner blokuje interakciu so strÃ¡nkou
 */
async function acceptCookiesIfPresent(page: Page): Promise<void> {
  // PoÄkÃ¡me krÃ¡tko na prÃ­padnÃ½ cookie banner
  const cookieSelectors = [
    'button:has-text("SÃºhlasÃ­m")',
    'button:has-text("PrijaÅ¥")',
    'button:has-text("PrijaÅ¥ vÅ¡etko")',
    'button:has-text("AkceptovaÅ¥")',
    'button:has-text("PovoliÅ¥ vÅ¡etko")',
    'button:has-text("SÃºhlasÃ­m so vÅ¡etkÃ½mi")',
    'button:has-text("Accept")',
    'button:has-text("Accept all")',
    '[id*="cookie"] button',
    '[class*="cookie"] button',
    '[id*="consent"] button',
    '[class*="consent"] button',
  ];

  for (const selector of cookieSelectors) {
    try {
      const button = page.locator(selector).first();
      if (await button.isVisible({ timeout: 3000 })) {
        await button.click();
        // PoÄkÃ¡me kÃ½m banner zmizne
        await page.waitForTimeout(1000);
        return;
      }
    } catch {
      // Tento selektor neexistuje, skÃºsime ÄalÅ¡Ã­
    }
  }
}

/**
 * PomocnÃ¡ funkcia: hÄ¾adÃ¡ chat widget na strÃ¡nke
 * Vracia objekt s informÃ¡ciou Äi bol widget nÃ¡jdenÃ½ a akÃ½m spÃ´sobom
 */
async function findChatWidget(page: Page): Promise<{
  found: boolean;
  method: string;
  details: string;
}> {
  // 1. HÄ¾adÃ¡me podÄ¾a CSS selektorov
  for (const selector of CHAT_WIDGET_SELECTORS) {
    try {
      const element = page.locator(selector).first();
      if (await element.isVisible({ timeout: 2000 })) {
        return {
          found: true,
          method: 'css-selector',
          details: `NÃ¡jdenÃ½ element: ${selector}`,
        };
      }
    } catch {
      // Selektor neexistuje, pokraÄujeme
    }
  }

  // 2. HÄ¾adÃ¡me tlaÄidlo s textom sÃºvisiacim s chatom
  for (const text of CHAT_BUTTON_TEXTS) {
    try {
      const button = page.locator(`button:has-text("${text}")`).first();
      if (await button.isVisible({ timeout: 1000 })) {
        return {
          found: true,
          method: 'button-text',
          details: `NÃ¡jdenÃ© tlaÄidlo s textom: "${text}"`,
        };
      }
    } catch {
      // Text neexistuje, pokraÄujeme
    }
  }

  // 3. HÄ¾adÃ¡me akÃ½koÄ¾vek element s aria-label sÃºvisiacim s chatom
  const ariaSelectors = [
    '[aria-label*="chat" i]',
    '[aria-label*="Chat" i]',
    '[aria-label*="online" i]',
    '[title*="chat" i]',
  ];
  for (const selector of ariaSelectors) {
    try {
      const element = page.locator(selector).first();
      if (await element.isVisible({ timeout: 1000 })) {
        return {
          found: true,
          method: 'aria-label',
          details: `NÃ¡jdenÃ½ element s atribÃºtom: ${selector}`,
        };
      }
    } catch {
      // PokraÄujeme
    }
  }

  // 4. HÄ¾adÃ¡me chat v shadow DOM alebo dynamicky naÄÃ­tanÃ½ch skriptoch
  const chatScriptPresent = await page.evaluate(() => {
    const scripts = Array.from(document.querySelectorAll('script[src]'));
    return scripts.some(
      (s) =>
        s.getAttribute('src')?.includes('chat') ||
        s.getAttribute('src')?.includes('cx-webchat') ||
        s.getAttribute('src')?.includes('genesys') ||
        s.getAttribute('src')?.includes('livechat')
    );
  });

  if (chatScriptPresent) {
    return {
      found: true,
      method: 'script-tag',
      details: 'NÃ¡jdenÃ½ chat skript v zdrojovom kÃ³de strÃ¡nky (widget sa mÃ´Å¾e naÄÃ­taÅ¥ oneskorene)',
    };
  }

  return {
    found: false,
    method: 'none',
    details: 'Chat widget nebol nÃ¡jdenÃ½ Å¾iadnou metÃ³dou',
  };
}

test.describe('BUG-003: Chat widget dostupnosÅ¥ na B2C vs B2B portÃ¡li', () => {
  // ZvÃ½Å¡enÃ½ timeout â externÃ© strÃ¡nky sa mÃ´Å¾u naÄÃ­tavaÅ¥ dlhÅ¡ie
  test.setTimeout(60_000);

  let b2cChatResult: { found: boolean; method: string; details: string };
  let b2bChatResult: { found: boolean; method: string; details: string };

  /**
   * Test 1: Overenie prÃ­tomnosti chat widgetu na B2C portÃ¡li (orange.sk)
   * OÄakÃ¡vanÃ½ vÃ½sledok: Chat widget BY MAL byÅ¥ prÃ­tomnÃ½ (aktuÃ¡lne chÃ½ba â BUG)
   */
  test('B2C portÃ¡l (orange.sk) by mal obsahovaÅ¥ chat widget', async ({ page }) => {
    // NavigÃ¡cia na B2C portÃ¡l
    await page.goto('https://www.orange.sk', {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    // Akceptovanie cookies ak sa zobrazÃ­ banner
    await acceptCookiesIfPresent(page);

    // PoÄkÃ¡me na ÃºplnÃ© naÄÃ­tanie strÃ¡nky vrÃ¡tane lazy-loaded komponentov
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {
      // networkidle mÃ´Å¾e timeoutovaÅ¥ na strÃ¡nkach s analytickÃ½mi skriptami
    });

    // DodatoÄnÃ© Äakanie na dynamicky naÄÃ­tanÃ½ chat widget
    await page.waitForTimeout(5000);

    // HÄ¾adÃ¡me chat widget
    b2cChatResult = await findChatWidget(page);

    // BUG-003: Chat widget chÃ½ba na B2C â tento test by mal ZLYHAÅ¤, ÄÃ­m potvrdÃ­ bug
    // KeÄ bude bug opravenÃ½, test bude prechÃ¡dzaÅ¥
    expect(
      b2cChatResult.found,
      `Chat widget nebol nÃ¡jdenÃ½ na B2C portÃ¡li (orange.sk). ` +
        `ZÃ¡kaznÃ­ci na B2C nemajÃº prÃ­stup k online chatu. ` +
        `Detail: ${b2cChatResult.details}`
    ).toBe(true);
  });

  /**
   * Test 2: Overenie prÃ­tomnosti chat widgetu na B2B portÃ¡li (orange.sk/biznis)
   * OÄakÃ¡vanÃ½ vÃ½sledok: Chat widget JE prÃ­tomnÃ½ (funguje sprÃ¡vne)
   */
  test('B2B portÃ¡l (orange.sk/biznis) by mal obsahovaÅ¥ chat widget', async ({ page }) => {
    // NavigÃ¡cia na B2B portÃ¡l
    await page.goto('https://www.orange.sk/biznis', {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    // Akceptovanie cookies
    await acceptCookiesIfPresent(page);

    // ÄakÃ¡me na ÃºplnÃ© naÄÃ­tanie
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});

    // DodatoÄnÃ© Äakanie na dynamicky naÄÃ­tanÃ½ chat widget
    await page.waitForTimeout(5000);

    // HÄ¾adÃ¡me chat widget
    b2bChatResult = await findChatWidget(page);

    // B2B portÃ¡l by mal maÅ¥ chat widget â overenie referenÄnÃ©ho sprÃ¡vania
    expect(
      b2bChatResult.found,
      `Chat widget nebol nÃ¡jdenÃ½ ani na B2B portÃ¡li (orange.sk/biznis). ` +
        `Detail: ${b2bChatResult.details}`
    ).toBe(true);
  });

  /**
   * Test 3: Porovnanie â oba portÃ¡ly musia maÅ¥ chat widget
   * Tento test overuje konzistenciu medzi B2C a B2B portÃ¡lom
   */
  test('chat widget musÃ­ byÅ¥ prÃ­tomnÃ½ na oboch portÃ¡loch (B2C aj B2B)', async ({ page }) => {
    // Najprv skontrolujeme B2B portÃ¡l (referenÄnÃ½ â funguje)
    await page.goto('https://www.orange.sk/biznis', {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    await acceptCookiesIfPresent(page);
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(5000);
    const b2bResult = await findChatWidget(page);

    // Potom skontrolujeme B2C portÃ¡l (bugovÃ½)
    await page.goto('https://www.orange.sk', {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    await acceptCookiesIfPresent(page);
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(5000);
    const b2cResult = await findChatWidget(page);

    // Porovnanie: ak B2B mÃ¡ chat a B2C nie, potvrdzuje to bug BUG-003
    if (b2bResult.found && !b2cResult.found) {
      // ExplicitnÃ© zlyhanie s jasnÃ½m popisom bugu
      expect(
        false,
        `BUG-003 POTVRDENÃ: Chat widget je dostupnÃ½ na B2B portÃ¡li ` +
          `(${b2bResult.details}), ale CHÃBA na B2C portÃ¡li. ` +
          `Toto spÃ´sobuje, Å¾e B2C zÃ¡kaznÃ­ci nemajÃº prÃ­stup k online podpore.`
      ).toBe(true);
    }

    // Oba portÃ¡ly musia maÅ¥ chat widget
    expect(b2cResult.found, 'B2C portÃ¡l nemÃ¡ chat widget').toBe(true);
    expect(b2bResult.found, 'B2B portÃ¡l nemÃ¡ chat widget').toBe(true);
  });
});

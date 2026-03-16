import { test, expect } from '@playwright/test';

/**
 * BUG-005: DuplicitnÃ¡ navigÃ¡cia bez ARIA atribÃºtov
 *
 * Popis: HTML strÃ¡nky obsahujÃº dva identickÃ© <nav> bloky v DOM.
 * Oba sÃº vÅ¾dy prÃ­tomnÃ© (viditeÄ¾nosÅ¥ sa prepÃ­na cez CSS display: none).
 * ÄÃ­taÄka obrazovky preÄÃ­ta navigÃ¡ciu dvakrÃ¡t.
 * ChÃ½bajÃºce aria-label a aria-hidden atribÃºty.
 *
 * WCAG 2.1 SC 1.3.1 (Info and Relationships, Level A):
 * InformÃ¡cie, Å¡truktÃºra a vzÅ¥ahy sprostredkovanÃ© prezentÃ¡ciou
 * musia byÅ¥ programovo urÄiteÄ¾nÃ© alebo dostupnÃ© v texte.
 */

// PomocnÃ¡ Å¡truktÃºra pre vÃ½sledky inÅ¡pekcie navigaÄnÃ½ch elementov
interface NavElementInfo {
  index: number;
  /** Äi je element viditeÄ¾nÃ½ (display !== 'none' a visibility !== 'hidden') */
  isVisible: boolean;
  /** Hodnota CSS display */
  cssDisplay: string;
  /** Hodnota CSS visibility */
  cssVisibility: string;
  /** Hodnota aria-label atribÃºtu alebo null */
  ariaLabel: string | null;
  /** Hodnota aria-hidden atribÃºtu alebo null */
  ariaHidden: string | null;
  /** VnÃºtornÃ½ textovÃ½ obsah (skrÃ¡tenÃ½) */
  textSnippet: string;
  /** Äi mÃ¡ element role="navigation" */
  hasRoleNavigation: boolean;
}

test.describe('BUG-005: DuplicitnÃ¡ navigÃ¡cia bez ARIA atribÃºtov', () => {
  test.beforeEach(async ({ page }) => {
    // Nastavenie vÃ¤ÄÅ¡ieho ÄasovÃ©ho limitu pre naÄÃ­tanie strÃ¡nky
    page.setDefaultTimeout(30_000);

    // Krok 1: PrejsÅ¥ na strÃ¡nku orange.sk
    await page.goto('https://www.orange.sk', { waitUntil: 'domcontentloaded' });

    // Krok 2: PrijaÅ¥ cookies, ak sa zobrazÃ­ dialÃ³g
    // HÄ¾adÃ¡me beÅ¾nÃ© selektory pre cookie liÅ¡tu na orange.sk
    const cookieSelectors = [
      'button:has-text("SÃºhlasÃ­m")',
      'button:has-text("PrijaÅ¥")',
      'button:has-text("AkceptovaÅ¥")',
      'button:has-text("PovoliÅ¥")',
      'button:has-text("Accept")',
      'button:has-text("OK")',
      '[id*="cookie"] button',
      '[class*="cookie"] button',
      '[id*="consent"] button',
      '[class*="consent"] button',
    ];

    for (const selector of cookieSelectors) {
      try {
        const btn = page.locator(selector).first();
        if (await btn.isVisible({ timeout: 3_000 })) {
          await btn.click();
          // PoÄkaÅ¥ kÃ½m zmizne cookie liÅ¡ta
          await page.waitForTimeout(1_000);
          break;
        }
      } catch {
        // Tento selektor nebol nÃ¡jdenÃ½, skÃºsime ÄalÅ¡Ã­
      }
    }
  });

  test('Krok 3-8: AnalÃ½za vÅ¡etkÃ½ch <nav> elementov v DOM vrÃ¡tane skrytÃ½ch', async ({ page }) => {
    // Krok 3: SpoÄÃ­taÅ¥ vÅ¡etky <nav> elementy v DOM (vrÃ¡tane skrytÃ½ch)
    // PouÅ¾Ã­vame page.evaluate() na priamu inÅ¡pekciu DOM
    const navInfos: NavElementInfo[] = await page.evaluate(() => {
      const navElements = document.querySelectorAll('nav');
      const results: NavElementInfo[] = [];

      navElements.forEach((nav, index) => {
        const computedStyle = window.getComputedStyle(nav);
        const cssDisplay = computedStyle.display;
        const cssVisibility = computedStyle.visibility;
        const isVisible = cssDisplay !== 'none' && cssVisibility !== 'hidden';

        results.push({
          index,
          isVisible,
          cssDisplay,
          cssVisibility,
          ariaLabel: nav.getAttribute('aria-label'),
          ariaHidden: nav.getAttribute('aria-hidden'),
          textSnippet: (nav.textContent || '').trim().substring(0, 80),
          hasRoleNavigation: nav.getAttribute('role') === 'navigation',
        });
      });

      return results;
    });

    // Krok 3: VÃ½pis celkovÃ©ho poÄtu <nav> elementov
    const totalNavCount = navInfos.length;
    console.log(`CelkovÃ½ poÄet <nav> elementov v DOM: ${totalNavCount}`);

    // Krok 8: VÃ½pis stavu kaÅ¾dÃ©ho <nav> elementu â viditeÄ¾nosÅ¥ a ARIA atribÃºty
    for (const nav of navInfos) {
      console.log(
        `  nav[${nav.index}]: ` +
        `viditeÄ¾nÃ½=${nav.isVisible}, ` +
        `display="${nav.cssDisplay}", ` +
        `visibility="${nav.cssVisibility}", ` +
        `aria-label="${nav.ariaLabel}", ` +
        `aria-hidden="${nav.ariaHidden}", ` +
        `role=navigation: ${nav.hasRoleNavigation}, ` +
        `text: "${nav.textSnippet}..."`
      );
    }

    // Rozdelenie na viditeÄ¾nÃ© a skrytÃ© navigÃ¡cie
    const visibleNavs = navInfos.filter((n) => n.isVisible);
    const hiddenNavs = navInfos.filter((n) => !n.isVisible);

    console.log(`ViditeÄ¾nÃ© navigÃ¡cie: ${visibleNavs.length}`);
    console.log(`SkrytÃ© navigÃ¡cie: ${hiddenNavs.length}`);

    // --- OVERENIA (assertions) ---

    // Krok 4: SkontrolovaÅ¥, Äi aspoÅ jeden <nav> mÃ¡ aria-label
    // WCAG 2.1 SC 1.3.1 â ak existuje viac navigÃ¡ciÃ­, kaÅ¾dÃ¡ musÃ­ maÅ¥ unikÃ¡tny aria-label
    const navsWithAriaLabel = navInfos.filter((n) => n.ariaLabel !== null);
    console.log(`NavigÃ¡cie s aria-label: ${navsWithAriaLabel.length} z ${totalNavCount}`);

    // Ak existuje viac ako jedna navigÃ¡cia, kaÅ¾dÃ¡ by mala maÅ¥ aria-label
    // na rozlÃ­Å¡enie ÃºÄelu (WCAG SC 1.3.1)
    if (totalNavCount > 1) {
      /**
       * WCAG 2.1 SC 1.3.1: KaÅ¾dÃ½ <nav> element musÃ­ maÅ¥ aria-label,
       * aby ÄÃ­taÄky obrazovky dokÃ¡zali rozlÃ­Å¡iÅ¥ ÃºÄel jednotlivÃ½ch navigÃ¡ciÃ­.
       */
      expect(
        navsWithAriaLabel.length,
        'KaÅ¾dÃ½ <nav> element by mal maÅ¥ aria-label pre rozlÃ­Å¡enie navigÃ¡ciÃ­ (WCAG 2.1 SC 1.3.1)'
      ).toBe(totalNavCount);

      // OveriÅ¥, Å¾e aria-label hodnoty sÃº unikÃ¡tne
      const ariaLabels = navsWithAriaLabel.map((n) => n.ariaLabel);
      const uniqueLabels = new Set(ariaLabels);
      expect(
        uniqueLabels.size,
        'Hodnoty aria-label musia byÅ¥ unikÃ¡tne pre kaÅ¾dÃº navigÃ¡ciu (WCAG 2.1 SC 1.3.1)'
      ).toBe(ariaLabels.length);
    }

    // Krok 5: SkontrolovaÅ¥, Äi skrytÃ© <nav> elementy majÃº aria-hidden="true"
    /**
     * WCAG 2.1 SC 1.3.1: SkrytÃ© navigÃ¡cie (display: none) musia maÅ¥
     * aria-hidden="true", aby ÄÃ­taÄky obrazovky nepreÄÃ­tali duplicitnÃ½ obsah.
     */
    for (const hiddenNav of hiddenNavs) {
      expect(
        hiddenNav.ariaHidden,
        `SkrytÃ½ nav[${hiddenNav.index}] by mal maÅ¥ aria-hidden="true" (WCAG 2.1 SC 1.3.1)`
      ).toBe('true');
    }

    // Krok 6: WCAG 2.1 SC 1.3.1 â overenie programovej urÄiteÄ¾nosti
    /**
     * WCAG 2.1 SC 1.3.1: Ak existujÃº duplicitnÃ© navigÃ¡cie,
     * musia byÅ¥ programovo rozlÃ­Å¡iteÄ¾nÃ©. Overujeme:
     * - KaÅ¾dÃ½ viditeÄ¾nÃ½ <nav> mÃ¡ aria-label
     * - SkrytÃ© <nav> majÃº aria-hidden="true"
     * - NeexistujÃº duplicitnÃ© navigÃ¡cie bez rozlÃ­Å¡enia
     */
    for (const visibleNav of visibleNavs) {
      expect(
        visibleNav.ariaLabel,
        `ViditeÄ¾nÃ½ nav[${visibleNav.index}] musÃ­ maÅ¥ aria-label (WCAG 2.1 SC 1.3.1)`
      ).not.toBeNull();
    }

    // Krok 7: Kontrola CSS display/visibility kaÅ¾dÃ©ho <nav> elementu
    for (const nav of navInfos) {
      // OverÃ­me, Å¾e vieme urÄiÅ¥ stav viditeÄ¾nosti
      expect(
        ['none', 'block', 'flex', 'grid', 'inline', 'inline-block', 'inline-flex', 'inline-grid', 'contents', 'list-item', ''],
        `nav[${nav.index}] mÃ¡ neoÄakÃ¡vanÃº hodnotu CSS display: "${nav.cssDisplay}"`
      ).toContain(nav.cssDisplay);

      console.log(
        `  nav[${nav.index}] CSS stav: display="${nav.cssDisplay}", visibility="${nav.cssVisibility}" â ` +
        `${nav.isVisible ? 'VIDITEÄ½NÃ' : 'SKRYTÃ'}`
      );
    }
  });

  test('Overenie, Å¾e duplicitnÃ© navigÃ¡cie nenarÃºÅ¡ajÃº prÃ­stupnosÅ¥', async ({ page }) => {
    /**
     * WCAG 2.1 SC 1.3.1: Tento test overuje, Å¾e strÃ¡nka neobsahuje
     * duplicitnÃ© navigÃ¡cie, ktorÃ© by ÄÃ­taÄka obrazovky preÄÃ­tala dvakrÃ¡t.
     * Ak existujÃº dve <nav> s rovnakÃ½m obsahom, je to chyba prÃ­stupnosti.
     */
    const duplicateInfo = await page.evaluate(() => {
      const navElements = document.querySelectorAll('nav');
      const navTexts: string[] = [];
      const navDetails: Array<{
        index: number;
        textContent: string;
        isVisible: boolean;
        ariaHidden: string | null;
        ariaLabel: string | null;
      }> = [];

      navElements.forEach((nav, index) => {
        const computedStyle = window.getComputedStyle(nav);
        const text = (nav.textContent || '').trim().replace(/\s+/g, ' ');
        navTexts.push(text);
        navDetails.push({
          index,
          textContent: text.substring(0, 100),
          isVisible: computedStyle.display !== 'none' && computedStyle.visibility !== 'hidden',
          ariaHidden: nav.getAttribute('aria-hidden'),
          ariaLabel: nav.getAttribute('aria-label'),
        });
      });

      // NÃ¡jsÅ¥ duplicitnÃ© navigÃ¡cie (s rovnakÃ½m textovÃ½m obsahom)
      const duplicates: number[][] = [];
      for (let i = 0; i < navTexts.length; i++) {
        for (let j = i + 1; j < navTexts.length; j++) {
          if (navTexts[i] === navTexts[j]) {
            duplicates.push([i, j]);
          }
        }
      }

      return { navDetails, duplicates };
    });

    console.log('Detaily navigaÄnÃ½ch elementov:');
    for (const detail of duplicateInfo.navDetails) {
      console.log(
        `  nav[${detail.index}]: viditeÄ¾nÃ½=${detail.isVisible}, ` +
        `aria-hidden="${detail.ariaHidden}", aria-label="${detail.ariaLabel}", ` +
        `text: "${detail.textContent}..."`
      );
    }

    // Ak existujÃº duplicitnÃ© navigÃ¡cie, skontrolujeme ARIA atribÃºty
    if (duplicateInfo.duplicates.length > 0) {
      console.log(`VAROVANIE: NÃ¡jdenÃ© duplicitnÃ© navigÃ¡cie: ${JSON.stringify(duplicateInfo.duplicates)}`);

      /**
       * WCAG 2.1 SC 1.3.1: DuplicitnÃ© navigÃ¡cie musia byÅ¥ sprÃ¡vne
       * oznaÄenÃ© aria atribÃºtmi. MinimÃ¡lne jedna z duplicÃ­t musÃ­ maÅ¥
       * aria-hidden="true", aby sa zabrÃ¡nilo dvojitÃ©mu ÄÃ­taniu.
       */
      for (const [i, j] of duplicateInfo.duplicates) {
        const navI = duplicateInfo.navDetails[i];
        const navJ = duplicateInfo.navDetails[j];

        // AspoÅ jedna z duplicitnÃ½ch navigÃ¡ciÃ­ musÃ­ maÅ¥ aria-hidden="true"
        const atLeastOneHidden = navI.ariaHidden === 'true' || navJ.ariaHidden === 'true';
        expect(
          atLeastOneHidden,
          `DuplicitnÃ© nav[${i}] a nav[${j}] â aspoÅ jedna musÃ­ maÅ¥ aria-hidden="true" (WCAG 2.1 SC 1.3.1)`
        ).toBe(true);

        // ViditeÄ¾nÃ¡ navigÃ¡cia musÃ­ maÅ¥ aria-label
        const visibleNav = navI.isVisible ? navI : navJ;
        expect(
          visibleNav.ariaLabel,
          `ViditeÄ¾nÃ¡ duplicitnÃ¡ nav[${visibleNav.index}] musÃ­ maÅ¥ aria-label (WCAG 2.1 SC 1.3.1)`
        ).not.toBeNull();
      }
    }
  });
});

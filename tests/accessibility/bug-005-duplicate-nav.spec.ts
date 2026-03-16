import { test, expect } from '@playwright/test';
import { BASE_URL } from '../utils/constants';
import { acceptCookiesIfPresent } from '../utils/helpers';

/**
 * BUG-005: Duplicitná navigácia bez ARIA
 *
 * HTML stránky obsahujú dva identické <nav> bloky v DOM.
 * Oba sú vždy prítomné (viditeľnosť prepínaná cez CSS display: none).
 * Screen reader číta navigáciu dvakrát. Chýba aria-label a aria-hidden.
 *
 * WCAG 2.1 SC 1.3.1 (Info and Relationships, Level A)
 */

interface NavElementInfo {
  index: number;
  isVisible: boolean;
  cssDisplay: string;
  cssVisibility: string;
  ariaLabel: string | null;
  ariaHidden: string | null;
  textSnippet: string;
  hasRoleNavigation: boolean;
}

test.describe('BUG-005: Duplicitná navigácia bez ARIA atribútov', () => {
  test.beforeEach(async ({ page }) => {
    page.setDefaultTimeout(30_000);
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await acceptCookiesIfPresent(page);
  });

  test('should_have_aria_labels_on_all_navs — analýza <nav> elementov', async ({ page }) => {
    const navInfos: NavElementInfo[] = await page.evaluate(() => {
      const navElements = document.querySelectorAll('nav');
      return Array.from(navElements).map((nav, index) => {
        const style = window.getComputedStyle(nav);
        return {
          index,
          isVisible: style.display !== 'none' && style.visibility !== 'hidden',
          cssDisplay: style.display,
          cssVisibility: style.visibility,
          ariaLabel: nav.getAttribute('aria-label'),
          ariaHidden: nav.getAttribute('aria-hidden'),
          textSnippet: (nav.textContent || '').trim().substring(0, 80),
          hasRoleNavigation: nav.getAttribute('role') === 'navigation',
        };
      });
    });

    const visibleNavs = navInfos.filter((n) => n.isVisible);
    const hiddenNavs = navInfos.filter((n) => !n.isVisible);

    console.log(`Nav elementov: ${navInfos.length} (viditeľné: ${visibleNavs.length}, skryté: ${hiddenNavs.length})`);
    navInfos.forEach((nav) => console.log(
      `  nav[${nav.index}]: visible=${nav.isVisible}, display="${nav.cssDisplay}", ` +
      `aria-label="${nav.ariaLabel}", aria-hidden="${nav.ariaHidden}"`,
    ));

    // WCAG SC 1.3.1: Ak viac navigácií, každá musí mať aria-label
    if (navInfos.length > 1) {
      const navsWithAriaLabel = navInfos.filter((n) => n.ariaLabel !== null);
      expect(navsWithAriaLabel.length, 'Každý <nav> musí mať aria-label (WCAG 2.1 SC 1.3.1)').toBe(navInfos.length);

      const uniqueLabels = new Set(navsWithAriaLabel.map((n) => n.ariaLabel));
      expect(uniqueLabels.size, 'aria-label hodnoty musia byť unikátne').toBe(navsWithAriaLabel.length);
    }

    // Skryté navigácie musia mať aria-hidden="true"
    for (const hiddenNav of hiddenNavs) {
      expect(hiddenNav.ariaHidden, `Skrytý nav[${hiddenNav.index}] musí mať aria-hidden="true"`).toBe('true');
    }

    // Viditeľné navigácie musia mať aria-label
    for (const visibleNav of visibleNavs) {
      expect(visibleNav.ariaLabel, `Viditeľný nav[${visibleNav.index}] musí mať aria-label`).not.toBeNull();
    }
  });

  test('should_not_have_duplicate_nav_content — detekcia duplicít', async ({ page }) => {
    const duplicateInfo = await page.evaluate(() => {
      const navElements = document.querySelectorAll('nav');
      const navTexts: string[] = [];
      const navDetails: Array<{
        index: number; textContent: string; isVisible: boolean;
        ariaHidden: string | null; ariaLabel: string | null;
      }> = [];

      navElements.forEach((nav, index) => {
        const style = window.getComputedStyle(nav);
        const text = (nav.textContent || '').trim().replace(/\s+/g, ' ');
        navTexts.push(text);
        navDetails.push({
          index,
          textContent: text.substring(0, 100),
          isVisible: style.display !== 'none' && style.visibility !== 'hidden',
          ariaHidden: nav.getAttribute('aria-hidden'),
          ariaLabel: nav.getAttribute('aria-label'),
        });
      });

      const duplicates: number[][] = [];
      for (let i = 0; i < navTexts.length; i++) {
        for (let j = i + 1; j < navTexts.length; j++) {
          if (navTexts[i] === navTexts[j]) duplicates.push([i, j]);
        }
      }

      return { navDetails, duplicates };
    });

    if (duplicateInfo.duplicates.length > 0) {
      console.log(`Duplicitné navigácie: ${JSON.stringify(duplicateInfo.duplicates)}`);

      for (const [i, j] of duplicateInfo.duplicates) {
        const navI = duplicateInfo.navDetails[i];
        const navJ = duplicateInfo.navDetails[j];
        const atLeastOneHidden = navI.ariaHidden === 'true' || navJ.ariaHidden === 'true';
        expect(atLeastOneHidden, `Duplicitné nav[${i}] a nav[${j}] — aspoň jedna musí mať aria-hidden="true"`).toBe(true);
      }
    }
  });
});

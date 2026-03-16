import { Page } from '@playwright/test';
import { COOKIE_CONSENT_SELECTORS } from './constants';

/**
 * Accepts cookie consent banner if present.
 * Uses locator with short timeout to avoid blocking tests.
 */
export async function acceptCookiesIfPresent(page: Page): Promise<void> {
  for (const selector of COOKIE_CONSENT_SELECTORS) {
    try {
      const button = page.locator(selector).first();
      if (await button.isVisible({ timeout: 3_000 })) {
        await button.click();
        await button.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
        return;
      }
    } catch {
      // Selector not found, try next
    }
  }
}

/** Cookie audit entry parsed from Set-Cookie header */
export interface CookieAuditEntry {
  name: string;
  value: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: string;
  domain: string;
  path: string;
  source: string;
}

/**
 * Parses a raw Set-Cookie header string into a structured CookieAuditEntry.
 */
export function parseSetCookie(raw: string, sourceUrl: string): CookieAuditEntry | null {
  const parts = raw.split(';').map((p) => p.trim());
  if (parts.length === 0) return null;

  const [nameValue, ...attributes] = parts;
  const eqIndex = nameValue.indexOf('=');
  if (eqIndex === -1) return null;

  const name = nameValue.substring(0, eqIndex).trim();
  const value = nameValue.substring(eqIndex + 1).trim();

  let secure = false;
  let httpOnly = false;
  let sameSite = 'none';
  let domain = '';
  let path = '/';

  for (const attr of attributes) {
    const lower = attr.toLowerCase();
    if (lower === 'secure') secure = true;
    else if (lower === 'httponly') httpOnly = true;
    else if (lower.startsWith('samesite=')) sameSite = attr.split('=')[1]?.trim() ?? 'none';
    else if (lower.startsWith('domain=')) domain = attr.split('=')[1]?.trim() ?? '';
    else if (lower.startsWith('path=')) path = attr.split('=')[1]?.trim() ?? '/';
  }

  return { name, value, secure, httpOnly, sameSite, domain, path, source: sourceUrl };
}

/** Redirect hop info for tracing redirect chains */
export interface RedirectHop {
  url: string;
  statusCode: number;
  location: string | null;
  protocol: 'https' | 'http';
}

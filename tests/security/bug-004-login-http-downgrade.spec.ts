import { test, expect, APIRequestContext } from '@playwright/test';
import { CRITICAL_SESSION_COOKIES, HSTS_MIN_MAX_AGE } from '../utils/constants';
import { parseSetCookie, RedirectHop, CookieAuditEntry } from '../utils/helpers';

/**
 * BUG-004: HTTPS → HTTP downgrade na /moj-orange/
 *
 * OWASP A02:2021 — Cryptographic Failures
 * OWASP A07:2021 — Identification and Authentication Failures
 * CWE-319: Cleartext Transmission of Sensitive Information
 * CWE-614: Sensitive Cookie Without 'Secure' Attribute
 */

async function traceRedirectChain(
  context: APIRequestContext,
  startUrl: string,
  maxHops = 15,
): Promise<{ hops: RedirectHop[]; cookies: CookieAuditEntry[] }> {
  const hops: RedirectHop[] = [];
  const cookies: CookieAuditEntry[] = [];
  let currentUrl = startUrl;

  for (let i = 0; i < maxHops; i++) {
    const response = await context.get(currentUrl, { maxRedirects: 0, ignoreHTTPSErrors: true });
    const statusCode = response.status();
    const location = response.headers()['location'] ?? null;
    const protocol = new URL(currentUrl).protocol === 'https:' ? 'https' : 'http';

    hops.push({ url: currentUrl, statusCode, location, protocol });

    const setCookieHeaders = response.headersArray().filter((h) => h.name.toLowerCase() === 'set-cookie');
    for (const header of setCookieHeaders) {
      const parsed = parseSetCookie(header.value, currentUrl);
      if (parsed) cookies.push(parsed);
    }

    if (statusCode < 300 || statusCode >= 400 || !location) break;
    currentUrl = new URL(location, currentUrl).href;
  }

  return { hops, cookies };
}

test.describe('BUG-004: HTTPS→HTTP downgrade na /moj-orange/', () => {
  let context: APIRequestContext;

  test.beforeAll(async ({ playwright }) => {
    context = await playwright.request.newContext({
      ignoreHTTPSErrors: true,
      extraHTTPHeaders: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'sk-SK,sk;q=0.9',
      },
    });
  });

  test.afterAll(async () => {
    await context.dispose();
  });

  test('should_not_downgrade_https — presmerovanie z /moj-orange/ [CRITICAL]', async () => {
    const { hops } = await traceRedirectChain(context, 'https://www.orange.sk/moj-orange/');

    console.log('=== Redirect chain pre /moj-orange/ ===');
    hops.forEach((hop, i) => console.log(`  [${i}] ${hop.statusCode} ${hop.url}${hop.location ? ` → ${hop.location}` : ''}`));

    const firstRedirect = hops.find((h) => h.statusCode === 301 || h.statusCode === 302);
    expect(firstRedirect, 'Očakávame aspoň jedno presmerovanie').toBeDefined();

    if (firstRedirect?.location) {
      const locationUrl = new URL(firstRedirect.location, firstRedirect.url);
      expect.soft(locationUrl.protocol, `Redirect smeruje na ${firstRedirect.location} — OWASP A02:2021`).toBe('https:');
    }

    const httpDowngrades = hops.filter((hop) => {
      if (!hop.location) return false;
      return new URL(hop.location, hop.url).protocol === 'http:';
    });

    expect.soft(httpDowngrades, `${httpDowngrades.length} HTTP downgrade redirect(s) — OWASP A07:2021`).toHaveLength(0);
  });

  test('should_have_secure_flag_on_all_cookies — cookie audit [CRITICAL]', async () => {
    const { cookies } = await traceRedirectChain(context, 'https://www.orange.sk/moj-orange/');
    if (cookies.length === 0) return;

    const insecureCookies = cookies.filter((c) => !c.secure);
    if (insecureCookies.length > 0) {
      console.error('Cookies BEZ Secure flagu:');
      insecureCookies.forEach((c) => console.error(`  ✗ ${c.name} (httpOnly=${c.httpOnly}, sameSite=${c.sameSite})`));
    }

    expect.soft(insecureCookies.map((c) => c.name), `CWE-614: ${insecureCookies.length} cookies bez Secure flagu`).toHaveLength(0);
  });

  test('should_have_secure_httponly_on_session_cookies — kritické session cookies', async () => {
    const { cookies } = await traceRedirectChain(context, 'https://www.orange.sk/moj-orange/');

    for (const cookieName of CRITICAL_SESSION_COOKIES) {
      const found = cookies.filter((c) => c.name === cookieName);
      if (found.length === 0) continue;

      for (const cookie of found) {
        expect.soft(cookie.secure, `${cookie.name} musí mať Secure flag — CWE-614`).toBe(true);
        expect.soft(cookie.httpOnly, `${cookie.name} musí mať HttpOnly flag — CWE-1004`).toBe(true);
      }
    }
  });

  test('should_behave_same_with_without_trailing_slash — porovnanie', async () => {
    const [withSlash, withoutSlash] = await Promise.all([
      traceRedirectChain(context, 'https://www.orange.sk/moj-orange/'),
      traceRedirectChain(context, 'https://www.orange.sk/moj-orange'),
    ]);

    const findDowngrades = (hops: RedirectHop[]) =>
      hops.filter((h) => h.location && new URL(h.location, h.url).protocol === 'http:');

    expect.soft(findDowngrades(withSlash.hops), 'HTTP downgrade s trailing slash').toHaveLength(0);
    expect.soft(findDowngrades(withoutSlash.hops), 'HTTP downgrade bez trailing slash').toHaveLength(0);
  });

  test('should_have_hsts_header — HSTS prítomnosť [OWASP A05:2021]', async () => {
    const response = await context.get('https://www.orange.sk/moj-orange/', { maxRedirects: 0, ignoreHTTPSErrors: true });
    const hstsHeader = response.headers()['strict-transport-security'];

    expect.soft(hstsHeader, 'HSTS hlavička chýba — OWASP A05:2021').toBeDefined();

    if (hstsHeader) {
      const maxAgeMatch = hstsHeader.match(/max-age=(\d+)/);
      if (maxAgeMatch) {
        const maxAge = parseInt(maxAgeMatch[1], 10);
        expect.soft(maxAge, `HSTS max-age ${maxAge}s je pod minimom ${HSTS_MIN_MAX_AGE}s`).toBeGreaterThanOrEqual(HSTS_MIN_MAX_AGE);
      }
    }
  });
});

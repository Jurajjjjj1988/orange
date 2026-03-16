/**
 * BUG-004: HTTPS â HTTP downgrade na prihlasovacej strÃ¡nke /moj-orange/
 *
 * KritickÃ¡ bezpeÄnostnÃ¡ chyba: Presmerovanie z HTTPS na HTTP v autentifikovanej sekcii.
 * ÃtoÄnÃ­k mÃ´Å¾e zachytiÅ¥ session cookies a prihlasovacie Ãºdaje cez MITM Ãºtok.
 *
 * OWASP A02:2021 â Cryptographic Failures
 *   https://owasp.org/Top10/A02_2021-Cryptographic_Failures/
 * OWASP A07:2021 â Identification and Authentication Failures
 *   https://owasp.org/Top10/A07_2021-Identification_and_Authentication_Failures/
 *
 * CWE-319: Cleartext Transmission of Sensitive Information
 * CWE-614: Sensitive Cookie in HTTPS Session Without 'Secure' Attribute
 */

import { test, expect, APIRequestContext } from '@playwright/test';

// ZÃ¡ujmovÃ© cookies pre autentifikÃ¡ciu Orange
const CRITICAL_COOKIES = [
  'SimpleSAMLSessionID',
  'fe_typo_orange_sess',
];

interface RedirectHop {
  url: string;
  statusCode: number;
  location: string | null;
  protocol: 'https' | 'http';
}

interface CookieAuditEntry {
  name: string;
  value: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: string;
  domain: string;
  path: string;
  source: string; // URL odpovede, ktorÃ¡ cookie nastavila
}

/**
 * Sleduje reÅ¥azec presmerovanÃ­ manuÃ¡lne, bez automatickÃ©ho nasledovania.
 * Vracia pole RedirectHop objektov.
 *
 * PouÅ¾Ã­vame request.newContext() s manuÃ¡lnym riadenÃ­m presmerovanÃ­,
 * aby sme mohli inÅ¡pektovaÅ¥ kaÅ¾dÃ½ krok reÅ¥azca.
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
    // maxRedirects: 0 zabraÅuje automatickÃ©mu nasledovaniu presmerovanÃ­
    const response = await context.get(currentUrl, {
      maxRedirects: 0,
      ignoreHTTPSErrors: true,
    });

    const statusCode = response.status();
    const location = response.headers()['location'] ?? null;
    const protocol = new URL(currentUrl).protocol === 'https:' ? 'https' : 'http';

    hops.push({ url: currentUrl, statusCode, location, protocol });

    // Zbierame Set-Cookie hlaviÄky z kaÅ¾dej odpovede
    const setCookieHeaders = response.headersArray().filter(
      (h) => h.name.toLowerCase() === 'set-cookie',
    );

    for (const header of setCookieHeaders) {
      const parsed = parseSetCookie(header.value, currentUrl);
      if (parsed) {
        cookies.push(parsed);
      }
    }

    // Ak nie je presmerovanie, konÄÃ­me
    if (statusCode < 300 || statusCode >= 400 || !location) {
      break;
    }

    // RozlÃ­Å¡ime relatÃ­vne a absolÃºtne URL
    currentUrl = new URL(location, currentUrl).href;
  }

  return { hops, cookies };
}

/**
 * Parsuje Set-Cookie hlaviÄku na CookieAuditEntry.
 */
function parseSetCookie(raw: string, sourceUrl: string): CookieAuditEntry | null {
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
    if (lower === 'secure') {
      secure = true;
    } else if (lower === 'httponly') {
      httpOnly = true;
    } else if (lower.startsWith('samesite=')) {
      sameSite = attr.split('=')[1]?.trim() ?? 'none';
    } else if (lower.startsWith('domain=')) {
      domain = attr.split('=')[1]?.trim() ?? '';
    } else if (lower.startsWith('path=')) {
      path = attr.split('=')[1]?.trim() ?? '/';
    }
  }

  return { name, value, secure, httpOnly, sameSite, domain, path, source: sourceUrl };
}

test.describe('BUG-004: HTTPSâHTTP downgrade na /moj-orange/', () => {
  let context: APIRequestContext;

  test.beforeAll(async ({ playwright }) => {
    // VytvÃ¡rame API kontext bez automatickÃ©ho nasledovania presmerovanÃ­
    context = await playwright.request.newContext({
      ignoreHTTPSErrors: true,
      extraHTTPHeaders: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'sk-SK,sk;q=0.9,en;q=0.8',
      },
    });
  });

  test.afterAll(async () => {
    await context.dispose();
  });

  /**
   * HlavnÃ½ test: Overenie HTTPSâHTTP downgrade pri presmerovanÃ­ s koncovÃ½m lomÃ­tkom.
   *
   * PodÄ¾a OWASP A02:2021, vÅ¡etky presmerovacia v autentifikovanej sekcii
   * musia zachovaÅ¥ HTTPS protokol. HTTP downgrade umoÅ¾Åuje MITM Ãºtok
   * na zachytenie session tokenov.
   */
  test('presmerovanie z /moj-orange/ nesmie obsahovaÅ¥ HTTP downgrade [CRITICAL]', async () => {
    const startUrl = 'https://www.orange.sk/moj-orange/';
    const { hops } = await traceRedirectChain(context, startUrl);

    // DiagnostickÃ½ vÃ½pis celÃ©ho reÅ¥azca presmerovanÃ­
    console.log('=== ReÅ¥azec presmerovanÃ­ pre /moj-orange/ ===');
    for (const [index, hop] of hops.entries()) {
      console.log(
        `  [${index}] ${hop.statusCode} ${hop.url}` +
          (hop.location ? ` â ${hop.location}` : ' (koneÄnÃ¡)'),
      );
    }

    // Kontrolujeme prvÃ© presmerovanie â BUG: Location hlaviÄka smeruje na http://
    const firstRedirect = hops.find((h) => h.statusCode === 301 || h.statusCode === 302);
    expect(firstRedirect, 'OÄakÃ¡vame aspoÅ jedno presmerovanie').toBeDefined();

    if (firstRedirect?.location) {
      const locationUrl = new URL(firstRedirect.location, firstRedirect.url);

      // Detekcia bugu: prvÃ© presmerovanie smeruje na HTTP namiesto HTTPS
      const isDowngrade = locationUrl.protocol === 'http:';
      if (isDowngrade) {
        console.error(
          `\nâ  BUG-004 POTVRDENÃ: PrvÃ© 301 presmerovanie z ${firstRedirect.url} ` +
            `smeruje na HTTP: ${firstRedirect.location}\n` +
            `  Toto je kritickÃ¡ zraniteÄ¾nosÅ¥ â OWASP A02:2021, CWE-319.\n`,
        );
      }

      // Toto je assertion, ktorÃ½ zlyhÃ¡, ak je bug prÃ­tomnÃ½
      // (Äo je oÄakÃ¡vanÃ© sprÃ¡vanie â test dokumentuje existujÃºci bug)
      expect.soft(
        locationUrl.protocol,
        `PrvÃ© presmerovanie z ${firstRedirect.url} musÃ­ smerovaÅ¥ na HTTPS. ` +
          `AktuÃ¡lne smeruje na ${firstRedirect.location}. ` +
          `OWASP A02:2021 â Cryptographic Failures, CWE-319.`,
      ).toBe('https:');
    }

    // Overenie, Å¾e Å½IADNE presmerovanie v celom reÅ¥azci nepouÅ¾Ã­va HTTP
    const httpDowngrades = hops.filter((hop) => {
      if (!hop.location) return false;
      const target = new URL(hop.location, hop.url);
      return target.protocol === 'http:';
    });

    if (httpDowngrades.length > 0) {
      console.error('\n=== HTTP downgrade presmerovanie nÃ¡jdenÃ© ===');
      for (const hop of httpDowngrades) {
        console.error(`  ${hop.statusCode} ${hop.url} â ${hop.location}`);
      }
    }

    expect.soft(
      httpDowngrades,
      `NÃ¡jdenÃ© ${httpDowngrades.length} presmerovanie(a) s HTTP downgrade. ` +
        `VÅ¡etky presmerovanie v autentifikovanej sekcii musia pouÅ¾Ã­vaÅ¥ HTTPS. ` +
        `OWASP A07:2021 â Identification and Authentication Failures.`,
    ).toHaveLength(0);
  });

  /**
   * Audit cookies: Overenie Secure flagu na vÅ¡etkÃ½ch cookies.
   *
   * CWE-614: CitlivÃ¡ cookie v HTTPS relÃ¡cii bez atribÃºtu 'Secure'
   * umoÅ¾Åuje zachytenie cez nezabezpeÄenÃ© HTTP spojenie.
   */
  test('vÅ¡etky cookies musia maÅ¥ nastavenÃ½ Secure flag [CRITICAL]', async () => {
    const startUrl = 'https://www.orange.sk/moj-orange/';
    const { cookies } = await traceRedirectChain(context, startUrl);

    if (cookies.length === 0) {
      console.log('Å½iadne cookies neboli nastavenÃ© poÄas presmerovanÃ­.');
      return;
    }

    console.log(`\n=== Audit cookies (celkom: ${cookies.length}) ===`);

    // Zoznam cookies bez Secure flagu â bezpeÄnostnÃ© riziko
    const insecureCookies = cookies.filter((c) => !c.secure);
    const secureCookies = cookies.filter((c) => c.secure);

    console.log(`\n  Cookies so Secure flagom (${secureCookies.length}):`);
    for (const c of secureCookies) {
      console.log(`    â ${c.name} (domain=${c.domain}, path=${c.path})`);
    }

    if (insecureCookies.length > 0) {
      console.error(`\n  Cookies BEZ Secure flagu (${insecureCookies.length}) â RIZIKO:`);
      for (const c of insecureCookies) {
        console.error(
          `    â ${c.name} (domain=${c.domain}, path=${c.path}, ` +
            `httpOnly=${c.httpOnly}, sameSite=${c.sameSite}, ` +
            `zdroj=${c.source})`,
        );
      }
    }

    expect.soft(
      insecureCookies.map((c) => c.name),
      `NasledujÃºce cookies nemajÃº Secure flag: ${insecureCookies.map((c) => c.name).join(', ')}. ` +
        `VÅ¡etky cookies v autentifikovanej sekcii musia maÅ¥ Secure flag. ` +
        `CWE-614: Sensitive Cookie Without 'Secure' Attribute.`,
    ).toHaveLength(0);
  });

  /**
   * Kontrola kritickÃ½ch autentifikaÄnÃ½ch cookies.
   *
   * SimpleSAMLSessionID â SAML session token pre SSO prihlÃ¡senie
   * fe_typo_orange_sess â TYPO3 frontend session cookie
   *
   * Tieto cookies sÃº obzvlÃ¡Å¡Å¥ citlivÃ©, pretoÅ¾e ich zachytenie
   * umoÅ¾Åuje session hijacking (OWASP A07:2021).
   */
  test('kritickÃ© session cookies musia maÅ¥ Secure a HttpOnly flagy', async () => {
    const startUrl = 'https://www.orange.sk/moj-orange/';
    const { cookies } = await traceRedirectChain(context, startUrl);

    console.log('\n=== Kontrola kritickÃ½ch autentifikaÄnÃ½ch cookies ===');

    for (const cookieName of CRITICAL_COOKIES) {
      const found = cookies.filter((c) => c.name === cookieName);

      if (found.length === 0) {
        console.log(
          `  ${cookieName}: NenÃ¡jdenÃ¡ v odpovediach presmerovanÃ­ ` +
            `(mÃ´Å¾e byÅ¥ nastavenÃ¡ aÅ¾ po autentifikÃ¡cii).`,
        );
        continue;
      }

      for (const cookie of found) {
        console.log(
          `  ${cookie.name}: Secure=${cookie.secure}, HttpOnly=${cookie.httpOnly}, ` +
            `SameSite=${cookie.sameSite}, Domain=${cookie.domain}`,
        );

        // Session cookies MUSIA maÅ¥ Secure flag
        expect.soft(
          cookie.secure,
          `Cookie '${cookie.name}' musÃ­ maÅ¥ Secure flag. ` +
            `Bez Secure flagu mÃ´Å¾e byÅ¥ session token zachytenÃ½ cez HTTP. ` +
            `CWE-614, OWASP A07:2021.`,
        ).toBe(true);

        // Session cookies MUSIA maÅ¥ HttpOnly flag (ochrana pred XSS)
        expect.soft(
          cookie.httpOnly,
          `Cookie '${cookie.name}' musÃ­ maÅ¥ HttpOnly flag. ` +
            `Bez HttpOnly flagu je cookie prÃ­stupnÃ¡ cez JavaScript (XSS Ãºtok). ` +
            `CWE-1004, OWASP A03:2021.`,
        ).toBe(true);
      }
    }
  });

  /**
   * Porovnanie sprÃ¡vania s a bez koncovÃ©ho lomÃ­tka.
   *
   * NiektorÃ© webservery sa sprÃ¡vajÃº odliÅ¡ne pri URL s/bez trailing slash.
   * Overujeme, Äi je HTTP downgrade prÃ­tomnÃ½ v oboch prÃ­padoch.
   */
  test('porovnanie presmerovanÃ­ s/bez koncovÃ©ho lomÃ­tka', async () => {
    const urlWithSlash = 'https://www.orange.sk/moj-orange/';
    const urlWithoutSlash = 'https://www.orange.sk/moj-orange';

    const [withSlash, withoutSlash] = await Promise.all([
      traceRedirectChain(context, urlWithSlash),
      traceRedirectChain(context, urlWithoutSlash),
    ]);

    console.log('\n=== Porovnanie: S koncovÃ½m lomÃ­tkom ===');
    for (const [i, hop] of withSlash.hops.entries()) {
      console.log(
        `  [${i}] ${hop.statusCode} ${hop.url}` +
          (hop.location ? ` â ${hop.location}` : ''),
      );
    }

    console.log('\n=== Porovnanie: Bez koncovÃ©ho lomÃ­tka ===');
    for (const [i, hop] of withoutSlash.hops.entries()) {
      console.log(
        `  [${i}] ${hop.statusCode} ${hop.url}` +
          (hop.location ? ` â ${hop.location}` : ''),
      );
    }

    // HÄ¾adÃ¡me HTTP downgrade v oboch variantoch
    const downgradesWithSlash = withSlash.hops.filter((h) => {
      if (!h.location) return false;
      return new URL(h.location, h.url).protocol === 'http:';
    });

    const downgradesWithoutSlash = withoutSlash.hops.filter((h) => {
      if (!h.location) return false;
      return new URL(h.location, h.url).protocol === 'http:';
    });

    console.log(
      `\n  HTTP downgrade s lomÃ­tkom: ${downgradesWithSlash.length}`,
    );
    console.log(
      `  HTTP downgrade bez lomÃ­tka: ${downgradesWithoutSlash.length}`,
    );

    // Oba varianty musia byÅ¥ bez HTTP downgrade
    expect.soft(
      downgradesWithSlash,
      `URL s koncovÃ½m lomÃ­tkom obsahuje ${downgradesWithSlash.length} HTTP downgrade presmerovanie(a). ` +
        `OWASP A02:2021.`,
    ).toHaveLength(0);

    expect.soft(
      downgradesWithoutSlash,
      `URL bez koncovÃ©ho lomÃ­tka obsahuje ${downgradesWithoutSlash.length} HTTP downgrade presmerovanie(a). ` +
        `OWASP A02:2021.`,
    ).toHaveLength(0);

    // Porovnanie cookies medzi oboma variantmi
    const insecureWithSlash = withSlash.cookies.filter((c) => !c.secure);
    const insecureWithoutSlash = withoutSlash.cookies.filter((c) => !c.secure);

    if (insecureWithSlash.length > 0 || insecureWithoutSlash.length > 0) {
      console.error('\n=== NezabezpeÄenÃ© cookies podÄ¾a variantu URL ===');
      if (insecureWithSlash.length > 0) {
        console.error(
          `  S lomÃ­tkom: ${insecureWithSlash.map((c) => c.name).join(', ')}`,
        );
      }
      if (insecureWithoutSlash.length > 0) {
        console.error(
          `  Bez lomÃ­tka: ${insecureWithoutSlash.map((c) => c.name).join(', ')}`,
        );
      }
    }
  });

  /**
   * Overenie, Å¾e HSTS hlaviÄka je prÃ­tomnÃ¡.
   *
   * Strict-Transport-Security hlaviÄka zabraÅuje HTTP downgrade Ãºtokom
   * na Ãºrovni prehliadaÄa. Jej absencia v kombinÃ¡cii s HTTP presmerovaniami
   * vytvÃ¡ra kritickÃº zraniteÄ¾nosÅ¥.
   *
   * OWASP A05:2021 â Security Misconfiguration
   */
  test('HSTS hlaviÄka musÃ­ byÅ¥ prÃ­tomnÃ¡ na HTTPS odpovediach', async () => {
    const startUrl = 'https://www.orange.sk/moj-orange/';
    const { hops } = await traceRedirectChain(context, startUrl);

    // Kontrolujeme HSTS na prvej HTTPS odpovedi
    const firstHttpsHop = hops[0]; // ZaÄÃ­name na HTTPS
    expect(firstHttpsHop).toBeDefined();

    const response = await context.get(startUrl, {
      maxRedirects: 0,
      ignoreHTTPSErrors: true,
    });

    const hstsHeader = response.headers()['strict-transport-security'];

    console.log(
      `\n=== HSTS hlaviÄka ===\n  ${hstsHeader ?? 'CHÃBA'}`,
    );

    if (hstsHeader) {
      // Overenie, Å¾e max-age je dostatoÄne dlhÃ½ (minimÃ¡lne 1 rok = 31536000)
      const maxAgeMatch = hstsHeader.match(/max-age=(\d+)/);
      if (maxAgeMatch) {
        const maxAge = parseInt(maxAgeMatch[1], 10);
        console.log(`  max-age: ${maxAge} sekÃºnd (${(maxAge / 86400).toFixed(0)} dnÃ­)`);

        expect.soft(
          maxAge,
          `HSTS max-age je ${maxAge}s, odporÃºÄa sa minimÃ¡lne 31536000s (1 rok). ` +
            `OWASP A05:2021.`,
        ).toBeGreaterThanOrEqual(31536000);
      }

      // includeSubDomains je dÃ´leÅ¾itÃ© pre kompletnÃº ochranu
      const hasIncludeSubDomains = hstsHeader.includes('includeSubDomains');
      console.log(`  includeSubDomains: ${hasIncludeSubDomains}`);
    }

    expect.soft(
      hstsHeader,
      `HSTS hlaviÄka chÃ½ba na ${startUrl}. Bez HSTS prehliadaÄ nezabrÃ¡ni ` +
        `HTTP downgrade Ãºtokom. OWASP A05:2021, CWE-319.`,
    ).toBeDefined();
  });
});

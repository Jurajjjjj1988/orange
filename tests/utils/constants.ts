/** Shared constants across all Orange.sk test suites */

export const BASE_URL = 'https://www.orange.sk';
export const B2B_URL = `${BASE_URL}/biznis`;
export const MOJ_ORANGE_URL = `${BASE_URL}/moj-orange`;

/** HSTS minimum recommended max-age (1 year) */
export const HSTS_MIN_MAX_AGE = 31_536_000;

/** Cookie selectors for accepting cookie consent */
export const COOKIE_CONSENT_SELECTORS = [
  'button:has-text("Odsúhlasiť a zavrieť")',
  'button:has-text("Súhlasím")',
  'button:has-text("Prijať")',
  'button:has-text("Prijať všetko")',
  'button:has-text("Accept")',
  'button:has-text("Accept all")',
  '[id*="cookie"] button',
  '[class*="cookie"] button',
  '[id*="consent"] button',
  '[class*="consent"] button',
];

/** Critical session cookies that must have Secure + HttpOnly flags */
export const CRITICAL_SESSION_COOKIES = [
  'SimpleSAMLSessionID',
  'fe_typo_orange_sess',
];

/** Pages that should return HTTP 200 (BUG-002) */
export const CANONICAL_PAGES = [
  { path: '/volania-a-pausal/pausal', name: 'Paušálne tarify' },
  { path: '/telefony-a-zariadenia/smartfony', name: 'Smartfóny eshop' },
  { path: '/internetatv/internet', name: 'Internet sekcia' },
  { path: '/pre-biznis', name: 'Business sekcia' },
  { path: '/eshop', name: 'Hlavný e-shop' },
  { path: '/obchody', name: 'Zoznam predajní' },
] as const;

/**
 * Deriv OAuth session handling.
 * Deriv redirects back with query params: acct1, token1, currency1, acct2, ...
 * Tokens are stored in localStorage under one key. This is client-visible
 * storage by design (Deriv tokens are account-scoped API tokens, revocable at
 * https://app.deriv.com/account/security). Do not put server secrets here.
 */
export interface DerivAccount {
  index: number;
  loginid: string;
  token: string;
  currency: string;
}

const STORE_KEY = 'deriv_sessions_v1';

export function parseAccountsFromParams(search: string): DerivAccount[] {
  const params = new URLSearchParams(search);
  const accounts: DerivAccount[] = [];
  for (let i = 1; i <= 10; i++) {
    const loginid = params.get(`acct${i}`);
    const token = params.get(`token${i}`);
    if (!loginid || !token) break;
    accounts.push({
      index: i,
      loginid,
      token,
      currency: params.get(`currency${i}`) ?? 'USD',
    });
  }
  return accounts;
}

export function loadSessions(): DerivAccount[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    const parsed = raw ? (JSON.parse(raw) as DerivAccount[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveSessions(accounts: DerivAccount[]): void {
  if (typeof window === 'undefined' || accounts.length === 0) return;
  const existing = loadSessions();
  const byLogin = new Map(existing.map((a) => [a.loginid, a]));
  for (const a of accounts) byLogin.set(a.loginid, a);
  window.localStorage.setItem(STORE_KEY, JSON.stringify([...byLogin.values()]));
}

export function clearSessions(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORE_KEY);
}

/** If the current URL carries OAuth params, store them and clean the URL. Returns accounts found. */
export function consumeOAuthParamsIfPresent(): DerivAccount[] {
  if (typeof window === 'undefined') return [];
  const accounts = parseAccountsFromParams(window.location.search);
  if (accounts.length > 0) {
    saveSessions(accounts);
    const clean = window.location.pathname;
    window.history.replaceState({}, '', clean);
  }
  return accounts;
}

/** Deriv demo accounts are virtual: loginid starts with 'VR'. Real accounts do not. */
export function isDemoAccount(a: DerivAccount): boolean {
  return a.loginid.toUpperCase().startsWith('VR');
}

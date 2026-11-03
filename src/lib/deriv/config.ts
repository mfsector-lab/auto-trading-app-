/**
 * Deriv API configuration.
 * Priority: localStorage override (instant, set from the UI) -> NEXT_PUBLIC_DERIV_APP_ID env -> test app 1089.
 * Register your own at https://api.deriv.com and set the redirect URL to
 * https://<your-domain>/deriv/callback
 */
export const DERIV_APP_ID_FALLBACK = '1089';
const OVERRIDE_KEY = 'deriv_app_id_override';

export function isTestAppId(id: string): boolean {
  return id === DERIV_APP_ID_FALLBACK;
}

export function getDerivAppId(): string {
  if (typeof window !== 'undefined') {
    try {
      const o = window.localStorage.getItem(OVERRIDE_KEY);
      if (o && o.trim()) return o.trim();
    } catch { /* ignore */ }
  }
  return process.env.NEXT_PUBLIC_DERIV_APP_ID?.trim() || DERIV_APP_ID_FALLBACK;
}

export function setDerivAppIdOverride(id: string): void {
  if (typeof window === 'undefined') return;
  const clean = id.trim();
  if (clean) window.localStorage.setItem(OVERRIDE_KEY, clean);
  else window.localStorage.removeItem(OVERRIDE_KEY);
}

export function derivWsUrl(): string {
  return `wss://ws.derivws.com/websockets/v3?app_id=${getDerivAppId()}`;
}

export function derivOAuthRedirect(origin: string): string {
  return `https://oauth.deriv.com/oauth2/authorize?app_id=${encodeURIComponent(getDerivAppId())}&l=EN&brand=deriv`;
}

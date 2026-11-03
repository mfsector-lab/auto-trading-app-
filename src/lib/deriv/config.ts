/**
 * Deriv API configuration.
 * App ID comes from env; 1089 is Deriv's public test app id (works for demo).
 * Register your own at https://api.deriv.com and set NEXT_PUBLIC_DERIV_APP_ID.
 */
export const DERIV_APP_ID: string =
  process.env.NEXT_PUBLIC_DERIV_APP_ID?.trim() || '1089';

export const DERIV_OAUTH_URL = 'https://oauth.deriv.com/oauth2/authorize';
export const DERIV_WS_URL = `wss://ws.derivws.com/websockets/v3?app_id=${DERIV_APP_ID}`;

export function derivOAuthRedirect(origin: string): string {
  const redirect = `${origin}/deriv/callback`;
  return `${DERIV_OAUTH_URL}?app_id=${encodeURIComponent(DERIV_APP_ID)}&l=EN&brand=deriv`;
}

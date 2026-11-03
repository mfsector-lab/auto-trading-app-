'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { derivOAuthRedirect, getDerivAppId, setDerivAppIdOverride, isTestAppId } from '@/lib/deriv/config';
import {
  clearSessions,
  consumeOAuthParamsIfPresent,
  loadSessions,
  saveSessions,
  type DerivAccount,
} from '@/lib/deriv/session';
import { DerivSocket } from '@/lib/deriv/ws';

type WsState = 'idle' | 'connecting' | 'open' | 'authorized' | 'error';

export default function DerivConnect() {
  const [accounts, setAccounts] = useState<DerivAccount[]>([]);
  const [active, setActive] = useState<DerivAccount | null>(null);
  const [wsState, setWsState] = useState<WsState>('idle');
  const [lastTick, setLastTick] = useState<string>('');
  const [tickCount, setTickCount] = useState(0);
  const [appId, setAppId] = useState('1089');
  const [appIdInput, setAppIdInput] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [tokenMsg, setTokenMsg] = useState('');
  const [tokenBusy, setTokenBusy] = useState(false);
  const [balance, setBalance] = useState<{ v: number; c: string } | null>(null);
  const socketRef = useRef<DerivSocket | null>(null);

  useEffect(() => {
    // Handles both /deriv/callback landing and params landing on /deriv itself
    consumeOAuthParamsIfPresent();
    setAppId(getDerivAppId());
    const stored = loadSessions();
    setAccounts(stored);
    setActive(stored[0] ?? null);
  }, []);

  const connectOAuth = useCallback(() => {
    window.location.href = derivOAuthRedirect(window.location.origin);
  }, []);

  const applyOverride = useCallback(() => {
    if (!appIdInput.trim()) return;
    setDerivAppIdOverride(appIdInput.trim());
    setAppId(getDerivAppId());
    setAppIdInput('');
  }, [appIdInput]);

  /** Direct API-token login: authorize on the spot, store as a normal session. */
  const loginWithToken = useCallback(async () => {
    const token = tokenInput.trim();
    if (!token) return;
    setTokenBusy(true);
    setTokenMsg('Authorizing with Deriv…');
    try {
      const sock = new DerivSocket();
      sock.connect(async () => {
        try {
          const res = await sock.authorize(token);
          const a = res.authorize as Record<string, unknown>;
          const account: DerivAccount = {
            index: 1,
            loginid: String(a.loginid ?? ''),
            token,
            currency: String(a.currency ?? 'USD'),
          };
          saveSessions([account]);
          setAccounts(loadSessions());
          setActive(account);
          setTokenInput('');
          setTokenMsg(`Signed in as ${account.loginid} (${String(a.is_virtual) === '1' ? 'DEMO' : 'REAL'}) — live balance active below.`);
          // keep this socket as the live one
          socketRef.current?.close();
          socketRef.current = sock;
          setWsState('authorized');
          await sock.subscribeBalance();
          sock.onBalance((b) => setBalance({ v: Number(b.balance ?? 0), c: String(b.currency ?? account.currency) }));
          await sock.subscribeTicks('R_10', (msg) => {
            const t = msg.tick as Record<string, unknown> | undefined;
            if (t) { setLastTick(String(t.quote ?? '')); setTickCount((x) => x + 1); }
          });
        } catch (e) {
          sock.close();
          setTokenMsg(`Deriv rejected the token: ${e instanceof Error ? e.message : 'unknown error'}`);
        } finally {
          setTokenBusy(false);
        }
      });
    } catch {
      setTokenMsg('Could not reach Deriv.');
      setTokenBusy(false);
    }
  }, [tokenInput]);

  const initSocket = useCallback(async (account: DerivAccount) => {
    setWsState('connecting');
    socketRef.current?.close();
    const sock = new DerivSocket();
    socketRef.current = sock;
    sock.connect(
      async () => {
        try {
          await sock.authorize(account.token);
          setWsState('authorized');
          await sock.subscribeTicks('R_10', (msg) => {
            const tick = msg.tick as Record<string, unknown> | undefined;
            if (tick) {
              setLastTick(String(tick.quote ?? ''));
              setTickCount((c) => c + 1);
            }
          });
        } catch {
          setWsState('error');
        }
      },
      () => {
        if (!sock.closedByUser) setWsState('connecting');
      },
    );
  }, []);

  const selectAccount = useCallback(
    (a: DerivAccount) => {
      setActive(a);
      void initSocket(a);
    },
    [initSocket],
  );

  const logout = useCallback(() => {
    socketRef.current?.close();
    socketRef.current = null;
    clearSessions();
    setAccounts([]);
    setActive(null);
    setWsState('idle');
    setLastTick('');
    setTickCount(0);
  }, []);

  const stateLabel: Record<WsState, string> = {
    idle: 'Not connected',
    connecting: 'Connecting…',
    open: 'Socket open',
    authorized: 'Authorized — streaming R_10',
    error: 'Auth failed (token expired? re-authorize)',
  };

  return (
    <div className="rounded-2xl border border-violet-500/30 bg-slate-900/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">Deriv Account</p>
          <p className="mt-0.5 text-xs text-slate-400">
            Official Deriv OAuth handshake. Tokens stay in this browser only.
          </p>
        </div>
        {accounts.length === 0 ? (
          <button
            onClick={connectOAuth}
            className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-500"
          >
            Connect with Deriv
          </button>
        ) : (
          <button
            onClick={logout}
            className="rounded-xl border border-slate-600 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-slate-800"
          >
            Log out
          </button>
        )}
      </div>

      {accounts.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {accounts.map((a) => (
            <button
              key={a.loginid}
              onClick={() => selectAccount(a)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                active?.loginid === a.loginid
                  ? 'border-violet-400 bg-violet-500/20 text-violet-100'
                  : 'border-slate-700 bg-slate-950 text-slate-300 hover:border-slate-500'
              }`}
            >
              {a.loginid} · {a.currency}
            </button>
          ))}
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] md:grid-cols-4">
        <div className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5">
          <p className="text-slate-500">App ID {isTestAppId(appId) ? '(test)' : '(registered)'}</p>
          <p className={`font-semibold ${isTestAppId(appId) ? 'text-amber-300' : 'text-emerald-300'}`}>{appId}</p>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5">
          <p className="text-slate-500">WebSocket</p>
          <p className={`font-semibold ${wsState === 'authorized' ? 'text-emerald-400' : wsState === 'error' ? 'text-rose-400' : 'text-slate-300'}`}>
            {stateLabel[wsState]}
          </p>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5">
          <p className="text-slate-500">Last R_10 tick</p>
          <p className="font-semibold text-slate-200">{lastTick || '—'}</p>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5">
          <p className="text-slate-500">Ticks received</p>
          <p className="font-semibold text-slate-200">{tickCount}</p>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5">
          <p className="text-slate-500">Balance</p>
          <p className={`font-semibold ${balance && balance.v >= 0 ? 'text-emerald-300' : 'text-slate-200'}`}>
            {balance ? `${balance.v.toFixed(2)} ${balance.c}` : '—'}
          </p>
        </div>
      </div>

      <details className="mt-3 rounded-xl border border-slate-700 bg-slate-950 p-3 text-[11px]">
        <summary className="cursor-pointer font-semibold text-slate-300">Advanced: sign in with an API token (no OAuth)</summary>
        <p className="mt-2 text-slate-400">
          Create a token at app.deriv.com → Settings → API token (scopes: read, trade). Paste it here
          to log in instantly — this bypasses OAuth and works with your real balance right now.
        </p>
        <div className="mt-2 flex gap-2">
          <input
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value.trim())}
            placeholder="Paste Deriv API token"
            className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-100 placeholder:text-slate-500"
            type="password"
          />
          <button onClick={() => void loginWithToken()} disabled={tokenBusy || !tokenInput}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 font-bold text-white hover:bg-emerald-500 disabled:opacity-40">
            {tokenBusy ? 'Checking…' : 'Sign in'}
          </button>
        </div>
        {tokenMsg && <p className={`mt-1 ${tokenMsg.startsWith('Signed in') ? 'text-emerald-300' : 'text-rose-300'}`}>{tokenMsg}</p>}
      </details>

      {isTestAppId(appId) && (
        <div className="mt-3 rounded-xl border border-amber-400/40 bg-amber-500/10 p-3 text-[11px] text-amber-100">
          <p className="font-bold">Setup required — auto-return after login is disabled while using Deriv&apos;s test app.</p>
          <ol className="mt-1 list-decimal space-y-0.5 pl-4">
            <li>Register your app at <a href="https://api.deriv.com" target="_blank" rel="noreferrer" className="underline">api.deriv.com</a> (free, uses your Deriv login).</li>
            <li>App URL: <code>https://tradeautomate-ai.vercel.app</code></li>
            <li>Redirect URL: <code>https://tradeautomate-ai.vercel.app/deriv/callback</code></li>
            <li>Paste your new App ID below — it applies instantly, no redeploy needed.</li>
          </ol>
          <div className="mt-2 flex gap-2">
            <input
              value={appIdInput}
              onChange={(e) => setAppIdInput(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="Your Deriv App ID"
              inputMode="numeric"
              className="flex-1 rounded-lg border border-amber-400/40 bg-slate-950 px-2 py-1.5 text-slate-100 placeholder:text-slate-500"
            />
            <button onClick={applyOverride} className="rounded-lg bg-amber-500 px-3 py-1.5 font-bold text-slate-950 hover:bg-amber-400">
              Save
            </button>
          </div>
          <p className="mt-1 text-[10px] text-amber-200/70">
            For production, also set NEXT_PUBLIC_DERIV_APP_ID in Vercel env vars.
          </p>
        </div>
      )}
    </div>
  );
}

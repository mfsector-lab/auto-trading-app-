'use client';

import { useCallback, useEffect, useState } from 'react';
import SygnalControl from './SygnalControl';
import type { ReactNode } from 'react';

/* Real engine data comes from the same API the EA uses. */
interface EngineStatus {
  terminalOnline: boolean;
  broker: string;
  account: string;
  eaVersion: string;
  openTrades: Array<{ ticket: number; symbol: string; side: string; lot: number; open_price: number; profit: number }>;
  openProfit: number;
  lastTrade: string;
  lastReject: string;
  lastSignal: { action: string; symbol: string; reason: string; timestamp: string } | null;
}

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'performance', label: 'Performance' },
  { id: 'markets', label: 'Markets' },
  { id: 'bots', label: 'Trading Bots' },
  { id: 'strategies', label: 'Strategies' },
  { id: 'risk', label: 'Risk Engine' },
  { id: 'portfolio', label: 'Portfolio' },
  { id: 'history', label: 'Order History' },
  { id: 'settings', label: 'Settings' },
] as const;

type TabId = (typeof TABS)[number]['id'];

const BOTS = [
  { id: 'MOMENTUM_ALPHA', name: 'Momentum Alpha', style: 'Trend / Momentum · Multi-market' },
  { id: 'MEAN_REVERSION', name: 'Mean Reversion X', style: 'Statistical · Bollinger + RSI' },
  { id: 'VOLATILITY_HARVEST', name: 'Volatility Harvest', style: 'Vol Breakout · ATR regime' },
  { id: 'SENTIMENT_EDGE', name: 'Sentiment Edge', style: 'Flow proxy · Streak + trend' },
  { id: 'GRID_SCALPER', name: 'Grid Scalper', style: 'Market-making · Mean layers' },
];

const STRATEGY_INFO: Record<string, { logic: string; best: string; risk: string }> = {
  MOMENTUM_ALPHA: { logic: 'Enters when H1 and M5 trend agree, MACD confirms, RSI < 70 (longs) / > 30 (shorts) and price respects Bollinger bounds.', best: 'Trending sessions on EURUSD, XAUUSD, US indices', risk: 'Medium — trend flips cause whipsaws; uses 2:1 default RR' },
  MEAN_REVERSION: { logic: 'Fades extremes: buys below the lower Bollinger band with RSI < 35, sells above the upper band with RSI > 65. No trend filter by design.', best: 'Ranging markets, low-volatility hours', risk: 'Medium-high — strong trends can push through bands; cap daily loss' },
  VOLATILITY_HARVEST: { logic: 'Waits for ATR to expand 15%+ above its 20-bar average, then trades the break of the prior 20-bar high/low.', best: 'News-driven expansion, session opens, gold/crypto bursts', risk: 'High — breakout traps; SL floors keep losses defined' },
  SENTIMENT_EDGE: { logic: 'Flow proxy: 4+ consecutive same-direction candles confirmed by the H1 trend. A statistical stand-in for news sentiment.', best: 'Persistent one-sided flow days', risk: 'Medium — streaks can exhaust; RSI guard rejects overextended entries' },
  GRID_SCALPER: { logic: 'Layers entries around the SMA20 mean at 0.5x-stddev spacing; takes fast profits at 0.6x SL distance.', best: 'Choppy, mean-reverting intraday markets', risk: 'High by design — layered exposure; grid level cap limits stacking' },
};

function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: 'good' | 'bad' | 'neutral' }) {
  const color = tone === 'good' ? 'text-emerald-400' : tone === 'bad' ? 'text-rose-400' : 'text-slate-100';
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-3">
      <p className="text-[10px] uppercase tracking-widest text-slate-500">{label}</p>
      <p className={`mt-1 text-sm font-bold ${color}`}>{value}</p>
    </div>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
      <p className="text-sm font-semibold text-white">{title}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

export default function SygnalApp() {
  const [tab, setTab] = useState<TabId>('dashboard');
  const [st, setSt] = useState<EngineStatus | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/signals?status=1&client_id=0000', { cache: 'no-store' });
      if (!res.ok) return;
      const d = await res.json();
      const t = d.terminal ?? {};
      const trades: EngineStatus['openTrades'] = Array.isArray(d.open_trades) ? d.open_trades : [];
      const online = Boolean(t.last_seen) && Date.now() - Date.parse(t.last_seen) < 30_000;
      const e = d.execution ?? null;
      const q = d.queued_signal ?? null;
      setSt({
        terminalOnline: online,
        broker: [t.broker, t.server].filter(Boolean).join(' / ') || '—',
        account: t.account_number ? `${t.account_mode} #${t.account_number}` : '—',
        eaVersion: t.ea_version ?? '—',
        openTrades: trades,
        openProfit: trades.reduce((s, x) => s + (Number(x.profit) || 0), 0),
        lastTrade: e && e.ticket ? `${e.action} ${e.symbol} @ ${e.price}` : 'None yet',
        lastReject: d.rejection ? `${d.rejection.reason}: ${d.rejection.detail}` : 'None',
        lastSignal: q && q.timestamp ? { action: q.action, symbol: q.symbol, reason: q.scan_reason ?? '', timestamp: q.timestamp } : null,
      });
    } catch { /* offline */ }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [load]);

  return (
    <main className="mx-auto w-full max-w-[1540px] px-4 py-5">
      {/* header */}
      <div className="rounded-2xl border border-violet-500/30 bg-[linear-gradient(135deg,#140a1f,#090d1a)] p-5 text-white">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-violet-300">Sygnal</p>
            <h1 className="text-xl font-bold">Autonomous Trading Console</h1>
            <p className="mt-1 text-xs text-slate-300">
              Terminal: <span className={st?.terminalOnline ? 'font-bold text-emerald-400' : 'font-bold text-rose-400'}>{st?.terminalOnline ? 'ONLINE' : 'OFFLINE'}</span>
              {' · '}{st?.account ?? '—'} · {st?.broker ?? '—'} · EA {st?.eaVersion ?? '—'}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Open trades" value={st ? st.openTrades.length : '—'} />
            <Stat label="Open P&L" value={st ? `$${st.openProfit.toFixed(2)}` : '—'} tone={st && st.openProfit > 0 ? 'good' : st && st.openProfit < 0 ? 'bad' : 'neutral'} />
            <Stat label="Last signal" value={st?.lastSignal ? `${st.lastSignal.action} ${st.lastSignal.symbol}` : '—'} />
          </div>
        </div>
      </div>

      {/* tabs */}
      <div className="sticky top-14 z-20 mt-4 flex flex-wrap gap-1 rounded-2xl border border-slate-700 bg-slate-950/90 p-1 backdrop-blur">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition-all ${tab === t.id ? 'bg-violet-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-4">
        {tab === 'dashboard' && (
          <>
            <SygnalControl />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card title="AI Trading Bots">
                <div className="space-y-2">
                  {BOTS.map((b) => (
                    <button key={b.id} onClick={() => setTab('strategies')} className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-left hover:border-violet-500/50">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold text-slate-100">{b.name}</p>
                        <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-300">engine live</span>
                      </div>
                      <p className="mt-0.5 text-[10px] text-slate-500">{b.style}</p>
                    </button>
                  ))}
                </div>
              </Card>
              <Card title="Live Terminal Activity">
                {st && st.openTrades.length > 0 ? (
                  <div className="space-y-1.5">
                    {st.openTrades.map((t) => (
                      <div key={t.ticket} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-xs">
                        <span className="font-semibold text-slate-200">#{t.ticket} {t.symbol} {t.side} lot {t.lot}</span>
                        <span className={(t.profit ?? 0) >= 0 ? 'font-bold text-emerald-400' : 'font-bold text-rose-400'}>${(t.profit ?? 0).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">No open positions from the engine right now. Generate a signal above to trade.</p>
                )}
                <div className="mt-3 space-y-1 text-[11px] text-slate-400">
                  <p>Last trade: <span className="text-slate-200">{st?.lastTrade ?? '—'}</span></p>
                  <p>Last reject: <span className="text-rose-300">{st?.lastReject ?? '—'}</span></p>
                </div>
              </Card>
            </div>
          </>
        )}

        {tab === 'performance' && (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="Terminal" value={st?.terminalOnline ? 'Online' : 'Offline'} tone={st?.terminalOnline ? 'good' : 'bad'} />
              <Stat label="Open P&L" value={st ? `$${st.openProfit.toFixed(2)}` : '—'} tone={st && st.openProfit > 0 ? 'good' : 'bad'} />
              <Stat label="Open trades" value={st?.openTrades.length ?? '—'} />
              <Stat label="EA" value={st?.eaVersion ?? '—'} />
            </div>
            <Card title="How performance is measured">
              <p className="text-xs text-slate-400">
                These figures come from your live MT5 terminal heartbeat — open positions and floating P&L update every 5 seconds.
                Closed-trade win rates per strategy build up in the dashboard&apos;s History dock as the engine trades. The big
                dollar numbers on marketing dashboards elsewhere are simulated; everything on this tab is your real account.
              </p>
            </Card>
          </>
        )}

        {tab === 'markets' && (
          <Card title="Markets your engine trades">
            <p className="text-xs text-slate-400">
              Scope these in the main dashboard&apos;s Scoping panel. The scanner reads Yahoo Finance data; the EA executes on your broker symbols.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
              {['EURUSD','GBPUSD','USDJPY','XAUUSD','BTCUSD','USDCAD','AUDUSD','US500','NAS100','USOIL'].map((s) => (
                <div key={s} className="rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-2 font-semibold text-slate-200">{s}</div>
              ))}
            </div>
          </Card>
        )}

        {tab === 'bots' && (
          <>
            <SygnalControl />
            <Card title="Spawn or command bots">
              <p className="text-xs text-slate-400">
                The five engine strategies are selectable above — pick one and generate a signal. For per-bot capital, Martingale/Grid
                settings and digit strategies, use the <a href="/bots" className="font-semibold text-violet-300 underline">AI Bots page</a>.
              </p>
            </Card>
          </>
        )}

        {tab === 'strategies' && (
          <div className="space-y-3">
            {BOTS.map((b) => {
              const info = STRATEGY_INFO[b.id];
              return (
                <Card key={b.id} title={b.name}>
                  <p className="text-[10px] uppercase tracking-widest text-slate-500">{b.style}</p>
                  <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-3">
                    <div><p className="text-[10px] font-bold uppercase text-slate-400">Entry logic</p><p className="mt-1 text-xs text-slate-300">{info.logic}</p></div>
                    <div><p className="text-[10px] font-bold uppercase text-slate-400">Best conditions</p><p className="mt-1 text-xs text-slate-300">{info.best}</p></div>
                    <div><p className="text-[10px] font-bold uppercase text-slate-400">Risk profile</p><p className="mt-1 text-xs text-slate-300">{info.risk}</p></div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {tab === 'risk' && (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="Daily loss cap" value="$250" tone="neutral" />
              <Stat label="Max lot / trade" value="0.10" />
              <Stat label="Max open trades" value="20" />
              <Stat label="SL floor" value="500 pts (gold 3000)" />
            </div>
            <Card title="Active risk gates">
              <div className="space-y-2 text-xs text-slate-300">
                <p>• Every entry passes the bridge risk gate: daily loss cap, max trades, spread guard, no-trade windows.</p>
                <p>• Stop-loss floor 500 points (gold minimum 3000 points = $300 move); TP = SL × your risk-reward ratio.</p>
                <p>• Trailing stop engages at 550 points profit and trails 250 points behind price (EA-side).</p>
                <p>• Real accounts require an explicit live-trading consent toggle on the AI Bots page.</p>
                {st?.lastReject && st.lastReject !== 'None' && (
                  <p className="rounded-lg border border-amber-400/40 bg-amber-500/10 px-2 py-1.5 text-amber-200">Last rejection: {st.lastReject}</p>
                )}
              </div>
            </Card>
          </>
        )}

        {tab === 'portfolio' && (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <Stat label="Account" value={st?.account ?? '—'} />
              <Stat label="Broker" value={st?.broker ?? '—'} />
              <Stat label="Open P&L" value={st ? `$${st.openProfit.toFixed(2)}` : '—'} tone={st && st.openProfit > 0 ? 'good' : 'bad'} />
            </div>
            <Card title="Open positions (live from your terminal)">
              {st && st.openTrades.length > 0 ? (
                <table className="w-full text-xs">
                  <thead><tr className="text-left text-slate-500"><th className="pb-2">Ticket</th><th>Symbol</th><th>Side</th><th>Lot</th><th>Entry</th><th className="text-right">P&L</th></tr></thead>
                  <tbody>
                    {st.openTrades.map((t) => (
                      <tr key={t.ticket} className="border-t border-slate-800 text-slate-200">
                        <td className="py-1.5">#{t.ticket}</td><td>{t.symbol}</td><td>{t.side}</td><td>{t.lot}</td><td>{t.open_price}</td>
                        <td className={`text-right font-bold ${(t.profit ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>${(t.profit ?? 0).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-xs text-slate-500">No open positions. History of closed trades lives in the main dashboard&apos;s History dock.</p>
              )}
            </Card>
          </>
        )}

        {tab === 'history' && (
          <Card title="Order & signal history">
            <p className="text-xs text-slate-400">
              Executions, rejections and the full trade log stream into the main dashboard&apos;s Terminal dock (Execution / Errors / History tabs,
              bottom of the page) — per profile PIN. This console shows the latest:
            </p>
            <div className="mt-3 space-y-1.5 text-xs">
              <p>Last trade: <span className="font-semibold text-slate-200">{st?.lastTrade ?? '—'}</span></p>
              <p>Last rejection: <span className="font-semibold text-rose-300">{st?.lastReject ?? 'None'}</span></p>
              {st?.lastSignal && <p>Last engine signal: <span className="font-semibold text-slate-200">{st.lastSignal.action} {st.lastSignal.symbol}</span> <span className="text-slate-500">· {st.lastSignal.reason} · {new Date(st.lastSignal.timestamp).toLocaleString()}</span></p>}
            </div>
            <a href="/" className="mt-3 inline-block rounded-lg bg-violet-600 px-3 py-2 text-xs font-bold text-white hover:bg-violet-500">Open full history on dashboard</a>
          </Card>
        )}

        {tab === 'settings' && (
          <Card title="Console settings">
            <div className="space-y-2 text-xs text-slate-300">
              <p>• Risk-reward ratio, strategy mode and scoping are controlled from the main dashboard — they apply to this console too (one engine).</p>
              <p>• Profile: your PIN unlocks your own history and settings. <a href="/join" className="text-violet-300 underline">Invite others</a> — they get their own PIN by email.</p>
              <p>• EA defaults: AppURL http://127.0.0.1:5001/signal · EventURL http://127.0.0.1:5001/event (cloud fallback automatic).</p>
            </div>
          </Card>
        )}
      </div>
    </main>
  );
}

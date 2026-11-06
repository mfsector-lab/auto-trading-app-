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
  aiStats: { totalTrades: number; wins: number; losses: number; winRate: number; totalPnl: number; recentResults: Array<{ action: string; symbol: string; profit: number; outcome: string; timestamp: string }> } | null;
  activeStrategy: string;
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


interface Recommendation {
  severity: 'info' | 'warn' | 'action';
  title: string;
  detail: string;
  apply?: { rrRatio?: string; strategyMode?: string };
}

function evaluateEngine(
  stats: NonNullable<EngineStatus['aiStats']> | null,
  activeStrategy: string,
  rrRatio: string,
): Recommendation[] {
  const recs: Recommendation[] = [];
  if (!stats || stats.totalTrades === 0) {
    recs.push({ severity: 'info', title: 'No closed trades yet', detail: 'Generate signals or enable Autonomous Mode on the dashboard. Evaluations begin once the EA reports closed trades.' });
    return recs;
  }
  const wr = stats.winRate;
  const recent = stats.recentResults ?? [];
  const recent10 = recent.slice(0, 10);
  const recentWr = recent10.length > 0
    ? Math.round((recent10.filter((x) => x.outcome === 'WIN').length / recent10.length) * 100)
    : null;

  // 1) per-symbol concentration
  const bySym: Record<string, { w: number; l: number }> = {};
  for (const t of recent) {
    bySym[t.symbol] = bySym[t.symbol] ?? { w: 0, l: 0 };
    if (t.outcome === 'WIN') bySym[t.symbol].w += 1; else bySym[t.symbol].l += 1;
  }
  for (const [sym, s] of Object.entries(bySym)) {
    if (s.l >= 3 && s.w === 0) {
      recs.push({ severity: 'warn', title: `${sym} is bleeding`, detail: `${s.l} consecutive losses on ${sym}. Recommend removing it from scoped markets in the dashboard Scoping panel.` });
    } else if (s.w >= 3 && s.l === 0) {
      recs.push({ severity: 'action', title: `${sym} is performing`, detail: `${s.w} wins, 0 losses. Consider prioritizing ${sym} (lock market or narrow scope to it).` });
    }
  }

  // 2) win-rate based tuning
  if (recentWr !== null && recent10.length >= 4) {
    if (recentWr < 40) {
      const nextRr = String(Math.min(4.0, Number(rrRatio) + 0.3));
      recs.push({ severity: 'action', title: `Recent win rate ${recentWr}% — widen targets`, detail: `Only ${recent10.filter((x) => x.outcome === 'WIN').length}/${recent10.length} recent trades won. Recommend raising RR to ${nextRr} so winners outweigh losers, or switching strategy mode.`, apply: { rrRatio: nextRr } });
    } else if (recentWr > 65) {
      const nextRr = String(Math.max(1.2, Number(rrRatio) - 0.2));
      recs.push({ severity: 'info', title: `Recent win rate ${recentWr}% — harvesting well`, detail: `Edge is working. You could tighten RR to ${nextRr} for faster compounding, or keep current settings.`, apply: { rrRatio: nextRr } });
    }
  }

  // 3) drawdown / streak guard
  let worst = 0, cur = 0;
  for (const t of recent) {
    cur = t.outcome === 'WIN' ? 0 : cur + 1;
    worst = Math.max(worst, cur);
  }
  if (worst >= 4) {
    recs.push({ severity: 'warn', title: `Loss streak of ${worst} detected`, detail: 'Recommend enabling a cooldown (raise No-Trade Windows coverage) or pausing Autonomous Mode until conditions change.' });
  }

  // 4) overall health
  recs.push({ severity: 'info', title: `Lifetime: ${stats.totalTrades} trades · ${wr}% win · $${stats.totalPnl.toFixed(2)} P&L`, detail: `Active strategy: ${activeStrategy}. All evaluations recompute every 5s from your EA's reported results.` });
  return recs;
}

export default function SygnalApp() {
  const [tab, setTab] = useState<TabId>('dashboard');
  const [st, setSt] = useState<EngineStatus | null>(null);
  const [rrRatio, setRrRatio] = useState('2.0');
  const [autoTune, setAutoTune] = useState(false);
  const [applied, setApplied] = useState('');

  const applyRecommendation = useCallback(async (r: Recommendation) => {
    if (!r.apply) return;
    if (r.apply.rrRatio) setRrRatio(r.apply.rrRatio);
    try {
      await fetch('/api/signals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: '0000', mode: 'scalp', action: 'HOLD', symbol: 'EURUSD', lot: 0.01,
          bot_enabled: true, strategy_mode: r.apply.strategyMode ?? st?.activeStrategy ?? 'DASHBOARD_SIGNALS',
          rr_ratio: Number(r.apply.rrRatio ?? rrRatio), comment: 'Sygnal_SelfTune' }),
      });
      setApplied(`${r.title} -> applied (RR ${r.apply.rrRatio ?? rrRatio})`);
    } catch { setApplied('apply failed'); }
  }, [st?.activeStrategy, rrRatio]);

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
        aiStats: d.ai_stats ?? null,
        activeStrategy: String(q.strategy_mode ?? '—'),
      });
    } catch { /* offline */ }
  }, []);

  const recs = evaluateEngine(st?.aiStats ?? null, st?.activeStrategy ?? '', rrRatio);

  useEffect(() => {
    if (!autoTune || !st?.aiStats) return;
    const actionable = recs.find((r) => r.severity === 'action' && r.apply);
    if (actionable?.apply) void applyRecommendation(actionable);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st?.aiStats?.totalTrades, autoTune]);

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
              <Card title="AI Trading Bots (live from your engine)">
                <p className="mb-2 text-[10px] text-slate-500">
                  Active mode: <span className="font-bold text-violet-300">{st?.activeStrategy ?? '—'}</span> — select a card below and Generate to switch the engine instantly.
                </p>
                <div className="space-y-2">
                  {BOTS.map((b) => {
                    const active = (st?.activeStrategy ?? '') === b.id;
                    const wins = st?.aiStats?.wins ?? 0;
                    const total = st?.aiStats?.totalTrades ?? 0;
                    const wr = total > 0 ? Math.round((wins / total) * 100) : null;
                    return (
                      <button key={b.id} onClick={() => setTab('strategies')} className={`w-full rounded-xl border p-3 text-left transition-all ${active ? 'border-violet-400 bg-violet-500/10' : 'border-slate-700 bg-slate-950 hover:border-violet-500/50'}`}>
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-bold text-slate-100">{b.name}</p>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${active ? 'bg-violet-500/20 text-violet-200' : 'bg-slate-700/60 text-slate-300'}`}>{active ? 'DRIVING ENGINE' : 'ready'}</span>
                        </div>
                        <p className="mt-0.5 text-[10px] text-slate-500">{b.style}</p>
                        <p className="mt-1 text-[10px] text-slate-400">
                          Real results: {total} closed trades · {wr !== null ? `${wr}% win rate` : 'no closed trades yet'} · P&L ${st?.aiStats?.totalPnl?.toFixed(2) ?? '0.00'}
                        </p>
                      </button>
                    );
                  })}
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
                {st?.aiStats?.recentResults && st.aiStats.recentResults.length > 0 && (
                  <div className="mt-3">
                    <p className="text-[10px] uppercase tracking-widest text-slate-500">Closed trades (real, from your EA)</p>
                    <div className="mt-1 max-h-40 space-y-1 overflow-y-auto">
                      {st.aiStats.recentResults.slice(0, 10).map((t, i) => (
                        <div key={i} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-xs">
                          <span className={t.outcome === 'WIN' ? 'font-semibold text-emerald-300' : 'font-semibold text-rose-300'}>
                            {t.action} · {t.symbol} · {t.outcome}
                          </span>
                          <span className="text-slate-400">${(t.profit ?? 0).toFixed(2)} · {new Date(t.timestamp).toLocaleTimeString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
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
            <Card title="Engine Evaluation & Self-Improvement">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[10px] text-slate-500">Rules-based evaluator over your real closed trades. Recomputes every 5s.</p>
                <label className="flex items-center gap-2 text-[10px] font-semibold text-violet-300">
                  <input type="checkbox" checked={autoTune} onChange={(e) => setAutoTune(e.target.checked)} />
                  AUTO-TUNE {autoTune ? 'ON' : 'OFF'}
                </label>
              </div>
              <div className="space-y-2">
                {recs.map((r, i) => (
                  <div key={i} className={`rounded-xl border p-2.5 text-xs ${
                    r.severity === 'action' ? 'border-violet-400/40 bg-violet-500/10' :
                    r.severity === 'warn' ? 'border-amber-400/40 bg-amber-500/10' : 'border-slate-700 bg-slate-950/60'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <p className={`font-bold ${r.severity === 'warn' ? 'text-amber-200' : r.severity === 'action' ? 'text-violet-200' : 'text-slate-200'}`}>
                        {r.severity === 'action' ? 'RECOMMENDED: ' : ''}{r.title}
                      </p>
                      {r.apply && (
                        <button onClick={() => void applyRecommendation(r)}
                          className="rounded-lg bg-violet-600 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-violet-500">
                          Apply
                        </button>
                      )}
                    </div>
                    <p className="mt-1 text-slate-400">{r.detail}</p>
                  </div>
                ))}
                {applied && <p className="text-[11px] font-semibold text-emerald-300">{applied}</p>}
              </div>
            </Card>
            <Card title="How performance is measured">
              <p className="text-xs text-slate-400">
                All figures come from your live MT5 terminal — open positions, floating P&L and closed-trade results update every 5 seconds.
                Nothing on this tab is simulated.
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

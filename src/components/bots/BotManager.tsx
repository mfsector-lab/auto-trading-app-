'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Nav from '@/components/Nav';
import DerivConnect from '@/components/deriv/DerivConnect';
import AiScannerWidget from './AiScannerWidget';
import { AiScanner, type ScannerState } from '@/services/aiScanner';
import { BotRunner } from '@/utils/tradingEngines/runner';
import { STRATEGIES, lastDigit } from '@/utils/tradingEngines/digitStrategies';
import type { BotConfig, BotStats, StrategyType, TickData } from '@/utils/tradingEngines/types';
import { isDemoAccount, loadSessions, type DerivAccount } from '@/lib/deriv/session';
import { DerivSocket } from '@/lib/deriv/ws';

const STORE = 'deriv_bots_v1';
const SYMBOLS = ['R_10', 'R_25', 'R_50', 'R_75', 'R_100', '1HZ10V', '1HZ25V', '1HZ50V', '1HZ75V', '1HZ100V'];

const DEFAULT_BOT: Omit<BotConfig, 'id'> = {
  name: 'New Bot',
  strategy: 'DIGITDIFF',
  symbol: 'R_10',
  digit: 5,
  overUnderBarrier: 5,
  stake: 0.35,
  moneyManagement: 'FLAT',
  martingaleMultiplier: 2.1,
  maxMartingaleSteps: 5,
  gridLevels: 3,
  cooldownTicks: 2,
  maxLossStreak: 6,
  followAi: true,
};

function loadBots(): BotConfig[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORE);
    return raw ? (JSON.parse(raw) as BotConfig[]) : [];
  } catch { return []; }
}

export default function BotManager() {
  const [bots, setBots] = useState<BotConfig[]>([]);
  const [stats, setStats] = useState<Record<string, BotStats>>({});
  const [draft, setDraft] = useState({ ...DEFAULT_BOT });
  const [accounts, setAccounts] = useState<DerivAccount[]>([]);
  const [active, setActive] = useState<DerivAccount | null>(null);
  const [liveAllowed, setLiveAllowed] = useState(false);
  const [balance, setBalance] = useState<{ v: number; c: string } | null>(null);
  const [scanner, setScanner] = useState<ScannerState | null>(null);
  const [feed, setFeed] = useState<string[]>([]);

  const socketRef = useRef<DerivSocket | null>(null);
  const runnersRef = useRef<Map<string, BotRunner>>(new Map());
  const scannerRef = useRef<AiScanner>(new AiScanner(100));

  // restore bots once
  useEffect(() => { setBots(loadBots()); }, []);
  useEffect(() => {
    if (typeof window !== 'undefined' && bots.length > 0) localStorage.setItem(STORE, JSON.stringify(bots));
  }, [bots]);

  // restore sessions once
  useEffect(() => {
    const s = loadSessions();
    setAccounts(s);
    // safety default: prefer the DEMO account
    setActive(s.find((a) => isDemoAccount(a)) ?? s[0] ?? null);
  }, []);

  const log = useCallback((line: string) => {
    setFeed((prev) => [`[${new Date().toLocaleTimeString()}] ${line}`, ...prev].slice(0, 60));
  }, []);

  /** Open a fresh authorized socket for the selected account, subscribe balance + symbol ticks. */
  const connectAccount = useCallback(async (account: DerivAccount, symbol: string) => {
    socketRef.current?.close();
    setBalance(null);
    const sock = new DerivSocket();
    socketRef.current = sock;
    sock.connect(async () => {
      try {
        await sock.authorize(account.token);
        const bal = await sock.subscribeBalance();
        setBalance({ v: Number(bal.balance ?? 0), c: String(bal.currency ?? account.currency) });
        log(`Authorized ${account.loginid} (${isDemoAccount(account) ? 'DEMO' : 'REAL'})`);
        await sock.subscribeTicks(symbol, (msg) => {
          const t = msg.tick as Record<string, unknown> | undefined;
          if (!t) return;
          const tick: TickData = {
            epoch: Number(t.epoch ?? 0),
            quote: Number(t.quote ?? 0),
            digit: lastDigit(Number(t.quote ?? 0)),
          };
          const st = scannerRef.current.push(tick);
          setScanner({ ...st });
          for (const runner of runnersRef.current.values()) {
            runner.pushTick(tick, sock, account.currency, st);
          }
        });
      } catch (e) {
        log(`Auth failed: ${e instanceof Error ? e.message : 'unknown'}`);
      }
    });
  }, [log]);

  // (re)connect when active account or any bot symbol changes
  const symbolsKey = bots.map((b) => b.symbol).join(',');
  const anyRunning = useMemo(() => Object.values(stats).some((s) => s.running), [stats]);
  useEffect(() => {
    if (!active) return;
    const symbol = bots.find((b) => b.symbol)?.symbol ?? 'R_10';
    void connectAccount(active, symbol);
    return () => { socketRef.current?.close(); socketRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.loginid, symbolsKey]);

  const spawn = useCallback(() => {
    const bot: BotConfig = { ...draft, id: `bot_${Date.now()}` };
    setBots((prev) => [...prev, bot]);
    log(`Spawned bot "${bot.name}" (${bot.strategy} on ${bot.symbol})`);
  }, [draft, log]);

  const toggleRun = useCallback((bot: BotConfig) => {
    setStats((prev) => {
      const cur = prev[bot.id];
      const running = !cur?.running;
      if (running) {
        runnersRef.current.set(bot.id, new BotRunner(bot));
        log(`Started "${bot.name}"`);
      } else {
        runnersRef.current.delete(bot.id);
        log(`Stopped "${bot.name}"`);
      }
      return { ...prev, [bot.id]: { ...(cur ?? {
        trades: 0, wins: 0, losses: 0, pnl: 0, lossStreak: 0,
        currentStake: bot.stake, openContracts: 0, lastError: '', running,
      }), running } };
    });
  }, [log]);

  const removeBot = useCallback((id: string) => {
    runnersRef.current.delete(id);
    setBots((prev) => prev.filter((b) => b.id !== id));
  }, []);

  const liveSelected = active ? !isDemoAccount(active) : false;
  const tradingBlocked = liveSelected && !liveAllowed;
  // gate entries for live accounts not explicitly enabled
  useEffect(() => {
    if (tradingBlocked) {
      for (const r of runnersRef.current.values()) r.stop();
    }
  }, [tradingBlocked]);

  const needsDigit = (s: StrategyType) => STRATEGIES.find((x) => x.type === s)?.needsBarrier ?? false;

  return (
    <div className="mx-auto w-full max-w-[1540px] px-4 py-6">
      <div className="rounded-2xl border border-violet-500/30 bg-[linear-gradient(135deg,#140a1f,#090d1a)] p-5 text-white">
        <h1 className="text-xl font-bold">AI Multi-Bot Engine</h1>
        <p className="mt-1 text-xs text-slate-300">Spawn bots on Deriv digit markets — bulk entries, Martingale/Grid risk, live balances from your authorized account.</p>
      </div>

      <div className="mt-4"><DerivConnect /></div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-700 bg-slate-900/70 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          {accounts.map((a) => (
            <button
              key={a.loginid}
              onClick={() => setActive(a)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                active?.loginid === a.loginid
                  ? isDemoAccount(a) ? 'border-cyan-400 bg-cyan-500/20 text-cyan-100' : 'border-amber-400 bg-amber-500/20 text-amber-100'
                  : 'border-slate-700 bg-slate-950 text-slate-300'
              }`}
            >
              {a.loginid} · {isDemoAccount(a) ? 'DEMO' : 'REAL'}
            </button>
          ))}
          {accounts.length === 0 && <p className="text-xs text-slate-400">Connect Deriv above to enable bots.</p>}
        </div>
        <div className="flex items-center gap-3">
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${liveSelected ? 'bg-amber-500/20 text-amber-200' : 'bg-cyan-500/20 text-cyan-200'}`}>
            {liveSelected ? 'REAL MONEY' : 'DEMO'}
          </span>
          <span className="text-sm font-bold text-white">
            {balance ? `${balance.v.toFixed(2)} ${balance.c}` : '—'}
          </span>
        </div>
      </div>

      {liveSelected && (
        <label className="mt-2 flex items-center gap-2 rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-2 text-xs text-amber-100">
          <input type="checkbox" checked={liveAllowed} onChange={(e) => setLiveAllowed(e.target.checked)} />
          Enable live trading on this REAL account — bots will spend real money.
        </label>
      )}

      {tradingBlocked && (
        <p className="mt-2 rounded-xl border border-rose-400/40 bg-rose-500/10 px-4 py-2 text-xs text-rose-200">
          Bots are paused: a REAL account is selected but live trading is not enabled.
        </p>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.4fr]">
        <div className="space-y-4">
          <AiScannerWidget s={scanner ?? new AiScanner(100).state} />

          <div className="rounded-2xl border border-violet-500/30 bg-slate-900/70 p-4">
            <p className="text-sm font-semibold text-white">Spawn New Bot</p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <label className="col-span-2 text-[10px] uppercase tracking-widest text-slate-500">Name
                <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-100" />
              </label>
              <label className="text-[10px] uppercase tracking-widest text-slate-500">Algorithm
                <select value={draft.strategy} onChange={(e) => setDraft({ ...draft, strategy: e.target.value as StrategyType })}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-100">
                  {STRATEGIES.map((s) => <option key={s.type} value={s.type}>{s.label}</option>)}
                </select>
              </label>
              <label className="text-[10px] uppercase tracking-widest text-slate-500">Symbol
                <select value={draft.symbol} onChange={(e) => setDraft({ ...draft, symbol: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-100">
                  {SYMBOLS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              {needsDigit(draft.strategy) && draft.strategy.startsWith('DIGIT') && (
                <label className="text-[10px] uppercase tracking-widest text-slate-500">Digit
                  <select value={draft.digit} onChange={(e) => setDraft({ ...draft, digit: Number(e.target.value) })}
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-100">
                    {Array.from({ length: 10 }, (_, i) => <option key={i} value={i}>{i}</option>)}
                  </select>
                </label>
              )}
              {needsDigit(draft.strategy) && !draft.strategy.startsWith('DIGIT') && (
                <label className="text-[10px] uppercase tracking-widest text-slate-500">Barrier
                  <select value={draft.overUnderBarrier} onChange={(e) => setDraft({ ...draft, overUnderBarrier: Number(e.target.value) })}
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-100">
                    {Array.from({ length: 10 }, (_, i) => <option key={i} value={i}>{i}</option>)}
                  </select>
                </label>
              )}
              <label className="text-[10px] uppercase tracking-widest text-slate-500">Base stake
                <input type="number" step="0.01" min="0.35" value={draft.stake}
                  onChange={(e) => setDraft({ ...draft, stake: Number(e.target.value) })}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-100" />
              </label>
              <label className="text-[10px] uppercase tracking-widest text-slate-500">Risk model
                <select value={draft.moneyManagement} onChange={(e) => setDraft({ ...draft, moneyManagement: e.target.value as BotConfig['moneyManagement'] })}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-100">
                  <option value="FLAT">Flat</option>
                  <option value="MARTINGALE">Martingale</option>
                  <option value="GRID">Grid</option>
                </select>
              </label>
              {draft.moneyManagement === 'MARTINGALE' && (
                <>
                  <label className="text-[10px] uppercase tracking-widest text-slate-500">Multiplier
                    <input type="number" step="0.1" value={draft.martingaleMultiplier}
                      onChange={(e) => setDraft({ ...draft, martingaleMultiplier: Number(e.target.value) })}
                      className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-100" />
                  </label>
                  <label className="text-[10px] uppercase tracking-widest text-slate-500">Max steps
                    <input type="number" value={draft.maxMartingaleSteps}
                      onChange={(e) => setDraft({ ...draft, maxMartingaleSteps: Number(e.target.value) })}
                      className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-100" />
                  </label>
                </>
              )}
              {draft.moneyManagement === 'GRID' && (
                <label className="text-[10px] uppercase tracking-widest text-slate-500">Grid levels
                  <input type="number" value={draft.gridLevels}
                    onChange={(e) => setDraft({ ...draft, gridLevels: Number(e.target.value) })}
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-100" />
                </label>
              )}
              <label className="col-span-2 flex items-center gap-2 text-[11px] text-slate-300">
                <input type="checkbox" checked={draft.followAi}
                  onChange={(e) => setDraft({ ...draft, followAi: e.target.checked })} />
                Follow AI scanner recommendation before entering
              </label>
            </div>
            <button onClick={spawn} disabled={accounts.length === 0}
              className="mt-3 w-full rounded-xl bg-violet-600 px-3 py-2.5 text-sm font-bold text-white hover:bg-violet-500 disabled:opacity-40">
              ⚡ Spawn Bot
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
            <p className="text-sm font-semibold text-white">Bot Fleet ({bots.length})</p>
            <div className="mt-3 space-y-2">
              {bots.length === 0 && <p className="text-xs text-slate-500">No bots yet — spawn one on the left.</p>}
              {bots.map((bot) => {
                const s = stats[bot.id];
                return (
                  <div key={bot.id} className="rounded-xl border border-slate-700 bg-slate-950 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-bold text-slate-100">
                          {bot.name} <span className="ml-1 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300">{bot.strategy}{bot.strategy.startsWith('DIGIT') ? ` ${bot.digit}` : bot.strategy === 'OVER' || bot.strategy === 'UNDER' ? ` ${bot.overUnderBarrier}` : ''}</span>
                          <span className="ml-1 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300">{bot.symbol}</span>
                          <span className="ml-1 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300">{bot.moneyManagement}</span>
                          {bot.followAi && <span className="ml-1 rounded bg-cyan-900/60 px-1.5 py-0.5 text-[10px] text-cyan-300">AI-gated</span>}
                        </p>
                        <p className="mt-1 text-[11px] text-slate-400">
                          trades {s?.trades ?? 0} · win {s?.wins ?? 0} · loss {s?.losses ?? 0} · streak {s?.lossStreak ?? 0} · stake {s?.currentStake?.toFixed?.(2) ?? bot.stake}
                          {' '}· P&L <span className={(s?.pnl ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{(s?.pnl ?? 0).toFixed(2)}</span>
                          {s?.lastError ? ` · ${s.lastError}` : ''}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => toggleRun(bot)} disabled={!active || tradingBlocked}
                          className={`rounded-lg px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40 ${s?.running ? 'bg-rose-600 hover:bg-rose-500' : 'bg-emerald-600 hover:bg-emerald-500'}`}>
                          {s?.running ? 'Stop' : 'Start'}
                        </button>
                        <button onClick={() => removeBot(bot.id)}
                          className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-800">
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
            <p className="text-sm font-semibold text-white">Activity {anyRunning ? '· running' : ''}</p>
            <div className="mt-2 max-h-44 space-y-1 overflow-y-auto text-[11px] text-slate-400">
              {feed.length === 0 && <p>No activity yet.</p>}
              {feed.map((l, i) => <p key={i}>{l}</p>)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

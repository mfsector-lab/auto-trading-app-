'use client';

import { useCallback, useEffect, useState } from 'react';

const STRATEGIES = [
  { id: 'MOMENTUM_ALPHA', label: 'Momentum Alpha', tag: 'Trend / Momentum' },
  { id: 'MEAN_REVERSION', label: 'Mean Reversion X', tag: 'Statistical' },
  { id: 'VOLATILITY_HARVEST', label: 'Volatility Harvest', tag: 'Vol Breakout' },
  { id: 'SENTIMENT_EDGE', label: 'Sentiment Edge', tag: 'Flow proxy' },
  { id: 'GRID_SCALPER', label: 'Grid Scalper', tag: 'Market-making' },
];

export default function SygnalControl() {
  const [mode, setMode] = useState('MOMENTUM_ALPHA');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [last, setLast] = useState<{ action: string; symbol: string; reason: string; ts: string } | null>(null);

  const poll = useCallback(async () => {
    try {
      const res = await fetch('/api/signals?status=1&client_id=0000', { cache: 'no-store' });
      if (!res.ok) return;
      const d = await res.json();
      const q = d.queued_signal ?? d.lastSignalByMode ?? null;
      if (q && q.action) {
        setLast({ action: String(q.action), symbol: String(q.symbol ?? ''), reason: String(q.scan_reason ?? ''), ts: String(q.timestamp ?? '') });
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    void poll();
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, [poll]);

  const generate = useCallback(async () => {
    setBusy(true);
    setMsg('Engine scanning markets…');
    try {
      const res = await fetch('/api/signals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: '0000',
          mode: 'scalp',
          action: 'AUTO_SCAN',
          symbol: 'EURUSD',
          lot: 0.01,
          bot_enabled: true,
          autonomous_mode: true,
          strategy_mode: mode,
          comment: 'Sygnal_AI_Generated',
        }),
      });
      setMsg(res.ok ? 'Signal request delivered to the engine — result appears below within seconds.' : `Engine returned ${res.status}`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'request failed');
    } finally {
      setBusy(false);
    }
  }, [mode]);

  return (
    <div className="rounded-2xl border border-violet-500/30 bg-slate-950/80 p-4">
      <p className="text-sm font-semibold text-white">Sygnal AI Signal Generator</p>
      <p className="mt-1 text-xs text-slate-400">
        Pick a strategy, generate a live signal from the trading engine, and it executes on your connected terminal.
      </p>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {STRATEGIES.map((s) => (
          <button
            key={s.id}
            onClick={() => setMode(s.id)}
            className={`rounded-xl border p-3 text-left transition-all ${mode === s.id ? 'border-violet-400 bg-violet-500/10' : 'border-slate-700 bg-slate-900 hover:border-slate-500'}`}
          >
            <p className="text-xs font-bold text-white">{s.label}</p>
            <p className="mt-0.5 text-[10px] uppercase tracking-widest text-slate-500">{s.tag}</p>
            {mode === s.id && <p className="mt-1 text-[10px] font-semibold text-violet-300">SELECTED</p>}
          </button>
        ))}
      </div>

      <button
        onClick={generate}
        disabled={busy}
        className="mt-3 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-violet-500 disabled:opacity-40"
      >
        {busy ? 'Generating…' : '⚡ Generate AI Signal'}
      </button>
      {msg && <p className="mt-2 text-[11px] text-slate-300">{msg}</p>}

      {last && (
        <div className="mt-3 rounded-xl border border-slate-700 bg-slate-900 p-3 text-xs">
          <p className="text-slate-400">Latest engine signal</p>
          <p className="mt-1 font-bold text-white">
            <span className={last.action === 'BUY' ? 'text-emerald-400' : last.action === 'SELL' ? 'text-rose-400' : 'text-slate-300'}>
              {last.action}
            </span>{' '}
            {last.symbol} <span className="text-slate-500">· {last.reason}</span>
          </p>
        </div>
      )}
    </div>
  );
}

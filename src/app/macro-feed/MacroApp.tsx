'use client';

import { useEffect, useState } from 'react';
import MacroTabs from '@/components/MacroTabs';

interface EcoEvent {
  date: string; time: string; name: string; currency: string;
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
  forecast: string | null; previous: string | null; actual: string | null;
  pairs: string[]; released: boolean; minutesUntil: number;
}


export default function MacroApp() {
  const [events, setEvents] = useState<EcoEvent[]>([]);
  const [next, setNext] = useState<EcoEvent | null>(null);
  const [macro, setMacro] = useState<Array<{ pair: string; bias: string; health: number; note: string; counterFiltered: number; drift: number }>>([]);
  const [now, setNow] = useState(() => Date.now());

  // 24/7: event list refresh every 30s, countdown ticks every 1s
  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch('/api/news', { cache: 'no-store' });
        const d = await r.json();
        setEvents(d.events ?? []);
        setNext(d.nextHighImpact ?? null);
      } catch { /* keep */ }
      try {
        const r2 = await fetch('/api/scanner', { cache: 'no-store' });
        const d2 = await r2.json();
        setMacro(d2.macro ?? []);
      } catch { /* keep */ }
    };
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const countdown = (() => {
    if (!next) return null;
    const ms = new Date(`${next.date}T${next.time}:00Z`).getTime() - now;
    if (ms <= 0) return 'RELEASED';
    const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000);
    return `${h}h ${m}m ${s}s`;
  })();

  return (
    <div className="mx-auto w-full max-w-[1540px] px-4 py-4">
      {/* header: H4 engine live (MT ENGINE text replaced) */}
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white">Live Macro &amp; Smart Money Intelligence</h1>
          <p className="text-xs text-slate-400">24/7 economic calendar · CPI / PPI / NFP / FOMC · institutional bias · H4 scanner link</p>
        </div>
        <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-bold text-emerald-300">
          H4 SCANNER ENGINE: LIVE
        </span>
      </div>

      {/* sub-navigation preserved */}
      <MacroTabs active="/macro-feed" />{/* 24/7 high-impact alert banner with live countdown */}
      {next && (
        <div className="nexa-panel mb-3 border-red-500/40 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-bold text-red-300">⚠ HIGH-IMPACT EVENT APPROACHING — SPREAD RISK ACTIVE</p>
              <p className="text-xs text-red-200/80">
                {next.name} · {next.date} {next.time} UTC · {next.currency} · forecast {next.forecast} vs previous {next.previous}
              </p>
              <p className="mt-1 text-[11px] text-red-200/70">Affects: {next.pairs.join(', ')}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wide text-red-300/70">Countdown</p>
              <p className="font-mono text-xl font-bold text-red-200">{countdown}</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {/* Tier-1 calendar (auto-updating 24/7) */}
        <div className="lg:col-span-2 nexa-panel p-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-bold text-white">Economic Calendar — Tier 1 Events</h2>
            <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-300">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> LIVE · 30s refresh
            </span>
          </div>
          <div className="max-h-[480px] space-y-2 overflow-y-auto pr-1">
            {events.map((e) => (
              <div key={`${e.date}-${e.name}`} className="rounded-lg border border-slate-800 bg-slate-950/60 p-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold text-white">
                      {e.name}
                      {e.impact === 'HIGH' && <span className="ml-2 rounded bg-red-500/20 px-1.5 py-0.5 text-[9px] font-bold text-red-300">HIGH</span>}
                      {e.impact === 'MEDIUM' && <span className="ml-2 rounded bg-yellow-500/20 px-1.5 py-0.5 text-[9px] font-bold text-yellow-300">MED</span>}
                    </p>
                    <p className="text-[10px] text-slate-500">{e.date} · {e.time} UTC · {e.currency}</p>
                  </div>
                  <div className="flex gap-4 text-[11px]">
                    <span className="text-slate-400">F: <span className="text-slate-200">{e.forecast ?? '—'}</span></span>
                    <span className="text-slate-400">P: <span className="text-slate-200">{e.previous ?? '—'}</span></span>
                    <span className="text-slate-400">A: <span className={e.actual ? 'text-cyan-300' : 'text-slate-500'}>{e.actual ?? 'pending'}</span></span>
                    <span className={e.released ? 'text-emerald-400' : 'text-yellow-400'}>{e.released ? 'RELEASED' : `in ${e.minutesUntil}m`}</span>
                  </div>
                </div>
                <p className="mt-1 text-[10px] text-violet-300/80">H4 scanner link: {e.pairs.join(' · ')}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Macro Trend Lock + Smart Money confluence */}
        <div className="nexa-panel p-3">
          <h2 className="mb-2 text-sm font-bold text-white">🔒 Macro Trend Lock</h2>
          <p className="mb-2 text-[11px] text-slate-400">Active institutional bias — counter-trend H&amp;S setups filtered unless confirmed by structure + COT shift.</p>
          <div className="space-y-2">
            {macro.map((m) => (
              <div key={m.pair} className="rounded-lg border border-slate-800 bg-slate-950/60 p-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white">{m.pair}</span>
                  <span className={`text-[10px] font-bold ${m.bias === 'BULLISH' ? 'text-emerald-400' : m.bias === 'BEARISH' ? 'text-red-400' : 'text-yellow-400'}`}>
                    {m.bias === 'BULLISH' ? '▲ LONG' : m.bias === 'BEARISH' ? '▼ SHORT' : '◆ RANGE'}
                  </span>
                </div>
                <p className="mt-1 text-[10px] text-slate-400">{m.note}</p>
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-1 flex-1 overflow-hidden rounded bg-slate-800">
                    <div className="h-full bg-gradient-to-r from-violet-500 to-emerald-400" style={{ width: `${m.health}%` }} />
                  </div>
                  <span className="text-[10px] text-slate-400">{m.health}/100</span>
                </div>
                {m.counterFiltered > 0 && (
                  <p className="mt-1 text-[10px] text-amber-300/80">🔒 {m.counterFiltered} counter-trend H&S signal{m.counterFiltered > 1 ? 's' : ''} filtered</p>
                )}
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/60 p-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">COT Positioning Shift <span className="ml-1 text-[9px] text-slate-600">CFTC weekly</span></p>
            <p className="mt-1 text-[11px] text-slate-300">Weekly CFTC COT report (published Fridays) — latest positioning summary on the COT Data History tab; refreshes each report release</p>
          </div>
        </div>
      </div>

    </div>
  );
}

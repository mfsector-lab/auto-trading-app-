'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Setup {
  pair: string; direction: string; status: string; confidence: number;
  technicalScore: number; learnAdjust: number; smc: string[];
  neckline: number; head: number; target: number; stopLoss: number;
}

function fmt(pair: string, v: number) {
  return v.toFixed(pair.includes('JPY') ? 3 : 2);
}

export default function HeroSetups() {
  const [setups, setSetups] = useState<Setup[]>([]);
  const [loading, setLoading] = useState(true);
  const [updated, setUpdated] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch('/api/scanner', { cache: 'no-store' });
        const d = await r.json();
        setSetups(d.setups ?? []);
        setUpdated(new Date().toLocaleTimeString());
      } catch { /* keep */ }
      setLoading(false);
    };
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, []);

  const top = setups.slice(0, 2);

  return (
    <section>
      {/* command-center header strip */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-500/30 bg-black/60 px-4 py-3">
        <div>
          <h1 className="text-lg font-bold tracking-[0.22em] text-white nexa-glow-text">
            H4 COMMAND CENTER
          </h1>
          <p className="text-[11px] text-slate-400">
            Two highest-potential setups on the board right now
          </p>
        </div>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 rounded-full border border-red-500/40 bg-red-500/10 px-3 py-1 text-[10px] font-bold tracking-widest text-red-300">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" /> LIVE
          </span>
          <span className="text-[10px] text-slate-500">updated {updated || '…'}</span>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="nexa-panel h-[380px] animate-pulse" />
          ))}
        </div>
      ) : top.length === 0 ? (
        <div className="nexa-panel p-10 text-center">
          <p className="text-sm text-slate-300">No high-potential setups detected on the board right now.</p>
          <p className="mt-1 text-xs text-slate-500">The engine rescans every 60 seconds across 23 pairs.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {top.map((s, i) => {
            const bear = s.direction === 'BEARISH_HS';
            const accent = bear ? '#ef4444' : '#10b981';
            const statusLabel =
              s.status === 'NECKLINE_BREAKOUT' ? '⚡ NECKLINE BREAKOUT' :
              s.status === 'EARLY_FORMING' ? '◌ EARLY FORMING' : 'FORMING';
            return (
              <Link
                key={s.pair + s.direction}
                href="/scanner"
                className="nexa-panel relative block overflow-hidden p-0 transition"
              >
                {/* rank strip */}
                <div className="flex items-center justify-between border-b border-blue-500/20 px-4 py-2"
                     style={{ background: 'linear-gradient(90deg, rgba(59,130,246,0.10), transparent)' }}>
                  <span className="text-[10px] font-bold tracking-[0.3em] text-cyan-300">
                    SETUP #{i + 1} · HIGHEST POTENTIAL
                  </span>
                  <span className="font-mono text-[10px] text-slate-500">{s.status}</span>
                </div>

                <div className="p-4">
                  {/* pair + direction */}
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-2xl font-extrabold tracking-wider text-white">{s.pair}</p>
                      <p className="mt-0.5 text-xs font-semibold" style={{ color: accent }}>
                        {bear ? '▼ BEARISH HEAD & SHOULDERS' : '▲ INVERSE HEAD & SHOULDERS'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] uppercase tracking-widest text-slate-500">confidence</p>
                      <p className="font-mono text-3xl font-black" style={{ color: accent }}>{s.confidence}%</p>
                    </div>
                  </div>

                  {/* geometry readout — monospaced terminal rows */}
                  <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-[11px]">
                    <div className="rounded border border-slate-800 bg-black/50 px-2.5 py-1.5">
                      <span className="block text-[9px] uppercase text-slate-500">neckline</span>
                      <span className="text-cyan-300">{fmt(s.pair, s.neckline)}</span>
                    </div>
                    <div className="rounded border border-slate-800 bg-black/50 px-2.5 py-1.5">
                      <span className="block text-[9px] uppercase text-slate-500">head</span>
                      <span className="text-yellow-300">{fmt(s.pair, s.head)}</span>
                    </div>
                    <div className="rounded border border-slate-800 bg-black/50 px-2.5 py-1.5">
                      <span className="block text-[9px] uppercase text-slate-500">stop loss</span>
                      <span className="text-red-400">{fmt(s.pair, s.stopLoss)}</span>
                    </div>
                    <div className="rounded border border-slate-800 bg-black/50 px-2.5 py-1.5">
                      <span className="block text-[9px] uppercase text-slate-500">take profit</span>
                      <span className="text-emerald-400">{fmt(s.pair, s.target)}</span>
                    </div>
                  </div>

                  {/* SMC tags */}
                  <div className="mt-3 flex flex-wrap gap-1">
                    {(s.smc ?? []).map((t) => (
                      <span key={t} className="rounded border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-medium text-cyan-300">
                        {t.replace('_', ' ').toUpperCase()}
                      </span>
                    ))}
                    <span className="rounded border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[10px] font-medium text-violet-300">
                      LEARN {(s.learnAdjust ?? 0) >= 0 ? '+' : ''}{s.learnAdjust ?? 0}
                    </span>
                  </div>

                  {/* mini confidence bar with neon fill */}
                  <div className="mt-3">
                    <div className="h-2 overflow-hidden rounded bg-slate-800/80">
                      <div
                        className="h-full rounded"
                        style={{ width: `${s.confidence}%`, background: `linear-gradient(90deg, #3b82f6, ${accent})`, boxShadow: `0 0 12px ${accent}66` }}
                      />
                    </div>
                  </div>

                  <p className="mt-3 text-[11px] text-slate-500">
                    Status: <span className="text-slate-300">{statusLabel}</span> · technical {s.technicalScore}/60 · view full chart on the scanner grid →
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}

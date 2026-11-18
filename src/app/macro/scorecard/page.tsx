'use client';

import { useEffect, useState } from 'react';
import Nav from '@/components/Nav';
import MacroTabs from '@/components/MacroTabs';

interface Setup {
  pair: string; direction: string; status: string; confidence: number;
  technicalScore: number; learnAdjust: number; smc: string[];
}

export default function ScorecardPage() {
  const [setups, setSetups] = useState<Setup[]>([]);
  useEffect(() => {
    const load = async () => {
      const r = await fetch('/api/scanner', { cache: 'no-store' });
      const d = await r.json();
      setSetups(d.setups ?? []);
    };
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="min-h-screen bg-slate-950">
      <Nav />
      <main className="mx-auto w-full max-w-[1540px] px-4 py-5">
        <MacroTabs active="/macro/scorecard" />
        <h1 className="text-lg font-bold text-white nexa-glow-text">Setup Scorecard</h1>
        <p className="mb-4 text-xs text-slate-400">Component breakdown of the hybrid confidence score for every live H4 setup — technical quality vs learning-model adjustment. Auto-refreshes every 60s.</p>
        {setups.length === 0 ? (
          <p className="text-sm text-slate-400">No live setups — scorecard fills as the scanner detects patterns.</p>
        ) : (
          <div className="space-y-2">
            {setups.map((s) => {
              const technical = s.technicalScore ?? 0;
              const learn = s.learnAdjust ?? 0;
              const smcPts = (s.smc ?? []).length * 10;
              const rows = [
                { k: 'Technical quality (symmetry + neckline + macro)', v: technical, max: 60 },
                { k: 'SMC confluence', v: smcPts, max: 30 },
                { k: 'Learning-model adjustment', v: learn, max: 25, min: -25 },
              ];
              return (
                <div key={s.pair + s.direction} className="nexa-panel p-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="text-sm font-bold text-white">{s.pair}</span>
                      <span className={`ml-2 rounded px-2 py-0.5 text-[10px] font-bold ${s.direction === 'BEARISH_HS' ? 'bg-red-500/15 text-red-300' : 'bg-emerald-500/15 text-emerald-300'}`}>
                        {s.direction === 'BEARISH_HS' ? 'BEARISH H&S' : 'INVERSE H&S'}
                      </span>
                      <span className="ml-2 text-[10px] text-slate-500">{s.status}</span>
                    </div>
                    <span className={`font-mono text-lg font-bold ${s.confidence >= 75 ? 'text-emerald-400' : s.confidence >= 60 ? 'text-yellow-400' : 'text-slate-400'}`}>
                      {s.confidence}%
                    </span>
                  </div>
                  {rows.map((r) => {
                    const pct = Math.min(100, Math.abs(r.v) / r.max * 100);
                    const color = r.v >= 0 ? 'from-blue-500 to-cyan-400' : 'from-red-500 to-orange-400';
                    return (
                      <div key={r.k} className="mb-1">
                        <div className="flex justify-between text-[10px] text-slate-500">
                          <span>{r.k}</span><span>{r.v > 0 ? '+' : ''}{r.v}</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded bg-slate-800">
                          <div className={`h-full bg-gradient-to-r ${color}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                  <div className="mt-1 flex flex-wrap gap-1">
                    {(s.smc ?? []).map((t) => (
                      <span key={t} className="rounded bg-violet-500/10 px-1.5 py-0.5 text-[10px] text-violet-300">{t.replace('_', ' ')}</span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import Nav from '@/components/Nav';
import MacroTabs from '@/components/MacroTabs';

interface Setup {
  pair: string; direction: string; status: string; confidence: number;
  technicalScore: number; learnAdjust: number; smc: string[];
}

export default function StandingsPage() {
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

  // one row per pair: its best setup
  const best = new Map<string, Setup>();
  for (const s of setups) {
    const prev = best.get(s.pair);
    if (!prev || s.confidence > prev.confidence) best.set(s.pair, s);
  }
  const ranked = Array.from(best.values()).sort((a, b) => b.confidence - a.confidence);

  return (
    <div className="min-h-screen bg-slate-950">
      <Nav />
      <main className="mx-auto w-full max-w-[1540px] px-4 py-5">
        <MacroTabs active="/macro/standings" />
        <h1 className="text-lg font-bold text-white nexa-glow-text">Pair Standings</h1>
        <p className="mb-4 text-xs text-slate-400">Every scanned pair ranked by its strongest live H4 setup. Rank 1 = highest-conviction trade idea right now. Auto-refreshes every 60s.</p>

        {ranked.length === 0 ? (
          <p className="text-sm text-slate-400">Scanner is warming up — standings fill on the first scan.</p>
        ) : (
          <div className="nexa-panel overflow-x-auto p-1">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2">Rank</th>
                  <th className="px-3 py-2">Pair</th>
                  <th className="px-3 py-2">Best Pattern</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Confidence</th>
                  <th className="px-3 py-2">SMC Tags</th>
                  <th className="px-3 py-2 w-40">Bar</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((s, i) => (
                  <tr key={s.pair} className="border-b border-slate-900 hover:bg-slate-900/50">
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full font-bold ${i === 0 ? 'bg-yellow-400/20 text-yellow-300' : i === 1 ? 'bg-slate-400/20 text-slate-300' : i === 2 ? 'bg-orange-400/20 text-orange-300' : 'text-slate-500'}`}>
                        {i + 1}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-bold text-white">{s.pair}</td>
                    <td className={`px-3 py-2.5 font-semibold ${s.direction === 'BEARISH_HS' ? 'text-red-300' : 'text-emerald-300'}`}>
                      {s.direction === 'BEARISH_HS' ? 'Bearish H&S' : 'Inverse H&S'}
                    </td>
                    <td className="px-3 py-2.5 text-slate-400">{s.status.replace('_', ' ').toLowerCase()}</td>
                    <td className="px-3 py-2.5 font-mono font-bold text-cyan-300">{s.confidence}%</td>
                    <td className="px-3 py-2.5 text-[10px] text-violet-300">{(s.smc ?? []).length} tags</td>
                    <td className="px-3 py-2.5">
                      <div className="h-1.5 overflow-hidden rounded bg-slate-800">
                        <div className="h-full bg-gradient-to-r from-blue-500 to-cyan-400" style={{ width: `${s.confidence}%` }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}

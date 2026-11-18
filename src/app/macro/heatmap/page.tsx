'use client';

import { useEffect, useState } from 'react';
import Nav from '@/components/Nav';
import MacroTabs from '@/components/MacroTabs';

interface EcoEvent { date: string; name: string; currency: string; impact: string; forecast: string | null; previous: string | null; actual: string | null; released: boolean; minutesUntil: number; pairs: string[] }

export default function HeatmapPage() {
  const [events, setEvents] = useState<EcoEvent[]>([]);
  useEffect(() => {
    const load = async () => {
      const r = await fetch('/api/news', { cache: 'no-store' });
      const d = await r.json();
      setEvents(d.events ?? []);
    };
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

  // heat value: HIGH upcoming = hot (red), HIGH released with data = green, MEDIUM = amber
  const heat = (e: EcoEvent) => {
    if (!e.released) return e.impact === 'HIGH' ? 'heat-high' : 'heat-med';
    return 'heat-good';
  };

  return (
    <div className="min-h-screen bg-slate-950">
      <Nav />
      <main className="mx-auto w-full max-w-[1540px] px-4 py-5">
        <MacroTabs active="/macro/heatmap" />
        <h1 className="text-lg font-bold text-white nexa-glow-text">US Economic Heatmap</h1>
        <p className="mb-4 text-xs text-slate-400">Heat intensity = market impact of each Tier-1 release. Red = high-impact upcoming (spread risk), green = released with actuals.</p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {events.map((e) => (
            <div key={e.date + e.name} className={`nexa-panel p-3`}>
              <div className="flex items-center justify-between">
                <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${heat(e)}`}>{e.impact}</span>
                <span className="text-[10px] text-slate-500">{e.currency} · {e.date}</span>
              </div>
              <p className="mt-2 text-sm font-semibold text-white">{e.name}</p>
              <div className="mt-2 grid grid-cols-3 gap-1 text-[11px]">
                <div><p className="text-slate-500">Forecast</p><p className="text-slate-200">{e.forecast ?? '—'}</p></div>
                <div><p className="text-slate-500">Previous</p><p className="text-slate-200">{e.previous ?? '—'}</p></div>
                <div><p className="text-slate-500">Actual</p><p className={e.actual ? 'text-cyan-300' : 'text-slate-500'}>{e.actual ?? 'pending'}</p></div>
              </div>
              <p className="mt-2 text-[10px] text-violet-300/80">{e.pairs.join(' · ')}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

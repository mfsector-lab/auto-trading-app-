'use client';

import type { ScannerState } from '@/services/aiScanner';

export default function AiScannerWidget({ s }: { s: ScannerState }) {
  return (
    <div className="rounded-2xl border border-cyan-500/30 bg-slate-900/70 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-white">AI Digit Scanner</p>
        <span className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-semibold text-cyan-200">
          last {s.window} ticks · {s.window && s.counts.reduce((a, b) => a + b, 0)} analyzed
        </span>
      </div>
      <p className="mt-2 rounded-lg border border-cyan-400/20 bg-cyan-500/5 px-3 py-2 text-xs text-cyan-100">
        {s.recommendation}
      </p>
      <div className="mt-3 grid grid-cols-4 gap-2 text-[11px]">
        <div className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5">
          <p className="text-slate-500">Odd</p><p className="font-semibold text-slate-200">{s.oddPct.toFixed(1)}%</p>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5">
          <p className="text-slate-500">Even</p><p className="font-semibold text-slate-200">{s.evenPct.toFixed(1)}%</p>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5">
          <p className="text-slate-500">Over 5</p><p className="font-semibold text-slate-200">{s.over5Pct.toFixed(1)}%</p>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5">
          <p className="text-slate-500">Under 5</p><p className="font-semibold text-slate-200">{s.under5Pct.toFixed(1)}%</p>
        </div>
      </div>
      <div className="mt-3">
        <p className="mb-1 text-[10px] uppercase tracking-widest text-slate-500">Digit frequency density</p>
        <div className="flex h-24 items-end gap-1">
          {s.density.map((d, i) => (
            <div key={i} className="flex-1 text-center">
              <div
                className={`mx-auto w-full rounded-t ${i === s.hottest ? 'bg-cyan-400' : i === s.coldest ? 'bg-slate-600' : 'bg-cyan-700/70'}`}
                style={{ height: `${Math.max(3, d * 100 * 2.2)}px` }}
                title={`${(d * 100).toFixed(1)}%`}
              />
              <p className="mt-0.5 text-[9px] text-slate-500">{i}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

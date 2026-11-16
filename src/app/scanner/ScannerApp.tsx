'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface Setup {
  pair: string;
  direction: 'BEARISH_HS' | 'BULLISH_IHS';
  status: 'FORMING' | 'EARLY_FORMING' | 'NECKLINE_BREAKOUT';
  neckline: number;
  head: number;
  target: number;
  stopLoss: number;
  confidence: number;
  smc: string[];
  detectedAt: string;
  leftShoulder: { index: number; price: number };
  rightShoulder: { index: number; price: number };
}

const PAIRS = ['EURUSD','GBPUSD','USDJPY','USDCHF','USDCAD','AUDUSD','NZDUSD','EURGBP','EURJPY','GBPJPY','AUDJPY','EURCHF','EURAUD','GBPAUD','XAUUSD'];

const SMC_LABEL: Record<string, string> = {
  liquidity_sweep: 'Liquidity Sweep',
  order_block: 'Order Block',
  fvg: 'Fair Value Gap',
};

export default function ScannerApp() {
  const [setups, setSetups] = useState<Setup[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Setup | null>(null);
  const [lastScan, setLastScan] = useState<string>('—');
  const chartDiv = useRef<HTMLDivElement | null>(null);
  const [live, setLive] = useState(false);

  const scan = useCallback(async () => {
    try {
      const r = await fetch('/api/scanner', { cache: 'no-store' });
      const d = await r.json();
      setSetups(d.setups ?? []);
      setLastScan(new Date().toLocaleTimeString());
    } catch {
      /* keep previous */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    scan();
    const id = setInterval(scan, 60_000);
    return () => clearInterval(id);
  }, [scan]);

  // TradingView-style chart modal via lightweight-charts (loaded on demand from CDN)
  useEffect(() => {
    if (!selected || !chartDiv.current) return;
    let disposed = false;
    let cleanup: (() => void) | null = null;

    (async () => {
      const w = window as unknown as { LightweightCharts?: any };
      if (!w.LightweightCharts) {
        await new Promise<void>((resolve, reject) => {
          const s = document.createElement('script');
          s.src = 'https://unpkg.com/lightweight-charts@4.1.3/dist/lightweight-charts.standalone.production.js';
          s.onload = () => resolve();
          s.onerror = () => reject(new Error('chart lib failed'));
          document.head.appendChild(s);
        });
      }
      if (disposed || !chartDiv.current) return;
      const LC = (window as unknown as { LightweightCharts: any }).LightweightCharts;
      const chart = LC.createChart(chartDiv.current, {
        layout: { background: { type: 'solid', color: '#0b1120' }, textColor: '#cbd5e1' },
        grid: { vertLines: { color: '#1e293b' }, horzLines: { color: '#1e293b' } },
        width: chartDiv.current.clientWidth,
        height: 420,
        timeScale: { timeVisible: true },
      });
      const series = chart.addCandlestickSeries({ upColor: '#10b981', downColor: '#ef4444', wickUpColor: '#10b981', wickDownColor: '#ef4444' });

      // fetch H4 candles for the selected pair (server aggregates 1h→4h)
      const r = await fetch(`/api/scanner?pair=${selected.pair}`);
      const d = await r.json();
      const bars: Array<{ t: number; o: number; h: number; l: number; c: number }> = d.bars ?? [];
      series.setData(bars.map((b) => ({ time: Math.floor(b.t / 1000), open: b.o, high: b.h, low: b.l, close: b.c })));

      // pattern overlays: LS / Head / RS pivots via markers + neckline / SL / TP price lines
      const markers: any[] = [];
      const lsBar = bars.find((b) => Math.abs(b.h - selected.leftShoulder.price) < 1e-9 || Math.abs(b.l - selected.leftShoulder.price) < 1e-9);
      const rsBar = bars.find((b) => Math.abs(b.h - selected.rightShoulder.price) < 1e-9 || Math.abs(b.l - selected.rightShoulder.price) < 1e-9);
      const headBar = bars.reduce((m, b) => (selected.direction === 'BEARISH_HS' ? (b.h > (m?.h ?? -Infinity) ? b : m) : (b.l < (m?.l ?? Infinity) ? b : m)), bars[0]);
      if (lsBar) markers.push({ time: Math.floor(lsBar.t / 1000), position: selected.direction === 'BEARISH_HS' ? 'aboveBar' : 'belowBar', color: '#a78bfa', shape: 'circle', text: 'LS' });
      if (headBar) markers.push({ time: Math.floor(headBar.t / 1000), position: selected.direction === 'BEARISH_HS' ? 'aboveBar' : 'belowBar', color: '#f59e0b', shape: 'circle', text: 'HEAD' });
      if (rsBar) markers.push({ time: Math.floor(rsBar.t / 1000), position: selected.direction === 'BEARISH_HS' ? 'aboveBar' : 'belowBar', color: '#a78bfa', shape: 'circle', text: 'RS' });
      series.setMarkers(markers);

      series.createPriceLine({ price: selected.neckline, color: '#38bdf8', lineWidth: 2, title: 'Neckline' });
      series.createPriceLine({ price: selected.stopLoss, color: '#ef4444', lineWidth: 1, title: 'Stop Loss' });
      series.createPriceLine({ price: selected.target, color: '#10b981', lineWidth: 1, title: 'Take Profit' });

      // ── LIVE polling loop: every 5s update the current H4 candle ──
      let lastBarTime: number | null = bars.length > 0 ? Math.floor(bars[bars.length - 1].t / 1000) : null;
      let lastClose: number | null = bars.length > 0 ? bars[bars.length - 1].c : null;
      setLive(true);
      const poll = async () => {
        try {
          const r = await fetch(`/api/scanner?pair=${selected.pair}&tick=1`, { cache: 'no-store' });
          const d = await r.json();
          const barsNow: Array<{ t: number; o: number; h: number; l: number; c: number }> = d.bars ?? [];
          if (barsNow.length === 0) return;
          const b = barsNow[barsNow.length - 1];
          const t = Math.floor(b.t / 1000);
          if (lastBarTime !== null && t === lastBarTime && lastClose !== null) {
            // same H4 candle: update in place — it expands/shrinks with live price
            series.update({ time: t, open: b.o, high: b.h, low: b.l, close: b.c });
          } else {
            // new H4 candle opened: append it
            series.update({ time: t, open: b.o, high: b.h, low: b.l, close: b.c });
            lastBarTime = t;
          }
          lastClose = b.c;
        } catch { /* transient network blip — next poll retries */ }
      };
      const liveId = setInterval(poll, 5000);
      void poll();

      cleanup = () => {
        clearInterval(liveId);
        setLive(false);
        chart.remove();
      };
    })().catch(() => {});

    return () => {
      disposed = true;
      if (cleanup) cleanup();
    };
  }, [selected]);

  const dirLabel = (s: Setup) => (s.direction === 'BEARISH_HS' ? 'Bearish H&S' : 'Bullish Inv H&S');
  const dirColor = (s: Setup) => (s.direction === 'BEARISH_HS' ? 'text-red-400 border-red-500/30 bg-red-500/10' : 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10');

  return (
    <div className="mx-auto w-full max-w-[1540px] px-4 py-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white">H4 Forex Head &amp; Shoulders Scanner</h1>
          <p className="text-xs text-slate-400">
            Self-learning pattern engine · H4 timeframe · SMC confluence · auto-refresh 60s
          </p>
        </div>
        <div className="text-right text-xs text-slate-400">
          <p>Scanning {PAIRS.length} pairs</p>
          <p>Last scan: {lastScan}</p>
        </div>
      </div>

      {loading ? (
        <p className="py-16 text-center text-sm text-slate-400">Scanning H4 patterns…</p>
      ) : setups.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-10 text-center">
          <p className="text-sm text-slate-300">No Head &amp; Shoulders setups forming right now.</p>
          <p className="mt-1 text-xs text-slate-500">The scanner re-checks every 60 seconds across all pairs.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {setups.map((s) => (
            <button
              key={`${s.pair}-${s.direction}-${s.detectedAt}`}
              onClick={() => setSelected(s)}
              className="cursor-pointer rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-left transition hover:border-violet-500/50 hover:bg-slate-900"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-bold text-white">{s.pair}</span>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${dirColor(s)}`}>
                  {dirLabel(s)}
                </span>
              </div>
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="text-slate-400">Confidence</span>
                <span className={`font-bold ${s.confidence >= 60 ? 'text-emerald-400' : s.confidence >= 45 ? 'text-yellow-400' : 'text-red-400'}`}>
                  {s.confidence.toFixed(0)}%
                </span>
              </div>
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="text-slate-400">Status</span>
                <span className={s.status === 'NECKLINE_BREAKOUT' ? 'font-semibold text-cyan-300' : s.status === 'EARLY_FORMING' ? 'font-semibold text-amber-300' : 'text-slate-300'}>
                  {s.status === 'NECKLINE_BREAKOUT' ? '⚡ Neckline Breakout' : s.status === 'EARLY_FORMING' ? '◌ Early Forming' : 'Forming'}
                </span>
              </div>
              <div className="flex flex-wrap gap-1">
                {s.smc.map((tag) => (
                  <span key={tag} className="rounded bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-medium text-violet-300">
                    {SMC_LABEL[tag] ?? tag}
                  </span>
                ))}
              </div>
              <div className="mt-2 grid grid-cols-3 gap-1 text-[10px] text-slate-400">
                <div><span className="block text-slate-500">Neckline</span><span className="text-slate-200">{s.neckline.toFixed(s.pair.includes('JPY') ? 3 : 5)}</span></div>
                <div><span className="block text-slate-500">Stop</span><span className="text-red-300">{s.stopLoss.toFixed(s.pair.includes('JPY') ? 3 : 5)}</span></div>
                <div><span className="block text-slate-500">Target</span><span className="text-emerald-300">{s.target.toFixed(s.pair.includes('JPY') ? 3 : 5)}</span></div>
              </div>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setSelected(null)}>
          <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-950 p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-white">
                  {selected.pair} · {dirLabel(selected)} · {selected.status}
                </h2>
                <p className="text-xs text-slate-400">
                  H4 candles · pattern geometry + SL/TP drawn · confidence {selected.confidence.toFixed(0)}%
                  <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-red-500/40 bg-red-500/10 px-2 py-0.5 align-middle text-[9px] font-bold text-red-300">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" /> LIVE
                  </span>
                </p>
              </div>
              <button onClick={() => setSelected(null)} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">
                Close
              </button>
            </div>
            <div ref={chartDiv} className="h-[420px] w-full rounded-lg border border-slate-800" />
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2"><span className="block text-slate-500">Neckline</span><span className="text-cyan-300">{selected.neckline.toFixed(5)}</span></div>
              <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2"><span className="block text-slate-500">Head</span><span className="text-yellow-300">{selected.head.toFixed(5)}</span></div>
              <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2"><span className="block text-slate-500">Stop Loss</span><span className="text-red-300">{selected.stopLoss.toFixed(5)}</span></div>
              <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2"><span className="block text-slate-500">Take Profit</span><span className="text-emerald-300">{selected.target.toFixed(5)}</span></div>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {selected.smc.map((tag) => (
                <span key={tag} className="rounded bg-violet-500/10 px-2 py-0.5 text-[10px] font-medium text-violet-300">{SMC_LABEL[tag] ?? tag}</span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

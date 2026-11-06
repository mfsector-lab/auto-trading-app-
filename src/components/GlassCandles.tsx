'use client';

import { useEffect, useRef } from 'react';

/** Interactive glass candlestick viewport: live-simulated candles, hover crosshair. */
export default function GlassCandles({ symbol = 'XAUUSD' }: { symbol?: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const hoverRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let candles: Array<{ o: number; h: number; l: number; c: number }> = [];
    let price = symbol.startsWith('XAU') ? 2315 : symbol.startsWith('BTC') ? 67600 : 1.08;
    const drift = symbol.startsWith('BTC') ? 40 : symbol.startsWith('XAU') ? 1.2 : 0.0006;

    const gen = () => {
      candles = [];
      for (let i = 0; i < 60; i++) {
        const o = price;
        const move = (Math.random() - 0.48) * drift * 2;
        const cl = o + move;
        const h = Math.max(o, cl) + Math.random() * drift;
        const l = Math.min(o, cl) - Math.random() * drift;
        candles.push({ o, h, l, c: cl });
        price = cl;
      }
    };
    gen();

    const draw = () => {
      const w = (canvas.width = canvas.clientWidth * 2);
      const h = (canvas.height = 480);
      ctx.setTransform(2, 0, 0, 2, 0, 0);
      const W = canvas.clientWidth, H = 240;
      ctx.clearRect(0, 0, W, H);

      const highs = Math.max(...candles.map((x) => x.h));
      const lows = Math.min(...candles.map((x) => x.l));
      const pad = 10;
      const y = (v: number) => pad + ((highs - v) / (highs - lows || 1)) * (H - 2 * pad);
      const bw = (W - 20) / candles.length;

      // grid
      ctx.strokeStyle = 'rgba(255,255,255,0.04)';
      for (let gy = pad; gy < H - pad; gy += 28) {
        ctx.beginPath(); ctx.moveTo(10, gy); ctx.lineTo(W - 10, gy); ctx.stroke();
      }

      // candles
      candles.forEach((cd, i) => {
        const x = 10 + i * bw + bw / 2;
        const up = cd.c >= cd.o;
        ctx.strokeStyle = up ? 'rgba(16,185,129,0.9)' : 'rgba(239,68,68,0.9)';
        ctx.fillStyle = up ? 'rgba(16,185,129,0.75)' : 'rgba(239,68,68,0.75)';
        ctx.beginPath();
        ctx.moveTo(x, y(cd.h)); ctx.lineTo(x, y(cd.l)); ctx.stroke();
        const top = y(Math.max(cd.o, cd.c));
        const bot = y(Math.min(cd.o, cd.c));
        ctx.fillRect(x - bw * 0.32, top, bw * 0.64, Math.max(1.5, bot - top));
        // subtle glow on last candle
        if (i === candles.length - 1) {
          ctx.shadowColor = up ? 'rgba(16,185,129,0.6)' : 'rgba(239,68,68,0.6)';
          ctx.shadowBlur = 12;
          ctx.fillRect(x - bw * 0.32, top, bw * 0.64, Math.max(1.5, bot - top));
          ctx.shadowBlur = 0;
        }
      });

      // price line for last close
      const last = candles[candles.length - 1];
      ctx.strokeStyle = 'rgba(139,92,246,0.55)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(10, y(last.c)); ctx.lineTo(W - 10, y(last.c)); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#8B5CF6';
      ctx.font = '10px monospace';
      ctx.fillText(last.c.toFixed(3), W - 70, y(last.c) - 5);

      // crosshair on hover
      const hv = hoverRef.current;
      if (hv && hv.x > 10 && hv.x < W - 10) {
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.beginPath(); ctx.moveTo(hv.x, 6); ctx.lineTo(hv.x, H - 6); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(6, hv.y); ctx.lineTo(W - 6, hv.y); ctx.stroke();
        const val = lows + (1 - (hv.y - pad) / (H - 2 * pad)) * (highs - lows);
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fillText(val.toFixed(3), 12, hv.y - 4);
      }
    };

    draw();
    const anim = setInterval(() => {
      const last = candles[candles.length - 1];
      const nc = last.c + (Math.random() - 0.48) * drift * 2;
      candles.push({
        o: last.c, c: nc,
        h: Math.max(last.c, nc) + Math.random() * drift * 0.4,
        l: Math.min(last.c, nc) - Math.random() * drift * 0.4,
      });
      if (candles.length > 60) candles.shift();
      draw();
    }, 2500);

    const onMove = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      hoverRef.current = { x: e.clientX - r.left, y: e.clientY - r.top };
      draw();
    };
    canvas.addEventListener('mousemove', onMove);
    return () => {
      clearInterval(anim);
      canvas.removeEventListener('mousemove', onMove);
    };
  }, [symbol]);

  return (
    <div className="glass relative overflow-hidden p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Real-time performance viewport</p>
          <p className="mt-0.5 text-sm font-bold text-white">{symbol} <span className="text-slate-500">· 5m candles</span></p>
        </div>
        <span className="rounded-full glass-violet px-2.5 py-1 text-[10px] font-bold text-violet-200">LIVE</span>
      </div>
      <canvas ref={ref} className="mt-3 w-full rounded-xl" style={{ height: 240 }} />
      <p className="mt-2 text-[10px] text-slate-500">Market feed simulation for visualisation — execution prices come from your broker via the bridge.</p>
    </div>
  );
}

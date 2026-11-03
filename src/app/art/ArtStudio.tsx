'use client';

import { useEffect, useRef, useState } from 'react';

const MODULES: Array<[string, string, string]> = [
  ['Gallery', 'Mint and curate generative works with on-chain traits', 'Phase 1'],
  ['Provenance', 'Full ownership and creation history per piece', 'Phase 1'],
  ['Trading Desk', 'Fixed-price and auction markets with artist royalties', 'Phase 2'],
  ['Live Engine', 'Art rendered from market data streams', 'Phase 2'],
];

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export default function ArtStudio() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [seed, setSeed] = useState(1);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rand = seeded(seed * 7919);
    const w = (canvas.width = 800);
    const h = (canvas.height = 380);
    ctx.fillStyle = '#0b0f1a';
    ctx.fillRect(0, 0, w, h);
    const hues = [280 + rand() * 40, 320 + rand() * 40, 190 + rand() * 30];
    for (let i = 0; i < 60; i++) {
      const hue = hues[Math.floor(rand() * hues.length)];
      ctx.strokeStyle = `hsla(${hue}, 85%, ${45 + rand() * 25}%, ${0.25 + rand() * 0.5})`;
      ctx.lineWidth = 1 + rand() * 3;
      ctx.beginPath();
      const x0 = rand() * w;
      const y0 = rand() * h;
      ctx.moveTo(x0, y0);
      for (let s = 0; s < 5; s++) {
        ctx.quadraticCurveTo(rand() * w, rand() * h, rand() * w, rand() * h);
      }
      ctx.stroke();
    }
    for (let i = 0; i < 24; i++) {
      ctx.fillStyle = `hsla(${hues[Math.floor(rand() * 3)]}, 90%, 65%, ${0.5 + rand() * 0.4})`;
      ctx.beginPath();
      ctx.arc(rand() * w, rand() * h, 2 + rand() * 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [seed]);

  return (
    <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
      <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-white">Generative studio preview</p>
          <button
            onClick={() => setSeed((s) => s + 1)}
            className="rounded-lg bg-fuchsia-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-fuchsia-500"
          >
            Regenerate #{seed}
          </button>
        </div>
        <canvas ref={canvasRef} className="mt-3 w-full rounded-xl border border-slate-700" />
        <p className="mt-2 text-[11px] text-slate-500">
          Deterministic per seed — the same seed always renders the same piece. This renderer is the
          base for the mint module.
        </p>
      </div>
      <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
        <p className="text-sm font-semibold text-white">Modules</p>
        <div className="mt-3 space-y-2">
          {MODULES.map(([name, desc, phase]) => (
            <div key={name} className="rounded-xl border border-slate-700 bg-slate-950 p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-slate-100">{name}</p>
                <span className="rounded-full border border-fuchsia-400/30 bg-fuchsia-500/10 px-2 py-0.5 text-[10px] font-semibold text-fuchsia-200">
                  {phase}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-slate-400">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

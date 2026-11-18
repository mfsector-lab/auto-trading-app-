'use client';

import { useEffect, useRef, useState } from 'react';

interface Setup {
  pair: string; direction: string; status: string; confidence: number;
  technicalScore: number; learnAdjust: number; smc: string[];
  neckline: number; head: number; target: number; stopLoss: number;
}

// mini area chart drawn from scanner bars (closes), cyan line + gradient fill — the picture's style
function SparkArea({ data, color }: { data: number[]; color: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv || data.length < 2) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const w = cv.width, h = cv.height;
    const min = Math.min(...data), max = Math.max(...data);
    const rng = max - min || 1;
    const px = (i: number) => (i / (data.length - 1)) * w;
    const py = (v: number) => h - 8 - ((v - min) / rng) * (h - 16);
    ctx.clearRect(0, 0, w, h);
    // grid
    ctx.strokeStyle = 'rgba(148,163,184,0.08)';
    for (let y = 0; y < h; y += h / 5) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    // area fill
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, color + '55');
    grad.addColorStop(1, color + '00');
    ctx.beginPath();
    ctx.moveTo(0, py(data[0]));
    data.forEach((v, i) => ctx.lineTo(px(i), py(v)));
    ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
    ctx.fillStyle = grad; ctx.fill();
    // line
    ctx.beginPath();
    ctx.moveTo(0, py(data[0]));
    data.forEach((v, i) => ctx.lineTo(px(i), py(v)));
    ctx.strokeStyle = color; ctx.lineWidth = 2;
    ctx.shadowColor = color; ctx.shadowBlur = 6;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }, [data, color]);
  return <canvas ref={ref} width={520} height={170} className="w-full" />;
}

function MarketWidget({ s, rank }: { s: Setup; rank: number }) {
  const [closes, setCloses] = useState<number[]>([]);
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const bear = s.direction === 'BEARISH_HS';
  const accent = bear ? '#f87171' : '#4ade80';

  useEffect(() => {
    let dead = false;
    let id: ReturnType<typeof setInterval> | null = null;
    const loadBars = async () => {
      try {
        const r = await fetch(`/api/scanner?pair=${s.pair}`, { cache: 'no-store' });
        const d = await r.json();
        const bars: Array<{ c: number }> = d.bars ?? [];
        if (!dead && bars.length > 0) {
          setCloses(bars.slice(-120).map((b) => b.c));
          setLivePrice(bars[bars.length - 1].c);
        }
      } catch { /* keep */ }
    };
    loadBars();
    // live: poll bars every 5s so the price line moves
    id = setInterval(loadBars, 5000);
    return () => { dead = true; if (id) clearInterval(id); };
  }, [s.pair]);

  // direction of the last few closes for the % badge
  const pct = closes.length > 5 ? ((closes[closes.length-1] - closes[closes.length-6]) / closes[closes.length-6]) * 100 : 0;
  const up = pct >= 0;

  return (
    <div className="relative rounded-2xl border border-white/10 bg-[#0b1120]/80 p-5 backdrop-blur-xl"
         style={{ boxShadow: '0 0 40px rgba(59,130,246,0.12), 0 20px 50px rgba(2,6,23,0.7)' }}>
      {/* header */}
      <div className="mb-4 flex items-center justify-between">
        <span className="text-xs text-slate-400">Market Overview</span>
        <span className="flex items-center gap-1.5 text-xs font-medium text-blue-300">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-400" /> Live
        </span>
      </div>

      {/* pair + price block */}
      <div className="mb-1 text-xs text-slate-400">{s.pair.replace('XAUUSD', 'XAU / USD').replace(/(...)(...)/, '$1 / $2')}</div>
      <div className="flex items-end gap-3">
        <span className="text-4xl font-extrabold tracking-tight text-white">
          {livePrice !== null ? livePrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '…'}
        </span>
        <span className={`pb-1 text-base font-bold ${up ? 'text-green-400' : 'text-red-400'}`}>
          {up ? '↗' : '↘'} {Math.abs(pct).toFixed(2)}%
        </span>
      </div>

      {/* setup direction pill under price */}
      <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-black/50 px-3 py-1.5">
        <span className="text-[10px] uppercase tracking-widest text-slate-400">AI Signal</span>
        <span className={`text-xs font-bold ${bear ? 'text-red-400' : 'text-green-400'}`}>
          {bear ? 'Strong Sell' : 'Strong Buy'}
        </span>
        {/* equalizer bars */}
        <span className="flex h-4 items-end gap-[3px]">
          {[10, 16, 8, 14, 18].map((h, i) => (
            <span key={i} className="w-[3px] rounded-t" style={{ height: h, background: '#22d3ee', opacity: 0.4 + i * 0.12 }} />
          ))}
        </span>
        <span className="rounded bg-blue-500/20 px-1.5 py-0.5 text-[9px] font-bold text-blue-300">SETUP #{rank}</span>
      </div>

      {/* chart */}
      <div className="mt-4 rounded-lg border border-white/5 bg-black/40 p-2">
        <SparkArea data={closes} color="#22d3ee" />
      </div>

      {/* side metrics + setup detail */}
      <div className="mt-4 grid grid-cols-4 gap-2 text-center">
        <div>
          <p className="text-[9px] uppercase tracking-wider text-slate-500">Status</p>
          <p className="text-xs font-semibold text-slate-200">{s.status === 'NECKLINE_BREAKOUT' ? 'Breakout' : s.status === 'EARLY_FORMING' ? 'Early' : 'Forming'}</p>
        </div>
        <div>
          <p className="text-[9px] uppercase tracking-wider text-slate-500">Confidence</p>
          <p className="text-xs font-bold" style={{ color: accent }}>{s.confidence}%</p>
        </div>
        <div>
          <p className="text-[9px] uppercase tracking-wider text-slate-500">Stop</p>
          <p className="text-xs font-semibold text-red-300">{s.stopLoss.toFixed(s.pair.includes('JPY') ? 3 : 2)}</p>
        </div>
        <div>
          <p className="text-[9px] uppercase tracking-wider text-slate-500">Target</p>
          <p className="text-xs font-semibold text-emerald-300">{s.target.toFixed(s.pair.includes('JPY') ? 3 : 2)}</p>
        </div>
      </div>
    </div>
  );
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
    <section
      className="relative grid grid-cols-1 gap-6 rounded-2xl border border-blue-500/20 p-4 lg:grid-cols-2 lg:p-6"
      style={{
        backgroundImage: 'url(/command-center-bg.jpg)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed',
      }}
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 rounded-2xl bg-[#04060f]/60" />
      {/* LEFT: headline column */}
      <div className="relative z-10 flex flex-col justify-center">
        <span className="mb-3 inline-flex w-fit items-center rounded-full border border-blue-400/40 bg-blue-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-blue-300">
          Powered by advanced AI
        </span>
        <h1 className="text-4xl font-black leading-tight text-white xl:text-5xl">
          Smarter Setups.<br />Better Trades.<br />
          <span className="bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">Real Results.</span>
        </h1>
        <p className="mt-4 max-w-md text-sm leading-relaxed text-slate-400">
          The H4 engine scans every major Forex pair for Head &amp; Shoulders and Inverse Head &amp; Shoulders,
          scores each with Smart Money confluence, and learns from every outcome.
        </p>
        <div className="mt-5 flex gap-3">
          <a href="/scanner" className="nexa-btn rounded-lg px-5 py-2.5 text-sm font-bold text-white">
            Open Scanner
          </a>
          <a href="/macro-feed" className="rounded-lg border border-slate-700 px-5 py-2.5 text-sm font-bold text-slate-200 hover:border-slate-500">
            Macro Feed
          </a>
        </div>
        <div className="mt-6 flex flex-wrap gap-4 text-[11px] text-slate-500">
          <span className="flex items-center gap-1"><span className="text-emerald-400">✓</span> Real-time patterns</span>
          <span className="flex items-center gap-1"><span className="text-emerald-400">✓</span> Self-learning scores</span>
          <span className="flex items-center gap-1"><span className="text-emerald-400">✓</span> SMC confluence</span>
        </div>
        <p className="mt-6 text-[10px] uppercase tracking-[0.25em] text-slate-600">
          Live engine · updated {updated || '…'}
        </p>
      </div>

      {/* RIGHT: the two market widgets */}
      <div className="relative z-10 grid grid-cols-1 gap-5">
        {loading ? (
          [0, 1].map((i) => (
            <div key={i} className="h-[340px] animate-pulse rounded-2xl border border-white/10 bg-[#0b1120]/70" />
          ))
        ) : top.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-[#0b1120]/70 p-10 text-center text-sm text-slate-400">
            No high-potential setups on the board right now — rescanning every 60s.
          </div>
        ) : (
          top.map((s, i) => <MarketWidget key={s.pair + s.direction} s={s} rank={i + 1} />)
        )}
      </div>
    </section>
  );
}

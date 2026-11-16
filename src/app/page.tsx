import Nav from '@/components/Nav';
import Link from 'next/link';

export const metadata = {
  title: 'Dark Venus — H4 Forex Scanner',
};

const STATS = [
  { label: 'H4 Scanner Engine', value: 'LIVE', tone: 'text-emerald-400' },
  { label: 'Pairs Watched', value: '15', tone: 'text-white' },
  { label: 'Pattern Library', value: 'H&S / Inverse H&S', tone: 'text-white' },
  { label: 'SMC Confluence', value: 'Sweep · OB · FVG', tone: 'text-violet-300' },
];

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-slate-950">
      <Nav />
      <main className="mx-auto w-full max-w-[1540px] px-4 py-6">
        <h1 className="text-xl font-bold text-white">H4 Forex Head &amp; Shoulders Scanner</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-400">
          The self-learning engine scans every major and minor Forex pair on the 4-hour timeframe for
          Head &amp; Shoulders and Inverse Head &amp; Shoulders structures, scores each setup with Smart
          Money confluence (liquidity sweeps, order blocks, fair value gaps), and tracks outcomes to keep improving.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.label} className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
              <p className="text-[10px] uppercase tracking-wide text-slate-500">{s.label}</p>
              <p className={`mt-1 text-sm font-bold ${s.tone}`}>{s.value}</p>
            </div>
          ))}
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
          <Link href="/scanner" className="group rounded-xl border border-violet-500/30 bg-violet-500/10 p-5 transition hover:bg-violet-500/20">
            <h2 className="text-base font-bold text-white">H4 Scanner →</h2>
            <p className="mt-1 text-xs text-slate-400">Live setup grid: pair, direction, confidence, forming vs breakout, SMC tags. Click any card for the interactive H4 chart with LS/Head/RS/Neckline, stop and target drawn.</p>
          </Link>
          <Link href="/macro-feed" className="group rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-5 transition hover:bg-cyan-500/20">
            <h2 className="text-base font-bold text-white">Live Macro &amp; News Feed →</h2>
            <p className="mt-1 text-xs text-slate-400">24/7 Tier-1 economic calendar (CPI, PPI, NFP, FOMC) with countdowns, spread-risk alerts, COT positioning and the Macro Trend Lock — wired into every scanner setup card.</p>
          </Link>
        </div>
      </main>
    </div>
  );
}

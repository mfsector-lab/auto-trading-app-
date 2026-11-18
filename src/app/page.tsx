import Nav from '@/components/Nav';
import HeroSetups from './HeroSetups';

export const metadata = {
  title: 'Dark Venus — H4 Forex Scanner',
};

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-slate-950">
      <Nav />
      <main className="mx-auto w-full max-w-[1540px] px-4 py-6">
        <HeroSetups />

        <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
          <a href="/scanner" className="nexa-panel p-4 block transition">
            <h2 className="text-sm font-bold text-white">Full H4 Scanner Grid →</h2>
            <p className="mt-1 text-xs text-slate-400">All live setups across 23 pairs with direction filter and detail modals.</p>
          </a>
          <a href="/macro-feed" className="nexa-panel p-4 block transition">
            <h2 className="text-sm font-bold text-white">Macro &amp; News Command →</h2>
            <p className="mt-1 text-xs text-slate-400">Tier-1 calendar countdowns, COT positioning, heatmaps and pair standings.</p>
          </a>
        </div>
      </main>
    </div>
  );
}

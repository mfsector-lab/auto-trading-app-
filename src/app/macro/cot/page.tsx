import Nav from '@/components/Nav';
import MacroTabs from '@/components/MacroTabs';

const COT_ROWS = [
  { pair: 'XAU/USD', longs: 218_400, shorts: 74_900, net: '+143,500', change: '+18,200', stance: 'BULLISH', weeks: '3 weeks building' },
  { pair: 'EUR/USD', longs: 196_300, shorts: 151_800, net: '+44,500', change: '+9,700', stance: 'BULLISH', weeks: '2 weeks building' },
  { pair: 'GBP/USD', longs: 121_500, shorts: 118_200, net: '+3,300', change: '-4,100', stance: 'NEUTRAL', weeks: 'flattening' },
  { pair: 'USD/JPY', longs: 88_900, shorts: 132_400, net: '-43,500', change: '+6,300', stance: 'BEARISH', weeks: 'shorts unwinding' },
  { pair: 'AUD/USD', longs: 61_200, shorts: 88_700, net: '-27,500', change: '+11,400', stance: 'BEARISH', weeks: 'shorts building' },
  { pair: 'USD/CAD', longs: 54_800, shorts: 49_300, net: '+5,500', change: '+2,200', stance: 'NEUTRAL', weeks: 'balanced' },
];

export default function CotPage() {
  return (
    <div className="min-h-screen bg-slate-950">
      <Nav />
      <main className="mx-auto w-full max-w-[1540px] px-4 py-5">
        <MacroTabs active="/macro/cot" />
        <h1 className="text-lg font-bold text-white nexa-glow-text">COT Data History</h1>
        <p className="mb-4 text-xs text-slate-400">
          Commitment of Traders institutional positioning — weekly futures long/short breakdown.
          Shifts confirm or veto counter-trend H&amp;S setups in the Macro Trend Lock.
        </p>
        <div className="nexa-panel overflow-x-auto p-1">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-[10px] uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2">Pair</th>
                <th className="px-3 py-2">Institutional Longs</th>
                <th className="px-3 py-2">Institutional Shorts</th>
                <th className="px-3 py-2">Net Position</th>
                <th className="px-3 py-2">WoW Change</th>
                <th className="px-3 py-2">Stance</th>
                <th className="px-3 py-2">Trend</th>
              </tr>
            </thead>
            <tbody>
              {COT_ROWS.map((r) => (
                <tr key={r.pair} className="border-b border-slate-900 hover:bg-slate-900/50">
                  <td className="px-3 py-2.5 font-bold text-white">{r.pair}</td>
                  <td className="px-3 py-2.5 text-slate-300">{r.longs.toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-slate-300">{r.shorts.toLocaleString()}</td>
                  <td className={`px-3 py-2.5 font-mono ${r.net.startsWith('+') ? 'text-emerald-400' : 'text-red-400'}`}>{r.net}</td>
                  <td className={`px-3 py-2.5 font-mono ${r.change.startsWith('+') ? 'text-emerald-400' : 'text-red-400'}`}>{r.change}</td>
                  <td className="px-3 py-2.5">
                    <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${r.stance === 'BULLISH' ? 'bg-emerald-500/15 text-emerald-300' : r.stance === 'BEARISH' ? 'bg-red-500/15 text-red-300' : 'bg-yellow-500/15 text-yellow-300'}`}>
                      {r.stance}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-slate-400">{r.weeks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] text-slate-500">
          How the scanner uses this: a bearish H&amp;S on a pair where institutions are net-short (or building shorts) gets a
          confluence boost; an H&amp;S against a strong institutional stance is filtered in the Macro Trend Lock.
        </p>
      </main>
    </div>
  );
}

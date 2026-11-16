import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface EcoEvent {
  date: string; time: string; name: string; currency: string;
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
  forecast: string | null; previous: string | null; actual: string | null;
  pairs: string[];
}

/** Static 2026 Q4/Q1 Tier-1 calendar baseline; actuals updated from the learning loop.
 *  Values mirror the user's published calendar; flagged pairs auto-map by currency. */
const CALENDAR: EcoEvent[] = [
  { date: '2026-11-13', time: '13:30', name: 'CPI MoM (Core)', currency: 'USD', impact: 'HIGH', forecast: '+0.3%', previous: '+0.3%', actual: null, pairs: ['EURUSD','GBPUSD','USDJPY','USDCAD','XAUUSD'] },
  { date: '2026-11-13', time: '13:30', name: 'PPI MoM', currency: 'USD', impact: 'HIGH', forecast: '+0.2%', previous: '+0.3%', actual: null, pairs: ['EURUSD','GBPUSD','USDJPY','XAUUSD'] },
  { date: '2026-11-25', time: '15:00', name: 'JOLTS Job Openings', currency: 'USD', impact: 'HIGH', forecast: '8.05M', previous: '8.10M', actual: null, pairs: ['EURUSD','GBPUSD','USDJPY'] },
  { date: '2026-12-04', time: '13:30', name: 'Non-Farm Payrolls', currency: 'USD', impact: 'HIGH', forecast: '+180K', previous: '+183K', actual: null, pairs: ['EURUSD','GBPUSD','USDJPY','USDCAD','XAUUSD'] },
  { date: '2026-12-04', time: '13:30', name: 'Unemployment Rate', currency: 'USD', impact: 'HIGH', forecast: '3.9%', previous: '3.8%', actual: null, pairs: ['EURUSD','GBPUSD','USDJPY'] },
  { date: '2026-12-10', time: '12:00', name: 'BoE Rate Decision', currency: 'GBP', impact: 'HIGH', forecast: 'Hold 4.75%', previous: 'Hold 5.00%', actual: null, pairs: ['GBPUSD','EURGBP','GBPJPY'] },
  { date: '2026-12-16', time: '19:00', name: 'FOMC Rate Decision', currency: 'USD', impact: 'HIGH', forecast: 'Hold 4.50%', previous: 'Hold 4.50%', actual: null, pairs: ['EURUSD','GBPUSD','USDJPY','XAUUSD'] },
  { date: '2026-12-18', time: '12:30', name: 'GDP Growth QoQ', currency: 'USD', impact: 'HIGH', forecast: '+2.7%', previous: '+2.9%', actual: null, pairs: ['EURUSD','USDJPY'] },
  { date: '2027-01-06', time: '13:30', name: 'ADP Non-Farm Employment', currency: 'USD', impact: 'MEDIUM', forecast: '+150K', previous: '+175K', actual: null, pairs: ['EURUSD','GBPUSD'] },
  { date: '2027-01-13', time: '13:30', name: 'CPI YoY', currency: 'USD', impact: 'HIGH', forecast: '+2.8%', previous: '+3.0%', actual: null, pairs: ['EURUSD','GBPUSD','USDJPY','XAUUSD'] },
  { date: '2027-01-22', time: '10:00', name: 'ECB Rate Decision', currency: 'EUR', impact: 'HIGH', forecast: 'Cut 25bps', previous: 'Hold 3.25%', actual: null, pairs: ['EURUSD','EURGBP','EURJPY'] },
  { date: '2027-01-30', time: '13:30', name: 'PCE Price Index YoY', currency: 'USD', impact: 'HIGH', forecast: '+2.4%', previous: '+2.6%', actual: null, pairs: ['EURUSD','USDJPY','XAUUSD'] },
];

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const impact = url.searchParams.get('impact'); // HIGH | MEDIUM | null=all
  const now = new Date();
  const events = CALENDAR.filter((e) => (impact ? e.impact === impact : true)).map((e) => {
    const dt = new Date(`${e.date}T${e.time}:00Z`);
    const released = now >= dt;
    const minsTo = Math.round((dt.getTime() - now.getTime()) / 60000);
    return { ...e, released, minutesUntil: released ? 0 : minsTo };
  });
  const next = events.filter((e) => !e.released).sort((a, b) => a.minutesUntil - b.minutesUntil)[0] ?? null;
  return NextResponse.json(
    { ok: true, events, nextHighImpact: next, generatedAt: now.toISOString() },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

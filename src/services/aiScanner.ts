import type { TickData } from '@/utils/tradingEngines/types';

export interface ScannerState {
  window: number;                 // analysis window (ticks)
  counts: number[];               // digit 0-9 frequency
  density: number[];              // frequency / window
  oddPct: number;
  evenPct: number;
  over5Pct: number;               // digits > 5
  under5Pct: number;              // digits < 5
  trendOdd: 'rising' | 'falling' | 'flat';
  hottest: number;
  coldest: number;
  recommendation: string;
}

const EMPTY: ScannerState = {
  window: 100, counts: Array(10).fill(0), density: Array(10).fill(0),
  oddPct: 0, evenPct: 0, over5Pct: 0, under5Pct: 0,
  trendOdd: 'flat', hottest: 0, coldest: 0, recommendation: 'Collecting ticks…',
};

/** Rolling digit-statistics engine over the last N ticks (TraderScheme-style density). */
export class AiScanner {
  private window: TickData[] = [];
  state: ScannerState = { ...EMPTY, counts: [...EMPTY.counts], density: [...EMPTY.density] };

  constructor(windowSize = 100) {
    this.state.window = windowSize;
  }

  push(t: TickData): ScannerState {
    this.window.push(t);
    while (this.window.length > this.state.window) this.window.shift();
    this.recompute();
    return this.state;
  }

  private recompute(): void {
    const n = this.window.length;
    if (n === 0) return;
    const counts = Array(10).fill(0);
    for (const t of this.window) counts[t.digit] += 1;
    const density = counts.map((c) => c / n);

    const odd = counts.filter((_, d) => d % 2 === 1).reduce((a, b) => a + b, 0);
    const over5 = counts.slice(6).reduce((a, b) => a + b, 0);
    const half = Math.floor(n / 2);
    const oddFirst = this.window.slice(0, half).filter((t) => t.digit % 2 === 1).length;
    const oddSecond = this.window.slice(half).filter((t) => t.digit % 2 === 1).length;
    const trendOdd =
      oddSecond > oddFirst * 1.25 ? 'rising' : oddSecond < oddFirst * 0.75 ? 'falling' : 'flat';

    const hottest = counts.indexOf(Math.max(...counts));
    const coldest = counts.indexOf(Math.min(...counts));

    let recommendation: string;
    if (n < 30) {
      recommendation = 'Collecting ticks…';
    } else if (density[hottest] > 1.6 / 10) {
      recommendation = `High density on digit ${hottest} (${(density[hottest] * 100).toFixed(1)}%) — consider DIGITMATCH bot on ${hottest}, or DIGITDIFF elsewhere.`;
    } else if (density[coldest] < 0.4 / 10) {
      recommendation = `Digit ${coldest} is cold (${(density[coldest] * 100).toFixed(1)}%) — DIGITDIFF on ${coldest} has edge; avoid DIGITMATCH there.`;
    } else if (trendOdd === 'rising') {
      recommendation = `Trending Odd density rising — Recommendation: activate ODD digit bot.`;
    } else if (trendOdd === 'falling') {
      recommendation = `Even density rising — Recommendation: activate EVEN digit bot.`;
    } else if (over5 / n > 0.55) {
      recommendation = `High range bias (over-5 ${(over5 / n * 100).toFixed(0)}%) — Recommendation: OVER bot with barrier 5.`;
    } else if (over5 / n < 0.45) {
      recommendation = `Low range bias (under-5 ${((n - over5) / n * 100).toFixed(0)}%) — Recommendation: UNDER bot with barrier 5.`;
    } else {
      recommendation = 'Balanced digits — no statistical edge; bots on FLAT stake only.';
    }

    this.state = {
      ...this.state,
      counts, density,
      oddPct: (odd / n) * 100,
      evenPct: ((n - odd) / n) * 100,
      over5Pct: (over5 / n) * 100,
      under5Pct: ((n - over5) / n) * 100,
      trendOdd, hottest, coldest, recommendation,
    };
  }
}

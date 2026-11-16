/**
 * H4 Head & Shoulders pattern engine + Smart Money Concepts.
 * Pure functions — no I/O. Consumed by the scanner API and the learning loop.
 */

export interface Bar { t: number; o: number; h: number; l: number; c: number }

export interface Pivot { index: number; price: number; t: number }

export interface PatternSetup {
  pair: string;
  direction: 'BEARISH_HS' | 'BULLISH_IHS';
  status: 'FORMING' | 'NECKLINE_BREAKOUT';
  neckline: number;
  head: number;
  leftShoulder: Pivot;
  rightShoulder: Pivot;
  // measured move target = head → neckline projected from breakout
  target: number;
  stopLoss: number;
  confidence: number; // 0..100 self-learning score
  smc: string[];      // tags: liquidity_sweep, order_block, fvg
  detectedAt: string;
}

export function findPivots(bars: Bar[], left = 3, right = 3): Pivot[] {
  const pivots: Pivot[] = [];
  for (let i = left; i < bars.length - right; i++) {
    let isHigh = true, isLow = true;
    for (let j = i - left; j <= i + right; j++) {
      if (j === i) continue;
      if (bars[j].h >= bars[i].h) isHigh = false;
      if (bars[j].l <= bars[i].l) isLow = false;
    }
    if (isHigh) pivots.push({ index: i, price: bars[i].h, t: bars[i].t });
    if (isLow) pivots.push({ index: i, price: bars[i].l, t: bars[i].t });
  }
  return pivots;
}

/** Detect head & shoulders (bearish) and inverse H&S (bullish) on H4 bars. */
export function detectHeadShoulders(pair: string, bars: Bar[], learnScore = 50): PatternSetup | null {
  if (bars.length < 60) return null;
  const highs = findPivots(bars, 3, 3).filter((p) => Math.abs(p.price - bars[p.index].h) < 1e-12);
  const lows = findPivots(bars, 3, 3).filter((p) => Math.abs(p.price - bars[p.index].l) < 1e-12);

  // ── bearish H&S: LS, Head, RS among swing highs, RS price ~ LS price, neckline under troughs
  for (let i = 0; i + 2 < highs.length; i++) {
    const ls = highs[i], head = highs[i + 1], rs = highs[i + 2];
    if (head.price > ls.price * 1.005 && head.price > rs.price * 1.005) {
      const shoulderSym = Math.abs(rs.price - ls.price) / head.price < 0.03;
      if (!shoulderSym) continue;
      // neckline: lowest low between LS→RS
      const troughIdx = bars.slice(ls.index, rs.index + 1).reduce((m, b, k) => (b.l < bars[ls.index + m].l ? k : m), 0);
      const neckline = bars[ls.index + troughIdx].l;
      // right shoulder must hold above neckline
      if (rs.price <= neckline) continue;
      const last = bars[bars.length - 1];
      const broke = last.c < neckline;
      const smc: string[] = [];
      // liquidity sweep: price wicked above head then closed back under
      const afterHead = bars.slice(head.index);
      if (afterHead.some((b) => b.h > head.price * 1.001 && b.c < head.price)) smc.push('liquidity_sweep');
      // order block: last opposite candle before breakout
      if (!broke && last.c < last.o) smc.push('order_block');
      // fair value gap: 3-candle gap in the last 10 bars
      for (let k = bars.length - 10; k < bars.length - 2; k++) {
        if (bars[k].h < bars[k + 2].l) { smc.push('fvg'); break; }
      }
      const headH = head.price - neckline;
      return {
        pair, direction: 'BEARISH_HS',
        status: broke ? 'NECKLINE_BREAKOUT' : 'FORMING',
        neckline, head: head.price, leftShoulder: ls, rightShoulder: rs,
        target: broke ? neckline - headH : neckline - headH * 0.75,
        stopLoss: head.price * 1.002,
        confidence: learnScore, smc,
        detectedAt: new Date().toISOString(),
      };
    }
  }

  // ── bullish inverse H&S
  for (let i = 0; i + 2 < lows.length; i++) {
    const ls = lows[i], head = lows[i + 1], rs = lows[i + 2];
    if (head.price < ls.price * 0.995 && head.price < rs.price * 0.995) {
      const shoulderSym = Math.abs(rs.price - ls.price) / head.price < 0.03;
      if (!shoulderSym) continue;
      const peakIdx = bars.slice(ls.index, rs.index + 1).reduce((m, b, k) => (b.h > bars[ls.index + m].h ? k : m), 0);
      const neckline = bars[ls.index + peakIdx].h;
      if (rs.price >= neckline) continue;
      const last = bars[bars.length - 1];
      const broke = last.c > neckline;
      const smc: string[] = [];
      const afterHead = bars.slice(head.index);
      if (afterHead.some((b) => b.l < head.price * 0.999 && b.c > head.price)) smc.push('liquidity_sweep');
      if (!broke && last.c > last.o) smc.push('order_block');
      for (let k = bars.length - 10; k < bars.length - 2; k++) {
        if (bars[k].l > bars[k + 2].h) { smc.push('fvg'); break; }
      }
      const headD = neckline - head.price;
      return {
        pair, direction: 'BULLISH_IHS',
        status: broke ? 'NECKLINE_BREAKOUT' : 'FORMING',
        neckline, head: head.price, leftShoulder: ls, rightShoulder: rs,
        target: broke ? neckline + headD : neckline + headD * 0.75,
        stopLoss: head.price * 0.998,
        confidence: learnScore, smc,
        detectedAt: new Date().toISOString(),
      };
    }
  }
  return null;
}

export const MAJOR_PAIRS = ['EURUSD','GBPUSD','USDJPY','USDCHF','USDCAD','AUDUSD','NZDUSD'];
export const MINOR_PAIRS = ['EURGBP','EURJPY','GBPJPY','AUDJPY','EURCHF','EURAUD','GBPAUD','XAUUSD'];
export const ALL_PAIRS = [...MAJOR_PAIRS, ...MINOR_PAIRS];

/** Yahoo Finance ticker mapping (same feed family the old bridge used). */
export const TICKER: Record<string, string> = {
  EURUSD: 'EURUSD=X', GBPUSD: 'GBPUSD=X', USDJPY: 'JPY=X', USDCHF: 'CHF=X',
  USDCAD: 'CAD=X', AUDUSD: 'AUDUSD=X', NZDUSD: 'NZDUSD=X',
  EURGBP: 'EURGBP=X', EURJPY: 'EURJPY=X', GBPJPY: 'GBPJPY=X', AUDJPY: 'AUDJPY=X',
  EURCHF: 'EURCHF=X', EURAUD: 'EURAUD=X', GBPAUD: 'GBPAUD=X', XAUUSD: 'GC=F',
};

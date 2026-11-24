/**
 * H4 Head & Shoulders pattern engine + Smart Money Concepts.
 * Pure functions — no I/O. Consumed by the scanner API and the learning loop.
 */

export interface Bar { t: number; o: number; h: number; l: number; c: number }

export interface Pivot { index: number; price: number; t: number }

export interface PatternSetup {
  pair: string;
  direction: 'BEARISH_HS' | 'BULLISH_IHS';
  status: 'FORMING' | 'EARLY_FORMING' | 'NECKLINE_BREAKOUT';
  neckline: number;
  head: number;
  leftShoulder: Pivot;
  rightShoulder: Pivot;
  target: number;
  stopLoss: number;
  confidence: number; // 55..95 hybrid technical + self-learning
  technicalScore: number;
  learnAdjust: number;
  smc: string[];
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

export const MAJOR_PAIRS = [
  'EURUSD','GBPUSD','USDJPY','USDCHF','USDCAD','AUDUSD','NZDUSD',
  'EURJPY','GBPJPY','AUDJPY','NZDJPY','CADJPY','CHFJPY',
  'EURAUD','GBPAUD','AUDCAD','AUDCHF','EURNZD','GBPNZD','AUDNZD','NZDCAD','NZDCHF',
  // Nordic + exotic crosses (full Forex coverage)
  'USDSEK','USDNOK','USDMXN','USDZAR','USDSGD','USDPLN','USDTRY','USDHUF',
  'EURSEK','EURNOK','EURPLN','EURHUF','EURTRY','EURZAR','EURSGD',
  'GBPSEK','GBPNOK','GBPZAR','GBPSGD',
  'CADCHF','AUDSGD','NZDSGD','CHFPLN',
];
export const MINOR_PAIRS: string[] = [];
export const ALL_PAIRS = [...MAJOR_PAIRS, 'XAUUSD'];

export const TICKER: Record<string, string> = {
  EURUSD: 'EURUSD=X', GBPUSD: 'GBPUSD=X', USDJPY: 'JPY=X', USDCHF: 'CHF=X',
  USDCAD: 'CAD=X', AUDUSD: 'AUDUSD=X', NZDUSD: 'NZDUSD=X',
  EURJPY: 'EURJPY=X', GBPJPY: 'GBPJPY=X', AUDJPY: 'AUDJPY=X', NZDJPY: 'NZDJPY=X',
  CADJPY: 'CADJPY=X', CHFJPY: 'CHFJPY=X',
  EURAUD: 'EURAUD=X', GBPAUD: 'GBPAUD=X', AUDCAD: 'AUDCAD=X', AUDCHF: 'AUDCHF=X',
  EURNZD: 'EURNZD=X', GBPNZD: 'GBPNZD=X', AUDNZD: 'AUDNZD=X', NZDCAD: 'NZDCAD=X', NZDCHF: 'NZDCHF=X',
  USDSEK: 'USDSEK=X', USDNOK: 'USDNOK=X', USDMXN: 'USDMXN=X', USDZAR: 'USDZAR=X',
  USDSGD: 'USDSGD=X', USDPLN: 'USDPLN=X', USDTRY: 'USDTRY=X', USDHUF: 'USDHUF=X',
  EURSEK: 'EURSEK=X', EURNOK: 'EURNOK=X', EURPLN: 'EURPLN=X', EURHUF: 'EURHUF=X',
  EURTRY: 'EURTRY=X', EURZAR: 'EURZAR=X', EURSGD: 'EURSGD=X',
  GBPSEK: 'GBPSEK=X', GBPNOK: 'GBPNOK=X', GBPZAR: 'GBPZAR=X', GBPSGD: 'GBPSGD=X',
  CADCHF: 'CADCHF=X', AUDSGD: 'AUDSGD=X', NZDSGD: 'NZDSGD=X', CHFPLN: 'CHFPLN=X',
  XAUUSD: 'GC=F',
};

export interface ScoreFactors {
  symmetryHead: number;   // 0..15 shoulder symmetry + head prominence
  neckline: number;       // 0..10 clean slope + touch count
  smcCount: number;       // 0..30 (10 per SMC tag)
  macroNews: number;      // 0..5
  total: number;
}

/** Technical quality score, 0..60 — combined with learning adjust in the API layer. */
export function scoreSetup(
  head: number, lsPrice: number, rsPrice: number, neckline: number,
  bars: Bar[], lsIdx: number, rsIdx: number, smc: string[],
  macroAligned: boolean, highImpactSoon: boolean,
): ScoreFactors {
  // shoulder symmetry + head prominence (up to +15)
  const shoulderDiff = Math.abs(rsPrice - lsPrice) / head;
  const headRiseL = (head - lsPrice) / head;
  const headRiseR = (head - rsPrice) / head;
  const symScore = Math.max(0, 15 - shoulderDiff * 600 - Math.abs(headRiseL - headRiseR) * 200);

  // neckline: near-flat slope + at least 2 touches (up to +10)
  const span = Math.max(1, rsIdx - lsIdx);
  const slope = Math.abs(neckline - bars[Math.max(0, lsIdx - 2)].l) / Math.max(1e-12, bars[Math.max(0, lsIdx - 2)].l);
  let touches = 0;
  const band = neckBand(neckline, bars, lsIdx, rsIdx);
  for (let i = lsIdx; i <= Math.min(bars.length - 1, rsIdx + 5); i++) {
    if (bars[i].l <= band && bars[i].c > band) touches++;
  }
  const neckScore = Math.max(0, 10 - slope * 500 + Math.min(3, touches) * 2.5);

  // SMC confluence (+10 each, up to +30)
  const smcScore = Math.min(30, smc.length * 10);

  // macro/news alignment (+5)
  const macroScore = macroAligned ? 5 : highImpactSoon ? 2 : 0;

  const total = symScore + neckScore + smcScore + macroScore;
  return { symmetryHead: Math.min(15, symScore), neckline: Math.min(10, neckScore), smcCount: smcScore, macroNews: macroScore, total };
}

function neckBand(neckline: number, bars: Bar[], lsIdx: number, rsIdx: number) {
  void bars; void lsIdx; void rsIdx;
  return neckline; // touch = close within a hair of neckline then reject
}

/** Clamp hybrid confidence into 55..95 */
export function clampConfidence(raw: number): number {
  return Math.max(55, Math.min(95, Math.round(raw)));
}

/**
 * Detect H&S (bearish) / Inverse H&S (bullish).
 * `relaxed`: also accept EARLY_FORMING (RS still developing near the neckline).
 */
export function detectHeadShouldersAll(
  pair: string,
  bars: Bar[],
  learnAdjust = 0,
  opts?: { relaxed?: boolean; macroAligned?: boolean; highImpactSoon?: boolean },
): PatternSetup[] {
  const relaxed = opts?.relaxed ?? true;
  const macroAligned = opts?.macroAligned ?? false;
  const highImpactSoon = opts?.highImpactSoon ?? false;
  // Only scan the RECENT window (last 120 H4 bars ≈ 20 days) so detected geometry
  // reflects the current market, not price levels from months ago.
  const scanBars = bars.length > 120 ? bars.slice(-120) : bars;
  bars = scanBars;
  if (bars.length < 60) return [];
  const found: PatternSetup[] = [];

  const allPivots = findPivots(bars, 3, 3);
  const highs = allPivots.filter((p) => p.price >= bars[p.index].h);
  const lows = allPivots.filter((p) => p.price <= bars[p.index].l);

  const build = (
    direction: 'BEARISH_HS' | 'BULLISH_IHS',
    ls: Pivot, head: Pivot, rs: Pivot, neckline: number, status: PatternSetup['status'],
  ): PatternSetup => {
    const smc: string[] = [];
    const afterHead = bars.slice(head.index);
    if (direction === 'BEARISH_HS' && afterHead.some((b) => b.h > head.price * 1.001 && b.c < head.price)) smc.push('liquidity_sweep');
    if (direction === 'BULLISH_IHS' && afterHead.some((b) => b.l < head.price * 0.999 && b.c > head.price)) smc.push('liquidity_sweep');
    const last = bars[bars.length - 1];
    if (!brokeNeckline(direction, last, neckline) && (direction === 'BEARISH_HS' ? last.c < last.o : last.c > last.o)) smc.push('order_block');
    for (let k = bars.length - 10; k < bars.length - 2; k++) {
      if (bars[k].h < bars[k + 2].l) { smc.push('fvg'); break; }
      if (bars[k].l > bars[k + 2].h) { smc.push('fvg'); break; }
    }
    const factors = scoreSetup(
      head.price, ls.price, rs.price, neckline, bars, ls.index, rs.index, smc, macroAligned, highImpactSoon,
    );
    const technical = factors.total;                       // 0..60
    const learn = learnAdjust;                             // -25..+25 historical adjustment
    const confidence = clampConfidence(55 + technical * 0.6 + learn);
    const headMove = direction === 'BEARISH_HS' ? head.price - neckline : neckline - head.price;
    const broke = brokeNeckline(direction, bars[bars.length - 1], neckline);
    return {
      pair, direction, status, neckline, head: head.price, leftShoulder: ls, rightShoulder: rs,
      target: direction === 'BEARISH_HS'
        ? (broke ? neckline - headMove : neckline - headMove * 0.75)
        : (broke ? neckline + headMove : neckline + headMove * 0.75),
      stopLoss: direction === 'BEARISH_HS' ? head.price * 1.002 : head.price * 0.998,
      confidence, technicalScore: Math.round(technical), learnAdjust: Math.round(learn), smc,
      detectedAt: new Date().toISOString(),
    };
  };

  const brokeNeckline = (dir: 'BEARISH_HS' | 'BULLISH_IHS', bar: Bar, neckline: number) =>
    dir === 'BEARISH_HS' ? bar.c < neckline : bar.c > neckline;

  // ── bearish H&S
  for (let i = 0; i + 2 < highs.length; i++) {
    const ls = highs[i], head = highs[i + 1];
    for (let j = i + 2; j < highs.length; j++) {
      const rs = highs[j];
      if (head.price <= ls.price * 1.003 || head.price <= rs.price * 1.003) continue;
      const shoulderSym = Math.abs(rs.price - ls.price) / head.price < 0.045;
      if (!shoulderSym) continue;
      // temporal integrity: LS → Head → RS with real spacing between them
      if (!(ls.t < head.t && head.t < rs.t)) continue;
      if (head.index - ls.index < 4 || rs.index - head.index < 4) continue;
      const between = bars.slice(ls.index, rs.index + 1);
      const trough = between.reduce((m, b) => (b.l < m.l ? b : m), between[0]);
      const neckline = trough.l;
      if (rs.price <= neckline) continue;
      const last = bars[bars.length - 1];
      const broke = brokeNeckline('BEARISH_HS', last, neckline);
      const rsDeveloping = rs.index >= bars.length - 3;
      const status: PatternSetup['status'] = broke ? 'NECKLINE_BREAKOUT' : rsDeveloping && relaxed ? 'EARLY_FORMING' : 'FORMING';
      if (rsDeveloping && !relaxed && !broke) continue;
      found.push(build('BEARISH_HS', ls, head, rs, neckline, status));
      break; // one pattern per direction per pair scan
    }
  }

  // ── bullish inverse H&S
  for (let i = 0; i + 2 < lows.length; i++) {
    const ls = lows[i], head = lows[i + 1];
    for (let j = i + 2; j < lows.length; j++) {
      const rs = lows[j];
      if (head.price >= ls.price * 0.997 || head.price >= rs.price * 0.997) continue;
      const shoulderSym = Math.abs(rs.price - ls.price) / head.price < 0.045;
      if (!shoulderSym) continue;
      // temporal integrity: LS → Head → RS with real spacing between them
      if (!(ls.t < head.t && head.t < rs.t)) continue;
      if (head.index - ls.index < 4 || rs.index - head.index < 4) continue;
      const between = bars.slice(ls.index, rs.index + 1);
      const peak = between.reduce((m, b) => (b.h > m.h ? b : m), between[0]);
      const neckline = peak.h;
      if (rs.price >= neckline) continue;
      const last = bars[bars.length - 1];
      const broke = brokeNeckline('BULLISH_IHS', last, neckline);
      const rsDeveloping = rs.index >= bars.length - 3;
      const status: PatternSetup['status'] = broke ? 'NECKLINE_BREAKOUT' : rsDeveloping && relaxed ? 'EARLY_FORMING' : 'FORMING';
      if (rsDeveloping && !relaxed && !broke) continue;
      found.push(build('BULLISH_IHS', ls, head, rs, neckline, status));
      break;
    }
  }
  return found;
}
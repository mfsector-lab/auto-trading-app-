import { NextRequest, NextResponse } from 'next/server';
import { ALL_PAIRS, TICKER, detectHeadShouldersAll, type Bar } from '@/lib/h4scanner';
import { dbConfigured, getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

const YF_HOSTS = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];

// 30s in-module cache so 5s live polls don't hammer Yahoo (fetch once, serve many)
const h4Cache = new Map<string, { at: number; bars: Bar[] }>();
const H4_CACHE_MS = 30_000;
async function fetchH4Cached(ticker: string): Promise<Bar[]> {
  const hit = h4Cache.get(ticker);
  if (hit && Date.now() - hit.at < H4_CACHE_MS) return hit.bars;
  const bars = await fetchH4(ticker);
  if (bars.length > 0) h4Cache.set(ticker, { at: Date.now(), bars });
  return bars;
}

async function fetchH4(ticker: string): Promise<Bar[]> {
  for (const host of YF_HOSTS) {
    try {
      const url = `https://${host}/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1h&range=1y`;
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, cache: 'no-store' });
      if (!r.ok) continue;
      const j = await r.json();
      const res = (j?.chart?.result ?? [])[0] ?? {};
      const ts: number[] = res.timestamp ?? [];
      const q = res.indicators?.quote?.[0] ?? {};
      const bars: Bar[] = [];
      for (let i = 0; i < ts.length; i++) {
        const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i];
        if (o == null || h == null || l == null || c == null) continue;
        bars.push({ t: ts[i] * 1000, o, h, l, c });
      }
      const h4: Bar[] = [];
      for (let i = 0; i < bars.length; i += 4) {
        const chunk = bars.slice(i, i + 4);
        if (chunk.length === 0) continue;
        h4.push({
          t: chunk[0].t,
          o: chunk[0].o,
          h: Math.max(...chunk.map((b) => b.h)),
          l: Math.min(...chunk.map((b) => b.l)),
          c: chunk[chunk.length - 1].c,
        });
      }
      return h4;
    } catch {
      continue;
    }
  }
  return [];
}

/**
 * Self-learning adjustment (-25..+25): win-rate of THIS pattern type on THIS pair
 * from recorded outcomes in Neon. Cold start = 0 until outcomes exist.
 */
async function learnAdjust(pair: string, direction: string): Promise<number> {
  if (!dbConfigured()) return 0;
  try {
    const sql = await getDb();
    if (!sql) return 0;
    const rows = (await sql`
      SELECT outcome, COUNT(*)::int AS n FROM h4_outcomes
      WHERE pair = ${pair} AND direction = ${direction}
      GROUP BY outcome`) as Array<{ outcome: string; n: number }>;
    const wins = rows.find((r) => r.outcome === 'WIN')?.n ?? 0;
    const losses = rows.find((r) => r.outcome === 'LOSS')?.n ?? 0;
    const total = wins + losses;
    if (total < 5) return 0; // not enough history yet — neutral
    const winRate = wins / total;
    return Math.max(-25, Math.min(25, Math.round((winRate - 0.5) * 50)));
  } catch {
    return 0;
  }
}

/** Startup backtest seed: replay the last 200 H4 candles, record how past H&S setups resolved.
 *  Creates the h4_outcomes history so the learning model starts with real data. */
async function seedBacktest(pair: string, bars: Bar[], direction: 'BEARISH_HS' | 'BULLISH_IHS') {
  if (!dbConfigured() || bars.length < 200) return 0;
  try {
    const sql = await getDb();
    if (!sql) return 0;
    // check if this pair+direction already has outcomes
    const existing = (await sql`
      SELECT COUNT(*)::int AS n FROM h4_outcomes
      WHERE pair = ${pair} AND direction = ${direction} AND source = 'backtest'`) as Array<{ n: number }>;
    if ((existing[0]?.n ?? 0) > 0) return 0;

    let seeded = 0;
    for (let cut = 200; cut >= 60; cut -= 20) {
      const window = bars.slice(0, bars.length - cut + 60 > bars.length ? bars.length : bars.length - cut + 60);
      if (window.length < 60) continue;
      const setups = detectHeadShouldersAll(pair, window, 0, { relaxed: true });
      for (const setup of setups) {
        if (setup.direction !== direction) continue;
        // resolve forward from detection: did price reach target before stop within 30 H4 bars?
        const from = Math.min(bars.length - 1, setup.rightShoulder.index + 30);
        let outcome: string | null = null;
        for (let i = setup.rightShoulder.index + 1; i <= from; i++) {
          if (direction === 'BEARISH_HS') {
            if (bars[i].l <= setup.target) { outcome = 'WIN'; break; }
            if (bars[i].h >= setup.stopLoss) { outcome = 'LOSS'; break; }
          } else {
            if (bars[i].h >= setup.target) { outcome = 'WIN'; break; }
            if (bars[i].l <= setup.stopLoss) { outcome = 'LOSS'; break; }
          }
        }
        if (outcome) {
          await sql`INSERT INTO h4_outcomes (pair, direction, outcome, source, detected_at)
                    VALUES (${pair}, ${direction}, ${outcome}, 'backtest', now())`;
          seeded++;
        }
      }
    }
    return seeded;
  } catch {
    return 0;
  }
}

/** news alignment: +5 when a HIGH-impact event for this pair's currency is >24h away,
 *  +2 partial credit when 12-24h away (scanner stays picky right before releases) */
async function newsAlignment(pair: string, baseUrl: string): Promise<{ aligned: boolean; soon: boolean }> {
  try {
    const r = await fetch(`${baseUrl}/api/news`, { cache: 'no-store' });
    if (!r.ok) return { aligned: false, soon: false };
    const j = await r.json();
    const events = j.events ?? [];
    const now = Date.now();
    const relevant = events.filter((e: { pairs: string[]; released: boolean; minutesUntil: number }) =>
      !e.released && (e.pairs ?? []).includes(pair));
    const soon = relevant.some((e: { minutesUntil: number }) => e.minutesUntil <= 720);
    const aligned = relevant.length === 0 || relevant.every((e: { minutesUntil: number }) => e.minutesUntil > 1440);
    return { aligned, soon };
  } catch {
    return { aligned: false, soon: false };
  }
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const requested = url.searchParams.get('pair')?.toUpperCase();
  const pairs = requested ? [requested] : ALL_PAIRS;
  const baseUrl = `${url.protocol}//${url.host}`;

  const results = await Promise.all(
    pairs.map(async (pair) => {
      const bars = await fetchH4Cached(TICKER[pair] ?? pair);
      if (bars.length < 60) return null;
      const { aligned, soon } = await newsAlignment(pair, baseUrl);
      const setups = detectHeadShouldersAll(pair, bars, 0, { relaxed: true, macroAligned: aligned, highImpactSoon: soon });
      if (setups.length === 0) return null;
      // startup historical backtest seed + learning adjustment per direction
      const out = [];
      for (const setup of setups) {
        await seedBacktest(pair, bars, setup.direction);
        const adjust = await learnAdjust(pair, setup.direction);
        out.push({ setup, adjust });
      }
      return out;
    })
  );

  const all = results
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .flat()
    .map(({ setup, adjust }) => {
      const raw = setup.confidence + adjust;
      const confidence = Math.max(55, Math.min(95, Math.round(raw)));
      return { ...setup, confidence, learnAdjust: Math.round(adjust) };
    });
  // dedupe: one best setup per pair+direction (keep highest confidence)
  const best = new Map<string, (typeof all)[number]>();
  for (const s of all) {
    const key = `${s.pair}|${s.direction}`;
    const prev = best.get(key);
    if (!prev || s.confidence > prev.confidence) best.set(key, s);
  }
  const setups = Array.from(best.values()).sort((a, b) => b.confidence - a.confidence);

  // persist current setups + SELF-LEARNING LOOP: resolve past setups against live price
  if (dbConfigured() && setups.length > 0) {
    try {
      const sql = await getDb();
      if (sql) {
        await sql`CREATE TABLE IF NOT EXISTS h4_setups (
          id BIGSERIAL PRIMARY KEY, pair TEXT, direction TEXT, status TEXT,
          neckline NUMERIC, head NUMERIC, target NUMERIC, stop_loss NUMERIC,
          confidence NUMERIC, smc TEXT[], detected_at TIMESTAMPTZ DEFAULT now())`;
        await sql`CREATE TABLE IF NOT EXISTS h4_outcomes (
          id BIGSERIAL PRIMARY KEY, pair TEXT, direction TEXT, outcome TEXT,
          source TEXT, detected_at TIMESTAMPTZ DEFAULT now())`;
        for (const s of setups) {
          await sql`INSERT INTO h4_setups (pair, direction, status, neckline, head, target, stop_loss, confidence, smc)
                    VALUES (${s.pair}, ${s.direction}, ${s.status}, ${s.neckline}, ${s.head},
                            ${s.target}, ${s.stopLoss}, ${s.confidence}, ${s.smc})`;
        }

        // LEARNING LOOP — resolve open breakout setups: fetch latest price per pair once,
        // compare against each unresolved setup's target/stop, record WIN/LOSS.
        const open = (await sql`
          SELECT DISTINCT ON (pair, direction) id, pair, direction, target, stop_loss
          FROM h4_setups
          WHERE status = 'NECKLINE_BREAKOUT'
            AND id NOT IN (SELECT setup_ref FROM h4_outcomes WHERE setup_ref IS NOT NULL)
          ORDER BY pair, direction, detected_at DESC`) as Array<{ id: number; pair: string; direction: string; target: number; stop_loss: number }>;
        for (const o of open) {
          const bars = await fetchH4Cached(TICKER[o.pair] ?? o.pair);
          if (bars.length === 0) continue;
          const last = bars[bars.length - 1].c;
          const win = o.direction === 'BEARISH_HS' ? last <= o.target : last >= o.target;
          const loss = o.direction === 'BEARISH_HS' ? last >= o.stop_loss : last <= o.stop_loss;
          if (win || loss) {
            await sql`INSERT INTO h4_outcomes (pair, direction, outcome, source, setup_ref)
                      VALUES (${o.pair}, ${o.direction}, ${win ? 'WIN' : 'LOSS'}, 'live', ${o.id})`;
          }
        }
      }
    } catch {
      /* non-fatal */
    }
  }

  let barsPayload: Array<{ t: number; o: number; h: number; l: number; c: number }> | undefined;
  if (requested) {
    barsPayload = await fetchH4Cached(TICKER[requested] ?? requested);
  }

  // ── LIVE Macro Trend Lock: derived from the same real H4 bars the scanner uses ──
  const macroBias = await Promise.all(
    pairs.map(async (pair) => {
      const bars = await fetchH4Cached(TICKER[pair] ?? pair);
      if (bars.length < 220) return null;
      const closes = bars.map((b) => b.c);
      const n = closes.length;
      // H4 swing structure over the last ~60 bars: count higher-highs/lows vs lower
      const recent = bars.slice(-15);
      let hh = 0, hl = 0, lh = 0, ll = 0;
      for (let i = 1; i < recent.length; i++) {
        if (recent[i].h > recent[i - 1].h) hh++; else if (recent[i].h < recent[i - 1].h) lh++;
        if (recent[i].l > recent[i - 1].l) hl++; else if (recent[i].l < recent[i - 1].l) ll++;
      }
      // EMA200 side
      const k = 2 / (200 + 1);
      let ema = closes[Math.max(0, n - 200)];
      for (let i = Math.max(1, n - 200); i < n; i++) ema = closes[i] * k + ema * (1 - k);
      const above = closes[n - 1] > ema;
      // 5-hour drift (bars[-6] → bars[-1])
      const drift = ((closes[n - 1] - closes[n - 6]) / Math.max(1e-12, closes[n - 6])) * 100;
      // structure health 0..100: blend structure agreement + EMA agreement + drift strength
      const bullStruct = hh >= lh && hl >= ll;
      const bearStruct = lh >= hh && ll >= hl;
      const emaAgree = above === (drift >= 0);
      const health = Math.round(Math.min(100, 40 * (bullStruct || bearStruct ? 1 : 0.35) + (emaAgree ? 35 : 10) + Math.min(25, Math.abs(drift) * 6)));
      const bias = bullStruct && above ? 'BULLISH' : bearStruct && !above ? 'BEARISH' : bullStruct ? 'BULLISH' : bearStruct ? 'BEARISH' : 'NEUTRAL';
      const note = bias === 'BULLISH'
        ? 'Higher highs & higher lows confirmed on H4'
        : bias === 'BEARISH'
          ? 'Lower highs into H4 supply'
          : 'Range-bound — H&S setups allowed both ways';
      // counter-trend filter: count bearish setups on a BULLISH-bias pair and vice versa
      const counter = setups.filter(
        (s) => s.pair === pair &&
          ((bias === 'BULLISH' && s.direction === 'BEARISH_HS') || (bias === 'BEARISH' && s.direction === 'BULLISH_IHS')),
      ).length;
      return { pair, bias, health, note, counterFiltered: counter, drift: +drift.toFixed(2) };
    }),
  );
  const macro = macroBias.filter(Boolean);

  return NextResponse.json(
    { ok: true, scanned: pairs.length, setups, bars: barsPayload, macro, generatedAt: new Date().toISOString() },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

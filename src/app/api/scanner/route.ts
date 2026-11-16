import { NextRequest, NextResponse } from 'next/server';
import { ALL_PAIRS, TICKER, detectHeadShoulders, type Bar } from '@/lib/h4scanner';
import { dbConfigured, getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

const YF_HOSTS = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];

async function fetchH4(ticker: string): Promise<Bar[]> {
  for (const host of YF_HOSTS) {
    try {
      const url = `https://${host}/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1h&range=3mo`;
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
      // aggregate 1h → 4h
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

/** self-learning confidence: stored per pair+direction, nudged by outcome feedback */
async function learnScore(pair: string, direction: string): Promise<number> {
  if (!dbConfigured()) return 50;
  try {
    const sql = await getDb();
    if (!sql) return 50;
    const rows = (await sql`
      SELECT score FROM h4_learning WHERE pair = ${pair} AND direction = ${direction} LIMIT 1`) as Array<{ score: number }>;
    return rows[0]?.score ?? 50;
  } catch {
    return 50;
  }
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const requested = url.searchParams.get('pair')?.toUpperCase();
  const pairs = requested ? [requested] : ALL_PAIRS;

  const setups = await Promise.all(
    pairs.map(async (pair) => {
      const bars = await fetchH4(TICKER[pair] ?? pair);
      if (bars.length < 60) return null;
      const base = 50;
      const setup = detectHeadShoulders(pair, bars, base);
      if (!setup) return null;
      const conf = await learnScore(pair, setup.direction);
      return { ...setup, confidence: conf };
    })
  );

  const found = setups.filter(Boolean);

  // for a single-pair request also return the raw H4 bars (chart modal)
  let barsPayload: Array<{ t: number; o: number; h: number; l: number; c: number }> | undefined;
  if (requested) {
    barsPayload = await fetchH4(TICKER[requested] ?? requested);
  }

  // persist for the learning loop + dashboard (24/7 self-update)
  if (dbConfigured() && found.length > 0) {
    try {
      const sql = await getDb();
      if (sql) {
        await sql`CREATE TABLE IF NOT EXISTS h4_setups (
          id BIGSERIAL PRIMARY KEY, pair TEXT, direction TEXT, status TEXT,
          neckline NUMERIC, head NUMERIC, target NUMERIC, stop_loss NUMERIC,
          confidence NUMERIC, smc TEXT[], detected_at TIMESTAMPTZ DEFAULT now())`;
        for (const s of found) {
          await sql`INSERT INTO h4_setups (pair, direction, status, neckline, head, target, stop_loss, confidence, smc)
                    VALUES (${s!.pair}, ${s!.direction}, ${s!.status}, ${s!.neckline}, ${s!.head},
                            ${s!.target}, ${s!.stopLoss}, ${s!.confidence}, ${s!.smc})`;
        }
      }
    } catch {
      /* non-fatal */
    }
  }

  return NextResponse.json(
    { ok: true, scanned: pairs.length, setups: found, bars: barsPayload, generatedAt: new Date().toISOString() },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

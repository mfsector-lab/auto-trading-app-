import { NextResponse } from 'next/server';
import { dbConfigured, getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!dbConfigured()) {
    return NextResponse.json({ ok: true, configured: false, message: 'DATABASE_URL not set' });
  }
  try {
    const sql = await getDb();
    if (!sql) return NextResponse.json({ ok: true, configured: false });

    await sql`CREATE TABLE IF NOT EXISTS h4_outcomes (
      id BIGSERIAL PRIMARY KEY, pair TEXT, direction TEXT, outcome TEXT,
      source TEXT, setup_ref BIGINT, detected_at TIMESTAMPTZ DEFAULT now())`;

    const totals = (await sql`
      SELECT outcome, COUNT(*)::int AS n FROM h4_outcomes GROUP BY outcome`) as Array<{ outcome: string; n: number }>;
    const wins = totals.find((t) => t.outcome === 'WIN')?.n ?? 0;
    const losses = totals.find((t) => t.outcome === 'LOSS')?.n ?? 0;

    const bySource = (await sql`
      SELECT source, outcome, COUNT(*)::int AS n FROM h4_outcomes GROUP BY source, outcome`) as
      Array<{ source: string; outcome: string; n: number }>;

    const byDirection = (await sql`
      SELECT direction, outcome, COUNT(*)::int AS n FROM h4_outcomes GROUP BY direction, outcome`) as
      Array<{ direction: string; outcome: string; n: number }>;

    const topPairs = (await sql`
      SELECT pair, direction, outcome, COUNT(*)::int AS n FROM h4_outcomes
      GROUP BY pair, direction, outcome ORDER BY n DESC LIMIT 10`) as
      Array<{ pair: string; direction: string; outcome: string; n: number }>;

    const latest = (await sql`
      SELECT pair, direction, outcome, source, detected_at FROM h4_outcomes
      ORDER BY detected_at DESC LIMIT 10`) as Array<Record<string, unknown>>;

    return NextResponse.json({
      ok: true, configured: true,
      totals: { wins, losses, winRate: wins + losses > 0 ? Math.round((wins / (wins + losses)) * 1000) / 10 : null },
      bySource, byDirection, topPairs, latest,
      generatedAt: new Date().toISOString(),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e).slice(0, 200) }, { status: 500 });
  }
}

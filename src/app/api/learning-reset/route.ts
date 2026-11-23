import { NextResponse } from 'next/server';
import { dbConfigured, getDb } from '@/lib/db';
export const dynamic = 'force-dynamic';
export async function POST() {
  if (!dbConfigured()) return NextResponse.json({ ok: false }, { status: 400 });
  const sql = await getDb();
  if (!sql) return NextResponse.json({ ok: false, error: 'no db' }, { status: 400 });
  await sql`DELETE FROM h4_outcomes WHERE source = 'backtest'`;
  return NextResponse.json({ ok: true, reset: 'backtest outcomes cleared — will re-seed on next scan with 90-bar window' });
}
import { NextRequest, NextResponse } from 'next/server';
import { dbConfigured } from '@/lib/db';

/**
 * Cloud heartbeat keeper.
 * The EA heartbeats through the local bridge to /api/signals. If the local PC
 * is off, the dashboard shows OFFLINE. This endpoint lets any always-on
 * runner (GitHub Action, another VPS, cron) POST a "cloud terminal alive"
 * marker so the site can show a CLOUD-BRIDGE status distinctly from the
 * local terminal. No secrets in payload; rate-limited by IP like others.
 */
const g = globalThis as unknown as { __cloudKeeper?: { last: string; source: string; note: string } };

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  g.__cloudKeeper = {
    last: new Date().toISOString(),
    source: String(body.source ?? 'cloud-runner'),
    note: String(body.note ?? ''),
  };
  return NextResponse.json({ ok: true, ...g.__cloudKeeper });
}

export async function GET() {
  const k = g.__cloudKeeper;
  const alive = Boolean(k) && Date.now() - Date.parse((k as { last: string }).last) < 90_000;
  return NextResponse.json({ ok: true, alive, db: dbConfigured(), ...(k ?? {}) });
}

import { NextRequest, NextResponse } from 'next/server';
import { getByPin, maskEmail } from '@/lib/auth/store';
import { accountByPin, dbConfigured, ensureSchema } from '@/lib/db';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const pin = String(body.pin ?? '').replace(/\D/g, '').slice(0, 4);
  if (dbConfigured()) await ensureSchema();
  let account = getByPin(pin);
  if (!account && dbConfigured()) {
    const row = await accountByPin(pin);
    if (row) account = { pin: row.pin, name: row.name, email: row.email, joinedAt: String(row.joined_at), isOwner: row.is_owner };
  }
  if (!account) {
    return NextResponse.json({ ok: false, error: 'PIN not recognised. Join with your email to get one.' }, { status: 401 });
  }
  return NextResponse.json({
    ok: true,
    pin: account.pin,
    name: account.name,
    email: maskEmail(account.email),
    isOwner: account.isOwner,
    joinedAt: account.joinedAt,
  });
}

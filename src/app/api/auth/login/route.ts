import { NextRequest, NextResponse } from 'next/server';
import { getByPin, maskEmail } from '@/lib/auth/store';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const pin = String(body.pin ?? '').replace(/\D/g, '').slice(0, 4);
  const account = getByPin(pin);
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

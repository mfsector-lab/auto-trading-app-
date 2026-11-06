import { NextRequest, NextResponse } from 'next/server';
import { createAccount, getByEmail, maskEmail } from '@/lib/auth/store';
import { upsertAccount, dbConfigured, ensureSchema } from '@/lib/db';
import { sendPinEmail, mailConfigured } from '@/lib/auth/mailer';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const name = String(body.name ?? '').trim();
  const email = String(body.email ?? '').trim().toLowerCase();

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ ok: false, error: 'Enter a valid email address.' }, { status: 400 });
  }

  if (dbConfigured()) await ensureSchema();
  const existing = getByEmail(email);
  const account = existing ?? createAccount(name, email);
  if (dbConfigured()) await upsertAccount({ pin: account.pin, name: account.name, email: account.email, isOwner: account.isOwner });
  const mail = await sendPinEmail(account);

  return NextResponse.json({
    ok: true,
    created: !existing,
    pin: account.pin,
    name: account.name,
    email: maskEmail(account.email),
    joinedAt: account.joinedAt,
    emailSent: mail.sent,
    emailDetail: mail.sent ? 'sent' : mail.detail,
    mailConfigured: mailConfigured(),
  });
}

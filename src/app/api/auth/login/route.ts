import { NextRequest, NextResponse } from 'next/server';
import { getByPin, maskEmail } from '@/lib/auth/store';
import { accountByPin, dbConfigured, ensureSchema, getDb } from '@/lib/db';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const pin = String(body.pin ?? '').replace(/\D/g, '').slice(0, 4);
  if (dbConfigured()) await ensureSchema();
  let account = getByPin(pin);
  let dbInfo: { configured: boolean; pgFound: boolean; dbId: string; user: string } = { configured: dbConfigured(), pgFound: false, dbId: '', user: '' };
  if (!account && dbConfigured()) {
    const row = await accountByPin(pin);
    if (row) {
      account = { pin: row.pin, name: row.name, email: row.email, joinedAt: String(row.joined_at), isOwner: row.is_owner };
      dbInfo.pgFound = true;
    }
  }
  if (dbConfigured()) {
    try {
      await ensureSchema();
      const sql = await getDb();
      const ident = (await (sql as unknown as (q: TemplateStringsArray) => Promise<Array<Record<string, unknown>>>)`SELECT current_database() AS db, current_user AS usr`) as Array<Record<string, unknown>>;
      dbInfo.dbId = String(ident[0]?.db ?? '');
      dbInfo.user = String(ident[0]?.usr ?? '');
    } catch { /* surfaced as empty */ }
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
    db: dbInfo,
  });
}

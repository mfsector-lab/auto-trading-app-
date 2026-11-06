/**
 * Prisma Postgres persistence. Activates when DATABASE_URL is set,
 * otherwise every helper returns null and callers fall back to memory.
 */
type Sql = (strings: TemplateStringsArray, ...params: unknown[]) => Promise<unknown[]> & {
  begin?: unknown;
};

let client: Sql | null = null;

export function dbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export async function getDb(): Promise<Sql | null> {
  if (!dbConfigured()) return null;
  if (client) return client;
  const mod = await import('postgres');
  const postgres = (mod as { default?: unknown }).default ?? mod;
  client = (postgres as (url: string, opts: Record<string, unknown>) => Sql)(
    process.env.DATABASE_URL as string,
    { max: 3, idle_timeout: 20, prepare: false },
  );
  return client;
}

export async function ensureSchema(): Promise<boolean> {
  const sql = await getDb();
  if (!sql) return false;
  try {
    await sql`CREATE TABLE IF NOT EXISTS accounts (
      pin TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
      joined_at TIMESTAMPTZ NOT NULL DEFAULT now(), is_owner BOOLEAN NOT NULL DEFAULT false)`;
    await sql`CREATE TABLE IF NOT EXISTS trade_results (
      id BIGSERIAL PRIMARY KEY, action TEXT, symbol TEXT, ticket BIGINT, lot NUMERIC,
      open_price NUMERIC, close_price NUMERIC, profit NUMERIC, outcome TEXT,
      strategy_mode TEXT, ea_version TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
    await sql`CREATE TABLE IF NOT EXISTS bridge_settings (
      client_id TEXT PRIMARY KEY, settings JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
    return true;
  } catch {
    return false;
  }
}

export interface AccountRow { pin: string; name: string; email: string; joined_at: string; is_owner: boolean }

export async function upsertAccount(a: { pin: string; name: string; email: string; isOwner: boolean }): Promise<void> {
  const sql = await getDb();
  if (!sql) return;
  await sql`INSERT INTO accounts (pin, name, email, is_owner) VALUES (${a.pin}, ${a.name}, ${a.email.toLowerCase()}, ${a.isOwner})
            ON CONFLICT (email) DO UPDATE SET pin = EXCLUDED.pin, name = EXCLUDED.name`;
}

export async function accountByPin(pin: string): Promise<AccountRow | null> {
  const sql = await getDb();
  if (!sql) return null;
  const rows = (await sql`SELECT pin, name, email, joined_at, is_owner FROM accounts WHERE pin = ${pin} LIMIT 1`) as unknown as AccountRow[];
  return rows[0] ?? null;
}

export async function saveTradeResult(t: {
  action: string; symbol: string; ticket: number; lot: number;
  open_price: number; close_price: number; profit: number; outcome: string;
  strategy_mode?: string; ea_version?: string;
}): Promise<void> {
  const sql = await getDb();
  if (!sql) return;
  await sql`INSERT INTO trade_results (action, symbol, ticket, lot, open_price, close_price, profit, outcome, strategy_mode, ea_version)
            VALUES (${t.action}, ${t.symbol}, ${t.ticket}, ${t.lot}, ${t.open_price}, ${t.close_price}, ${t.profit}, ${t.outcome}, ${t.strategy_mode ?? null}, ${t.ea_version ?? null})`;
}

export async function recentTradeResults(limit = 30): Promise<Array<Record<string, unknown>>> {
  const sql = await getDb();
  if (!sql) return [];
  const rows = (await sql`SELECT action, symbol, ticket, lot, open_price, close_price, profit, outcome, strategy_mode, ea_version, created_at
                          FROM trade_results ORDER BY created_at DESC LIMIT ${limit}`) as unknown as Array<Record<string, unknown>>;
  return rows;
}

export async function saveBridgeSettings(clientId: string, settings: Record<string, unknown>): Promise<void> {
  const sql = await getDb();
  if (!sql) return;
  await sql`INSERT INTO bridge_settings (client_id, settings) VALUES (${clientId}, ${JSON.stringify(settings)}::jsonb)
            ON CONFLICT (client_id) DO UPDATE SET settings = EXCLUDED.settings, updated_at = now()`;
}

export async function loadBridgeSettings(clientId: string): Promise<Record<string, unknown> | null> {
  const sql = await getDb();
  if (!sql) return null;
  const rows = (await sql`SELECT settings FROM bridge_settings WHERE client_id = ${clientId} LIMIT 1`) as unknown as Array<{ settings: Record<string, unknown> }>;
  return rows[0]?.settings ?? null;
}

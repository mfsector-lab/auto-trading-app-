/**
 * Prisma Postgres persistence layer.
 * Set DATABASE_URL (Prisma Postgres connection string) in Vercel env vars.
 * When unset, everything gracefully falls back to in-memory (resets on deploy).
 */
let postgresClient: ReturnType<typeof import('postgres').default> | null = null;

export function dbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export async function getDb() {
  if (!dbConfigured()) return null;
  if (postgresClient) return postgresClient;
  const { default: postgres } = await import('postgres');
  postgresClient = postgres(process.env.DATABASE_URL as string, {
    max: 3,
    idle_timeout: 20,
    prepare: false,
  });
  return postgresClient;
}

export async function ensureSchema() {
  const sql = await getDb();
  if (!sql) return false;
  await sql`
    CREATE TABLE IF NOT EXISTS accounts (
      pin TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      is_owner BOOLEAN NOT NULL DEFAULT false
    )`;
  await sql`
    CREATE TABLE IF NOT EXISTS trade_results (
      id BIGSERIAL PRIMARY KEY,
      action TEXT, symbol TEXT, ticket BIGINT, lot NUMERIC,
      open_price NUMERIC, close_price NUMERIC, profit NUMERIC,
      outcome TEXT, strategy_mode TEXT, ea_version TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;
  await sql`
    CREATE TABLE IF NOT EXISTS bridge_settings (
      client_id TEXT PRIMARY KEY,
      settings JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;
  return true;
}

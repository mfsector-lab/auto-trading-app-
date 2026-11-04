/**
 * Lightweight account store for the PIN-based profile system.
 * In-memory per server instance — for durable accounts across deployments,
 * provision Vercel KV/Postgres and swap the two Map operations.
 */
export interface Account {
  pin: string;
  name: string;
  email: string;
  joinedAt: string;
  isOwner: boolean;
}

type Store = {
  byEmail: Map<string, Account>;
  byPin: Map<string, Account>;
};

const g = globalThis as unknown as { __taAuthStore?: Store };

function store(): Store {
  if (!g.__taAuthStore) {
    const byEmail = new Map<string, Account>();
    const byPin = new Map<string, Account>();
    // Owner profile — PIN 1313, always valid
    const owner: Account = {
      pin: '1313',
      name: 'Owner',
      email: 'owner@tradeautomate-ai.app',
      joinedAt: '2026-11-01T00:00:00.000Z',
      isOwner: true,
    };
    byPin.set(owner.pin, owner);
    byEmail.set(owner.email, owner);
    // Legacy local profiles kept working
    for (const [pin, name] of [['2468', 'User 2'], ['9090', 'User 3'], ['3131', 'User 4']] as const) {
      const a: Account = { pin, name, email: `${name.toLowerCase().replace(' ', '')}@local`, joinedAt: '2026-11-01T00:00:00.000Z', isOwner: false };
      byPin.set(pin, a);
    }
    g.__taAuthStore = { byEmail, byPin };
  }
  return g.__taAuthStore;
}

export function getByPin(pin: string): Account | undefined {
  return store().byPin.get(pin.trim());
}

export function getByEmail(email: string): Account | undefined {
  return store().byEmail.get(email.trim().toLowerCase());
}

export function createAccount(name: string, email: string): Account {
  const s = store();
  const cleanEmail = email.trim().toLowerCase();
  const existing = s.byEmail.get(cleanEmail);
  if (existing) return existing;
  let pin = '';
  do {
    pin = String(Math.floor(1000 + Math.random() * 9000));
  } while (s.byPin.has(pin));
  const account: Account = {
    pin,
    name: name.trim().slice(0, 40) || cleanEmail.split('@')[0],
    email: cleanEmail,
    joinedAt: new Date().toISOString(),
    isOwner: false,
  };
  s.byEmail.set(cleanEmail, account);
  s.byPin.set(pin, account);
  return account;
}

export function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  if (!domain) return '***';
  const head = user.slice(0, 2);
  return `${head}${'*'.repeat(Math.max(2, user.length - 2))}@${domain}`;
}

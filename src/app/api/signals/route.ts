import { NextRequest, NextResponse } from 'next/server';

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_DEFAULT = 120;
const RATE_LIMIT_MAX_STATUS = 600;
const RATE_LIMIT_MAX_TELEMETRY = 3000;
const requestsByIp = new Map<string, number[]>();

type SignalAction = 'BUY' | 'SELL' | 'HOLD';

type SignalPayload = {
  mode: string;
  action: SignalAction;
  account_mode: 'AUTO' | 'DEMO' | 'LIVE';
  bot_enabled?: boolean;
  symbol: string;
  lot: number;
  tp_pips: number;
  sl_pips: number;
  max_spread: number;
  magic: number;
  comment: string;
  order_type?: string;
  pending_price?: number;
  trailing_stop_pips?: number;
  lock_symbol?: string;
  scalp_mode?: boolean;
  spread_guard?: boolean;
  ai_verify?: boolean;
  smart_trailing?: boolean;
  news_filter?: boolean;
  candle_depth?: number;
  concurrent_markets?: number;
  max_open_trades: number;
  scoped_symbols_csv: string;
  autonomous_mode?: boolean;
  timestamp: string;
};

type TerminalStatus = {
  account_mode: 'DEMO' | 'LIVE' | 'UNKNOWN';
  broker: string;
  server: string;
  account_number: string;
  symbol: string;
  last_seen: string;
  source?: 'heartbeat' | 'poll';
  ea_version?: string;
  open_count?: number;
  open_profit?: number;
};

type ExecutionStatus = {
  action: SignalAction;
  symbol: string;
  ticket: number;
  lot: number;
  price: number;
  stop_loss: number;
  take_profit: number;
  timestamp: string;
};

type RejectionStatus = {
  reason: string;
  detail: string;
  symbol: string;
  timestamp: string;
};

type OpenTradeStatus = {
  ticket: number;
  symbol: string;
  side: 'BUY' | 'SELL';
  lot: number;
  open_price: number;
  profit: number;
  magic: number;
  stop_loss: number;
  take_profit: number;
};

type ClientSignalState = {
  lastSignalByMode: Map<string, SignalPayload>;
  lastGlobalSignal: SignalPayload | null;
  lastTerminalStatus: TerminalStatus | null;
  lastExecutionStatus: ExecutionStatus | null;
  lastRejectionStatus: RejectionStatus | null;
  lastOpenTradesStatus: OpenTradeStatus[];
};

const signalState = new Map<string, ClientSignalState>();

function getClientSignalState(clientId: string): ClientSignalState {
  let state = signalState.get(clientId);
  if (state) return state;
  state = {
    lastSignalByMode: new Map<string, SignalPayload>(),
    lastGlobalSignal: null,
    lastTerminalStatus: null,
    lastExecutionStatus: null,
    lastRejectionStatus: null,
    lastOpenTradesStatus: [],
  };
  signalState.set(clientId, state);
  return state;
}

function normalizeAction(value: unknown): SignalAction {
  if (typeof value !== 'string') return 'HOLD';
  const v = value.trim().toUpperCase();
  if (!v) return 'HOLD';
  if (v === 'B' || v === 'LONG' || v.startsWith('BUY')) return 'BUY';
  if (v === 'S' || v === 'SHORT' || v.startsWith('SELL')) return 'SELL';
  return 'HOLD';
}

function normalizeSignalAccountMode(value: unknown): SignalPayload['account_mode'] {
  const mode = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (mode === 'DEMO') return 'DEMO';
  if (mode === 'LIVE') return 'LIVE';
  return 'AUTO';
}

function toNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const normalized = value.trim().replace(/\s+/g, '').replace(',', '.');
    const n = Number(normalized);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function parseBodyText(raw: string): Record<string, unknown> {
  const text = raw.trim();
  if (!text) return {};
  try {
    const parsed = JSON.parse(text) as unknown;
    return typeof parsed === 'object' && parsed ? (parsed as Record<string, unknown>) : {};
  } catch {
    const normalized = text.replace(/(?<=\d),(?=\d)/g, '.');
    try {
      const parsed = JSON.parse(normalized) as unknown;
      return typeof parsed === 'object' && parsed ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
}

function getClientIdFromSearch(searchParams: URLSearchParams): string {
  const raw = (searchParams.get('client_id') ?? '').trim();
  return raw || 'default';
}

function getClientIdFromBody(body: Record<string, unknown>): string {
  const raw = typeof body.client_id === 'string' ? body.client_id.trim() : '';
  return raw || 'default';
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (v === 'true' || v === '1' || v === 'yes' || v === 'on') return true;
    if (v === 'false' || v === '0' || v === 'no' || v === 'off') return false;
  }
  return fallback;
}

function getIp(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? request.headers.get('x-real-ip') ?? 'unknown';
}

function isRateLimited(key: string, max: number): boolean {
  const now = Date.now();
  const entries = requestsByIp.get(key) ?? [];
  const recent = entries.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  recent.push(now);
  requestsByIp.set(key, recent);
  return recent.length > max;
}

function getRateLimitKey(request: NextRequest, ip: string, eventType?: string): string {
  if (eventType) return `${ip}:event:${eventType}`;
  const { searchParams, pathname } = new URL(request.url);
  if (searchParams.get('status')) return `${ip}:status:${pathname}`;
  return `${ip}:${request.method}:${pathname}`;
}

function getRateLimitMax(request: NextRequest, eventType?: string): number {
  if (eventType === 'heartbeat' || eventType === 'open_trades' || eventType === 'execution' || eventType === 'rejection') {
    return RATE_LIMIT_MAX_TELEMETRY;
  }
  const { searchParams } = new URL(request.url);
  if (searchParams.get('status')) return RATE_LIMIT_MAX_STATUS;
  return RATE_LIMIT_MAX_DEFAULT;
}

function validateSecurity(request: NextRequest, eventType?: string): NextResponse | null {
  // EA telemetry POSTs (heartbeat, open_trades, execution, rejection, commands) must never
  // be rate-limited or blocked — the dashboard depends on these arriving continuously.
  if (request.method === 'POST') {
    return null;
  }

  const ip = getIp(request);
  const limitKey = getRateLimitKey(request, ip, eventType);
  const limitMax = getRateLimitMax(request, eventType);
  const isTelemetryEvent = eventType === 'heartbeat'
    || eventType === 'open_trades'
    || eventType === 'execution'
    || eventType === 'rejection';

  if (isRateLimited(limitKey, limitMax)) {
    return NextResponse.json({ ok: false, error: 'Rate limit exceeded.' }, { status: 429, headers: { 'Retry-After': '5' } });
  }

  const allowList = process.env.TRADEAUTOMATE_ALLOWED_IPS;
  if (allowList) {
    const allowed = allowList.split(',').map((s) => s.trim()).filter(Boolean);
    if (!allowed.includes(ip)) {
      return NextResponse.json({ ok: false, error: 'IP not allowed.' }, { status: 403 });
    }
  }

  const proto = request.headers.get('x-forwarded-proto');
  if (proto && proto !== 'https' && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ ok: false, error: 'HTTPS required.' }, { status: 400 });
  }

  const expectedToken = process.env.TRADEAUTOMATE_API_TOKEN;
  if (expectedToken) {
    const authHeader = request.headers.get('authorization') ?? '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if ((!token || token !== expectedToken) && !isTelemetryEvent) {
      return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 });
    }

    const expiresAt = process.env.TRADEAUTOMATE_TOKEN_EXPIRES_AT;
    if (expiresAt && Date.now() > Number(expiresAt)) {
      return NextResponse.json({ ok: false, error: 'Token expired.' }, { status: 401 });
    }
  }

  return null;
}

export async function GET(request: NextRequest) {
  const securityError = validateSecurity(request);
  if (securityError) return securityError;

  const { searchParams } = new URL(request.url);
  const clientId = getClientIdFromSearch(searchParams);
  const state = getClientSignalState(clientId);
  const mode = searchParams.get('mode') ?? 'signal';

  if (!searchParams.get('status')) {
    state.lastTerminalStatus = {
      account_mode: state.lastTerminalStatus?.account_mode ?? 'UNKNOWN',
      broker: state.lastTerminalStatus?.broker ?? 'unknown',
      server: state.lastTerminalStatus?.server ?? 'unknown',
      account_number: state.lastTerminalStatus?.account_number ?? 'unknown',
      symbol: state.lastTerminalStatus?.symbol ?? 'unknown',
      last_seen: new Date().toISOString(),
      source: state.lastTerminalStatus?.source === 'heartbeat' ? 'heartbeat' : 'poll',
      ea_version: state.lastTerminalStatus?.ea_version,
      open_count: state.lastTerminalStatus?.open_count,
      open_profit: state.lastTerminalStatus?.open_profit,
    };
  }

  const status = searchParams.get('status');
  if (status === '1' || status === 'true') {
    return NextResponse.json(
      {
        ok: true,
        client_id: clientId,
        terminal: state.lastTerminalStatus,
        execution: state.lastExecutionStatus,
        rejection: state.lastRejectionStatus,
        open_trades: state.lastOpenTradesStatus,
        queued_signal: state.lastGlobalSignal,
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  }

  const payload = state.lastSignalByMode.get(mode) ?? state.lastGlobalSignal ?? {
    mode,
    action: 'HOLD' as SignalAction,
    account_mode: 'AUTO' as const,
    bot_enabled: true,
    symbol: 'EURUSD',
    lot: 0.01,
    tp_pips: 10,
    sl_pips: 7,
    max_spread: 2,
    magic: 54321,
    comment: 'TradeAutomate_Scalp',
    lock_symbol: '',
    scalp_mode: true,
    spread_guard: true,
    ai_verify: true,
    smart_trailing: false,
    news_filter: true,
    candle_depth: 200,
    concurrent_markets: 5,
    max_open_trades: 5,
    scoped_symbols_csv: 'EURUSD,GBPUSD,USDJPY,XAUUSD,BTCUSD,USDCAD,AUDUSD,US500,NAS100,USOIL',
    autonomous_mode: false,
    timestamp: new Date().toISOString(),
  };

  return NextResponse.json(payload, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text().catch(() => '');
  const body = parseBodyText(rawBody);
  const clientId = getClientIdFromBody(body);
  const state = getClientSignalState(clientId);
  const rawAction = (body as Record<string, unknown>).action
    ?? (body as Record<string, unknown>).side
    ?? (body as Record<string, unknown>).direction
    ?? (body as Record<string, unknown>).signal
    ?? (body as Record<string, unknown>).type;

  const mode = typeof (body as Record<string, unknown>).mode === 'string' && (body as Record<string, unknown>).mode
    ? String((body as Record<string, unknown>).mode)
    : 'signal';

  const eventType = String((body as Record<string, unknown>).event_type ?? '').toLowerCase();

  const securityError = validateSecurity(request, eventType || undefined);
  if (securityError) return securityError;

  if (eventType === 'heartbeat') {
    const terminal: TerminalStatus = {
      account_mode:
        String((body as Record<string, unknown>).account_mode ?? 'LIVE').toUpperCase() === 'DEMO' ? 'DEMO' : 'LIVE',
      broker: String((body as Record<string, unknown>).broker ?? 'unknown'),
      server: String((body as Record<string, unknown>).server ?? 'unknown'),
      account_number: String((body as Record<string, unknown>).account_number ?? 'unknown'),
      symbol: String((body as Record<string, unknown>).symbol ?? ''),
      last_seen: new Date().toISOString(),
      source: 'heartbeat',
      ea_version: String((body as Record<string, unknown>).ea_version ?? 'unknown'),
      open_count: Math.max(0, Math.trunc(toNumber((body as Record<string, unknown>).open_count, 0))),
      open_profit: toNumber((body as Record<string, unknown>).open_profit, 0),
    };
    state.lastTerminalStatus = terminal;
    return NextResponse.json({ ok: true, client_id: clientId, terminal, timestamp: terminal.last_seen }, { status: 200 });
  }

  if (eventType === 'execution') {
    const execution: ExecutionStatus = {
      action: normalizeAction((body as Record<string, unknown>).action),
      symbol: String((body as Record<string, unknown>).symbol ?? 'unknown'),
      ticket: Math.trunc(toNumber((body as Record<string, unknown>).ticket, 0)),
      lot: toNumber((body as Record<string, unknown>).lot, 0),
      price: toNumber((body as Record<string, unknown>).price, 0),
      stop_loss: toNumber((body as Record<string, unknown>).stop_loss, 0),
      take_profit: toNumber((body as Record<string, unknown>).take_profit, 0),
      timestamp: new Date().toISOString(),
    };
    state.lastExecutionStatus = execution;
    return NextResponse.json({ ok: true, client_id: clientId, execution, timestamp: execution.timestamp }, { status: 200 });
  }

  if (eventType === 'rejection') {
    const rejection: RejectionStatus = {
      reason: String((body as Record<string, unknown>).reason ?? 'unknown'),
      detail: String((body as Record<string, unknown>).detail ?? ''),
      symbol: String((body as Record<string, unknown>).symbol ?? ''),
      timestamp: new Date().toISOString(),
    };
    state.lastRejectionStatus = rejection;
    return NextResponse.json({ ok: true, client_id: clientId, rejection, timestamp: rejection.timestamp }, { status: 200 });
  }

  if (eventType === 'open_trades') {
    const rawTrades = Array.isArray((body as Record<string, unknown>).open_trades)
      ? ((body as Record<string, unknown>).open_trades as unknown[])
      : [];

    const openTrades: OpenTradeStatus[] = rawTrades
      .map((trade) => {
        const t = trade as Record<string, unknown>;
        const side = normalizeAction(t.side);
        if (side !== 'BUY' && side !== 'SELL') return null;
        return {
          ticket: Math.max(0, Math.trunc(toNumber(t.ticket, 0))),
          symbol: String(t.symbol ?? '').toUpperCase(),
          side,
          lot: toNumber(t.lot, 0),
          open_price: toNumber(t.open_price, 0),
          profit: toNumber(t.profit, 0),
          magic: Math.trunc(toNumber(t.magic, 0)),
          stop_loss: toNumber(t.stop_loss, 0),
          take_profit: toNumber(t.take_profit, 0),
        };
      })
      .filter((t): t is OpenTradeStatus => !!t && t.ticket > 0 && t.symbol.length > 0);

    state.lastOpenTradesStatus = openTrades;

    const openCount = Math.max(0, Math.trunc(toNumber((body as Record<string, unknown>).open_count, openTrades.length)));
    const openProfit = toNumber(
      (body as Record<string, unknown>).open_profit,
      openTrades.reduce((sum, t) => sum + t.profit, 0)
    );

    state.lastTerminalStatus = {
      account_mode:
        String((body as Record<string, unknown>).account_mode ?? state.lastTerminalStatus?.account_mode ?? 'UNKNOWN').toUpperCase() === 'DEMO'
          ? 'DEMO'
          : String((body as Record<string, unknown>).account_mode ?? state.lastTerminalStatus?.account_mode ?? 'UNKNOWN').toUpperCase() === 'LIVE'
            ? 'LIVE'
            : 'UNKNOWN',
      broker: String((body as Record<string, unknown>).broker ?? state.lastTerminalStatus?.broker ?? 'unknown'),
      server: String((body as Record<string, unknown>).server ?? state.lastTerminalStatus?.server ?? 'unknown'),
      account_number: String((body as Record<string, unknown>).account_number ?? state.lastTerminalStatus?.account_number ?? 'unknown'),
      symbol: String((body as Record<string, unknown>).symbol ?? state.lastTerminalStatus?.symbol ?? ''),
      last_seen: new Date().toISOString(),
      source: 'heartbeat',
      ea_version: String((body as Record<string, unknown>).ea_version ?? state.lastTerminalStatus?.ea_version ?? 'unknown'),
      open_count: openCount,
      open_profit: openProfit,
    };

    return NextResponse.json(
      { ok: true, client_id: clientId, open_count: openCount, open_profit: openProfit, open_trades: openTrades, timestamp: state.lastTerminalStatus.last_seen },
      { status: 200 }
    );
  }

  const payload: SignalPayload = {
    mode,
    action: normalizeAction(rawAction),
    account_mode: normalizeSignalAccountMode((body as Record<string, unknown>).account_mode),
    bot_enabled: toBoolean((body as Record<string, unknown>).bot_enabled, true),
    symbol: String((body as Record<string, unknown>).symbol ?? 'EURUSD'),
    lot: toNumber((body as Record<string, unknown>).lot, 0.01),
    tp_pips: Math.trunc(toNumber((body as Record<string, unknown>).tp_pips, 10)),
    sl_pips: Math.trunc(toNumber((body as Record<string, unknown>).sl_pips, 7)),
    max_spread: toNumber((body as Record<string, unknown>).max_spread, 2),
    magic: Math.trunc(toNumber((body as Record<string, unknown>).magic, 54321)),
    comment: String((body as Record<string, unknown>).comment ?? 'TradeAutomate_Scalp'),
    order_type: typeof (body as Record<string, unknown>).order_type === 'string'
      ? String((body as Record<string, unknown>).order_type)
      : undefined,
    pending_price: toNumber((body as Record<string, unknown>).pending_price, 0),
    trailing_stop_pips: Math.trunc(toNumber((body as Record<string, unknown>).trailing_stop_pips, 0)),
    lock_symbol: String((body as Record<string, unknown>).lock_symbol ?? '').toUpperCase(),
    scalp_mode: toBoolean((body as Record<string, unknown>).scalp_mode, true),
    spread_guard: toBoolean((body as Record<string, unknown>).spread_guard, true),
    ai_verify: toBoolean((body as Record<string, unknown>).ai_verify, true),
    smart_trailing: toBoolean((body as Record<string, unknown>).smart_trailing, false),
    news_filter: toBoolean((body as Record<string, unknown>).news_filter, true),
    candle_depth: Math.max(100, Math.trunc(toNumber((body as Record<string, unknown>).candle_depth, 200))),
    concurrent_markets: Math.max(1, Math.trunc(toNumber((body as Record<string, unknown>).concurrent_markets, 5))),
    max_open_trades: Math.max(1, Math.trunc(toNumber((body as Record<string, unknown>).max_open_trades, 5))),
    scoped_symbols_csv: Array.isArray((body as Record<string, unknown>).scoped_symbols)
      ? ((body as Record<string, unknown>).scoped_symbols as unknown[])
          .map((v) => String(v).trim().toUpperCase())
          .filter(Boolean)
          .join(',')
      : String((body as Record<string, unknown>).scoped_symbols_csv ?? 'EURUSD,GBPUSD,USDJPY,XAUUSD,BTCUSD,USDCAD,AUDUSD,US500,NAS100,USOIL'),
    autonomous_mode: toBoolean((body as Record<string, unknown>).autonomous_mode, false),
    timestamp: new Date().toISOString(),
  };

  state.lastSignalByMode.set(mode, payload);
  state.lastGlobalSignal = payload;

  return NextResponse.json(
    {
      ok: true,
      client_id: clientId,
      stored: payload,
      timestamp: payload.timestamp,
    },
    { status: 200 }
  );
}

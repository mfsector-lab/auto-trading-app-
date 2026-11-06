import { NextRequest, NextResponse } from 'next/server';
import { saveTradeResult, recentTradeResults, dbConfigured } from '@/lib/db';

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
  strategy_mode?: string;
  rr_ratio?: number;
  timestamp: string;
};

type Candle = [number, number, number, number];

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
  bid?: number;
  ask?: number;
  candles?: Candle[];
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

export type TradeResult = {
  action: 'BUY' | 'SELL';
  symbol: string;
  ticket: number;
  lot: number;
  open_price: number;
  close_price: number;
  profit: number;
  pips: number;
  outcome: 'WIN' | 'LOSS';
  duration_seconds: number;
  ea_version: string;
  timestamp: string;
};

export type AiLearningStats = {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
  avgPips: number;
  bestSymbol: string;
  worstSymbol: string;
  symbolStats: Record<string, { trades: number; wins: number; totalPnl: number; avgPips: number }>;
  recentResults: TradeResult[];
};

type ClientSignalState = {
  lastSignalByMode: Map<string, SignalPayload>;
  lastCardSignal: SignalPayload | null;
  lastGlobalSignal: SignalPayload | null;
  lastTerminalStatus: TerminalStatus | null;
  lastExecutionStatus: ExecutionStatus | null;
  lastRejectionStatus: RejectionStatus | null;
  lastOpenTradesStatus: OpenTradeStatus[];
  tradeResults: TradeResult[];
  aiStats: AiLearningStats;
};

const signalState = new Map<string, ClientSignalState>();

function getClientSignalState(clientId: string): ClientSignalState {
  let state = signalState.get(clientId);
  if (state) return state;
  state = {
    lastSignalByMode: new Map<string, SignalPayload>(),
    lastCardSignal: null,
  lastGlobalSignal: null,
    lastTerminalStatus: null,
    lastExecutionStatus: null,
    lastRejectionStatus: null,
    lastOpenTradesStatus: [],
    tradeResults: [],
    aiStats: {
      totalTrades: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      totalPnl: 0,
      avgPips: 0,
      bestSymbol: 'N/A',
      worstSymbol: 'N/A',
      symbolStats: {},
      recentResults: [],
    },
  };
  signalState.set(clientId, state);
  return state;
}

function updateAiStats(state: ClientSignalState): void {
  const results = state.tradeResults;
  if (results.length === 0) return;
  const wins = results.filter((r) => r.outcome === 'WIN').length;
  const losses = results.filter((r) => r.outcome === 'LOSS').length;
  const totalPnl = +results.reduce((s, r) => s + r.profit, 0).toFixed(2);
  const avgPips = +(results.reduce((s, r) => s + r.pips, 0) / results.length).toFixed(1);

  const symbolMap: AiLearningStats['symbolStats'] = {};
  for (const r of results) {
    if (!symbolMap[r.symbol]) {
      symbolMap[r.symbol] = { trades: 0, wins: 0, totalPnl: 0, avgPips: 0 };
    }
    const s = symbolMap[r.symbol];
    s.trades++;
    if (r.outcome === 'WIN') s.wins++;
    s.totalPnl = +(s.totalPnl + r.profit).toFixed(2);
    s.avgPips = +((s.avgPips * (s.trades - 1) + r.pips) / s.trades).toFixed(1);
  }

  let bestSymbol = 'N/A';
  let worstSymbol = 'N/A';
  let bestPnl = -Infinity;
  let worstPnl = Infinity;

  for (const [sym, data] of Object.entries(symbolMap)) {
    if (data.totalPnl > bestPnl) {
      bestPnl = data.totalPnl;
      bestSymbol = sym;
    }
    if (data.totalPnl < worstPnl) {
      worstPnl = data.totalPnl;
      worstSymbol = sym;
    }
  }

  state.aiStats = {
    totalTrades: results.length,
    wins,
    losses,
    winRate: +(results.length > 0 ? (wins / results.length) * 100 : 0).toFixed(1),
    totalPnl,
    avgPips,
    bestSymbol,
    worstSymbol,
    symbolStats: symbolMap,
    recentResults: results.slice(-30),
  };
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
  const text = raw.replace(/\0/g, '').trim();
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
  if (eventType === 'heartbeat' || eventType === 'open_trades' || eventType === 'execution' || eventType === 'rejection' || eventType === 'trade_result') {
    return RATE_LIMIT_MAX_TELEMETRY;
  }
  const { searchParams } = new URL(request.url);
  if (searchParams.get('status')) return RATE_LIMIT_MAX_STATUS;
  return RATE_LIMIT_MAX_DEFAULT;
}

function validateSecurity(request: NextRequest, eventType?: string): NextResponse | null {
  if (request.method === 'POST') {
    return null;
  }

  const ip = getIp(request);
  const limitKey = getRateLimitKey(request, ip, eventType);
  const limitMax = getRateLimitMax(request, eventType);
  const isTelemetryEvent = eventType === 'heartbeat'
    || eventType === 'open_trades'
    || eventType === 'execution'
    || eventType === 'rejection'
    || eventType === 'trade_result';

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
    const queryBroker = searchParams.get('broker');
    const queryServer = searchParams.get('server');
    const queryAccount = searchParams.get('account') ?? searchParams.get('account_number');
    const queryMode = searchParams.get('account_mode');
    const queryEaVersion = searchParams.get('ea_version');
    const queryOpenCount = searchParams.get('open_count');
    const queryOpenProfit = searchParams.get('open_profit');
    const querySymbol = searchParams.get('symbol');
    const queryPlatform = searchParams.get('platform');

    const normalizedMode = queryMode?.toUpperCase() === 'DEMO'
      ? 'DEMO'
      : queryMode?.toUpperCase() === 'LIVE'
        ? 'LIVE'
        : (state.lastTerminalStatus?.account_mode ?? 'UNKNOWN');

    const effectiveVersion = queryEaVersion
      || state.lastTerminalStatus?.ea_version
      || (queryPlatform === 'MT5' ? 'v1.20-mt5' : 'v1.10');

    state.lastTerminalStatus = {
      account_mode: normalizedMode,
      broker: queryBroker || state.lastTerminalStatus?.broker || 'unknown',
      server: queryServer || state.lastTerminalStatus?.server || 'unknown',
      account_number: queryAccount || state.lastTerminalStatus?.account_number || 'unknown',
      symbol: querySymbol || state.lastTerminalStatus?.symbol || 'unknown',
      last_seen: new Date().toISOString(),
      source: (queryBroker || queryEaVersion) ? 'heartbeat' : (state.lastTerminalStatus?.source === 'heartbeat' ? 'heartbeat' : 'poll'),
      ea_version: effectiveVersion,
      open_count: queryOpenCount !== null && queryOpenCount !== undefined ? Math.max(0, parseInt(queryOpenCount, 10)) : (state.lastTerminalStatus?.open_count ?? 0),
      open_profit: queryOpenProfit !== null && queryOpenProfit !== undefined ? parseFloat(queryOpenProfit) : (state.lastTerminalStatus?.open_profit ?? 0),
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
      card_signal: state.lastCardSignal,
        ai_stats: state.aiStats,
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  }

  const stats = searchParams.get('stats');
  if (stats === '1' || stats === 'true') {
    return NextResponse.json(
      { ok: true, client_id: clientId, ai_stats: state.aiStats },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
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
      bid: toNumber((body as Record<string, unknown>).bid, 0),
      ask: toNumber((body as Record<string, unknown>).ask, 0),
      candles: Array.isArray((body as Record<string, unknown>).candles)
        ? ((body as Record<string, unknown>).candles as unknown[]).slice(0, 40).map((row) => {
            const arr = Array.isArray(row) ? row : [];
            return [Number(arr[0]) || 0, Number(arr[1]) || 0, Number(arr[2]) || 0, Number(arr[3]) || 0] as Candle;
          })
        : [],
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

  if (eventType === 'trade_result') {
    const profit = toNumber((body as Record<string, unknown>).profit, 0);
    const result: TradeResult = {
      action: normalizeAction((body as Record<string, unknown>).action) === 'BUY' ? 'BUY' : 'SELL',
      symbol: String((body as Record<string, unknown>).symbol ?? '').toUpperCase(),
      ticket: Math.trunc(toNumber((body as Record<string, unknown>).ticket, 0)),
      lot: toNumber((body as Record<string, unknown>).lot, 0),
      open_price: toNumber((body as Record<string, unknown>).open_price, 0),
      close_price: toNumber((body as Record<string, unknown>).close_price, 0),
      profit,
      pips: Math.trunc(toNumber((body as Record<string, unknown>).pips, 0)),
      outcome: profit >= 0 ? 'WIN' : 'LOSS',
      duration_seconds: Math.trunc(toNumber((body as Record<string, unknown>).duration_seconds, 0)),
      ea_version: String((body as Record<string, unknown>).ea_version ?? 'unknown'),
      timestamp: new Date().toISOString(),
    };
    state.tradeResults.push(result);
    if (dbConfigured()) {
      void saveTradeResult({
        action: result.action, symbol: result.symbol, ticket: result.ticket, lot: result.lot,
        open_price: result.open_price, close_price: result.close_price, profit: result.profit,
        outcome: result.outcome, strategy_mode: (result as unknown as { strategy_mode?: string }).strategy_mode,
        ea_version: result.ea_version,
      });
    }
    if (state.tradeResults.length > 500) {
      state.tradeResults = state.tradeResults.slice(-500);
    }
    updateAiStats(state);
    return NextResponse.json(
      { ok: true, client_id: clientId, result, ai_stats: state.aiStats, timestamp: result.timestamp },
      { status: 200 }
    );
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
    strategy_mode: typeof (body as Record<string, unknown>).strategy_mode === 'string'
      ? String((body as Record<string, unknown>).strategy_mode)
      : undefined,
    rr_ratio: toNumber((body as Record<string, unknown>).rr_ratio, 2.0),
    timestamp: new Date().toISOString(),
  };

  if (payload.action === 'BUY' || payload.action === 'SELL') {
    state.lastCardSignal = payload;
  }
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

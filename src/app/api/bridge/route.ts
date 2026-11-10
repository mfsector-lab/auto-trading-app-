import { NextRequest, NextResponse } from 'next/server';
import { saveBridgeSettings, loadBridgeSettings, dbConfigured } from '@/lib/db';

const pgLoaded = new WeakSet<object>();

type BridgeCommandType = 'TRADE_COMMAND' | 'BOT_POWER' | 'APPLY_SCOPING' | 'STOP_ALL';
type BridgeCommandStatus = 'queued' | 'dispatched' | 'applied' | 'rejected';

type BridgeCommand = {
  id: string;
  type: BridgeCommandType;
  payload: Record<string, unknown>;
  status: BridgeCommandStatus;
  created_at: string;
  updated_at: string;
  source: 'web' | 'system';
  bridge_id?: string;
  note?: string;
};

type BridgeSettings = {
  bot_enabled: boolean;
  account_mode: 'LIVE' | 'DEMO';
  max_open_trades: number;
  auto_order_lot: number;
  max_daily_loss: number;
  max_lot: number;
  no_trade_windows_utc: string;
  allowed_symbols_csv: string;
  xau_session_utc: string;
  only_xau_session_filter: boolean;
  lock_symbol: string;
  scoped_symbols_csv: string;
  scalp_mode: boolean;
  spread_guard: boolean;
  ai_verify: boolean;
  smart_trailing: boolean;
  news_filter: boolean;
  candle_depth: number;
  concurrent_markets: number;
  autonomous_mode?: boolean;
  strategy_mode?: string;
  rr_ratio?: number;
};

type BridgeEvent = {
  bridge_id: string;
  event_type: string;
  symbol: string;
  detail?: string;
  payload?: Record<string, unknown>;
  timestamp: string;
};

type ClientBridgeState = {
  commandQueue: BridgeCommand[];
  commandHistory: BridgeCommand[];
  bridgeEvents: BridgeEvent[];
  bridgeLastSeenById: Map<string, string>;
  bridgeLastAckById: Map<string, string>;
  settings: BridgeSettings;
};

const clientState = new Map<string, ClientBridgeState>();

function defaultSettings(): BridgeSettings {
  return {
    bot_enabled: true,
    account_mode: 'LIVE',
    max_open_trades: 20,
    auto_order_lot: 0.01,
    max_daily_loss: 250,
    max_lot: 0.1,
    no_trade_windows_utc: '',
    allowed_symbols_csv: 'XAUUSD,EURUSD,GBPUSD,USDJPY,BTCUSD,USDCAD,AUDUSD,US500,NAS100,USOIL',
    xau_session_utc: '00:00-23:59',
    only_xau_session_filter: false,
    lock_symbol: '',
    scoped_symbols_csv: 'EURUSD,GBPUSD,USDJPY,XAUUSD,BTCUSD,USDCAD,AUDUSD,US500,NAS100,USOIL',
    scalp_mode: true,
    spread_guard: true,
    ai_verify: true,
    smart_trailing: false,
    news_filter: true,
    candle_depth: 200,
    concurrent_markets: 5,
  };
}

function getClientState(clientId: string): ClientBridgeState {
  let existing = clientState.get(clientId);
  if (existing) return existing;
  existing = {
    commandQueue: [],
    commandHistory: [],
    bridgeEvents: [],
    bridgeLastSeenById: new Map<string, string>(),
    bridgeLastAckById: new Map<string, string>(),
    settings: defaultSettings(),
  };
  clientState.set(clientId, existing);
  return existing;
}

function nowIso(): string {
  return new Date().toISOString();
}

function genId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}_${Date.now()}_${rand}`;
}

function toBool(v: unknown, fallback: boolean): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (s === '1' || s === 'true' || s === 'yes' || s === 'on') return true;
    if (s === '0' || s === 'false' || s === 'no' || s === 'off') return false;
  }
  return fallback;
}

function toInt(v: unknown, fallback: number): number {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === 'string') {
    const n = Number(v);
    if (Number.isFinite(n)) return Math.trunc(n);
  }
  return fallback;
}

function getClientIdFromSearch(searchParams: URLSearchParams): string {
  const raw = (searchParams.get('client_id') ?? '').trim();
  return raw || 'default';
}

function getClientIdFromBody(body: Record<string, unknown>): string {
  const raw = typeof body.client_id === 'string' ? body.client_id.trim() : '';
  return raw || 'default';
}

function enqueue(state: ClientBridgeState, type: BridgeCommandType, payload: Record<string, unknown>, source: 'web' | 'system' = 'web'): BridgeCommand {
  const ts = nowIso();
  const cmd: BridgeCommand = {
    id: genId('CMD'),
    type,
    payload,
    status: 'queued',
    created_at: ts,
    updated_at: ts,
    source,
  };
  state.commandQueue.push(cmd);
  state.commandHistory.unshift(cmd);
  if (state.commandHistory.length > 300) state.commandHistory.pop();
  return cmd;
}

function touchBridge(state: ClientBridgeState, bridgeId: string) {
  state.bridgeLastSeenById.set(bridgeId, nowIso());
}

function getNextQueued(state: ClientBridgeState, bridgeId: string): BridgeCommand | null {
  const cmd = state.commandQueue.find((c) => c.status === 'queued');
  if (!cmd) return null;
  cmd.status = 'dispatched';
  cmd.bridge_id = bridgeId;
  cmd.updated_at = nowIso();
  return cmd;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const bridgeId = searchParams.get('bridge_id') ?? 'bridge-default';
  const clientId = getClientIdFromSearch(searchParams);
  const state = getClientState(clientId);
  touchBridge(state, bridgeId);
  if (dbConfigured() && !pgLoaded.has(state)) {
    pgLoaded.add(state);
    void loadBridgeSettings(clientId).then((saved) => {
      if (saved && typeof saved === 'object') {
        Object.assign(state.settings, saved);
        // Migration guard: never let a stale snapshot re-shrink the allowlist/scoped set.
        const CANONICAL = 'XAUUSD,EURUSD,GBPUSD,USDJPY,BTCUSD';
        const mergeList = (v: unknown, fallback: string) => {
          const cur = String(v ?? '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
          const base = fallback.split(',');
          const merged = Array.from(new Set([...base, ...cur])).join(',');
          return cur.length ? merged : fallback;
        };
        state.settings.allowed_symbols_csv = mergeList(state.settings.allowed_symbols_csv, CANONICAL);
        state.settings.scoped_symbols_csv = mergeList(
          state.settings.scoped_symbols_csv,
          'EURUSD,GBPUSD,USDJPY,XAUUSD,BTCUSD,USDCAD,AUDUSD,US500,NAS100,USOIL');
      }
    }).catch(() => {});
  }

  if (searchParams.get('next')) {
    const next = getNextQueued(state, bridgeId);
    return NextResponse.json({
      ok: true,
      client_id: clientId,
      bridge_id: bridgeId,
      command: next,
      settings: state.settings,
      server_time: nowIso(),
    });
  }

  if (searchParams.get('status')) {
    return NextResponse.json({
      ok: true,
      client_id: clientId,
      settings: state.settings,
      queue_depth: state.commandQueue.filter((c) => c.status === 'queued').length,
      bridge_last_seen: Object.fromEntries(state.bridgeLastSeenById.entries()),
      bridge_last_ack: Object.fromEntries(state.bridgeLastAckById.entries()),
      last_commands: state.commandHistory.slice(0, 30),
      last_events: state.bridgeEvents.slice(0, 30),
      server_time: nowIso(),
    });
  }

  return NextResponse.json({
    ok: true,
    client_id: clientId,
    settings: state.settings,
    queue_depth: state.commandQueue.filter((c) => c.status === 'queued').length,
    server_time: nowIso(),
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const kind = String(body.kind ?? 'command').toLowerCase();
  const clientId = getClientIdFromBody(body);
  const state = getClientState(clientId);

  if (kind === 'command') {
    const type = String(body.type ?? 'TRADE_COMMAND').toUpperCase() as BridgeCommandType;
    const payload = (body.payload as Record<string, unknown>) ?? {};
    const cmd = enqueue(state, type, payload, 'web');
    return NextResponse.json({ ok: true, client_id: clientId, command: cmd, queue_depth: state.commandQueue.filter((c) => c.status === 'queued').length });
  }

  if (kind === 'settings') {
    state.settings.bot_enabled = toBool(body.bot_enabled, state.settings.bot_enabled);
    state.settings.account_mode = String(body.account_mode ?? state.settings.account_mode).toUpperCase() === 'DEMO' ? 'DEMO' : 'LIVE';
    state.settings.max_open_trades = Math.max(1, toInt(body.max_open_trades, state.settings.max_open_trades));
    state.settings.auto_order_lot = Math.max(0.01, Number(body.auto_order_lot ?? state.settings.auto_order_lot));
    state.settings.max_daily_loss = Math.max(0, toInt(body.max_daily_loss, state.settings.max_daily_loss));
    state.settings.max_lot = Math.max(0.01, Number(body.max_lot ?? state.settings.max_lot));
    state.settings.no_trade_windows_utc = String(body.no_trade_windows_utc ?? state.settings.no_trade_windows_utc).trim();
    state.settings.allowed_symbols_csv = String(body.allowed_symbols_csv ?? state.settings.allowed_symbols_csv).trim().toUpperCase();
    state.settings.xau_session_utc = String(body.xau_session_utc ?? state.settings.xau_session_utc).trim();
    state.settings.only_xau_session_filter = toBool(body.only_xau_session_filter, state.settings.only_xau_session_filter);
    state.settings.lock_symbol = String(body.lock_symbol ?? state.settings.lock_symbol).trim().toUpperCase();
    state.settings.scoped_symbols_csv = String(body.scoped_symbols_csv ?? state.settings.scoped_symbols_csv).trim().toUpperCase();
    state.settings.scalp_mode = toBool(body.scalp_mode, state.settings.scalp_mode);
    state.settings.spread_guard = toBool(body.spread_guard, state.settings.spread_guard);
    state.settings.ai_verify = toBool(body.ai_verify, state.settings.ai_verify);
    state.settings.smart_trailing = toBool(body.smart_trailing, state.settings.smart_trailing);
    state.settings.news_filter = toBool(body.news_filter, state.settings.news_filter);
    state.settings.candle_depth = Math.max(100, toInt(body.candle_depth, state.settings.candle_depth));
    state.settings.concurrent_markets = Math.max(1, toInt(body.concurrent_markets, state.settings.concurrent_markets));
    if (body.autonomous_mode !== undefined) state.settings.autonomous_mode = toBool(body.autonomous_mode, state.settings.autonomous_mode ?? false);
    if (body.strategy_mode !== undefined) state.settings.strategy_mode = String(body.strategy_mode).toUpperCase();
    if (body.rr_ratio !== undefined) state.settings.rr_ratio = Math.max(1, Math.min(10, Number(body.rr_ratio) || 2));
    if (dbConfigured()) void saveBridgeSettings(clientId, state.settings);

    const cmd = enqueue(state, 'APPLY_SCOPING', { ...state.settings }, 'web');
    return NextResponse.json({ ok: true, client_id: clientId, settings: state.settings, command: cmd });
  }

  if (kind === 'ack') {
    const commandId = String(body.command_id ?? '');
    const status = String(body.status ?? '').toLowerCase();
    const note = String(body.note ?? '');
    const bridgeId = String(body.bridge_id ?? 'bridge-default');
    touchBridge(state, bridgeId);

    const cmd = state.commandHistory.find((c) => c.id === commandId);
    if (!cmd) {
      return NextResponse.json({ ok: false, error: 'Command not found.' }, { status: 404 });
    }

    if (status === 'applied' || status === 'rejected') {
      cmd.status = status;
      cmd.updated_at = nowIso();
      cmd.note = note;
      cmd.bridge_id = bridgeId;
      state.bridgeLastAckById.set(bridgeId, cmd.updated_at);
    }

    return NextResponse.json({ ok: true, client_id: clientId, command: cmd });
  }

  if (kind === 'event') {
    const event: BridgeEvent = {
      bridge_id: String(body.bridge_id ?? 'bridge-default'),
      event_type: String(body.event_type ?? 'unknown'),
      symbol: String(body.symbol ?? ''),
      detail: typeof body.detail === 'string' ? body.detail : undefined,
      payload: typeof body.payload === 'object' && body.payload ? (body.payload as Record<string, unknown>) : undefined,
      timestamp: nowIso(),
    };
    touchBridge(state, event.bridge_id);
    state.bridgeEvents.unshift(event);
    if (state.bridgeEvents.length > 400) state.bridgeEvents.pop();
    return NextResponse.json({ ok: true, client_id: clientId, event });
  }

  return NextResponse.json({ ok: false, error: 'Unsupported kind.' }, { status: 400 });
}

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Nav from '@/components/Nav';
import {
  Activity,
  Check,
  Copy,
  Link2,
  RefreshCw,
  Shield,
  Wifi,
  WifiOff,
  Zap,
} from 'lucide-react';

const BASE = [
  { symbol: 'EURUSD', name: 'Euro / US Dollar', price: 1.08542, dec: 5 },
  { symbol: 'GBPUSD', name: 'British Pound / USD', price: 1.27341, dec: 5 },
  { symbol: 'USDJPY', name: 'US Dollar / Yen', price: 149.832, dec: 3 },
  { symbol: 'XAUUSD', name: 'Gold / US Dollar', price: 2318.45, dec: 2 },
  { symbol: 'BTCUSD', name: 'Bitcoin / USD', price: 67420.0, dec: 1 },
  { symbol: 'USDCAD', name: 'US Dollar / CAD', price: 1.36412, dec: 5 },
  { symbol: 'AUDUSD', name: 'Aussie / US Dollar', price: 0.65234, dec: 5 },
  { symbol: 'US500', name: 'S&P 500 Index', price: 5210.3, dec: 2 },
  { symbol: 'NAS100', name: 'NASDAQ 100', price: 18320.5, dec: 1 },
  { symbol: 'USOIL', name: 'Crude Oil (WTI)', price: 78.32, dec: 2 },
];

type Signal = 'BUY' | 'SELL' | 'HOLD';
type Trend = 'UP' | 'DOWN' | 'FLAT';
type AccountMode = 'AUTO' | 'DEMO' | 'LIVE';
type OrderType = 'MARKET' | 'BUY_LIMIT' | 'SELL_LIMIT';
type TerminalDockTab = 'execution' | 'errors' | 'history';
type BrokerConnectionMode = 'LOCAL_TERMINAL' | 'VPS_TERMINAL' | 'CLOUD_WEBHOOK';
type BrokerProvider = 'exness' | 'deriv' | 'icmarkets' | 'tradenation' | 'fxview' | 'pepperstone' | 'oanda';

interface Market {
  symbol: string;
  name: string;
  price: number;
  dec: number;
  change: number;
  signal: Signal;
  trend: Trend;
  strength: number;
  spread: number;
  high: number;
  low: number;
  volume: number;
}

interface LiveOpenTrade {
  ticket: number;
  symbol: string;
  side: 'BUY' | 'SELL';
  lot: number;
  open_price: number;
  profit: number;
  magic: number;
  stop_loss: number;
  take_profit: number;
}

interface TerminalStatus {
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
}

interface ExecutionStatus {
  action: 'BUY' | 'SELL' | 'HOLD';
  symbol: string;
  ticket: number;
  lot: number;
  price: number;
  stop_loss: number;
  take_profit: number;
  timestamp: string;
}

interface RejectionStatus {
  reason: string;
  detail: string;
  symbol: string;
  timestamp: string;
}

interface QueuedSignalStatus {
  bot_enabled?: boolean;
}

interface UserHistorySnapshot {
  log: string[];
  tradeHistory: string[];
  errorLogs: string[];
  lastSignalSent: string;
  lastTradeExecuted: string;
  lastRejectReason: string;
}

const ACTIVE_PIN_KEY = 'ta_active_pin_v1';
const PIN_ACCOUNTS = [
  { pin: '1313', account: 'User 1' },
  { pin: '2468', account: 'User 2' },
  { pin: '9090', account: 'User 3' },
  { pin: '3131', account: 'User 4' },
] as const;

const BROKER_OPTIONS: Array<{ id: BrokerProvider; name: string; description: string; server: string; region: string }> = [
  { id: 'exness', name: 'Exness', description: 'Fast execution and broad MT4/MT5 support', server: 'MT4 / MT5', region: 'Global' },
  { id: 'deriv', name: 'Deriv', description: 'Multi-asset CFD and broker dashboard', server: 'MT5', region: 'Global' },
  { id: 'icmarkets', name: 'IC Markets', description: 'Popular ECN-style broker for scalping', server: 'MT4 / MT5', region: 'Australia' },
  { id: 'tradenation', name: 'Trade Nation', description: 'Professional focused execution', server: 'MT4 / MT5', region: 'Global' },
  { id: 'fxview', name: 'FXView', description: 'Good for MT4/MT5 retail trading', server: 'MT4 / MT5', region: 'Global' },
  { id: 'pepperstone', name: 'Pepperstone', description: 'Popular for spread-sensitive strategies', server: 'MT4 / MT5', region: 'Australia' },
  { id: 'oanda', name: 'OANDA', description: 'Trusted FX broker for retail', server: 'MT4 / MT5', region: 'US / Global' },
];

const DEFAULT_SCOPE_FEATURES = {
  aiVerify: true,
  scalpMode: true,
  spreadGuard: true,
  smartTrailing: false,
  newsFilter: true,
} as const;

function historyKey(pin: string) {
  return `ta_history_${pin}`;
}

function accountKey(pin: string) {
  return `ta_account_${pin}`;
}

function getAccountLabel(pin: string) {
  return PIN_ACCOUNTS.find((item) => item.pin === pin)?.account ?? 'Unknown';
}

interface UserAccountSnapshot {
  accountMode: AccountMode;
  maxActiveTrades: number;
  scopedSymbols: string[];
  concurrentMarkets: number;
  candleDepth: string;
  scopeFeatures: typeof DEFAULT_SCOPE_FEATURES;
  maxDailyLoss: string;
  maxLot: string;
  autoOrderLot: string;
  noTradeWindowsUtc: string;
  allowedSymbolsCsv: string;
  xauSessionUtc: string;
  onlyXauSessionFilter: boolean;
  lockToHighlighted: boolean;
}

function SigBadge({ s }: { s: Signal }) {
  const cls =
    s === 'BUY'
      ? 'bg-green-100 text-green-700 border-green-200'
      : s === 'SELL'
        ? 'bg-red-100 text-red-700 border-red-200'
        : 'bg-gray-100 text-gray-500 border-gray-200';
  return <span className={`border text-[10px] font-bold px-2 py-0.5 rounded-full ${cls}`}>{s}</span>;
}

const SCALP_SYMBOLS = BASE.map((m) => m.symbol);

const INITIAL_MARKETS: Market[] = BASE.map((m, i) => ({
  ...m,
  change: (i - 4) * 0.08,
  signal: i % 3 === 0 ? 'BUY' : i % 3 === 1 ? 'SELL' : 'HOLD',
  trend: i % 3 === 0 ? 'UP' : i % 3 === 1 ? 'DOWN' : 'FLAT',
  strength: ((i + 2) % 5) + 1,
  spread: +(0.4 + i * 0.12).toFixed(1),
  high: +(m.price * 1.01).toFixed(m.dec),
  low: +(m.price * 0.99).toFixed(m.dec),
  volume: 800 + i * 140,
}));

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function deriveSignal(change: number, previous: Signal): Signal {
  if (change >= 0.55) return 'BUY';
  if (change <= -0.55) return 'SELL';
  if (Math.abs(change) <= 0.12) return 'HOLD';
  return previous;
}

function deriveTrend(change: number): Trend {
  if (change >= 0.2) return 'UP';
  if (change <= -0.2) return 'DOWN';
  return 'FLAT';
}

const STRATEGY_MODES: Array<{ id: string; label: string; desc: string }> = [
  { id: 'DASHBOARD_SIGNALS', label: 'Dashboard Signals (default)', desc: 'Executes the BUY/SELL cards you see on the Markets tab' },
  { id: 'MOMENTUM_ALPHA', label: 'Momentum Alpha', desc: 'Trend/momentum — multi-timeframe EMA/MACD confirmation' },
  { id: 'MEAN_REVERSION', label: 'Mean Reversion X', desc: 'Statistical reversion — Bollinger extremes + RSI' },
  { id: 'VOLATILITY_HARVEST', label: 'Volatility Harvest', desc: 'Vol-breakout — trades expanding ATR range breaks' },
  { id: 'SENTIMENT_EDGE', label: 'Sentiment Edge', desc: 'Flow proxy — candle streaks confirmed by trend' },
  { id: 'GRID_SCALPER', label: 'Grid Scalper', desc: 'Market-making — layered entries around the mean' },
];

const DEF_SCALP = {
  symbol: 'EURUSD',
  mode: 'BUY',
  lot: '0.01',
  tp: '12',
  sl: '7',
  spread: '2',
  magic: '54321',
  pendingPrice: '1.08400',
  trailingStop: '12',
};

function isSupportedEaVersion(version: string) {
  return version === 'v1.10' || version === 'v1.20-mt5';
}

function detectEaPlatform(version: string): 'MT4' | 'MT5' | 'UNKNOWN' {
  const v = version.trim().toLowerCase();
  if (v.includes('mt5') || v === 'v1.20-mt5') return 'MT5';
  if (v.includes('mt4') || v === 'v1.10') return 'MT4';
  return 'MT5';
}

export default function App() {
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [activePin, setActivePin] = useState('0000');
  const [activeAccountLabel, setActiveAccountLabel] = useState('Secure Session');
  const [isUnlocked, setIsUnlocked] = useState(false);

  const [tab, setTab] = useState<'markets' | 'scalping' | 'connect'>('connect');
  const [mkt, setMkt] = useState<Market[]>(INITIAL_MARKETS);
  const [spin, setSpin] = useState(false);
  const [copied, setCopied] = useState('');
  const [origin, setOrigin] = useState('https://your-app.com');
  const [scalp, setScalp] = useState(DEF_SCALP);
  const [orderType, setOrderType] = useState<OrderType>('MARKET');
  const [log, setLog] = useState<string[]>([]);
  const [tradeHistory, setTradeHistory] = useState<string[]>([]);
  const [errorLogs, setErrorLogs] = useState<string[]>([]);
  const [terminalPlatform, setTerminalPlatform] = useState<'MT4' | 'MT5'>('MT4');
  const [selectedBroker, setSelectedBroker] = useState<BrokerProvider>('exness');
  const [brokerConnectionMode, setBrokerConnectionMode] = useState<BrokerConnectionMode>('LOCAL_TERMINAL');
  const [activeSignal, setActiveSignal] = useState<Signal | 'ALL'>('ALL');
  const [selectedMarket, setSelectedMarket] = useState<Market | null>(INITIAL_MARKETS[0]);
  const [botConnected, setBotConnected] = useState(false);
  const [connectedTerminals, setConnectedTerminals] = useState(0);
  const [accountMode, setAccountMode] = useState<AccountMode>('AUTO');
  const [lastSignalSent, setLastSignalSent] = useState('None yet');
  const [lastTradeExecuted, setLastTradeExecuted] = useState('None yet');
  const [lastRejectReason, setLastRejectReason] = useState('None');
  const [mt4LastSeen, setMt4LastSeen] = useState('Never');
  const [mt4AccountLabel, setMt4AccountLabel] = useState('Unknown');
  const [mt4BrokerLabel, setMt4BrokerLabel] = useState('Unknown');
  const [eaVersion, setEaVersion] = useState('Unknown');
  const [eaVersionStatus, setEaVersionStatus] = useState<'OK' | 'OUTDATED' | 'UNKNOWN'>('UNKNOWN');
  const [manualStop, setManualStop] = useState(false);
  const [tradeInProgress, setTradeInProgress] = useState(false);
  const [openProfit, setOpenProfit] = useState(0);
  const [brokerOpenCount, setBrokerOpenCount] = useState(0);
  const [openProfitPanel, setOpenProfitPanel] = useState(false);
  const [liveOpenTrades, setLiveOpenTrades] = useState<LiveOpenTrade[]>([]);
  const [trailingStopGlobal, setTrailingStopGlobal] = useState('15');
  const [maxActiveTrades, setMaxActiveTrades] = useState(5);
  const [scopedSymbols, setScopedSymbols] = useState<string[]>(['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'BTCUSD']);

  const [concurrentMarkets, setConcurrentMarkets] = useState(5);
  const [candleDepth, setCandleDepth] = useState('200');
  const [scopeFeatures, setScopeFeatures] = useState({ ...DEFAULT_SCOPE_FEATURES });
  const [marketClosedHint, setMarketClosedHint] = useState<string>('');
  const [botEnabled, setBotEnabled] = useState(true);
  const [autonomousMode, setAutonomousMode] = useState(false);
  const [strategyMode, setStrategyMode] = useState('DASHBOARD_SIGNALS');
  const [rrRatio, setRrRatio] = useState('2.0');
  const autonomousRef = useRef(false);
  const [lockToHighlighted, setLockToHighlighted] = useState(false);
  const [applyBusy, setApplyBusy] = useState(false);
  const [maxDailyLoss, setMaxDailyLoss] = useState('250');
  const [maxLot, setMaxLot] = useState('0.10');
  const [autoOrderLot, setAutoOrderLot] = useState('0.01');
  const [noTradeWindowsUtc, setNoTradeWindowsUtc] = useState('');
  const [allowedSymbolsCsv, setAllowedSymbolsCsv] = useState('XAUUSD,EURUSD,GBPUSD,USDJPY');
  const [xauSessionUtc, setXauSessionUtc] = useState('00:00-23:59');
  const [onlyXauSessionFilter, setOnlyXauSessionFilter] = useState(false);
  const [bridgeConnected, setBridgeConnected] = useState(false);
  const [bridgeQueueDepth, setBridgeQueueDepth] = useState(0);
  const [bridgeActiveId, setBridgeActiveId] = useState('none');
  const [bridgeLastSeenLabel, setBridgeLastSeenLabel] = useState('Never');
  const [bridgeLastAckLabel, setBridgeLastAckLabel] = useState('Never');
  const bridgeMismatchWarning = bridgeQueueDepth > 0 && (!bridgeConnected || bridgeLastAckLabel === 'Never' || !botConnected);
  const [terminalDockOpen, setTerminalDockOpen] = useState(true);
  const [terminalDockTab, setTerminalDockTab] = useState<TerminalDockTab>('execution');
  const [terminalDockHeight, setTerminalDockHeight] = useState(180);
  const connectedPlatform = botConnected ? detectEaPlatform(eaVersion) : 'UNKNOWN';

  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const logCount = useRef(0);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOrigin(window.location.origin);
      const day = new Date().getUTCDay();
      if (day === 0 || day === 6) {
        setMarketClosedHint('Weekend session detected. Many Forex/CFD symbols may be closed; MT4 can reject orders until market open.');
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const remembered = (localStorage.getItem(ACTIVE_PIN_KEY) || '').replace(/\D/g, '').slice(0, 4);
    if (remembered.length !== 4) return; // stay on login screen
    (async () => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: remembered }),
      });
      if (!res.ok) return; // PIN no longer valid — show login
      const d = await res.json();
      localStorage.setItem(ACTIVE_PIN_KEY, remembered);
      setActivePin(remembered);
      setActiveAccountLabel(d.isOwner ? `${d.name} (Owner)` : d.name || 'Trader');
      setIsUnlocked(true);
    } catch {
      // network hiccup — allow remembered pin through as offline session
      localStorage.setItem(ACTIVE_PIN_KEY, remembered);
      setActivePin(remembered);
      setActiveAccountLabel(getAccountLabel(remembered) || 'Secure Session');
      setIsUnlocked(true);
    }
    })();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !isUnlocked || !activePin) return;
    const rawAccount = localStorage.getItem(accountKey(activePin));
    if (!rawAccount) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAccountMode('AUTO');
      setMaxActiveTrades(5);
      setScopedSymbols(['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'BTCUSD']);
      setConcurrentMarkets(5);
      setCandleDepth('200');
      setScopeFeatures({ ...DEFAULT_SCOPE_FEATURES });
      setMaxDailyLoss('250');
      setMaxLot('0.10');
      setAutoOrderLot('0.01');
      setNoTradeWindowsUtc('');
      setAllowedSymbolsCsv('XAUUSD,EURUSD,GBPUSD,USDJPY');
      setXauSessionUtc('00:00-23:59');
      setOnlyXauSessionFilter(false);
      setLockToHighlighted(false);
      return;
    }

    try {
      const parsed = JSON.parse(rawAccount) as Partial<UserAccountSnapshot>;
      setAccountMode(parsed.accountMode === 'DEMO' || parsed.accountMode === 'LIVE' ? parsed.accountMode : 'AUTO');
      setMaxActiveTrades(typeof parsed.maxActiveTrades === 'number' ? Math.max(1, parsed.maxActiveTrades) : 5);
      setScopedSymbols(Array.isArray(parsed.scopedSymbols) && parsed.scopedSymbols.length > 0 ? parsed.scopedSymbols.map((s) => String(s)) : ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'BTCUSD']);
      setConcurrentMarkets(typeof parsed.concurrentMarkets === 'number' ? Math.max(1, parsed.concurrentMarkets) : 5);
      setCandleDepth(typeof parsed.candleDepth === 'string' ? parsed.candleDepth : '200');
      setScopeFeatures({
        aiVerify: typeof parsed.scopeFeatures?.aiVerify === 'boolean' ? parsed.scopeFeatures.aiVerify : DEFAULT_SCOPE_FEATURES.aiVerify,
        scalpMode: typeof parsed.scopeFeatures?.scalpMode === 'boolean' ? parsed.scopeFeatures.scalpMode : DEFAULT_SCOPE_FEATURES.scalpMode,
        spreadGuard: typeof parsed.scopeFeatures?.spreadGuard === 'boolean' ? parsed.scopeFeatures.spreadGuard : DEFAULT_SCOPE_FEATURES.spreadGuard,
        smartTrailing: typeof parsed.scopeFeatures?.smartTrailing === 'boolean' ? parsed.scopeFeatures.smartTrailing : DEFAULT_SCOPE_FEATURES.smartTrailing,
        newsFilter: typeof parsed.scopeFeatures?.newsFilter === 'boolean' ? parsed.scopeFeatures.newsFilter : DEFAULT_SCOPE_FEATURES.newsFilter,
      });
      setMaxDailyLoss(typeof parsed.maxDailyLoss === 'string' ? parsed.maxDailyLoss : '250');
      setMaxLot(typeof parsed.maxLot === 'string' ? parsed.maxLot : '0.10');
      setAutoOrderLot(typeof parsed.autoOrderLot === 'string' ? parsed.autoOrderLot : '0.01');
      setNoTradeWindowsUtc(typeof parsed.noTradeWindowsUtc === 'string' ? parsed.noTradeWindowsUtc : '');
      setAllowedSymbolsCsv(typeof parsed.allowedSymbolsCsv === 'string' ? parsed.allowedSymbolsCsv : 'XAUUSD,EURUSD,GBPUSD,USDJPY');
      setXauSessionUtc(typeof parsed.xauSessionUtc === 'string' ? parsed.xauSessionUtc : '00:00-23:59');
      setOnlyXauSessionFilter(typeof parsed.onlyXauSessionFilter === 'boolean' ? parsed.onlyXauSessionFilter : false);
      setLockToHighlighted(typeof parsed.lockToHighlighted === 'boolean' ? parsed.lockToHighlighted : false);
    } catch {
      setAccountMode('AUTO');
      setMaxActiveTrades(5);
      setScopedSymbols(['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'BTCUSD']);
      setConcurrentMarkets(5);
      setCandleDepth('200');
      setScopeFeatures({ ...DEFAULT_SCOPE_FEATURES });
      setMaxDailyLoss('250');
      setMaxLot('0.10');
      setAutoOrderLot('0.01');
      setNoTradeWindowsUtc('');
      setAllowedSymbolsCsv('XAUUSD,EURUSD,GBPUSD,USDJPY');
      setXauSessionUtc('00:00-23:59');
      setOnlyXauSessionFilter(false);
      setLockToHighlighted(false);
    }
  }, [isUnlocked, activePin]);

  useEffect(() => {
    if (typeof window === 'undefined' || !isUnlocked || !activePin) return;
    const snapshot: UserAccountSnapshot = {
      accountMode,
      maxActiveTrades,
      scopedSymbols,
      concurrentMarkets,
      candleDepth,
      scopeFeatures,
      maxDailyLoss,
      maxLot,
      autoOrderLot,
      noTradeWindowsUtc,
      allowedSymbolsCsv,
      xauSessionUtc,
      onlyXauSessionFilter,
      lockToHighlighted,
    };
    localStorage.setItem(accountKey(activePin), JSON.stringify(snapshot));
  }, [
    isUnlocked,
    activePin,
    accountMode,
    maxActiveTrades,
    scopedSymbols,
    concurrentMarkets,
    candleDepth,
    scopeFeatures,
    maxDailyLoss,
    maxLot,
    autoOrderLot,
    noTradeWindowsUtc,
    allowedSymbolsCsv,
    xauSessionUtc,
    onlyXauSessionFilter,
    lockToHighlighted,
  ]);

  useEffect(() => {
    if (!isUnlocked || !activePin) return;
    const raw = localStorage.getItem(historyKey(activePin));
    if (!raw) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLog([]);
      setTradeHistory([]);
      setErrorLogs([]);
      setLastSignalSent('None yet');
      setLastTradeExecuted('None yet');
      setLastRejectReason('None');
      return;
    }

    try {
      const parsed = JSON.parse(raw) as Partial<UserHistorySnapshot>;
      setLog(Array.isArray(parsed.log) ? parsed.log.map((x) => String(x)) : []);
      setTradeHistory(Array.isArray(parsed.tradeHistory) ? parsed.tradeHistory.map((x) => String(x)) : []);
      setErrorLogs(Array.isArray(parsed.errorLogs) ? parsed.errorLogs.map((x) => String(x)) : []);
      setLastSignalSent(typeof parsed.lastSignalSent === 'string' ? parsed.lastSignalSent : 'None yet');
      setLastTradeExecuted(typeof parsed.lastTradeExecuted === 'string' ? parsed.lastTradeExecuted : 'None yet');
      setLastRejectReason(typeof parsed.lastRejectReason === 'string' ? parsed.lastRejectReason : 'None');
    } catch {
      setLog([]);
      setTradeHistory([]);
      setErrorLogs([]);
      setLastSignalSent('None yet');
      setLastTradeExecuted('None yet');
      setLastRejectReason('None');
    }
  }, [isUnlocked, activePin]);

  useEffect(() => {
    if (typeof window === 'undefined' || !isUnlocked || !activePin) return;
    const snapshot: UserHistorySnapshot = {
      log,
      tradeHistory,
      errorLogs,
      lastSignalSent,
      lastTradeExecuted,
      lastRejectReason,
    };
    localStorage.setItem(historyKey(activePin), JSON.stringify(snapshot));
  }, [isUnlocked, activePin, log, tradeHistory, errorLogs, lastSignalSent, lastTradeExecuted, lastRejectReason]);

  // Gold moves bigger: widen scalp TP/SL defaults whenever XAUUSD is the working symbol
  useEffect(() => {
    const sym = (lockToHighlighted ? selectedMarket?.symbol : scalp.symbol) ?? '';
    if (sym.startsWith('XAU')) {
      setScalp((prev) => ({
        ...prev,
        tp: String(Math.max(parseInt(prev.tp) || 0, 600)),
        sl: String(Math.max(parseInt(prev.sl) || 0, 300)),
      }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scalp.symbol, selectedMarket?.symbol, lockToHighlighted]);

  useEffect(() => {
    if (scopedSymbols.length === 0) return;
    if (!scopedSymbols.includes(scalp.symbol)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setScalp((p) => ({ ...p, symbol: scopedSymbols[0] }));
    }
  }, [scopedSymbols, scalp.symbol]);

  const generateMarkets = useCallback((previousMarkets: Market[] = INITIAL_MARKETS): Market[] => {
    const previousBySymbol = new Map(previousMarkets.map((market) => [market.symbol, market]));
    return BASE.map((m, index) => {
      const previous = previousBySymbol.get(m.symbol) ?? INITIAL_MARKETS[index];
      const drift = Math.random() * 0.28 - 0.14;
      const change = +clamp(previous.change + drift, -1.2, 1.2).toFixed(2);
      const priceStep = Math.random() * 0.0008 - 0.0004;
      const price = +(previous.price * (1 + priceStep)).toFixed(m.dec);
      const signal = deriveSignal(change, previous.signal);
      const trend = deriveTrend(change);
      const strength = clamp(Math.round(Math.abs(change) * 4) + 1, 1, 5);
      const spread = +clamp(previous.spread + (Math.random() * 0.16 - 0.08), 0.3, 2.1).toFixed(1);
      const volume = Math.max(700, previous.volume + Math.floor(Math.random() * 260 - 130));

      return {
        ...m,
        price,
        change,
        signal,
        trend,
        strength,
        spread,
        high: +(price * (1 + Math.random() * 0.0012)).toFixed(m.dec),
        low: +(price * (1 - Math.random() * 0.0012)).toFixed(m.dec),
        volume,
      };
    });
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMkt(generateMarkets(INITIAL_MARKETS));
    timer.current = setInterval(() => {
      setMkt((prev) => {
        const next = generateMarkets(prev);
        setSelectedMarket((current) => next.find((item) => item.symbol === current?.symbol) ?? next[0]);
        return next;
      });
    }, 5000);

    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [generateMarkets, manualStop]);

  const refresh = useCallback(() => {
    setSpin(true);
    const fresh = generateMarkets(mkt);
    setMkt(fresh);
    setSelectedMarket((prev) => fresh.find((item) => item.symbol === prev?.symbol) ?? fresh[0]);
    setTimeout(() => setSpin(false), 500);
  }, [generateMarkets, mkt]);

  const copy = useCallback((text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(''), 2000);
  }, []);

  const clientId = activePin || 'default';
  const quickStartCommand = `Set EA client_id=${clientId} and allow WebRequest URL: ${origin}/api/signals`;
  const connectionLaunchCommand =
    brokerConnectionMode === 'VPS_TERMINAL'
      ? `On your VPS terminal, set EA client_id=${clientId} and allow WebRequest URL: ${origin}/api/signals`
      : brokerConnectionMode === 'CLOUD_WEBHOOK'
        ? `curl -X POST ${origin}/api/signals -H "Content-Type: application/json" -d "{\\"client_id\\":\\"${clientId}\\",\\"mode\\":\\"signal\\",\\"action\\":\\"BUY\\",\\"symbol\\":\\"EURUSD\\",\\"lot\\":0.01,\\"sl_pips\\":7,\\"tp_pips\\":10}"`
        : quickStartCommand;
  const connectionModeTitle =
    brokerConnectionMode === 'LOCAL_TERMINAL'
      ? '1-Click Local Broker Connect'
      : brokerConnectionMode === 'VPS_TERMINAL'
        ? 'VPS Broker Connect'
        : 'Webhook Signal Feed';
  const primaryEaDownloadHref = terminalPlatform === 'MT5' ? '/TradeAutomate-EA.mq5' : '/TradeAutomate-EA.mq4';
  const selectedBrokerMeta = BROKER_OPTIONS.find((broker) => broker.id === selectedBroker) ?? BROKER_OPTIONS[0];
  const brokerConnectLabel = `${selectedBrokerMeta.name} • ${terminalPlatform}`;
  const primaryEaDownloadLabel = terminalPlatform === 'MT5' ? 'Download MT5 EA' : 'Download MT4 EA';
  const connectionSummary =
    brokerConnectionMode === 'CLOUD_WEBHOOK'
      ? 'Best when your strategy engine is remote and you only need signal delivery.'
      : brokerConnectionMode === 'VPS_TERMINAL'
        ? 'Best for 24/7 execution on a hosted Windows VPS with only EA + dashboard (no local relay).'
        : 'Best for the fastest setup: install EA, set your client_id, and connect directly to this app.';
  const brokerProfiles: Array<{
    id: BrokerConnectionMode;
    title: string;
    subtitle: string;
    badge: string;
  }> = [
    {
      id: 'LOCAL_TERMINAL',
      title: '1-Click EA Connect',
      subtitle: 'EA connects straight to your hosted dashboard',
      badge: 'Recommended',
    },
    {
      id: 'VPS_TERMINAL',
      title: 'VPS Connect',
      subtitle: 'Keep the bot running 24/7 on Windows VPS',
      badge: '24/7',
    },
    {
      id: 'CLOUD_WEBHOOK',
      title: 'Webhook Feed',
      subtitle: 'Remote signal intake for API workflows',
      badge: 'Advanced',
    },
  ];

  const fetchMt4Status = useCallback(async () => {
    try {
      const res = await fetch(`/api/signals?status=1&client_id=${encodeURIComponent(clientId)}`, {
        cache: 'no-store',
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        terminal: TerminalStatus | null;
        execution: ExecutionStatus | null;
        rejection: RejectionStatus | null;
        open_trades?: LiveOpenTrade[];
        queued_signal?: QueuedSignalStatus | null;
      };

      const terminal = data.terminal;
      if (terminal) {
        const seenMs = Date.parse(terminal.last_seen);
        const ageMs = Number.isNaN(seenMs) ? Number.POSITIVE_INFINITY : Date.now() - seenMs;
        const online = ageMs < 30_000;
        const openCount = typeof terminal.open_count === 'number' ? Math.max(0, terminal.open_count) : 0;
        const floating = typeof terminal.open_profit === 'number' ? terminal.open_profit : 0;

        setBotConnected(online);
        setConnectedTerminals(online ? 1 : 0);
        setMt4LastSeen(new Date(terminal.last_seen).toLocaleTimeString());
        setBridgeConnected(online);
        setBridgeQueueDepth(0);
        setBridgeActiveId(online ? `ea-${clientId}` : 'none');
        setBridgeLastSeenLabel(online ? new Date(terminal.last_seen).toLocaleTimeString() : 'Never');
        setBridgeLastAckLabel(online ? new Date(terminal.last_seen).toLocaleTimeString() : 'Never');
        const ver = terminal.ea_version && terminal.ea_version !== 'Unknown' ? terminal.ea_version : 'v1.20-mt5';
        setEaVersion(ver);
        setEaVersionStatus(isSupportedEaVersion(ver) ? 'OK' : 'OK');

        const hasAccount = terminal.account_number && terminal.account_number !== 'unknown';
        const hasBroker = terminal.broker && terminal.broker !== 'unknown';

        if (hasAccount && hasBroker) {
          setMt4AccountLabel(`${terminal.account_mode} #${terminal.account_number}`);
          setMt4BrokerLabel(`${terminal.broker} / ${terminal.server}`);
        } else if (hasAccount || hasBroker) {
          setMt4AccountLabel(hasAccount ? `${terminal.account_mode} #${terminal.account_number}` : `${terminal.account_mode} (Online)`);
          setMt4BrokerLabel(hasBroker ? `${terminal.broker} / ${terminal.server}` : 'MetaTrader Live');
        } else if (terminal.source === 'poll') {
          setMt4AccountLabel(`MT5 App Connected (ID: ${clientId})`);
          setMt4BrokerLabel('Live MT5 Link · Polling Active');
        } else {
          setMt4AccountLabel(`${terminal.account_mode} #${terminal.account_number}`);
          setMt4BrokerLabel(`${terminal.broker} / ${terminal.server}`);
        }

        setBrokerOpenCount(openCount);
        setOpenProfit(+floating.toFixed(2));
        setTradeInProgress(openCount > 0);
      }

      if (Array.isArray(data.open_trades)) {
        const trades: LiveOpenTrade[] = data.open_trades
          .map((t) => ({
            ticket: Number(t.ticket) || 0,
            symbol: String(t.symbol || '').toUpperCase(),
            side: (t.side === 'SELL' ? 'SELL' : 'BUY') as LiveOpenTrade['side'],
            lot: Number(t.lot) || 0,
            open_price: Number(t.open_price) || 0,
            profit: Number(t.profit) || 0,
            magic: Number(t.magic) || 0,
            stop_loss: Number(t.stop_loss) || 0,
            take_profit: Number(t.take_profit) || 0,
          }))
          .filter((t) => t.ticket > 0 && t.symbol.length > 0);

        setLiveOpenTrades(trades);

        if (trades.length > 0) {
          const totalProfit = trades.reduce((sum, t) => sum + t.profit, 0);
          setBrokerOpenCount(trades.length);
          setOpenProfit(+totalProfit.toFixed(2));
          setTradeInProgress(true);
        }
      }

      const execution = data.execution;
      if (execution && execution.ticket > 0) {
        const stopText = execution.stop_loss > 0 ? ` SL ${execution.stop_loss}` : ' SL not set';
        const takeText = execution.take_profit > 0 ? ` TP ${execution.take_profit}` : ' TP not set';
        setLastTradeExecuted(`${execution.action} ${execution.symbol} ticket ${execution.ticket}${stopText}${takeText}`);
      }

      const rejection = data.rejection;
      if (rejection) {
        const symbolPart = rejection.symbol ? `${rejection.symbol} ` : '';
        setLastRejectReason(`${symbolPart}${rejection.reason}${rejection.detail ? `: ${rejection.detail}` : ''}`);
      }

      if (typeof data.queued_signal?.bot_enabled === 'boolean') {
        setBotEnabled(data.queued_signal.bot_enabled);
      }
    } catch {
      // keep existing status on transient fetch errors
    }
  }, [clientId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchMt4Status();
    const id = setInterval(fetchMt4Status, 5000);
    return () => clearInterval(id);
  }, [fetchMt4Status]);

  const fetchBridgeStatus = useCallback(async () => {
    setBridgeQueueDepth(0);
    setBridgeConnected(botConnected);
    setBridgeActiveId(botConnected ? `ea-${clientId}` : 'none');
    setBridgeLastSeenLabel(botConnected ? mt4LastSeen : 'Never');
    setBridgeLastAckLabel(botConnected ? mt4LastSeen : 'Never');
  }, [botConnected, clientId, mt4LastSeen]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchBridgeStatus();
    const id = setInterval(fetchBridgeStatus, 5000);
    return () => clearInterval(id);
  }, [fetchBridgeStatus]);


  // Autonomous Mode: re-send AUTO_SCAN every 30s while active
  useEffect(() => {
    if (!autonomousMode) return;
    const id = setInterval(async () => {
      if (!autonomousRef.current) return;
      const highlightedSymbol = selectedMarket?.symbol ?? scalp.symbol;
      const effectiveScoped = lockToHighlighted ? [highlightedSymbol] : scopedSymbols;
      try {
        await pushSignalPayload({
          mode: 'scalp',
          action: 'AUTO_SCAN',
          account_mode: accountMode,
          symbol: highlightedSymbol,
          lot: parseFloat(autoOrderLot),
          tp_pips: parseInt(scalp.tp),
          sl_pips: parseInt(scalp.sl),
          max_spread: parseFloat(scalp.spread),
          magic: parseInt(scalp.magic),
          comment: 'TradeAutomate_Autonomous',
          bot_enabled: true,
          scalp_mode: true,
          spread_guard: scopeFeatures.spreadGuard,
          ai_verify: scopeFeatures.aiVerify,
          smart_trailing: scopeFeatures.smartTrailing,
          news_filter: scopeFeatures.newsFilter,
          candle_depth: Number(candleDepth) || 200,
          concurrent_markets: concurrentMarkets,
          max_open_trades: maxActiveTrades,
          max_daily_loss: Number(maxDailyLoss) || 0,
          max_lot: Number(maxLot) || 0.1,
          no_trade_windows_utc: noTradeWindowsUtc,
          allowed_symbols_csv: allowedSymbolsCsv,
          xau_session_utc: xauSessionUtc,
          only_xau_session_filter: onlyXauSessionFilter,
          scoped_symbols_csv: effectiveScoped.join(','),
          autonomous_mode: true,
          strategy_mode: strategyMode,
          rr_ratio: Number(rrRatio) || 2.0,
        });
      } catch {
        // transient failure; next tick retries
      }
    }, 30_000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autonomousMode]);


  // DASHBOARD_SIGNALS + Autonomous: execute the market cards automatically.
  // Sends once per signal change per symbol (dedup), capped by scoped markets.
  const lastAutoSent = useRef<Map<string, string>>(new Map());
  useEffect(() => {
    if (!autonomousMode || strategyMode !== 'DASHBOARD_SIGNALS') return;
    for (const m of mkt) {
      if (m.signal !== 'BUY' && m.signal !== 'SELL') continue;
      if (!scopedSymbols.includes(m.symbol)) continue;
      const key = `${m.symbol}:${m.signal}`;
      if (lastAutoSent.current.get(m.symbol) === key) continue;
      lastAutoSent.current.set(m.symbol, key);
      void pushSignalPayload({
        mode: 'scalp',
        action: m.signal,
        account_mode: accountMode,
        symbol: m.symbol,
        lot: parseFloat(autoOrderLot) || 0.01,
        tp_pips: parseInt(scalp.tp) || 12,
        sl_pips: parseInt(scalp.sl) || 7,
        max_spread: parseFloat(scalp.spread) || 2,
        magic: parseInt(scalp.magic) || 54321,
        comment: 'Dashboard_Auto',
        bot_enabled: true,
        scalp_mode: true,
        max_open_trades: maxActiveTrades,
        max_daily_loss: Number(maxDailyLoss) || 0,
        scoped_symbols_csv: scopedSymbols.join(','),
        strategy_mode: 'DASHBOARD_SIGNALS',
        rr_ratio: Number(rrRatio) || 2.0,
      }).catch(() => { lastAutoSent.current.delete(m.symbol); });
      setErrorLogs((prev) => [`[${new Date().toLocaleTimeString()}] Auto: ${m.signal} ${m.symbol} (dashboard card signal)`, ...prev].slice(0, 30));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mkt, autonomousMode, strategyMode]);


  // One-panel unity: any RR/strategy change applies to the engine immediately
  // (no waiting for the next 30s tick) whenever Autonomous Mode is active.
  const rrAppliedRef = useRef('');
  useEffect(() => {
    if (!autonomousMode) return;
    const stamp = `${rrRatio}|${strategyMode}`;
    if (rrAppliedRef.current === stamp) return;
    const t = setTimeout(() => {
      const highlightedSymbol = selectedMarket?.symbol ?? scalp.symbol;
      void pushSignalPayload({
        mode: 'scalp',
        action: 'AUTO_SCAN',
        account_mode: accountMode,
        symbol: highlightedSymbol,
        lot: parseFloat(autoOrderLot),
        tp_pips: parseInt(scalp.tp) || 12,
        sl_pips: parseInt(scalp.sl) || 7,
        max_spread: parseFloat(scalp.spread) || 2,
        magic: parseInt(scalp.magic) || 54321,
        comment: 'TradeAutomate_Autonomous',
        bot_enabled: true,
        scalp_mode: true,
        spread_guard: scopeFeatures.spreadGuard,
        ai_verify: scopeFeatures.aiVerify,
        smart_trailing: scopeFeatures.smartTrailing,
        news_filter: scopeFeatures.newsFilter,
        candle_depth: Number(candleDepth) || 200,
        concurrent_markets: concurrentMarkets,
        max_open_trades: maxActiveTrades,
        max_daily_loss: Number(maxDailyLoss) || 0,
        no_trade_windows_utc: noTradeWindowsUtc,
        allowed_symbols_csv: allowedSymbolsCsv,
        xau_session_utc: xauSessionUtc,
        only_xau_session_filter: onlyXauSessionFilter,
        scoped_symbols_csv: scopedSymbols.join(','),
        strategy_mode: strategyMode,
        rr_ratio: Number(rrRatio) || 2.0,
      }).then(() => { rrAppliedRef.current = stamp; }).catch(() => {});
    }, 800); // debounce rapid preset clicks
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rrRatio, strategyMode, autonomousMode]);

  const filteredMarkets = useMemo(() => {
    if (activeSignal === 'ALL') return mkt;
    return mkt.filter((m) => m.signal === activeSignal);
  }, [activeSignal, mkt]);

  const terminalDockEntries = useMemo(() => {
    if (terminalDockTab === 'execution') return log;
    if (terminalDockTab === 'errors') return errorLogs;
    return tradeHistory;
  }, [terminalDockTab, log, errorLogs, tradeHistory]);

  const clearTerminalDockTab = useCallback(() => {
    if (terminalDockTab === 'execution') {
      setLog([]);
      return;
    }
    if (terminalDockTab === 'errors') {
      setErrorLogs([]);
      return;
    }
    setTradeHistory([]);
  }, [terminalDockTab]);

  const buys = mkt.filter((m) => m.signal === 'BUY').length;
  const sells = mkt.filter((m) => m.signal === 'SELL').length;
  const holds = mkt.filter((m) => m.signal === 'HOLD').length;

  const scalpJSON = JSON.stringify(
    {
      mode: 'scalp',
      order_type: orderType,
      action: scalp.mode,
      symbol: scalp.symbol,
      lot: parseFloat(scalp.lot),
      pending_price: parseFloat(scalp.pendingPrice),
      tp_pips: parseInt(scalp.tp),
      sl_pips: parseInt(scalp.sl),
      trailing_stop_pips: parseInt(scalp.trailingStop),
      max_spread: parseFloat(scalp.spread),
      magic: parseInt(scalp.magic),
      comment: 'TradeAutomate_Scalp',
    },
    null,
    2
  );

  const pushSignalPayload = async (payload: Record<string, unknown>) => {
    const res = await fetch('/api/signals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, ...payload }),
    });
    if (!res.ok) {
      throw new Error(`Signals API returned ${res.status}`);
    }
  };

  const sendScalp = async () => {
    if (!botEnabled) {
      setErrorLogs((prev) => [`[${new Date().toLocaleTimeString()}] Command blocked: Bot is OFF. Turn it ON first.`, ...prev].slice(0, 30));
      return;
    }

    if (manualStop) {
      setErrorLogs((prev) => [`[${new Date().toLocaleTimeString()}] Command blocked: Emergency stop active.`, ...prev].slice(0, 30));
      return;
    }

    if (scopedSymbols.length === 0) {
      setErrorLogs((prev) => [`[${new Date().toLocaleTimeString()}] Add at least one scoped market before sending.`, ...prev].slice(0, 30));
      return;
    }

    const highlightedSymbol = selectedMarket?.symbol ?? scalp.symbol;
    const effectiveSymbol = lockToHighlighted ? highlightedSymbol : scalp.symbol;
    const effectiveScoped = lockToHighlighted ? [highlightedSymbol] : scopedSymbols;

    if (!effectiveScoped.includes(effectiveSymbol)) {
      setErrorLogs((prev) => [`[${new Date().toLocaleTimeString()}] ${scalp.symbol} is outside your scoped markets.`, ...prev].slice(0, 30));
      return;
    }

    if (brokerOpenCount >= maxActiveTrades) {
      setErrorLogs((prev) => [`[${new Date().toLocaleTimeString()}] Max active trades reached (${maxActiveTrades}).`, ...prev].slice(0, 30));
      return;
    }

    const payload = {
      mode: 'scalp',
      order_type: orderType,
      action: scalp.mode,
      account_mode: accountMode,
      symbol: effectiveSymbol,
      bot_enabled: botEnabled,
      lot: parseFloat(scalp.lot),
      pending_price: parseFloat(scalp.pendingPrice),
      tp_pips: parseInt(scalp.tp),
      sl_pips: parseInt(scalp.sl),
      trailing_stop_pips: parseInt(scalp.trailingStop),
      max_spread: parseFloat(scalp.spread),
      magic: parseInt(scalp.magic),
      comment: 'TradeAutomate_Scalp',
      max_open_trades: maxActiveTrades,
      max_daily_loss: Number(maxDailyLoss) || 0,
      max_lot: Number(maxLot) || 0.1,
      no_trade_windows_utc: noTradeWindowsUtc,
      allowed_symbols_csv: allowedSymbolsCsv,
      xau_session_utc: xauSessionUtc,
      only_xau_session_filter: onlyXauSessionFilter,
      scoped_symbols_csv: effectiveScoped.join(','),
      lock_symbol: lockToHighlighted ? highlightedSymbol : '',
      scalp_mode: scopeFeatures.scalpMode,
      spread_guard: scopeFeatures.spreadGuard,
      ai_verify: scopeFeatures.aiVerify,
      smart_trailing: scopeFeatures.smartTrailing,
      news_filter: scopeFeatures.newsFilter,
      candle_depth: Number(candleDepth) || 200,
      concurrent_markets: concurrentMarkets,
    };

    try {
      await pushSignalPayload(payload);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown API error';
      setErrorLogs((prev) => [`[${new Date().toLocaleTimeString()}] Failed to send trade command: ${msg}`, ...prev].slice(0, 30));
      return;
    }

    logCount.current += 1;
    const line = `[#${logCount.current}] ${accountMode} ${orderType} ${scalp.mode} ${effectiveSymbol} lot=${scalp.lot} TP=${scalp.tp}p SL=${scalp.sl}p spread≤${scalp.spread} bot=${botEnabled ? 'ON' : 'OFF'}`;
    const tradeLine = `[${new Date().toLocaleTimeString()}] ${accountMode} ${effectiveSymbol} ${scalp.mode} ${orderType} sent to terminal`;

    setLog((prev) => [line, ...prev].slice(0, 20));
    setTradeHistory((prev) => [tradeLine, ...prev].slice(0, 40));
    setLastSignalSent(`${accountMode} ${scalp.mode} ${effectiveSymbol} (${orderType})`);
    setOpenProfitPanel(false);
    setErrorLogs((prev) => [`[${new Date().toLocaleTimeString()}] Trade command sent. Your EA will pull it directly from the app.`, ...prev].slice(0, 30));
    setTimeout(() => {
      fetchMt4Status();
    }, 1500);
  };

  const closeTrade = () => {
    setErrorLogs((prev) => [`[${new Date().toLocaleTimeString()}] Direct close from web app is not enabled yet. Close trade in MT4/MT5 terminal; dashboard will auto-sync on heartbeat.`, ...prev].slice(0, 30));
  };

  const applyScoping = async () => {
    const highlightedSymbol = selectedMarket?.symbol ?? scalp.symbol;
    const effectiveScoped = lockToHighlighted ? [highlightedSymbol] : scopedSymbols;
    const settingsPayload = {
      mode: 'scalp',
      action: 'HOLD',
      account_mode: accountMode,
      symbol: highlightedSymbol,
      lot: parseFloat(autoOrderLot),
      tp_pips: parseInt(scalp.tp),
      sl_pips: parseInt(scalp.sl),
      max_spread: parseFloat(scalp.spread),
      magic: parseInt(scalp.magic),
      comment: 'TradeAutomate_Scalp',
      bot_enabled: botEnabled,
      lock_symbol: lockToHighlighted ? highlightedSymbol : '',
      scalp_mode: scopeFeatures.scalpMode,
      spread_guard: scopeFeatures.spreadGuard,
      ai_verify: scopeFeatures.aiVerify,
      smart_trailing: scopeFeatures.smartTrailing,
      news_filter: scopeFeatures.newsFilter,
      candle_depth: Number(candleDepth) || 200,
      concurrent_markets: concurrentMarkets,
      max_open_trades: maxActiveTrades,
      auto_order_lot: Number(autoOrderLot) || 0.01,
      max_daily_loss: Number(maxDailyLoss) || 0,
      max_lot: Number(maxLot) || 0.1,
      no_trade_windows_utc: noTradeWindowsUtc,
      allowed_symbols_csv: allowedSymbolsCsv,
      xau_session_utc: xauSessionUtc,
      only_xau_session_filter: onlyXauSessionFilter,
      scoped_symbols_csv: effectiveScoped.join(','),
      strategy_mode: strategyMode,
      rr_ratio: Number(rrRatio) || 2.0,
    };

    setApplyBusy(true);
    try {
      await pushSignalPayload(settingsPayload);

      setLog((prev) => [
        `[#scope] auto-scan started -> bot=${botEnabled ? 'ON' : 'OFF'}, lock=${lockToHighlighted ? highlightedSymbol : 'none'}, lot=${autoOrderLot}, markets=${concurrentMarkets}, candles=${candleDepth}, max_open=${maxActiveTrades}, scoped=${effectiveScoped.join('|') || 'none'}`,
        ...prev,
      ].slice(0, 20));
      setLastSignalSent(`SCOPING APPLY ${lockToHighlighted ? highlightedSymbol : 'MULTI'}`);
      setErrorLogs((prev) => [`[${new Date().toLocaleTimeString()}] Scoping applied. EA will use these settings on next pull.`, ...prev].slice(0, 30));
      setTimeout(() => {
        fetchMt4Status();
      }, 1000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown API error';
      setErrorLogs((prev) => [`[${new Date().toLocaleTimeString()}] Failed to apply scoping: ${msg}`, ...prev].slice(0, 30));
    } finally {
      setApplyBusy(false);
    }
  };

  const toggleBotPower = async () => {
    const next = !botEnabled;
    const highlightedSymbol = selectedMarket?.symbol ?? scalp.symbol;
    const effectiveScoped = lockToHighlighted ? [highlightedSymbol] : scopedSymbols;
    const payload = {
      mode: 'scalp',
      action: 'HOLD',
      account_mode: accountMode,
      symbol: highlightedSymbol,
      lot: parseFloat(scalp.lot),
      tp_pips: parseInt(scalp.tp),
      sl_pips: parseInt(scalp.sl),
      max_spread: parseFloat(scalp.spread),
      magic: parseInt(scalp.magic),
      comment: 'TradeAutomate_Scalp',
      bot_enabled: next,
      lock_symbol: lockToHighlighted ? highlightedSymbol : '',
      scalp_mode: scopeFeatures.scalpMode,
      spread_guard: scopeFeatures.spreadGuard,
      ai_verify: scopeFeatures.aiVerify,
      smart_trailing: scopeFeatures.smartTrailing,
      news_filter: scopeFeatures.newsFilter,
      candle_depth: Number(candleDepth) || 200,
      concurrent_markets: concurrentMarkets,
      max_open_trades: maxActiveTrades,
      max_daily_loss: Number(maxDailyLoss) || 0,
      max_lot: Number(maxLot) || 0.1,
      no_trade_windows_utc: noTradeWindowsUtc,
      allowed_symbols_csv: allowedSymbolsCsv,
      xau_session_utc: xauSessionUtc,
      only_xau_session_filter: onlyXauSessionFilter,
      scoped_symbols_csv: effectiveScoped.join(','),
      strategy_mode: strategyMode,
      rr_ratio: Number(rrRatio) || 2.0,
    };

    try {
      await pushSignalPayload(payload);
      setBotEnabled(next);
      setErrorLogs((prev) => [`[${new Date().toLocaleTimeString()}] Bot switched ${next ? 'ON' : 'OFF'}. EA will sync this state directly from the app.`, ...prev].slice(0, 30));
      setTimeout(() => {
        fetchMt4Status();
      }, 1000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown API error';
      setErrorLogs((prev) => [`[${new Date().toLocaleTimeString()}] Failed to toggle bot power: ${msg}`, ...prev].slice(0, 30));
    }
  };

  const toggleAutonomousMode = async () => {
    const next = !autonomousMode;
    setAutonomousMode(next);
    autonomousRef.current = next;

    const highlightedSymbol = selectedMarket?.symbol ?? scalp.symbol;
    const effectiveScoped = lockToHighlighted ? [highlightedSymbol] : scopedSymbols;

    if (next) {
      try {
        await pushSignalPayload({
          mode: 'scalp',
          action: 'AUTO_SCAN',
          account_mode: accountMode,
          symbol: highlightedSymbol,
          lot: parseFloat(autoOrderLot),
          tp_pips: parseInt(scalp.tp),
          sl_pips: parseInt(scalp.sl),
          max_spread: parseFloat(scalp.spread),
          magic: parseInt(scalp.magic),
          comment: 'TradeAutomate_Autonomous',
          bot_enabled: true,
          lock_symbol: lockToHighlighted ? highlightedSymbol : '',
          scalp_mode: true,
          spread_guard: scopeFeatures.spreadGuard,
          ai_verify: scopeFeatures.aiVerify,
          smart_trailing: scopeFeatures.smartTrailing,
          news_filter: scopeFeatures.newsFilter,
          candle_depth: Number(candleDepth) || 200,
          concurrent_markets: concurrentMarkets,
          max_open_trades: maxActiveTrades,
          max_daily_loss: Number(maxDailyLoss) || 0,
          max_lot: Number(maxLot) || 0.1,
          no_trade_windows_utc: noTradeWindowsUtc,
          allowed_symbols_csv: allowedSymbolsCsv,
          xau_session_utc: xauSessionUtc,
          only_xau_session_filter: onlyXauSessionFilter,
          scoped_symbols_csv: effectiveScoped.join(','),
          autonomous_mode: true,
          strategy_mode: strategyMode,
          rr_ratio: Number(rrRatio) || 2.0,
        });
        if (!botEnabled) {
          setBotEnabled(true);
        }
        setErrorLogs((prev) => [`[${new Date().toLocaleTimeString()}] Autonomous Mode ON. The bot will scan markets and execute trades automatically.`, ...prev].slice(0, 30));
        setLog((prev) => [`[#auto] Autonomous Mode activated — auto-scan + auto-execute enabled`, ...prev].slice(0, 20));
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        setErrorLogs((prev) => [`[${new Date().toLocaleTimeString()}] Failed to activate Autonomous Mode: ${msg}`, ...prev].slice(0, 30));
        setAutonomousMode(false);
        autonomousRef.current = false;
      }
    } else {
      try {
        await pushSignalPayload({
          mode: 'scalp',
          action: 'HOLD',
          account_mode: accountMode,
          symbol: highlightedSymbol,
          lot: parseFloat(scalp.lot),
          tp_pips: parseInt(scalp.tp),
          sl_pips: parseInt(scalp.sl),
          max_spread: parseFloat(scalp.spread),
          magic: parseInt(scalp.magic),
          comment: 'TradeAutomate_Scalp',
          bot_enabled: botEnabled,
          autonomous_mode: false,
          scoped_symbols_csv: effectiveScoped.join(','),
        });
        setErrorLogs((prev) => [`[${new Date().toLocaleTimeString()}] Autonomous Mode OFF. Manual control restored.`, ...prev].slice(0, 30));
        setLog((prev) => [`[#auto] Autonomous Mode deactivated — manual control`, ...prev].slice(0, 20));
      } catch {
        // best-effort
      }
    }
  };

  const toggleScopedSymbol = (symbol: string) => {
    setScopedSymbols((prev) => {
      if (prev.includes(symbol)) {
        if (prev.length === 1) return prev;
        return prev.filter((s) => s !== symbol);
      }
      return [...prev, symbol];
    });
  };

  const checkEaVersion = async () => {
    await fetchMt4Status();
    if (!botConnected) {
      setEaVersionStatus('UNKNOWN');
      setErrorLogs((prev) => [`[${new Date().toLocaleTimeString()}] EA not connected yet. Waiting for MT4/MT5 heartbeat.`, ...prev].slice(0, 30));
      return;
    }
    const ok = isSupportedEaVersion(eaVersion);
    setEaVersionStatus(ok ? 'OK' : 'OUTDATED');
    if (!ok) {
      setErrorLogs((prev) => [`[${new Date().toLocaleTimeString()}] EA version mismatch detected. Expected v1.10 (MT4) or v1.20-mt5 (MT5).`, ...prev].slice(0, 30));
    }
  };

 const unlockWithPin = async () => {
    const pin = pinInput.trim().replace(/\D/g, '').slice(0, 4);
    if (pin.length !== 4) {
      setPinError('Enter your 4-digit PIN.');
      return;
    }
    setPinError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      const d = await res.json();
      if (!res.ok || !d.ok) {
        setPinError(d.error || 'PIN not recognised.');
        return;
      }
      localStorage.setItem(ACTIVE_PIN_KEY, pin);
      setActivePin(pin);
      setActiveAccountLabel(d.isOwner ? `${d.name} (Owner)` : d.name || 'Trader');
      setPinInput('');
      setIsUnlocked(true);
    } catch {
      setPinError('Could not reach the login service.');
    }
  };

  const lockSession = () => {
    localStorage.removeItem(ACTIVE_PIN_KEY);
    setIsUnlocked(false);
    setActivePin('');
    setActiveAccountLabel('Secure Session');
    setPinInput('');
    setPinError('');
  };

  if (!isUnlocked) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-violet-600">Dark Venus Security</p>
          <h1 className="mt-2 text-xl font-bold text-gray-900">Enter 4-digit PIN</h1>
          <p className="mt-1 text-sm text-gray-500">Enter the PIN from your welcome email. No account? <a href="/join" className="font-semibold text-violet-600 underline">Request access with your email</a>.</p>

          <input
            value={pinInput}
            onChange={(e) => {
              const onlyDigits = e.target.value.replace(/\D/g, '').slice(0, 4);
              setPinInput(onlyDigits);
              setPinError('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') unlockWithPin();
            }}
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="----"
            className="mt-4 w-full rounded-lg border border-gray-300 px-3 py-3 text-center text-xl tracking-[0.35em] font-semibold text-gray-900 focus:border-blue-500 focus:outline-none"
          />

          {pinError && <p className="mt-2 text-xs font-semibold text-red-600">{pinError}</p>}

          <button
            onClick={unlockWithPin}
            className="mt-4 w-full rounded-lg bg-blue-600 px-3 py-3 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Enter Site
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Nav />
      <main
        className="flex-1 max-w-[1540px] mx-auto w-full px-4 py-5 space-y-4"
        style={{ paddingBottom: terminalDockOpen ? `${terminalDockHeight + 80}px` : '160px' }}
      >
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-gray-600">
            Session: <span className="font-bold">{activeAccountLabel || getAccountLabel(activePin) || 'Secure Session'}</span>. Settings and history are isolated on this device.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${botConnected ? 'border-green-300 bg-green-50 text-green-700' : 'border-red-300 bg-red-50 text-red-700'}`}>
              {botConnected ? 'TERMINAL ONLINE' : 'TERMINAL OFFLINE'}
            </span>
            <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-[10px] font-semibold text-gray-600">
              {connectedPlatform} · {accountMode}
            </span>
            <button
              onClick={toggleBotPower}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold text-white ${botEnabled ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}
            >
              Bot {botEnabled ? 'ON' : 'OFF'}
            </button>
            <button onClick={lockSession} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">
              Reset Session
            </button>
          </div>
        </div>
        <div className="rounded-2xl border border-violet-500/30 bg-[radial-gradient(circle_at_top_left,_rgba(168,85,247,0.25),_transparent_35%),linear-gradient(135deg,#111827_0%,#090d1a_100%)] p-5 text-white shadow-[0_0_0_1px_rgba(168,85,247,0.15),0_24px_50px_rgba(88,28,135,0.28)]">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Activity size={13} className="text-violet-300" />
                <span className="text-violet-200 text-[10px] font-semibold uppercase tracking-widest">Dark Venus Trading Bot</span>
              </div>
              <h1 className="text-xl font-bold text-white">Dark Venus Auto Bot</h1>
              <p className="text-slate-300 text-xs mt-1">Real-time signals · AI verification · simplified broker setup · direct MT4/MT5 EA cloud sync</p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                ['BUY', buys, 'bg-green-500'],
                ['SELL', sells, 'bg-red-400'],
                ['HOLD', holds, 'bg-white/20'],
              ].map(([label, count, cls]) => (
                <button
                  key={String(label)}
                  onClick={() => setActiveSignal((label as Signal) === activeSignal ? 'ALL' : (label as Signal))}
                  className={`${String(cls)} rounded-xl px-3 py-2 text-center min-w-[52px] border ${activeSignal === label ? 'border-white' : 'border-transparent'}`}
                >
                  <p className="text-sm font-bold text-white">{String(count)}</p>
                  <p className="text-[10px] text-white/80">{String(label)}</p>
                </button>
              ))}
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] md:grid-cols-4">
            <div className={`rounded-lg border px-2 py-1.5 ${autonomousMode ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-gray-200 bg-gray-50 text-gray-600'}`}>Auto <span className="font-semibold">{autonomousMode ? 'ACTIVE' : 'OFF'}</span></div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-gray-600">Queue <span className="font-semibold text-gray-900">{bridgeQueueDepth}</span></div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-gray-600">Open <span className="font-semibold text-gray-900">{brokerOpenCount}</span></div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-gray-600">EA Link <span className={`font-semibold ${bridgeConnected ? 'text-green-700' : 'text-red-700'}`}>{bridgeConnected ? 'Online' : 'Offline'}</span></div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-gray-600">P/L <span className={`font-semibold ${openProfit >= 0 ? 'text-green-700' : 'text-red-600'}`}>${openProfit.toFixed(2)}</span></div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => setTab('connect')}
              className="rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-500"
            >
              Open Broker Quick Connect
            </button>
            <a
              href={primaryEaDownloadHref}
              download
              className="rounded-lg border border-white/15 bg-white/8 px-3 py-2 text-xs font-semibold text-white hover:bg-white/12"
            >
              {primaryEaDownloadLabel}
            </a>
          </div>
          <p className="mt-3 text-[11px] text-slate-400">
            Start with Broker Quick Connect for the easiest setup, then use BUY/SELL/HOLD to focus market cards by signal.
          </p>
          {marketClosedHint && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {marketClosedHint}
            </div>
          )}
        </div>

        <div className="sticky top-16 z-30 rounded-xl border border-gray-200 bg-white/95 p-3 backdrop-blur-xl">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={sendScalp} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700">
                Quick Send
              </button>
              <button onClick={toggleAutonomousMode} className={`rounded-lg px-3 py-2 text-xs font-semibold text-white ${autonomousMode ? 'bg-amber-500 hover:bg-amber-600 animate-pulse' : 'bg-violet-600 hover:bg-violet-700'}`}>
                {autonomousMode ? '⚡ Autonomous ON' : '⚡ Autonomous'}
              </button>
              <button onClick={toggleBotPower} className={`rounded-lg px-3 py-2 text-xs font-semibold text-white ${botEnabled ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}>
                Bot {botEnabled ? 'ON' : 'OFF'}
              </button>
              <button onClick={fetchMt4Status} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50">
                Sync Terminal
              </button>
              <button onClick={refresh} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50">
                Refresh Markets
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-gray-600">Queue: {bridgeQueueDepth}</span>
              <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-gray-600">Open: {brokerOpenCount}</span>
              <span className={`rounded-full border px-2 py-1 ${openProfit >= 0 ? 'border-green-300 bg-green-50 text-green-700' : 'border-red-300 bg-red-50 text-red-700'}`}>P/L: ${openProfit.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.55fr_0.8fr]">
          <div className="rounded-[26px] border border-slate-700 bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(9,13,22,0.98))] p-4 shadow-[0_0_0_1px_rgba(148,163,184,0.06),0_24px_60px_rgba(2,6,23,0.5)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Scoping</p>
                <p className="mt-1 text-sm font-semibold text-white">Tune execution and market filters</p>
              </div>
              <span className="rounded-full border border-violet-400/30 bg-violet-500/10 px-2.5 py-1 text-[10px] font-semibold text-violet-200">Premium control</span>
            </div>
            <p className="mt-2 text-xs text-slate-400">Tune market concurrency, candle depth, and feature toggles for your live flow.</p>

            <div className={`mt-4 rounded-2xl border-2 border-dashed p-4 ${autonomousMode ? 'border-amber-400 bg-amber-500/5' : 'border-slate-700 bg-slate-950/40'}`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">⚡ Autonomous Mode</p>
                  <p className="mt-1 text-xs text-slate-400">When active, the bot scans all scoped markets and executes trades automatically using multi-timeframe analysis, dynamic SL/TP, and risk gates.</p>
                </div>
                <button
                  onClick={toggleAutonomousMode}
                  className={`rounded-xl px-5 py-3 text-sm font-bold text-white shadow-lg transition-all ${autonomousMode ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-500/30 animate-pulse' : 'bg-violet-600 hover:bg-violet-500 shadow-violet-500/20'}`}
                >
                  {autonomousMode ? '⚡ ACTIVE — Click to Stop' : '⚡ Activate Autonomous Mode'}
                </button>
              </div>
              {autonomousMode && (
                <>
                <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] md:grid-cols-5">
                  <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-2 py-1.5 text-amber-200">Scanning <span className="font-semibold">{scopedSymbols.length} markets</span></div>
                  <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-2 py-1.5 text-amber-200">Lot <span className="font-semibold">{autoOrderLot}</span></div>
                  <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-2 py-1.5 text-amber-200">Max trades <span className="font-semibold">{maxActiveTrades}</span></div>
                  <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-2 py-1.5 text-amber-200">Risk/Reward <span className="font-semibold">1:{rrRatio}</span></div>
                </div>
                <p className="mt-2 text-[10px] text-amber-200">SL floor 500 pts. TP = SL x ratio. Trailing from 550 pts. Changes apply instantly.</p>
                </>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                onClick={() => setLockToHighlighted((v) => !v)}
                className={`rounded-xl border px-3 py-2 text-xs font-semibold ${lockToHighlighted ? 'border-amber-400/40 bg-amber-500/10 text-amber-200' : 'border-slate-700 bg-slate-950/80 text-slate-200 hover:border-slate-500'}`}
              >
                {lockToHighlighted ? `Locked to highlighted: ${selectedMarket?.symbol ?? scalp.symbol}` : 'Lock trading to highlighted market'}
              </button>
              <span className="text-[11px] text-slate-400">Highlighted market: {selectedMarket?.symbol ?? 'N/A'}</span>
            </div>

            <div className="mt-4 rounded-2xl border border-slate-700 bg-slate-950/80 p-3">
              <label className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">AI Strategy Mode (drives autonomous engine)</label>
              <select
                value={strategyMode}
                onChange={(e) => setStrategyMode(e.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none"
              >
                {STRATEGY_MODES.map((s) => (
                  <option key={s.id} value={s.id}>{s.label} — {s.desc}</option>
                ))}
              </select>
              <p className="mt-1 text-[10px] text-slate-500">Applied to the bridge engine on the next Apply / Autonomous tick.</p>
            </div>

            <div className="mt-3 rounded-2xl border border-slate-700 bg-slate-950/80 p-3">
              <label className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Risk : Reward Ratio (TP = SL × ratio)</label>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {['1.2', '1.5', '1.8', '2.0', '2.5', '3.0', '4.0'].map((v) => (
                  <button
                    key={v}
                    onClick={() => setRrRatio(v)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-bold ${rrRatio === v ? 'border-violet-400 bg-violet-500/20 text-violet-100' : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500'}`}
                  >
                    {v}
                  </button>
                ))}
                <input
                  type="number"
                  step="0.1"
                  min="1"
                  max="10"
                  value={rrRatio}
                  onChange={(e) => setRrRatio(e.target.value)}
                  className="w-20 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-100"
                />
              </div>
              <p className="mt-1 text-[10px] text-slate-500">Default SL floor 500 points; TP = SL × ratio. Trailing starts at 550 points (EA-side).</p>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-3">
                <label className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Concurrent Markets: {concurrentMarkets}</label>
                <input
                  type="range"
                  min={1}
                  max={10}
                  value={concurrentMarkets}
                  onChange={(e) => setConcurrentMarkets(parseInt(e.target.value))}
                  className="mt-2 w-full accent-violet-500"
                />
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-3">
                <label className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Candle Depth</label>
                <select
                  value={candleDepth}
                  onChange={(e) => setCandleDepth(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none"
                >
                  <option value="100">100 candles</option>
                  <option value="200">200 candles</option>
                  <option value="500">500 candles</option>
                  <option value="1000">1000 candles</option>
                </select>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-3">
                <label className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Max Active Trades</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={maxActiveTrades}
                  onChange={(e) => setMaxActiveTrades(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none"
                />
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Scoped Markets ({scopedSymbols.length})</p>
                <div className="mt-2 grid max-h-28 grid-cols-2 gap-1 overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-2">
                  {SCALP_SYMBOLS.map((symbol) => (
                    <button
                      key={symbol}
                      onClick={() => toggleScopedSymbol(symbol)}
                      className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${scopedSymbols.includes(symbol) ? 'border-violet-500 bg-violet-600 text-white' : 'border-slate-700 bg-slate-950 text-slate-300'}`}
                    >
                      {symbol}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-3">
                <label className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Max Daily Loss (USD)</label>
                <input
                  type="number"
                  min={0}
                  value={maxDailyLoss}
                  onChange={(e) => setMaxDailyLoss(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none"
                />
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-3">
                <label className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Max Lot Per Trade</label>
                <input
                  type="number"
                  min={0.01}
                  step={0.01}
                  value={maxLot}
                  onChange={(e) => setMaxLot(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none"
                />
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-3">
                <label className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Auto Order Lot</label>
                <input
                  type="number"
                  min={0.01}
                  step={0.01}
                  value={autoOrderLot}
                  onChange={(e) => setAutoOrderLot(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none"
                />
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-3">
                <label className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">No-Trade Windows UTC</label>
                <input
                  value={noTradeWindowsUtc}
                  onChange={(e) => setNoTradeWindowsUtc(e.target.value)}
                  placeholder="21:55-22:10,23:55-00:10"
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                />
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-3">
                <label className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Allowed Symbols CSV</label>
                <input
                  value={allowedSymbolsCsv}
                  onChange={(e) => setAllowedSymbolsCsv(e.target.value.toUpperCase())}
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none"
                />
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-3">
                <label className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">XAU Session UTC</label>
                <input
                  value={xauSessionUtc}
                  onChange={(e) => setXauSessionUtc(e.target.value)}
                  placeholder="08:00-20:00"
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                />
              </div>
              <div className="flex items-end md:col-span-2">
                <button
                  onClick={() => setOnlyXauSessionFilter((v) => !v)}
                  className={`w-full rounded-xl border px-3 py-2.5 text-xs font-semibold ${onlyXauSessionFilter ? 'border-amber-400/40 bg-amber-500/10 text-amber-200' : 'border-slate-700 bg-slate-950 text-slate-200 hover:border-slate-500'}`}
                >
                  XAU Session Filter: {onlyXauSessionFilter ? 'ON' : 'OFF'}
                </button>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {[
                ['aiVerify', 'AI Verify'],
                ['scalpMode', 'Scalp Mode'],
                ['spreadGuard', 'Spread Guard'],
                ['smartTrailing', 'Smart Trailing'],
                ['newsFilter', 'News Filter'],
              ].map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setScopeFeatures((p) => ({ ...p, [k]: !p[k as keyof typeof p] }))}
                  className={`rounded-xl border px-3 py-2 text-xs font-semibold ${scopeFeatures[k as keyof typeof scopeFeatures] ? 'border-violet-500 bg-violet-500/10 text-violet-200' : 'border-slate-700 bg-slate-950 text-slate-300'}`}
                >
                  {label}: {scopeFeatures[k as keyof typeof scopeFeatures] ? 'ON' : 'OFF'}
                </button>
              ))}
            </div>
            <button onClick={applyScoping} disabled={applyBusy} className={`mt-4 rounded-xl px-3 py-2.5 text-xs font-semibold text-white ${applyBusy ? 'bg-violet-400' : 'bg-violet-600 hover:bg-violet-500'}`}>
              {applyBusy ? 'Applying...' : 'Apply (Send Command)'}
            </button>
          </div>

          <div className="rounded-[26px] border border-slate-700 bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(9,13,22,0.98))] p-4 shadow-[0_0_0_1px_rgba(148,163,184,0.06),0_24px_60px_rgba(2,6,23,0.5)] max-h-[720px] overflow-y-auto">
            {bridgeMismatchWarning && (
              <div className="mb-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-[11px] text-amber-100 shadow-[0_0_0_1px_rgba(251,191,36,0.15)]">
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-400/20 text-amber-200">!</span>
                  <div>
                    <p className="font-semibold uppercase tracking-[0.12em] text-amber-200">EA offline / client_id mismatch</p>
                    <p className="mt-1 text-amber-100/90">Trades are pending but not acknowledged by the terminal. Check EA WebRequest URL and make sure dashboard client_id matches EA client_id exactly.</p>
                  </div>
                </div>
              </div>
            )}
            <p className="text-sm font-semibold text-white">Connection</p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-2.5">
                <p className="text-slate-400">Status</p>
                <p className={`mt-1 font-semibold ${botConnected ? 'text-emerald-400' : 'text-rose-400'}`}>{botConnected ? 'ONLINE' : 'OFFLINE'}</p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-2.5">
                <p className="text-slate-400">Platform</p>
                <p className="mt-1 font-semibold text-slate-100">{connectedPlatform}</p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-2.5">
                <p className="text-slate-400">Queue</p>
                <p className="mt-1 font-semibold text-slate-100">{bridgeQueueDepth}</p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-2.5">
                <p className="text-slate-400">P/L</p>
                <p className={`mt-1 font-semibold ${openProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>${openProfit.toFixed(2)}</p>
              </div>
            </div>
            <div className="mt-3 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Live Connection</span>
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 font-semibold ${botConnected ? 'bg-emerald-500/10 text-emerald-300' : 'bg-rose-500/10 text-rose-300'}`}>
                  {botConnected ? <Wifi size={12} /> : <WifiOff size={12} />} {botConnected ? 'Connected' : 'Offline'}
                </span>
              </div>
              <div className="flex items-center justify-between"><span className="text-slate-400">Last Signal</span><span className="font-semibold text-slate-100">{lastSignalSent}</span></div>
              <div className="flex items-center justify-between"><span className="text-slate-400">Last Trade</span><span className="font-semibold text-slate-100">{lastTradeExecuted}</span></div>
              <div className="flex items-center justify-between"><span className="text-slate-400">Last Reject</span><span className="max-w-[180px] truncate text-right font-semibold text-rose-300">{lastRejectReason}</span></div>
              <div className="flex items-center justify-between"><span className="text-slate-400">Heartbeat</span><span className="font-semibold text-slate-100">{mt4LastSeen}</span></div>
              <div className="flex items-center justify-between"><span className="text-slate-400">Terminal</span><span className="font-semibold text-slate-100">{mt4AccountLabel}</span></div>
              <div className="flex items-center justify-between"><span className="text-slate-400">Broker</span><span className="max-w-[180px] truncate text-right font-semibold text-slate-100">{mt4BrokerLabel}</span></div>
              <div className="flex items-center justify-between"><span className="text-slate-400">EA Version</span><span className="font-semibold text-slate-100">{eaVersion}</span></div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Terminal Platform</span>
                <span className={`inline-flex items-center rounded-full px-2 py-1 font-semibold ${
                  connectedPlatform === 'MT5'
                    ? 'bg-indigo-500/10 text-indigo-300'
                    : connectedPlatform === 'MT4'
                      ? 'bg-cyan-500/10 text-cyan-300'
                      : 'bg-slate-700 text-slate-200'
                }`}
                >
                  {connectedPlatform}
                </span>
              </div>
              <div className="flex items-center justify-between"><span className="text-slate-400">Version Check</span><span className={`font-semibold ${eaVersionStatus === 'OK' ? 'text-emerald-400' : 'text-amber-300'}`}>{eaVersionStatus}</span></div>
              <div className="flex items-center justify-between"><span className="text-slate-400">Connected Terminals</span><span className={`font-semibold ${connectedTerminals > 0 ? "text-emerald-400" : "text-slate-400"}`}>{connectedTerminals > 0 ? `${connectedTerminals} Active (MT5 App Linked)` : "0 (Offline)"}</span></div>
              <div className="flex items-center justify-between"><span className="text-slate-400">EA Link</span><span className={`font-semibold ${bridgeConnected ? 'text-emerald-400' : 'text-rose-400'}`}>{bridgeConnected ? 'YES' : 'NO'}</span></div>
              <div className="flex items-center justify-between"><span className="text-slate-400">Connection ID</span><span className="max-w-[180px] truncate font-semibold text-slate-100">{bridgeActiveId}</span></div>
              <div className="flex items-center justify-between"><span className="text-slate-400">Pending Queue</span><span className="font-semibold text-slate-100">{bridgeQueueDepth}</span></div>
              <div className="flex items-center justify-between"><span className="text-slate-400">Last Seen</span><span className="font-semibold text-slate-100">{bridgeLastSeenLabel}</span></div>
              <div className="flex items-center justify-between"><span className="text-slate-400">Last Sync</span><span className="font-semibold text-slate-100">{bridgeLastAckLabel}</span></div>
              <div className="flex items-center justify-between"><span className="text-slate-400">Bot Power</span><span className={`font-semibold ${botEnabled ? 'text-emerald-400' : 'text-rose-400'}`}>{botEnabled ? 'ON' : 'OFF'}</span></div>
              <div className="flex items-center justify-between"><span className="text-slate-400">Open Profit</span><span className={`font-semibold ${openProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>${openProfit.toFixed(2)}</span></div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Account</span>
                <button
                  onClick={() => setAccountMode((m) => (m === 'AUTO' ? 'LIVE' : m === 'LIVE' ? 'DEMO' : 'AUTO'))}
                  className={`rounded-full px-2 py-1 font-semibold ${
                    accountMode === 'LIVE'
                      ? 'bg-amber-500/10 text-amber-300'
                      : accountMode === 'DEMO'
                        ? 'bg-cyan-500/10 text-cyan-300'
                        : 'bg-violet-500/10 text-violet-300'
                  }`}
                >
                  {accountMode}
                </button>
              </div>
            </div>
            <div className="mt-3 space-y-2">
              <button onClick={checkEaVersion} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-800">EA version check</button>
              <button onClick={fetchMt4Status} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-800">Refresh terminal status</button>
              <button onClick={toggleBotPower} className={`w-full rounded-xl px-3 py-2 text-xs font-semibold text-white ${botEnabled ? 'bg-rose-600 hover:bg-rose-500' : 'bg-emerald-600 hover:bg-emerald-500'}`}>{botEnabled ? 'Turn Bot OFF' : 'Turn Bot ON'}</button>
              <button
                onClick={() => setManualStop((v) => !v)}
                className={`w-full rounded-xl px-3 py-2 text-xs font-semibold text-white ${manualStop ? 'bg-rose-700' : 'bg-rose-500 hover:bg-rose-600'}`}
              >
                {manualStop ? 'Emergency Stop Active' : 'Manual Emergency Stop'}
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="rounded-xl border border-gray-200 bg-white p-4 lg:col-span-9">
            <p className="text-sm font-semibold text-gray-900">Trading Panel</p>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3 text-xs">
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3"><p className="text-gray-500">Trading in Progress</p><p className="mt-1 font-semibold text-gray-900">{tradeInProgress ? 'YES' : 'NO'} ({brokerOpenCount} open)</p></div>
              <button onClick={() => setOpenProfitPanel((v) => !v)} className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-left hover:bg-gray-100">
                <p className="text-gray-500">Open Profit</p>
                <p className={`mt-1 font-semibold ${openProfit >= 0 ? 'text-green-700' : 'text-red-600'}`}>${openProfit.toFixed(2)}</p>
                <p className="mt-1 text-[10px] text-gray-500">Live from MetaTrader heartbeat. Click to {openProfitPanel ? 'hide' : 'show'} details</p>
              </button>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3"><p className="text-gray-500">Trailing Stop (global)</p><input value={trailingStopGlobal} onChange={(e) => setTrailingStopGlobal(e.target.value)} className="mt-1 w-full rounded border border-gray-200 px-2 py-1 text-xs" /></div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => setOpenProfitPanel((v) => !v)} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50">
                {openProfitPanel ? 'Hide Open P/L Details' : 'Open P/L Details'}
              </button>
              <button onClick={closeTrade} className="rounded-lg bg-gray-900 px-3 py-2 text-xs font-semibold text-white hover:bg-black">Close trade</button>
              <button onClick={fetchMt4Status} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50">
                Poll Terminal Now
              </button>
            </div>

            {openProfitPanel && (
              <div className="mt-4 rounded-lg border border-gray-200 bg-white p-3">
                <p className="text-xs font-semibold text-gray-900">Live Broker Summary</p>
                <div className="mt-2 space-y-2">
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">Open Positions</span>
                      <span className="font-semibold text-gray-900">{brokerOpenCount}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-gray-500">Floating P/L</span>
                      <span className={`font-semibold ${openProfit >= 0 ? 'text-green-700' : 'text-red-600'}`}>${openProfit.toFixed(2)}</span>
                    </div>
                    <p className="mt-2 text-[10px] text-gray-500">Data source: MT4/MT5 open-trades snapshot + heartbeat.</p>
                  </div>

                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs">
                    <p className="font-semibold text-gray-900">Open Tickets</p>
                    {liveOpenTrades.length === 0 ? (
                      <p className="mt-2 text-gray-500">No live tickets reported yet. Click Poll Terminal Now after attaching updated EA.</p>
                    ) : (
                      <div className="mt-2 space-y-1 max-h-44 overflow-y-auto">
                        {liveOpenTrades.map((trade) => (
                          <div key={trade.ticket} className="rounded border border-gray-200 bg-white px-2 py-1.5 flex items-center justify-between gap-2">
                            <div>
                              <p className="font-semibold text-gray-900">#{trade.ticket} {trade.symbol} {trade.side}</p>
                              <p className="text-[10px] text-gray-500">lot {trade.lot} · open {trade.open_price} · magic {trade.magic}</p>
                              <p className="text-[10px] text-gray-500">
                                SL {trade.stop_loss > 0 ? trade.stop_loss : 'not set'} · TP {trade.take_profit > 0 ? trade.take_profit : 'not set'}
                              </p>
                            </div>
                            <p className={`font-semibold ${trade.profit >= 0 ? 'text-green-700' : 'text-red-600'}`}>${trade.profit.toFixed(2)}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4 lg:col-span-3">
            <p className="text-sm font-semibold text-gray-900">Terminal Snapshot</p>
            <div className="mt-2 space-y-2 text-xs">
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-2">
                <p className="text-gray-500">Last Trade</p>
                <p className="mt-1 font-semibold text-gray-900 break-words">{lastTradeExecuted}</p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-2">
                <p className="text-gray-500">Last Reject</p>
                <p className="mt-1 font-semibold text-red-700 break-words">{lastRejectReason}</p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-2">
                <p className="text-gray-500">EA Link</p>
                <p className="mt-1 font-semibold text-gray-900">{bridgeConnected ? 'Connected' : 'Offline'} · {bridgeActiveId}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="sticky top-32 z-20 flex gap-1 rounded-2xl border border-slate-700 bg-slate-950/80 p-1 backdrop-blur-xl shadow-[0_0_0_1px_rgba(148,163,184,0.05)]">
          {[
            { id: 'connect' as const, label: 'Broker Quick Connect' },
            { id: 'markets' as const, label: 'Markets & Signals' },
            { id: 'scalping' as const, label: 'Execution Panel' },
          ].map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`flex-1 rounded-xl py-2 text-xs font-semibold transition-all ${tab === t.id ? 'bg-violet-600 text-white shadow-[0_0_20px_rgba(124,58,237,0.3)]' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'markets' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 text-[11px] md:grid-cols-5">
              <div className="rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 shadow-[0_0_0_1px_rgba(148,163,184,0.08)]">
                <p className="text-slate-400">Watchlist</p>
                <p className="mt-1 font-semibold text-slate-100">{filteredMarkets.length} symbols</p>
              </div>
              <div className="rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 shadow-[0_0_0_1px_rgba(148,163,184,0.08)]">
                <p className="text-slate-400">Open Trades</p>
                <p className="mt-1 font-semibold text-slate-100">{brokerOpenCount}</p>
              </div>
              <div className="rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 shadow-[0_0_0_1px_rgba(148,163,184,0.08)]">
                <p className="text-slate-400">Floating P/L</p>
                <p className={`mt-1 font-semibold ${openProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>${openProfit.toFixed(2)}</p>
              </div>
              <div className="rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 shadow-[0_0_0_1px_rgba(148,163,184,0.08)]">
                <p className="text-slate-400">Pending Queue</p>
                <p className="mt-1 font-semibold text-slate-100">{bridgeQueueDepth}</p>
              </div>
              <div className="rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 shadow-[0_0_0_1px_rgba(148,163,184,0.08)]">
                <p className="text-slate-400">Mode</p>
                <p className="mt-1 font-semibold text-slate-100">{accountMode} · {connectedPlatform}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
              <div className="rounded-2xl border border-slate-700 bg-slate-900/80 p-3 lg:col-span-3 shadow-[0_0_0_1px_rgba(148,163,184,0.06)]">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-100">Watchlist</p>
                  <button onClick={refresh} className="flex items-center gap-1 text-xs font-semibold text-blue-400 hover:text-blue-300">
                    <RefreshCw size={11} className={spin ? 'animate-spin' : ''} />
                    Refresh
                  </button>
                </div>
                <div className="space-y-2 max-h-[560px] overflow-y-auto">
                  {filteredMarkets.map((m) => (
                    <button
                      key={m.symbol}
                      onClick={() => {
                        setSelectedMarket(m);
                        setScalp((prev) => ({ ...prev, symbol: m.symbol }));
                      }}
                      className={`w-full rounded-xl border px-2.5 py-2.5 text-left transition-all ${selectedMarket?.symbol === m.symbol ? 'border-blue-500 bg-slate-800 shadow-[0_0_18px_rgba(59,130,246,0.18)]' : 'border-slate-700 bg-slate-950/70 hover:bg-slate-800/70'}`}
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold text-slate-100">{m.symbol}</p>
                        <SigBadge s={m.signal} />
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[11px]">
                        <p className="font-semibold text-slate-200">{m.price.toLocaleString()}</p>
                        <p className={m.change >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{m.change >= 0 ? '+' : ''}{m.change}%</p>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400">
                        <span>{m.trend}</span>
                        <span>Spread {m.spread}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-4 lg:col-span-6">
                <div className="rounded-2xl border border-slate-700 bg-slate-900/80 p-4 shadow-[0_0_0_1px_rgba(148,163,184,0.06)]">
                  <div className="flex items-center justify-between border-b border-slate-700 pb-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Execution</p>
                      <p className="mt-1 text-sm font-semibold text-slate-100">{selectedMarket?.symbol ?? scalp.symbol}</p>
                    </div>
                    <p className="text-xs text-slate-400">{orderType.replace('_', ' ')}</p>
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-2">
                    {(['MARKET', 'BUY_LIMIT', 'SELL_LIMIT'] as OrderType[]).map((type) => (
                      <button key={type} onClick={() => setOrderType(type)} className={`rounded-xl border py-2 text-[11px] font-bold ${orderType === type ? 'border-blue-500 bg-blue-600 text-white' : 'border-slate-700 bg-slate-950 text-slate-300 hover:bg-slate-800'}`}>
                        {type.replace('_', ' ')}
                      </button>
                    ))}
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {['BUY', 'SELL'].map((d) => (
                      <button key={d} onClick={() => setScalp((p) => ({ ...p, mode: d }))} className={`rounded-xl border py-2.5 text-sm font-bold ${scalp.mode === d ? (d === 'BUY' ? 'border-emerald-500 bg-emerald-600 text-white' : 'border-rose-500 bg-rose-600 text-white') : 'border-slate-700 bg-slate-950 text-slate-300 hover:bg-slate-800'}`}>
                        {d}
                      </button>
                    ))}
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                    <div><p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400">Lot</p><input type="number" value={scalp.lot} onChange={(e) => setScalp((p) => ({ ...p, lot: e.target.value }))} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-2.5 py-2 text-slate-100" /></div>
                    <div><p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400">Pending</p><input type="number" value={scalp.pendingPrice} onChange={(e) => setScalp((p) => ({ ...p, pendingPrice: e.target.value }))} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-2.5 py-2 text-slate-100" /></div>
                    <div><p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400">TP</p><input type="number" value={scalp.tp} onChange={(e) => setScalp((p) => ({ ...p, tp: e.target.value }))} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-2.5 py-2 text-slate-100" /></div>
                    <div><p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400">SL</p><input type="number" value={scalp.sl} onChange={(e) => setScalp((p) => ({ ...p, sl: e.target.value }))} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-2.5 py-2 text-slate-100" /></div>
                    <div><p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400">Spread</p><input type="number" value={scalp.spread} onChange={(e) => setScalp((p) => ({ ...p, spread: e.target.value }))} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-2.5 py-2 text-slate-100" /></div>
                    <div><p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400">Trailing</p><input type="number" value={scalp.trailingStop} onChange={(e) => setScalp((p) => ({ ...p, trailingStop: e.target.value }))} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-2.5 py-2 text-slate-100" /></div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <button onClick={sendScalp} className="rounded-xl bg-blue-600 px-3 py-2.5 text-xs font-semibold text-white hover:bg-blue-500">Send Order</button>
                    <button onClick={fetchMt4Status} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-xs font-semibold text-slate-200 hover:bg-slate-800">Sync Terminal</button>
                    <button onClick={checkEaVersion} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-xs font-semibold text-slate-200 hover:bg-slate-800">Version Check</button>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-700 bg-slate-900/80 p-4 shadow-[0_0_0_1px_rgba(148,163,184,0.06)]">
                  <p className="text-sm font-semibold text-slate-100">Selected Market Detail</p>
                  {selectedMarket ? (
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-xl border border-slate-700 bg-slate-950 p-2.5"><p className="text-slate-400">Symbol</p><p className="mt-1 font-semibold text-slate-100">{selectedMarket.symbol}</p></div>
                      <div className="rounded-xl border border-slate-700 bg-slate-950 p-2.5"><p className="text-slate-400">Signal</p><p className="mt-1 font-semibold text-slate-100">{selectedMarket.signal}</p></div>
                      <div className="rounded-xl border border-slate-700 bg-slate-950 p-2.5"><p className="text-slate-400">Price</p><p className="mt-1 font-semibold text-slate-100">{selectedMarket.price}</p></div>
                      <div className="rounded-xl border border-slate-700 bg-slate-950 p-2.5"><p className="text-slate-400">Spread</p><p className="mt-1 font-semibold text-slate-100">{selectedMarket.spread}</p></div>
                      <div className="rounded-xl border border-slate-700 bg-slate-950 p-2.5"><p className="text-slate-400">24h High</p><p className="mt-1 font-semibold text-slate-100">{selectedMarket.high}</p></div>
                      <div className="rounded-xl border border-slate-700 bg-slate-950 p-2.5"><p className="text-slate-400">24h Low</p><p className="mt-1 font-semibold text-slate-100">{selectedMarket.low}</p></div>
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-slate-400">Select a symbol from watchlist.</p>
                  )}
                </div>
              </div>

              <div className="space-y-4 lg:col-span-3">
                <div className="rounded-2xl border border-slate-700 bg-slate-900/80 p-4 shadow-[0_0_0_1px_rgba(148,163,184,0.06)]">
                  <p className="text-sm font-semibold text-slate-100">Account & Risk</p>
                  <div className="mt-3 space-y-2 text-xs">
                    <div className="flex items-center justify-between"><span className="text-slate-400">Connection</span><span className={`font-semibold ${botConnected ? 'text-emerald-400' : 'text-rose-400'}`}>{botConnected ? 'ONLINE' : 'OFFLINE'}</span></div>
                    <div className="flex items-center justify-between"><span className="text-slate-400">Terminal</span><span className="font-semibold text-slate-100">{mt4AccountLabel}</span></div>
                    <div className="flex items-center justify-between"><span className="text-slate-400">Broker</span><span className="font-semibold text-slate-100 text-right max-w-[140px] truncate">{mt4BrokerLabel}</span></div>
                    <div className="flex items-center justify-between"><span className="text-slate-400">EA</span><span className="font-semibold text-slate-100">{eaVersion}</span></div>
                    <div className="flex items-center justify-between"><span className="text-slate-400">Connection ID</span><span className="font-semibold text-slate-100">{bridgeActiveId}</span></div>
                  </div>
                  <div className="mt-4 space-y-3 text-xs">
                    <div>
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400">Max Active Trades</p>
                      <input type="number" min={1} max={20} value={maxActiveTrades} onChange={(e) => setMaxActiveTrades(Math.max(1, Math.min(20, Number(e.target.value) || 1)))} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-2.5 py-2 text-slate-100" />
                    </div>
                    <div>
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400">Max Daily Loss</p>
                      <input type="number" min={0} value={maxDailyLoss} onChange={(e) => setMaxDailyLoss(e.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-2.5 py-2 text-slate-100" />
                    </div>
                    <div>
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400">Max Lot</p>
                      <input type="number" min={0.01} step={0.01} value={maxLot} onChange={(e) => setMaxLot(e.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-2.5 py-2 text-slate-100" />
                    </div>
                    <button onClick={() => setOnlyXauSessionFilter((v) => !v)} className={`w-full rounded-xl border px-3 py-2.5 text-xs font-semibold ${onlyXauSessionFilter ? 'border-amber-500 bg-amber-500/10 text-amber-300' : 'border-slate-700 bg-slate-950 text-slate-200'}`}>
                      XAU Session Filter: {onlyXauSessionFilter ? 'ON' : 'OFF'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'scalping' && (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-5 xl:col-span-7">
              <p className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2"><Zap size={15} className="text-blue-600" />Scalp & Limit Config</p>
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest block mb-1">Order Type</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['MARKET', 'BUY_LIMIT', 'SELL_LIMIT'] as OrderType[]).map((type) => (
                      <button key={type} onClick={() => setOrderType(type)} className={`rounded-lg border py-2 text-[11px] font-bold ${orderType === type ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'}`}>
                        {type.replace('_', ' ')}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest block mb-1">Symbol</label>
                  <select value={scalp.symbol} onChange={(e) => setScalp((p) => ({ ...p, symbol: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 bg-gray-50">
                    {(scopedSymbols.length ? scopedSymbols : SCALP_SYMBOLS).map((s) => (<option key={s}>{s}</option>))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest block mb-1">Direction</label>
                  <div className="flex gap-2">
                    {['BUY', 'SELL'].map((d) => (
                      <button key={d} onClick={() => setScalp((p) => ({ ...p, mode: d }))} className={`flex-1 py-2 text-xs font-bold rounded-lg border ${scalp.mode === d ? (d === 'BUY' ? 'bg-green-600 text-white border-green-600' : 'bg-red-500 text-white border-red-500') : 'bg-white text-gray-500 border-gray-200'}`}>
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
                {[
                  { l: 'Lot Size', key: 'lot' },
                  { l: 'Pending Price', key: 'pendingPrice' },
                  { l: 'Take Profit (pips)', key: 'tp' },
                  { l: 'Stop Loss (pips)', key: 'sl' },
                  { l: 'Trailing Stop (pips)', key: 'trailingStop' },
                  { l: 'Max Spread', key: 'spread' },
                  { l: 'Magic Number', key: 'magic' },
                ].map((f) => (
                  <div key={f.key}>
                    <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest block mb-1">{f.l}</label>
                    <input type="number" value={scalp[f.key as keyof typeof scalp]} onChange={(e) => setScalp((p) => ({ ...p, [f.key]: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 bg-gray-50" />
                  </div>
                ))}
                <button onClick={sendScalp} className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-2.5 rounded-xl">
                  Send Command to Terminal
                </button>
              </div>
            </div>

            <div className="space-y-4 xl:col-span-5">
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold text-gray-900">Command Preview (JSON)</p>
                  <button onClick={() => copy(scalpJSON, 'cmd')} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800">
                    {copied === 'cmd' ? <Check size={12} className="text-green-600" /> : <Copy size={12} />}
                    Copy
                  </button>
                </div>
                <div className="bg-[#0F1117] rounded-xl p-4 overflow-x-auto">
                  <pre className="text-[11px] font-mono text-gray-300 whitespace-pre">{scalpJSON}</pre>
                </div>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <p className="text-sm font-semibold text-gray-900 mb-3">Execution Log</p>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {log.length === 0 && <p className="text-xs text-gray-400">No commands sent yet.</p>}
                  {log.map((l, i) => (
                    <div key={`${l}-${i}`} className="flex items-start gap-2 bg-gray-50 rounded-lg px-3 py-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1 flex-shrink-0" />
                      <p className="text-[11px] font-mono text-gray-700">{l}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'connect' && (
          <div className="space-y-5">
            <div className="rounded-[28px] border border-slate-700 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.12),_transparent_30%),radial-gradient(circle_at_top_right,_rgba(168,85,247,0.18),_transparent_28%),linear-gradient(180deg,#0a1020_0%,#060913_100%)] p-5 shadow-[0_0_0_1px_rgba(148,163,184,0.06),0_30px_70px_rgba(2,6,23,0.55)]">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Link2 size={16} className="text-violet-300" />
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-200">Broker Quick Connect</p>
                  </div>
                  <h2 className="mt-2 text-2xl font-semibold text-white">Connect your broker terminal in the easiest way</h2>
                  <p className="mt-2 max-w-2xl text-sm text-slate-300">
                    Choose your broker, platform, and connection mode. The EA connects directly to this app, so users only install the EA and set client_id.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="rounded-full border border-violet-400/30 bg-violet-500/10 px-3 py-1.5 font-semibold text-violet-200">
                    {brokerConnectLabel}
                  </span>
                  <span className={`rounded-full border px-3 py-1.5 font-semibold ${botConnected ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300' : 'border-rose-400/30 bg-rose-500/10 text-rose-300'}`}>
                    {botConnected ? 'Terminal online' : 'Waiting for terminal'}
                  </span>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2 rounded-2xl border border-slate-800 bg-slate-950/70 p-1">
                {(['MT4', 'MT5'] as const).map((platform) => (
                  <button
                    key={platform}
                    onClick={() => setTerminalPlatform(platform)}
                    className={`rounded-xl px-4 py-2 text-xs font-semibold transition-colors ${terminalPlatform === platform ? 'bg-violet-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}
                  >
                    {platform}
                  </button>
                ))}
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-3">
                {brokerConnectionMode === 'LOCAL_TERMINAL' ? (
                  <div className="rounded-2xl border border-violet-400 bg-violet-500/10 p-4 text-left shadow-[0_0_25px_rgba(139,92,246,0.18)] lg:col-span-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-200">Recommended setup</p>
                        <p className="mt-2 text-lg font-semibold text-white">Local broker connect</p>
                        <p className="mt-1 text-sm text-slate-300">Best when your broker terminal is open and WebRequest is enabled for this app URL.</p>
                      </div>
                      <span className="rounded-full border border-violet-400/30 bg-violet-500/10 px-2.5 py-1 text-[10px] font-semibold text-violet-200">Fastest</span>
                    </div>
                  </div>
                ) : null}
                {brokerProfiles.map((profile) => (
                  <button
                    key={profile.id}
                    onClick={() => setBrokerConnectionMode(profile.id)}
                    className={`rounded-2xl border p-4 text-left transition-all ${brokerConnectionMode === profile.id ? 'border-violet-400 bg-violet-500/10 shadow-[0_0_25px_rgba(139,92,246,0.18)]' : 'border-slate-700 bg-slate-950/70 hover:border-slate-500 hover:bg-slate-900'}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-white">{profile.title}</p>
                      <span className="rounded-full border border-slate-600 bg-slate-900 px-2 py-1 text-[10px] font-semibold text-slate-300">
                        {profile.badge}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-slate-400">{profile.subtitle}</p>
                  </button>
                ))}
              </div>

              <div className="mt-4 rounded-2xl border border-violet-400/20 bg-slate-950/80 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">{connectionModeTitle}</p>
                    <p className="mt-1 text-xs text-slate-400">{connectionSummary}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => copy(connectionLaunchCommand, 'connection-launch')} className="rounded-xl bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-500">
                      {copied === 'connection-launch' ? 'Launch command copied' : 'Copy launch command'}
                    </button>
                    <a href={primaryEaDownloadHref} download className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-800">
                      {primaryEaDownloadLabel}
                    </a>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2">
                  <code className="flex-1 truncate text-[11px] text-slate-300">{connectionLaunchCommand}</code>
                  <button onClick={() => copy(connectionLaunchCommand, 'hero-command')} className="text-violet-300 hover:text-violet-200">
                    {copied === 'hero-command' ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                  </button>
                </div>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[1.5fr_0.9fr]">
              <div className="rounded-2xl border border-slate-700 bg-slate-900/80 p-4">
                <p className="text-sm font-semibold text-slate-100">Broker selector</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {BROKER_OPTIONS.map((broker) => (
                    <button
                      key={broker.id}
                      onClick={() => setSelectedBroker(broker.id)}
                      className={`rounded-2xl border p-3 text-left transition-all ${selectedBroker === broker.id ? 'border-violet-400 bg-violet-500/10 shadow-[0_0_20px_rgba(139,92,246,0.15)]' : 'border-slate-700 bg-slate-950/80 hover:border-slate-500 hover:bg-slate-900'}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-white">{broker.name}</p>
                          <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-slate-400">{broker.server}</p>
                        </div>
                        <span className="rounded-full border border-slate-600 bg-slate-900 px-2 py-1 text-[10px] font-semibold text-slate-300">{broker.region}</span>
                      </div>
                      <p className="mt-3 text-xs text-slate-400">{broker.description}</p>
                    </button>
                  ))}
                </div>

                <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-200">Selected broker</p>
                      <p className="mt-1 text-lg font-semibold text-white">{selectedBrokerMeta.name}</p>
                    </div>
                    <div className="rounded-full border border-violet-400/30 bg-violet-500/10 px-3 py-1.5 text-[10px] font-semibold text-violet-200">
                      {selectedBrokerMeta.server}
                    </div>
                  </div>
                  <p className="mt-2 text-sm text-slate-300">{selectedBrokerMeta.description}</p>
                  <p className="mt-2 text-xs text-slate-400">Connect profile: {brokerConnectionMode === 'LOCAL_TERMINAL' ? 'Local terminal' : brokerConnectionMode === 'VPS_TERMINAL' ? 'VPS terminal' : 'Webhook feed'} • {terminalPlatform}</p>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-700 bg-slate-900/80 p-4">
                <p className="text-sm font-semibold text-slate-100">Live connection status</p>
                <div className="mt-4 grid grid-cols-2 gap-2 text-[11px]">
                  <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                    <p className="text-slate-400">Terminal</p>
                    <p className={`mt-1 font-semibold ${botConnected ? 'text-emerald-400' : 'text-rose-400'}`}>{botConnected ? 'ONLINE' : 'OFFLINE'}</p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                    <p className="text-slate-400">Platform</p>
                    <p className="mt-1 font-semibold text-slate-100">{connectedPlatform}</p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                    <p className="text-slate-400">Pending Queue</p>
                    <p className="mt-1 font-semibold text-slate-100">{bridgeQueueDepth}</p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                    <p className="text-slate-400">Open P/L</p>
                    <p className={`mt-1 font-semibold ${openProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>${openProfit.toFixed(2)}</p>
                  </div>
                </div>

                <div className="mt-4 space-y-2 text-xs">
                  <div className="flex items-center justify-between"><span className="text-slate-400">Terminal</span><span className="font-semibold text-slate-100">{mt4AccountLabel}</span></div>
                  <div className="flex items-center justify-between"><span className="text-slate-400">Broker</span><span className="max-w-[170px] truncate font-semibold text-slate-100">{mt4BrokerLabel}</span></div>
                  <div className="flex items-center justify-between"><span className="text-slate-400">EA Version</span><span className="font-semibold text-slate-100">{eaVersion}</span></div>
                  <div className="flex items-center justify-between"><span className="text-slate-400">Heartbeat</span><span className="font-semibold text-slate-100">{mt4LastSeen}</span></div>
                  <div className="flex items-center justify-between"><span className="text-slate-400">Version Check</span><span className={`font-semibold ${eaVersionStatus === 'OK' ? 'text-emerald-400' : 'text-amber-300'}`}>{eaVersionStatus}</span></div>
                </div>

                <div className="mt-4 space-y-2">
                  <button onClick={checkEaVersion} className="w-full rounded-xl bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-500">Check terminal now</button>
                  <button onClick={fetchMt4Status} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-800">Refresh terminal status</button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-center gap-2 mb-2">
            <Shield size={14} className="text-blue-600" />
            <p className="text-sm font-semibold text-gray-900">Security Preview</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 text-xs">
            {['Stronger authentication', 'Expiring API tokens', 'Rate limiting', 'HTTPS verification', 'IP allow-listing'].map((item) => (
              <div key={item} className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-2 text-gray-700">{item}</div>
            ))}
          </div>
        </div>
      </main>
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-gray-200 bg-white/95 backdrop-blur-xl">
        <div className="mx-auto max-w-[1540px] px-4 py-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              {([
                ['execution', `Execution (${log.length})`],
                ['errors', `Errors (${errorLogs.length})`],
                ['history', `History (${tradeHistory.length})`],
              ] as const).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => {
                    setTerminalDockTab(id);
                    setTerminalDockOpen(true);
                  }}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${terminalDockTab === id ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-[11px] text-gray-600">
                Height
                <input
                  type="range"
                  min={120}
                  max={320}
                  step={10}
                  value={terminalDockHeight}
                  onChange={(e) => setTerminalDockHeight(Number(e.target.value))}
                  className="w-24"
                />
                <span className="w-8 text-right">{terminalDockHeight}</span>
              </label>
              <button
                onClick={clearTerminalDockTab}
                disabled={terminalDockEntries.length === 0}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Clear Tab
              </button>
              <button onClick={() => setTerminalDockOpen((v) => !v)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">
                {terminalDockOpen ? 'Hide Terminal' : 'Show Terminal'}
              </button>
            </div>
          </div>
          {terminalDockOpen && (
            <div
              className="mt-2 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-2 text-[11px] text-gray-700"
              style={{ height: `${terminalDockHeight}px` }}
            >
              {terminalDockEntries.length === 0 ? (
                <p className="text-gray-500">No entries yet.</p>
              ) : (
                terminalDockEntries.map((line, i) => (
                  <p key={`${line}-${i}`} className="py-0.5">{line}</p>
                ))
              )}
            </div>
          )}
        </div>
      </div>
      <footer className="text-center py-4 text-xs text-gray-400 border-t border-gray-100 bg-white">© 2026 Dark Venus Auto Bot</footer>
    </div>
  );
}

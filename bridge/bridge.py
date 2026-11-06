import json
import os
import re
import threading
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Tuple

import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, request

load_dotenv()

BACKEND_BASE_URL = os.getenv("BACKEND_BASE_URL", "https://tradeautomate-ai.vercel.app").rstrip("/")
BRIDGE_ID = os.getenv("BRIDGE_ID", "bridge-default")
BRIDGE_CLIENT_ID = os.getenv("BRIDGE_CLIENT_ID", "default")
POLL_SECONDS = float(os.getenv("BRIDGE_POLL_SECONDS", "1"))
HOST = os.getenv("BRIDGE_HOST", "127.0.0.1")
PORT = int(os.getenv("BRIDGE_PORT", "5001"))
EMA_FAST_LEN = 9
EMA_SLOW_LEN = 21
ATR_LEN = 14
ATR_STOP_MULT = 1.5
RISK_REWARD_RATIO = 1.7

API_BRIDGE_URL = f"{BACKEND_BASE_URL}/api/bridge"
API_SIGNALS_URL = f"{BACKEND_BASE_URL}/api/signals"

app = Flask(__name__)
state_lock = threading.Lock()

state: Dict[str, Any] = {
    "running": True,
    "last_poll_ok": False,
    "last_error": "",
    "last_poll_time": None,
    "settings": {
        "bot_enabled": True,
        "account_mode": "LIVE",
        "max_open_trades": 5,
        "auto_order_lot": 0.01,
        "auto_scan_enabled": True,
        "autonomous_mode": False,
        "strategy_mode": "DASHBOARD_SIGNALS",
        "rr_ratio": 2.0,
        "min_sl_pips": 50.0,
        "autonomous_mode": True,
        "max_daily_loss": 250,
        "max_lot": 0.1,
        "no_trade_windows_utc": "",
        "allowed_symbols_csv": "XAUUSD,EURUSD,GBPUSD,USDJPY",
        "xau_session_utc": "00:00-23:59",
        "only_xau_session_filter": False,
        "lock_symbol": "",
        "scoped_symbols_csv": "EURUSD,GBPUSD,USDJPY,XAUUSD,BTCUSD,USDCAD,AUDUSD,US500,NAS100,USOIL",
        "scalp_mode": True,
        "spread_guard": True,
        "ai_verify": True,
        "smart_trailing": False,
        "news_filter": True,
        "candle_depth": 200,
        "concurrent_markets": 5,
    },
    "latest_signal": {
        "mode": "scalp",
        "action": "HOLD",
        "account_mode": "LIVE",
        "symbol": "XAUUSD",
        "lot": 0.01,
        "tp_pips": 10,
        "sl_pips": 7,
        "max_spread": 2,
        "magic": 54321,
        "comment": "TradeAutomate_Scalp",
        "max_open_trades": 5,
        "max_daily_loss": 250,
        "max_lot": 0.1,
        "no_trade_windows_utc": "",
        "allowed_symbols_csv": "XAUUSD,EURUSD,GBPUSD,USDJPY",
        "xau_session_utc": "00:00-23:59",
        "only_xau_session_filter": False,
        "scoped_symbols_csv": "XAUUSD",
        "bot_enabled": True,
        "lock_symbol": "",
        "scalp_mode": True,
        "spread_guard": True,
        "ai_verify": True,
        "smart_trailing": False,
        "news_filter": True,
        "candle_depth": 200,
        "concurrent_markets": 5,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    },
    "risk": {
        "daily_pnl": 0.0,
        "pnl_day": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "last_block_reason": "",
    },
}
last_emitted_scan_candle: Dict[str, str] = {}


def _force_auto_scan(reason: str) -> None:
    settings = state["settings"]
    settings["scalp_mode"] = True
    settings["auto_scan_enabled"] = bool(settings.get("bot_enabled", True))

    latest = state["latest_signal"].copy()
    latest.update(settings)
    latest["mode"] = "scalp"
    latest["action"] = "AUTO_SCAN"
    latest["startup_reason"] = reason
    latest["timestamp"] = now_iso()
    state["latest_signal"] = latest


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def merge_settings(payload: Dict[str, Any]) -> None:
    s = state["settings"]
    for key in s.keys():
        if key in payload:
            s[key] = payload[key]
    s["scalp_mode"] = True
    s["auto_scan_enabled"] = bool(s.get("bot_enabled", True))


def _safe_float(value: Any, fallback: float) -> float:
    try:
        if isinstance(value, str):
            value = value.strip().replace(" ", "").replace(",", ".")
        return float(value)
    except Exception:
        return fallback


def _parse_event_body(raw_text: str) -> Dict[str, Any]:
    text = (raw_text or "").strip()
    if not text:
        return {}
    try:
        parsed = json.loads(text)
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        pass

    normalized = re.sub(r"(?<=\d),(?=\d)", ".", text)
    try:
        parsed = json.loads(normalized)
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {}


def _in_window(now_hm: str, start_hm: str, end_hm: str) -> bool:
    now_m = int(now_hm[:2]) * 60 + int(now_hm[3:5])
    start_m = int(start_hm[:2]) * 60 + int(start_hm[3:5])
    end_m = int(end_hm[:2]) * 60 + int(end_hm[3:5])
    if start_m <= end_m:
        return start_m <= now_m <= end_m
    return now_m >= start_m or now_m <= end_m


def _match_no_trade_window(now_hm: str, windows_csv: str) -> bool:
    raw = (windows_csv or "").strip()
    if not raw:
        return False
    windows = [w.strip() for w in raw.split(",") if w.strip()]
    for w in windows:
        if "-" not in w:
            continue
        start_hm, end_hm = [x.strip() for x in w.split("-", 1)]
        if len(start_hm) == 5 and len(end_hm) == 5 and _in_window(now_hm, start_hm, end_hm):
            return True
    return False


def _symbol_allowed(symbol: str, allowed_csv: str) -> bool:
    allowed = [x.strip().upper() for x in (allowed_csv or "").split(",") if x.strip()]
    if not allowed:
        return True
    return symbol.upper() in allowed


def _xau_session_ok(symbol: str, session: str) -> bool:
    if not symbol.upper().startswith("XAU"):
        return True
    if "-" not in session:
        return True
    start_hm, end_hm = [x.strip() for x in session.split("-", 1)]
    if len(start_hm) != 5 or len(end_hm) != 5:
        return True
    now_hm = datetime.now(timezone.utc).strftime("%H:%M")
    return _in_window(now_hm, start_hm, end_hm)


def _ticker_for_symbol(symbol: str) -> str:
    s = symbol.upper().strip()
    mapping = {
        "EURUSD": "EURUSD=X",
        "GBPUSD": "GBPUSD=X",
        "USDJPY": "JPY=X",
        "USDCAD": "CAD=X",
        "AUDUSD": "AUDUSD=X",
        "BTCUSD": "BTC-USD",
        "XAUUSD": "GC=F",
        "US500": "^GSPC",
        "NAS100": "^NDX",
        "USOIL": "CL=F",
    }
    return mapping.get(s, s)


_OHLC_CACHE: Dict[str, Tuple[float, List[Tuple[int, float, float, float]]]] = {}
_OHLC_TTL_SECONDS = 45.0
_YAHOO_HOSTS = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]


def _fetch_recent_ohlc(symbol: str, interval: str, range_value: str) -> List[Tuple[int, float, float, float]]:
    ticker = _ticker_for_symbol(symbol)
    cache_key = f"{ticker}|{interval}|{range_value}"
    now = time.time()
    cached = _OHLC_CACHE.get(cache_key)
    if cached and (now - cached[0]) < _OHLC_TTL_SECONDS:
        return cached[1]

    params = {
        "interval": interval,
        "range": range_value,
    }
    data = None
    last_err = None
    for host in _YAHOO_HOSTS:
        try:
            r = requests.get(
                f"https://{host}/v8/finance/chart/{ticker}",
                params=params, timeout=8,
                headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"},
            )
            r.raise_for_status()
            data = r.json()
            break
        except Exception as exc:
            last_err = exc
            continue
    if data is None:
        raise RuntimeError(f"yahoo fetch failed: {last_err}")

    result = ((data.get("chart") or {}).get("result") or [{}])[0] or {}
    timestamps = result.get("timestamp") or []
    quote = ((result.get("indicators") or {}).get("quote") or [{}])[0] or {}
    closes = quote.get("close") or []
    highs = quote.get("high") or []
    lows = quote.get("low") or []

    bars: List[Tuple[int, float, float, float]] = []
    size = min(len(timestamps), len(closes), len(highs), len(lows))
    for i in range(size):
        ts = timestamps[i]
        c = closes[i]
        h = highs[i]
        l = lows[i]
        if isinstance(ts, (int, float)) and isinstance(c, (int, float)) and isinstance(h, (int, float)) and isinstance(l, (int, float)):
            bars.append((int(ts), float(h), float(l), float(c)))
    _OHLC_CACHE[cache_key] = (now, bars)
    return bars


def _ema_series(values: List[float], period: int) -> List[float]:
    if not values or period <= 0:
        return []
    k = 2.0 / float(period + 1)
    out = [values[0]]
    for v in values[1:]:
        out.append(out[-1] + (v - out[-1]) * k)
    return out


def _sma(values: List[float], period: int) -> float:
    if period <= 0 or len(values) < period:
        return 0.0
    window = values[-period:]
    return sum(window) / float(period)


def _rsi(values: List[float], period: int) -> float:
    if len(values) < (period + 1):
        return 50.0
    gains = 0.0
    losses = 0.0
    for i in range(len(values) - period, len(values)):
        delta = values[i] - values[i - 1]
        if delta > 0:
            gains += delta
        elif delta < 0:
            losses += -delta
    avg_gain = gains / float(period)
    avg_loss = losses / float(period)
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return 100.0 - (100.0 / (1.0 + rs))


def _stddev(values: List[float], period: int) -> float:
    if period <= 0 or len(values) < period:
        return 0.0
    window = values[-period:]
    mean = sum(window) / float(period)
    variance = sum((v - mean) ** 2 for v in window) / float(period)
    return variance ** 0.5


def _atr_series(highs: List[float], lows: List[float], closes: List[float], period: int) -> List[float]:
    if not highs or not lows or not closes or period <= 0:
        return []
    trs: List[float] = []
    for i in range(len(closes)):
        if i == 0:
            tr = highs[i] - lows[i]
        else:
            prev_close = closes[i - 1]
            tr = max(highs[i] - lows[i], abs(highs[i] - prev_close), abs(lows[i] - prev_close))
        trs.append(max(0.0, tr))
    out = [trs[0]]
    for tr in trs[1:]:
        out.append(((out[-1] * (period - 1)) + tr) / float(period))
    return out


def _pip_size(symbol: str) -> float:
    s = symbol.upper().strip()
    if s.endswith("JPY"):
        return 0.01
    if s.startswith("XAU"):
        return 0.1
    if s.startswith("XAG"):
        return 0.01
    if s.startswith("BTC"):
        return 1.0
    if s in ("US500", "NAS100"):
        return 1.0
    if s == "USOIL":
        return 0.01
    return 0.0001


def _is_precious_metal(symbol: str) -> bool:
    s = symbol.upper()
    return "XAU" in s or "XAG" in s


def _decide_from_market_scan(symbol: str, base_lot: float, strategy_mode: str = "MOMENTUM_ALPHA") -> Dict[str, Any]:
    h1_bars = _fetch_recent_ohlc(symbol, "1h", "5d")
    if len(h1_bars) < 20:
        return {"action": "HOLD", "reason": "insufficient_h1", "lot": base_lot, "timeframe": "h1"}
    h1_closes = [b[3] for b in h1_bars]
    h1_sma20 = _sma(h1_closes, 20)
    h1_trend = "BULLISH" if h1_closes[-1] > h1_sma20 else "BEARISH"

    m5_trend_bars = _fetch_recent_ohlc(symbol, "5m", "2d")
    if len(m5_trend_bars) < 20:
        return {"action": "HOLD", "reason": "insufficient_m5_trend", "lot": base_lot, "timeframe": "m5"}
    m5_closes = [b[3] for b in m5_trend_bars]
    m5_sma20 = _sma(m5_closes, 20)
    m5_trend = "BULLISH" if m5_closes[-1] > m5_sma20 else "BEARISH"

    tf_interval = "5m"
    tf_range = "2d"
    bars = _fetch_recent_ohlc(symbol, tf_interval, tf_range)
    if len(bars) < 50:
        return {"action": "HOLD", "reason": f"insufficient_{tf_interval}", "lot": base_lot, "timeframe": tf_interval}

    timestamps = [b[0] for b in bars]
    highs = [b[1] for b in bars]
    lows = [b[2] for b in bars]
    closes = [b[3] for b in bars]

    current_close = closes[-1]
    sma5 = _sma(closes, 5)
    rsi14 = _rsi(closes, 14)
    ema12 = _ema_series(closes, 12)
    ema26 = _ema_series(closes, 26)
    macd_line = [ema12[i] - ema26[i] for i in range(min(len(ema12), len(ema26)))]
    signal_line = _ema_series(macd_line, 9) if macd_line else []
    current_macd = macd_line[-1] if macd_line else 0.0
    current_signal = signal_line[-1] if signal_line else 0.0

    bb_middle = _sma(closes, 20)
    bb_std = _stddev(closes, 20)
    bb_upper = bb_middle + (2.0 * bb_std)
    bb_lower = bb_middle - (2.0 * bb_std)

    atr_values = _atr_series(highs, lows, closes, ATR_LEN)
    atr_price = max(0.0, atr_values[-1] * ATR_STOP_MULT) if atr_values else 0.0
    pip_size = _pip_size(symbol)
    rr_ratio = _safe_float(state["settings"].get("rr_ratio", 2.0), 2.0)
    min_sl = _safe_float(state["settings"].get("min_sl_pips", 50.0), 50.0)
    sl_pips = max(1, int(round(atr_price / pip_size))) if pip_size > 0 else 7
    sl_pips = max(sl_pips, int(min_sl))  # floor: user default 500 points = 50 pips
    if _is_precious_metal(symbol):
        sl_pips = max(sl_pips, 300)  # gold/silver need wider stops: 300 pips = $30 on gold
    tp_pips = max(1, int(round(sl_pips * rr_ratio)))

    lot_size = 0.02 if _is_precious_metal(symbol) else max(0.01, base_lot)
    action = "HOLD"
    reason = "no_entry"
    mode = (strategy_mode or "MOMENTUM_ALPHA").upper()
    if mode == "DASHBOARD_SIGNALS":
        return {
            "action": "HOLD", "strategy_mode": mode, "score": 0.0,
            "reason": "dashboard_signals_mode", "timeframe": "5m",
            "sl_pips": int(_safe_float(state["settings"].get("min_sl_pips", 50.0), 50.0)),
            "tp_pips": int(round(_safe_float(state["settings"].get("min_sl_pips", 50.0), 50.0) * _safe_float(state["settings"].get("rr_ratio", 2.0), 2.0))),
            "candle_ts": "", "price": closes[-1] if closes else 0.0,
            "lot": 0.02 if _is_precious_metal(symbol) else max(0.01, base_lot),
            "h1_trend": "", "m5_trend": "", "rsi14": 50.0, "macd": 0.0, "signal": 0.0,
        }

    # ATR regime for volatility strategies
    atr_ma = _sma([max(h - l, 1e-9) for h, l in zip(highs, lows)], 20) if len(highs) >= 20 else atr_values[-1] if atr_values else 0.0
    atr_now = atr_values[-1] if atr_values else 0.0
    vol_expanding = atr_ma > 0 and atr_now > 1.15 * atr_ma

    # candle streak for sentiment proxy
    streak = 0
    streak_dir = 0
    for i in range(len(closes) - 1, 0, -1):
        chg = closes[i] - closes[i - 1]
        d = 1 if chg > 0 else (-1 if chg < 0 else 0)
        if d == 0:
            break
        if streak_dir == 0:
            streak_dir = d
        if d != streak_dir:
            break
        streak += 1

    if mode == "MEAN_REVERSION":
        # Bollinger reversion: fade extremes, no trend filter
        if current_close < bb_lower and rsi14 < 35:
            action, reason = "BUY", "mr_band_reversion_buy"
        elif current_close > bb_upper and rsi14 > 65:
            action, reason = "SELL", "mr_band_reversion_sell"

    elif mode == "VOLATILITY_HARVEST":
        # Trade only when volatility expands and price breaks the 20-bar range
        hi20 = max(highs[-21:-1]) if len(highs) > 21 else max(highs[:-1]) if len(highs) > 1 else 0
        lo20 = min(lows[-21:-1]) if len(lows) > 21 else min(lows[:-1]) if len(lows) > 1 else 0
        if vol_expanding and current_close > hi20:
            action, reason = "BUY", "vol_breakout_high"
        elif vol_expanding and current_close < lo20:
            action, reason = "SELL", "vol_breakout_low"

    elif mode == "SENTIMENT_EDGE":
        # Streak proxy for news/flow sentiment, confirmed by h1 trend
        if streak >= 4 and streak_dir == 1 and h1_trend == "BULLISH" and rsi14 < 75:
            action, reason = "BUY", f"sentiment_streak_up_{streak}"
        elif streak >= 4 and streak_dir == -1 and h1_trend == "BEARISH" and rsi14 > 25:
            action, reason = "SELL", f"sentiment_streak_down_{streak}"

    elif mode == "GRID_SCALPER":
        # Layer around SMA20 mean: enter toward the mean, fixed small TP
        grid_gap = max(bb_std * 0.5, atr_now * 0.25) if (bb_std or atr_now) else 0.0
        if grid_gap > 0 and current_close < bb_middle - grid_gap:
            action, reason = "BUY", "grid_buy_below_mean"
        elif grid_gap > 0 and current_close > bb_middle + grid_gap:
            action, reason = "SELL", "grid_sell_above_mean"
        tp_pips = max(3, int(round(sl_pips * 0.6)))  # scalper: fast small TP

    else:  # MOMENTUM_ALPHA — original multi-timeframe confirmation
        buy_cond = (
            current_close > sma5
            and rsi14 < 70
            and h1_trend == "BULLISH"
            and m5_trend == "BULLISH"
            and current_macd > current_signal
            and current_close < bb_upper
        )
        sell_cond = (
            current_close < sma5
            and rsi14 > 30
            and h1_trend == "BEARISH"
            and m5_trend == "BEARISH"
            and current_macd < current_signal
            and current_close > bb_lower
        )
        if buy_cond:
            action, reason = "BUY", "mtf_buy_confirmed"
        elif sell_cond:
            action, reason = "SELL", "mtf_sell_confirmed"

    score = abs(current_macd - current_signal) * 1000.0 + abs(rsi14 - 50.0) * 0.5
    candle_ts = datetime.fromtimestamp(timestamps[-1], tz=timezone.utc).isoformat()
    return {
        "action": action,
        "strategy_mode": mode,
        "score": round(score, 5),
        "reason": reason,
        "timeframe": tf_interval,
        "sl_pips": sl_pips,
        "tp_pips": tp_pips,
        "candle_ts": candle_ts,
        "price": current_close,
        "lot": lot_size,
        "h1_trend": h1_trend,
        "m5_trend": m5_trend,
        "rsi14": round(rsi14, 2),
        "macd": round(current_macd, 6),
        "signal": round(current_signal, 6),
    }


def _scan_symbol(symbol: str) -> Dict[str, Any]:
    try:
        default_lot = _safe_float(state["settings"].get("auto_order_lot", 0.01), 0.01)
        scan = _decide_from_market_scan(symbol, default_lot, str(state["settings"].get("strategy_mode", "MOMENTUM_ALPHA")))
        return {
            "symbol": symbol.upper(),
            "action": str(scan.get("action", "HOLD")),
            "score": float(scan.get("score", 0.0)),
            "reason": str(scan.get("reason", "unknown")),
            "timeframe": str(scan.get("timeframe", "5m")),
            "sl_pips": int(scan.get("sl_pips", 7)),
            "tp_pips": int(scan.get("tp_pips", 12)),
            "candle_ts": str(scan.get("candle_ts", "")),
            "price": float(scan.get("price", 0.0)),
            "lot": float(scan.get("lot", default_lot)),
            "h1_trend": str(scan.get("h1_trend", "")),
            "m5_trend": str(scan.get("m5_trend", "")),
            "rsi14": float(scan.get("rsi14", 50.0)),
        }
    except Exception as exc:
        default_lot = _safe_float(state["settings"].get("auto_order_lot", 0.01), 0.01)
        return {
            "symbol": symbol.upper(),
            "action": "HOLD",
            "score": 0.0,
            "reason": f"scan_error:{exc}",
            "timeframe": "5m",
            "sl_pips": 7,
            "tp_pips": 12,
            "candle_ts": "",
            "price": 0.0,
            "lot": default_lot,
        }


def _choose_scan_symbol(payload: Dict[str, Any]) -> Dict[str, Any]:
    lock_symbol = str(payload.get("lock_symbol", "")).upper().strip()
    if lock_symbol:
        return _scan_symbol(lock_symbol)

    scoped_csv = str(payload.get("scoped_symbols_csv") or state["settings"].get("scoped_symbols_csv", ""))
    scoped = [x.strip().upper() for x in scoped_csv.split(",") if x.strip()]
    if not scoped:
        scoped = [str(payload.get("symbol", "XAUUSD")).upper().strip() or "XAUUSD"]

    scans = [_scan_symbol(sym) for sym in scoped]
    tradable = [s for s in scans if s.get("action") in ("BUY", "SELL")]
    if tradable:
        tradable.sort(key=lambda x: abs(float(x.get("score", 0.0))), reverse=True)
        return tradable[0]
    return scans[0]


def _build_auto_signal(payload: Dict[str, Any]) -> Dict[str, Any]:
    auto = payload.copy()
    selected = _choose_scan_symbol(payload)
    symbol = str(selected.get("symbol", payload.get("symbol", "XAUUSD"))).upper()
    action = str(selected.get("action", "HOLD")).upper()
    candle_ts = str(selected.get("candle_ts", ""))
    if action in ("BUY", "SELL") and candle_ts:
        emitted_key = candle_ts
        if (not _is_precious_metal(symbol)) and last_emitted_scan_candle.get(symbol) == emitted_key:
            action = "HOLD"
            selected["reason"] = "already_sent_for_current_candle"
        else:
            last_emitted_scan_candle[symbol] = emitted_key

    auto["symbol"] = symbol
    auto["action"] = action
    auto["scan_score"] = selected.get("score", 0.0)
    auto["scan_reason"] = selected.get("reason", "unknown")
    auto["scan_timeframe"] = selected.get("timeframe", "5m")
    auto["scan_candle_ts"] = selected.get("candle_ts", "")
    auto["scan_price"] = selected.get("price", 0.0)
    auto["lot"] = _safe_float(selected.get("lot", payload.get("auto_order_lot", state["settings"].get("auto_order_lot", 0.01))), 0.01)
    auto["sl_pips"] = int(selected.get("sl_pips", payload.get("sl_pips", 7)))
    auto["tp_pips"] = int(selected.get("tp_pips", payload.get("tp_pips", 12)))
    auto["rr_ratio"] = _safe_float(state["settings"].get("rr_ratio", 2.0), 2.0)
    auto["atr_mult"] = ATR_STOP_MULT
    auto["trailing_stop_pips"] = 55  # start trailing at 550 points
    return auto


def _post_bridge_event(event_type: str, symbol: str, detail: str, payload: Dict[str, Any]) -> None:
    event_payload = {
        "kind": "event",
        "client_id": BRIDGE_CLIENT_ID,
        "bridge_id": BRIDGE_ID,
        "event_type": event_type,
        "symbol": symbol,
        "detail": detail,
        "payload": payload,
    }
    try:
        requests.post(API_BRIDGE_URL, json=event_payload, timeout=8)
    except Exception:
        pass


def _post_signals_rejection(symbol: str, detail: str) -> None:
    rej = {
        "client_id": BRIDGE_CLIENT_ID,
        "event_type": "rejection",
        "reason": "python_risk_filter",
        "detail": detail,
        "symbol": symbol,
    }
    try:
        requests.post(API_SIGNALS_URL, json=rej, timeout=8)
    except Exception:
        pass


def _risk_gate(payload: Dict[str, Any]) -> str:
    settings = state["settings"]
    risk = state["risk"]

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if risk.get("pnl_day") != today:
        risk["pnl_day"] = today
        risk["daily_pnl"] = 0.0

    max_daily_loss = _safe_float(settings.get("max_daily_loss", 0), 0.0)
    if max_daily_loss > 0 and _safe_float(risk.get("daily_pnl", 0.0), 0.0) <= -abs(max_daily_loss):
        return f"daily_loss_limit_reached({risk.get('daily_pnl')})"

    lot = _safe_float(payload.get("lot", 0.01), 0.01)
    max_lot = _safe_float(settings.get("max_lot", 0.1), 0.1)
    if lot > max_lot:
        return f"lot_above_max({lot}>{max_lot})"

    symbol = str(payload.get("symbol", "")).upper()
    if symbol and not _symbol_allowed(symbol, str(settings.get("allowed_symbols_csv", ""))):
        return f"symbol_not_allowed({symbol})"

    now_hm = datetime.now(timezone.utc).strftime("%H:%M")
    if _match_no_trade_window(now_hm, str(settings.get("no_trade_windows_utc", ""))):
        return f"no_trade_window({now_hm})"

    if bool(settings.get("only_xau_session_filter", False)) and not _xau_session_ok(symbol, str(settings.get("xau_session_utc", "00:00-23:59"))):
        return f"xau_session_block({settings.get('xau_session_utc')})"

    return ""


def apply_command(command: Dict[str, Any]) -> None:
    cmd_type = str(command.get("type", "")).upper()
    payload = command.get("payload") or {}

    if not isinstance(payload, dict):
        payload = {}

    if cmd_type == "TRADE_COMMAND":
        latest = state["latest_signal"].copy()
        latest.update(payload)
        action = str(latest.get("action", "")).upper().strip()
        if payload.get("strategy_mode"):
            state["settings"]["strategy_mode"] = str(payload["strategy_mode"]).upper()
        if payload.get("autonomous_mode") is not None:
            _save_persisted_flag(bool(payload["autonomous_mode"]))
        if payload.get("autonomous_mode"):
            state["settings"]["autonomous_mode"] = True
            state["settings"]["auto_scan_enabled"] = True
            state["settings"]["bot_enabled"] = True
        elif "autonomous_mode" in payload and not payload["autonomous_mode"]:
            state["settings"]["autonomous_mode"] = False
        if action in ("AUTO", "AUTO_SCAN", "SCAN"):
            latest = _build_auto_signal(latest)
            state["settings"]["auto_scan_enabled"] = True

        block_reason = _risk_gate(latest)
        if block_reason and str(latest.get("action", "")).upper() in ("BUY", "SELL"):
            latest["action"] = "HOLD"
            latest["bridge_block_reason"] = block_reason
            state["risk"]["last_block_reason"] = block_reason
            _post_bridge_event("risk_block", str(latest.get("symbol", "")), block_reason, latest)
            _post_signals_rejection(str(latest.get("symbol", "")), block_reason)
        latest["timestamp"] = now_iso()
        latest["bot_enabled"] = bool(state["settings"].get("bot_enabled", True))
        state["latest_signal"] = latest
        return

    if cmd_type == "BOT_POWER":
        if "bot_enabled" in payload:
            state["settings"]["bot_enabled"] = bool(payload["bot_enabled"])
        if state["settings"]["bot_enabled"]:
            state["settings"]["auto_scan_enabled"] = bool(state["settings"].get("scalp_mode", True))
        else:
            state["settings"]["auto_scan_enabled"] = False
        latest = state["latest_signal"].copy()
        latest["bot_enabled"] = bool(state["settings"]["bot_enabled"])
        if not latest["bot_enabled"]:
            latest["action"] = "HOLD"
        latest["timestamp"] = now_iso()
        state["latest_signal"] = latest
        return

    if cmd_type == "APPLY_SCOPING":
        merge_settings(payload)
        state["settings"]["auto_scan_enabled"] = bool(state["settings"].get("bot_enabled", True) and state["settings"].get("scalp_mode", True))
        latest = state["latest_signal"].copy()
        latest.update(state["settings"])
        latest["timestamp"] = now_iso()
        state["latest_signal"] = latest
        return

    if cmd_type == "STOP_ALL":
        state["settings"]["auto_scan_enabled"] = False
        latest = state["latest_signal"].copy()
        latest["action"] = "HOLD"
        latest["timestamp"] = now_iso()
        state["latest_signal"] = latest


def post_ack(command_id: str, status: str, note: str) -> None:
    payload = {
        "kind": "ack",
        "client_id": BRIDGE_CLIENT_ID,
        "bridge_id": BRIDGE_ID,
        "command_id": command_id,
        "status": status,
        "note": note,
    }
    requests.post(API_BRIDGE_URL, json=payload, timeout=8)


def _scan_and_emit(settings: Dict[str, Any], strategy_mode: str) -> None:
    scoped_csv = str(settings.get("scoped_symbols_csv", "EURUSD"))
    scoped = [x.strip().upper() for x in scoped_csv.split(",") if x.strip()][:6]
    base_lot = _safe_float(settings.get("auto_order_lot", 0.01), 0.01)
    best = None
    for sym in scoped:
        scan = _scan_symbol(sym)
        if scan.get("action") in ("BUY", "SELL"):
            if best is None or abs(float(scan.get("score", 0))) > abs(float(best.get("score", 0))):
                best = scan
    emit = best or (_scan_symbol(scoped[0]) if scoped else None)
    if not emit:
        return
    with state_lock:
        latest = state["latest_signal"].copy()
        latest.update({
            "action": emit.get("action", "HOLD"),
            "symbol": emit.get("symbol", scoped[0]),
            "lot": _safe_float(emit.get("lot"), base_lot),
            "sl_pips": int(emit.get("sl_pips", 50)),
            "tp_pips": int(emit.get("tp_pips", 100)),
            "comment": f"Auto_{strategy_mode[:12]}",
            "scan_reason": emit.get("reason", ""),
            "scan_score": emit.get("score", 0.0),
            "timestamp": now_iso(),
        })
        if latest["action"] in ("BUY", "SELL"):
            block = _risk_gate(latest)
            if block:
                latest["action"] = "HOLD"
                latest["bridge_block_reason"] = block
                state["risk"]["last_block_reason"] = block
        state["latest_signal"] = latest


def autonomous_engine() -> None:
    """Bridge-side autonomous loop: every 10s, if autonomous_mode is on, run the
    scan engine and set latest_signal directly. Does NOT depend on the browser
    being open. Explicit BUY/SELL from the dashboard still take precedence via
    the poll loop passthrough."""
    while True:
        time.sleep(10)
        try:
            with state_lock:
                if not (state["settings"].get("bot_enabled", True)
                        and state["settings"].get("autonomous_mode", False)):
                    continue
                settings = state["settings"].copy()
            mode = str(settings.get("strategy_mode", "MOMENTUM_ALPHA")).upper()
            if mode == "DASHBOARD_SIGNALS":
                # dashboard cards drive trades; the site-side auto-send pushes them.
                # as backup, poll the store for fresh BUY/SELL cards every 10s.
                try:
                    rr = requests.get(
                        f"{API_SIGNALS_URL}?status=1&client_id={BRIDGE_CLIENT_ID}", timeout=6)
                    rr.raise_for_status()
                    q = (rr.json().get("queued_signal") or {})
                    act = str(q.get("action", "")).upper()
                    ts = str(q.get("timestamp", ""))
                    if act in ("BUY", "SELL") and ts and ts != state.get("_last_dash_sig_ts"):
                        with state_lock:
                            state["_last_dash_sig_ts"] = ts
                            latest = state["latest_signal"].copy()
                            latest.update({
                                "action": act,
                                "symbol": str(q.get("symbol", "EURUSD")).upper(),
                                "lot": _safe_float(q.get("lot"), settings.get("auto_order_lot", 0.01)),
                                "comment": "Dashboard_Signal",
                                "timestamp": now_iso(),
                            })
                            block = _risk_gate(latest)
                            if block:
                                latest["action"] = "HOLD"
                                latest["bridge_block_reason"] = block
                            state["latest_signal"] = latest
                except Exception:
                    pass
                # No fresh dashboard card? Fall back to the engine scan so
                # the bot NEVER goes silent just because the browser is closed.
                mode_fallback = "MOMENTUM_ALPHA"
                settings2 = settings
                mode = None  # placeholder to keep structure clear
                _scan_and_emit(settings2, mode_fallback)
                continue

            # engine modes: scan scoped markets and emit signals
            _scan_and_emit(settings, mode)
        except Exception:
            continue


def poll_loop() -> None:
    while True:
        if not state["running"]:
            time.sleep(1)
            continue
        was_poll_ok = bool(state.get("last_poll_ok"))
        try:
            resp = requests.get(
                API_BRIDGE_URL,
                params={"next": "1", "bridge_id": BRIDGE_ID, "client_id": BRIDGE_CLIENT_ID},
                timeout=8,
            )
            resp.raise_for_status()
            data = resp.json()

            with state_lock:
                state["last_poll_ok"] = True
                state["last_error"] = ""
                state["last_poll_time"] = now_iso()

                settings_payload = data.get("settings")
                if isinstance(settings_payload, dict):
                    merge_settings(settings_payload)

                # Strategy mode lives in the dashboard signal store (separate
                # server state from /api/bridge settings) — read it every poll.
                try:
                    sr = requests.get(
                        f"{API_SIGNALS_URL}?status=1&client_id={BRIDGE_CLIENT_ID}",
                        timeout=5,
                    )
                    sr.raise_for_status()
                    sd = sr.json()
                    q = sd.get("queued_signal") or {}
                    sm = q.get("strategy_mode")
                    if sm:
                        state["settings"]["strategy_mode"] = str(sm).upper()
                    rr = q.get("rr_ratio")
                    if rr:
                        try:
                            state["settings"]["rr_ratio"] = max(1.0, min(10.0, float(rr)))
                        except Exception:
                            pass

                    # DASHBOARD_SIGNALS mode: the dashboard's own market cards are
                    # the primary signal source. Pass explicit BUY/SELL through
                    # to the EA (dedup by timestamp), like a manual Quick Send.
                    if state["settings"].get("strategy_mode") == "DASHBOARD_SIGNALS":
                        act = str(q.get("action", "")).upper()
                        ts = str(q.get("timestamp", ""))
                        if act in ("BUY", "SELL") and ts and ts != state.get("_last_dash_sig_ts"):
                            state["_last_dash_sig_ts"] = ts
                            latest = state["latest_signal"].copy()
                            latest.update({
                                "action": act,
                                "symbol": str(q.get("symbol", latest.get("symbol", "EURUSD"))).upper(),
                                "lot": _safe_float(q.get("lot"), state["settings"].get("auto_order_lot", 0.01)),
                                "comment": "Dashboard_Signal",
                                "timestamp": now_iso(),
                            })
                            block = _risk_gate(latest)
                            if block:
                                latest["action"] = "HOLD"
                                latest["bridge_block_reason"] = block
                            state["latest_signal"] = latest
                except Exception:
                    pass

                if not was_poll_ok:
                    _force_auto_scan("bridge_reconnect")

                command = data.get("command")
                if isinstance(command, dict) and command.get("id"):
                    apply_command(command)
                    post_ack(str(command["id"]), "applied", "applied by python bridge")

        except Exception as exc:
            with state_lock:
                state["last_poll_ok"] = False
                state["last_error"] = str(exc)
                state["last_poll_time"] = now_iso()

        time.sleep(max(1.0, POLL_SECONDS))


@app.get("/health")
def health():
    with state_lock:
        return jsonify(
            {
                "ok": True,
                "bridge_id": BRIDGE_ID,
                "client_id": BRIDGE_CLIENT_ID,
                "backend": BACKEND_BASE_URL,
                "last_poll_ok": state["last_poll_ok"],
                "last_error": state["last_error"],
                "last_poll_time": state["last_poll_time"],
                "risk": state["risk"],
                "settings": state["settings"],
            }
        )


@app.get("/signal")
def signal():
    mode = request.args.get("mode", "scalp")
    with state_lock:
        payload = state["latest_signal"].copy()
        payload.update(state["settings"])
        payload["mode"] = mode
        payload["timestamp"] = now_iso()

        incoming_action = str(payload.get("action", "")).upper()
        dashboard_mode = state["settings"].get("strategy_mode") == "DASHBOARD_SIGNALS"
        should_autoscan = (
            payload.get("bot_enabled", True)
            and (bool(state["settings"].get("autonomous_mode", False))
                 or (bool(state["settings"].get("auto_scan_enabled", True)) and bool(state["settings"].get("scalp_mode", True))))
            and not dashboard_mode
            and incoming_action not in ("BUY", "SELL")  # never overwrite explicit trades
        )
        if should_autoscan:
            auto_payload = _build_auto_signal(payload)
            auto_payload.update(state["settings"])
            auto_payload["mode"] = mode
            auto_payload["timestamp"] = now_iso()
            state["latest_signal"] = auto_payload.copy()
            payload = auto_payload

    if not payload.get("bot_enabled", True):
        payload["action"] = "HOLD"

    return jsonify(payload)


@app.post("/event")
def event_forward():
    body = request.get_json(silent=True) or {}
    raw_text = request.get_data(as_text=True)

    if not isinstance(body, dict) or (not body and raw_text):
        body = _parse_event_body(raw_text)

    if str(body.get("event_type", "")).lower() == "open_trades":
        with state_lock:
            today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            if state["risk"].get("pnl_day") != today:
                state["risk"]["pnl_day"] = today
                state["risk"]["daily_pnl"] = 0.0
            state["risk"]["daily_pnl"] = _safe_float(body.get("open_profit", 0.0), 0.0)

    mt4_result = {"ok": False}
    bridge_result = {"ok": False}
    errors = []

    try:
        signal_payload = body.copy()
        signal_payload["client_id"] = BRIDGE_CLIENT_ID
        r1 = requests.post(API_SIGNALS_URL, json=signal_payload, timeout=8)
        mt4_result = {"ok": r1.ok, "status": r1.status_code}
        if not r1.ok:
            errors.append(f"signals:{r1.status_code}")
    except Exception as exc:
        errors.append(f"signals:{exc}")

    try:
        event_payload = {
            "kind": "event",
            "client_id": BRIDGE_CLIENT_ID,
            "bridge_id": BRIDGE_ID,
            "event_type": str(body.get("event_type", "unknown")),
            "symbol": str(body.get("symbol", "")),
            "detail": str(body.get("detail", "")),
            "payload": body,
        }
        r2 = requests.post(API_BRIDGE_URL, json=event_payload, timeout=8)
        bridge_result = {"ok": r2.ok, "status": r2.status_code}
        if not r2.ok:
            errors.append(f"bridge:{r2.status_code}")
    except Exception as exc:
        errors.append(f"bridge:{exc}")

    status_code = 200 if not errors else 502
    return jsonify({"ok": len(errors) == 0, "signals": mt4_result, "bridge": bridge_result, "errors": errors}), status_code


def _load_persisted_flags() -> None:
    """Survive redeploys: the dashboard may be wiped, but the bridge remembers."""
    try:
        flag = os.path.join(os.path.dirname(os.path.abspath(__file__)), "autonomy.flag")
        if os.path.exists(flag):
            with open(flag) as f:
                state["settings"]["autonomous_mode"] = f.read().strip() == "1"
    except Exception:
        pass

def _save_persisted_flag(on: bool) -> None:
    try:
        flag = os.path.join(os.path.dirname(os.path.abspath(__file__)), "autonomy.flag")
        with open(flag, "w") as f:
            f.write("1" if on else "0")
    except Exception:
        pass

if __name__ == "__main__":
    _load_persisted_flags()
    _force_auto_scan("bridge_startup")
    t = threading.Thread(target=poll_loop, daemon=True)
    t.start()
    threading.Thread(target=autonomous_engine, daemon=True).start()
    app.run(host=HOST, port=PORT)

# Python Bridge for TradeAutomate

This bridge lets your web app send commands to a backend queue while MT4/MT5 EA stays a thin execution client.

## Architecture

Web/Mobile App -> Backend API (/api/bridge) -> Python Bridge -> MT4/MT5 EA -> MetaTrader Terminal

## What it does

- Polls `/api/bridge?next=1&bridge_id=...` for queued commands.
- Applies command/risk settings in Python.
- Serves latest signal locally at `/signal` for MT4/MT5 EA polling.
- Forwards EA telemetry from `/event` to backend `/api/signals` and `/api/bridge`.
- Enforces risk and session rules in Python before MT4 sees trade commands.
- Auto-scan scalp mode uses 5m candles with EMA(9/21) crossover and ATR-based stops.

## Auto scalp strategy (5m)

- Entry signal: EMA 9 crossing EMA 21 on 5-minute candles
- Stop loss distance: ATR(14) * 1.5 (converted to pips by symbol)
- Take profit distance: SL pips * 1.7 (RR 1.7)
- Duplicate protection: same symbol/candle crossover is sent once per 5m candle

## Quick start

1. Install Python 3.10+.
2. Install dependencies:

```bash
pip install -r bridge/requirements.txt
```

3. Optional environment variables:

- `BACKEND_BASE_URL` (default: `https://tradeautomate-ai.vercel.app`)
- `BRIDGE_ID` (default: `bridge-default`)
- `BRIDGE_CLIENT_ID` (recommended: user PIN, e.g. `1313`)
- `BRIDGE_POLL_SECONDS` (default: `1`)
- `BRIDGE_HOST` (default: `127.0.0.1`)
- `BRIDGE_PORT` (default: `5001`)

`BRIDGE_CLIENT_ID` isolates queues/signals per user so each PIN can connect to its own MT4.

4. Run bridge:

```bash
python bridge/bridge.py
```

Or run the simpler PowerShell relay from the project root:

```bat
start-bridge.bat 3131
```

That starts a localhost relay on `127.0.0.1:5001` for the logged-in user's PIN/client ID.

5. In MT4/MT5 EA parameters, set:

- `AppURL = http://127.0.0.1:5001/signal`

And if you wire telemetry endpoint in EA separately, use:

- `http://127.0.0.1:5001/event`

6. In MT4/MT5 `Tools -> Options -> Expert Advisors`, allow WebRequest for:

- `http://127.0.0.1:5001`
- Your backend URL (if needed for direct fallback)

## Endpoints exposed by bridge

- `GET /health`
- `GET /signal?mode=scalp`
- `POST /event`

## Risk and session controls

Configured from app Scoping tab and synced through `/api/bridge` settings:

- `max_daily_loss`
- `max_lot`
- `no_trade_windows_utc` (example: `21:55-22:10,23:55-00:10`)
- `allowed_symbols_csv`
- `xau_session_utc` (example: `08:00-20:00`)
- `only_xau_session_filter`

If a trade is blocked by risk/session checks, bridge returns HOLD and posts rejection reason.

## MT4/MT5 error -1 err=5200 fix

If you see WebRequest `response=-1 err=5200` on `http://127.0.0.1:5001`:

1. Ensure bridge is running (`python bridge/bridge.py`).
2. In MT4/MT5, add `http://127.0.0.1:5001` to allowed WebRequest list.
3. Keep EA settings:
	- `AppURL=http://127.0.0.1:5001/signal`
	- `EventURL=http://127.0.0.1:5001/event`
4. If bridge runs on another computer/VPS, replace `127.0.0.1` with that machine IP/domain and allow it in MT4 WebRequest.

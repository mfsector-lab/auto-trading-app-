# Dark Venus Cloud MT5 (MetaApi)

Standalone cloud broker-login + execution service. No local MT5, no EA.

## Deploy on Render
1. Render -> New + -> Web Service -> repo `auto-trading-app-`
2. Root Directory: `cloud-mt5`
3. Build Command: `pip install -r requirements.txt`
4. Start Command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
5. Environment variables:
   - `METAAPI_TOKEN` = your token from https://app.metaapi.cloud (free account, no card)
   - `API_TOKEN` = any long random string (clients must send it as `X-API-Token` header)

## Endpoints
- `POST /api/connect` `{login, password, server}` -> `{account_id}`
- `POST /api/trade/market-order` `{account_id, symbol, action: BUY|SELL, volume, sl?, tp?}`
- `GET /api/positions?account_id=...`
- `GET /health`

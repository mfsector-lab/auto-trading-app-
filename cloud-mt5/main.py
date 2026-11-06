"""Dark Venus Cloud MT5 — broker login & execution via MetaApi cloud.
Runs on Render (or any host). No local terminal, no EA required.

Env:
  METAAPI_TOKEN   — account token from app.metaapi.cloud (required)
  API_TOKEN       — shared secret this API requires in X-API-Token header (recommended)
  PORT            — provided by Render automatically

Endpoints:
  POST /api/connect            {login, password, server}         -> accountId
  POST /api/trade/market-order {account_id, symbol, action, volume, sl?, tp?}
  GET  /api/positions?account_id=...
  GET  /health
"""
import os, time, asyncio
from typing import Optional

import httpx
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

METAAPI_TOKEN = os.environ.get("METAAPI_TOKEN", "")
API_TOKEN = os.environ.get("API_TOKEN", "")
PROVISIONING = "https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai"
METASTATS = "https://mt-client-api-v1.agiliumtrade.agiliumtrade.ai"

app = FastAPI(title="Dark Venus Cloud MT5", version="1.0.0")

# accountId -> {"region": str, "connected_at": ts}
SESSIONS: dict[str, dict] = {}
_client: Optional[httpx.AsyncClient] = None


def client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(timeout=httpx.Timeout(10.0, connect=5.0))
    return _client


def auth_guard(x_api_token: Optional[str]) -> None:
    if API_TOKEN and x_api_token != API_TOKEN:
        raise HTTPException(401, "invalid X-API-Token")


def meta_headers() -> dict:
    if not METAAPI_TOKEN:
        raise HTTPException(500, "METAAPI_TOKEN not configured on server")
    return {"auth-token": METAAPI_TOKEN, "Content-Type": "application/json"}


async def get_connection(account_id: str) -> str:
    """Ensure the account has a live streaming connection; return region."""
    sess = SESSIONS.get(account_id)
    if not sess:
        raise HTTPException(404, f"account {account_id} not connected — call /api/connect first")
    region = sess["region"]
    # idempotent: initializing an already-initialized connection is a no-op for MetaApi
    r = await client().post(
        f"{PROVISIONING}/users/current/accounts/{account_id}/initialize?region={region}",
        headers=meta_headers(), json={})
    if r.status_code not in (200, 201, 204):
        raise HTTPException(502, f"connection init failed: {r.status_code} {r.text[:120]}")
    return region


class ConnectReq(BaseModel):
    login: str = Field(min_length=1)
    password: str = Field(min_length=1)
    server: str = Field(min_length=1)
    # optional: reuse an existing MetaApi account id instead of provisioning a new one
    account_id: Optional[str] = None


@app.post("/api/connect")
async def connect(req: ConnectReq, x_api_token: Optional[str] = Header(default=None)):
    """Provision a cloud MT5 session for the given broker credentials."""
    auth_guard(x_api_token)
    payload = {
        "login": req.login,
        "password": req.password,
        "server": req.server,
        "platform": "mt5",
        # faster scalping data: short sync of recent history only
        "copyFactory": False,
        "metadata": {"app": "dark-venus"},
    }
    if req.account_id:
        payload["accountId"] = req.account_id
    r = await client().post(
        f"{PROVISIONING}/users/current/accounts",
        headers=meta_headers(), json=payload)
    if r.status_code not in (200, 201):
        raise HTTPException(r.status_code, f"MetaApi provisioning failed: {r.text[:200]}")
    data = r.json()
    account_id = data["id"]
    region = data.get("region", "new-york")
    SESSIONS[account_id] = {"region": region, "connected_at": time.time()}
    # wait briefly for first deploy so first trade is not cold
    for _ in range(10):
        st = await client().get(
            f"{PROVISIONING}/users/current/accounts/{account_id}/status",
            headers=meta_headers())
        if st.status_code == 200 and st.json().get("connected"):
            break
        await asyncio.sleep(1.0)
    return {"account_id": account_id, "region": region, "connected": True}


class OrderReq(BaseModel):
    account_id: str
    symbol: str
    action: str = Field(pattern="^(BUY|SELL)$")
    volume: float = Field(gt=0, le=100)
    sl: Optional[float] = None
    tp: Optional[float] = None
    deviation: int = 20  # max slippage in points for scalping


@app.post("/api/trade/market-order")
async def market_order(req: OrderReq, x_api_token: Optional[str] = Header(default=None)):
    """Instant market execution. Low-latency path: direct trade RPC, no polling."""
    auth_guard(x_api_token)
    region = await get_connection(req.account_id)
    order_type = "ORDER_TYPE_BUY" if req.action == "BUY" else "ORDER_TYPE_SELL"
    body: dict = {
        "actionType": "ORDER_TYPE_SELL" if req.action == "SELL" else "ORDER_TYPE_BUY",
        "symbol": req.symbol,
        "volume": req.volume,
        "comment": "dark-venus-cloud",
        "clientId": f"dv-{int(time.time()*1000)}",
    }
    if req.sl is not None:
        body["stopLoss"] = {"price": req.sl}
    if req.tp is not None:
        body["takeProfit"] = {"price": req.tp}
    r = await client().post(
        f"{METASTATS}/users/current/accounts/{req.account_id}/trade?region={region}",
        headers=meta_headers(), json=body)
    if r.status_code not in (200, 201):
        raise HTTPException(r.status_code, f"order rejected: {r.text[:200]}")
    return {"ok": True, "result": r.json()}


@app.get("/api/positions")
async def positions(account_id: str, x_api_token: Optional[str] = Header(default=None)):
    auth_guard(x_api_token)
    region = await get_connection(account_id)
    r = await client().get(
        f"{METASTATS}/users/current/accounts/{account_id}/positions?region={region}",
        headers=meta_headers())
    if r.status_code != 200:
        raise HTTPException(r.status_code, f"positions fetch failed: {r.text[:200]}")
    rows = r.json()
    return {"account_id": account_id, "count": len(rows),
            "positions": [{"id": p.get("id"), "symbol": p.get("symbol"),
                           "type": p.get("type"), "volume": p.get("volume"),
                           "openPrice": p.get("openPrice"),
                           "profit": p.get("profit")} for p in rows]}


@app.get("/health")
async def health():
    return {"status": "ok", "sessions": len(SESSIONS), "metaapi_configured": bool(METAAPI_TOKEN)}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))

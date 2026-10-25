# TradeAutomate AI

Trading dashboard + backend command API + Python bridge for MT4 execution.

## Architecture

Web/Mobile App
-> Next.js Backend API (`/api/bridge`, `/api/signals`)
-> Python Bridge (local PC/VPS)
-> MT4 EA (thin execution client)
-> MetaTrader 4

## Components

- `src/app/page.tsx`: Trading UI (commands, scoping, status, history, PIN access)
- `src/app/api/bridge/route.ts`: Command queue/settings/events for Python bridge
- `src/app/api/signals/route.ts`: Signal + telemetry endpoint for MT4-facing execution state
- `public/TradeAutomate-EA.mq4`: MT4 EA
- `bridge/bridge.py`: Python bridge service

## Run web app locally

```bash
npm install
npm run dev
```

## Run Python bridge

```bash
pip install -r bridge/requirements.txt
python bridge/bridge.py
```

Bridge docs: `bridge/README.md`

## MT4 configuration (bridge mode)

EA inputs:

- `AppURL = http://127.0.0.1:5001/signal`
- `EventURL = http://127.0.0.1:5001/event`

In MT4 `Tools -> Options -> Expert Advisors`, allow WebRequest for:

- `http://127.0.0.1:5001`

## Deploy

```bash
npx vercel deploy --prod --yes
```

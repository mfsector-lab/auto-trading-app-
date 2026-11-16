# H4 Scanner v2 — scoring & live chart

Confidence = hybrid: technical quality (55-95 clamped)
  shoulder symmetry + head prominence   0..15
  neckline slope + touch count          0..10
  SMC confluence (10 per tag, max 30)   0..30
  macro/news alignment                  0..5
+ learning adjust (-25..+25) from h4_outcomes win-rate history
  (seeded by a 200-H4-bar startup backtest per pair+direction)

Detection: relaxed tolerance (shoulder symmetry 4.5%), EARLY_FORMING
status when the RS is still developing. All setups sorted by confidence.

Pairs: all 22 USD/JPY/NZD/AUD crosses + XAUUSD (23 total).

Live modal: 5s polling with 30s server-side Yahoo cache, series.update()
so the current H4 candle moves in real time, LIVE badge in the header.

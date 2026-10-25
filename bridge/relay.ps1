param(
  [string]$ClientId = "default",
  [string]$BridgeId = "bridge-default",
  [string]$BackendBaseUrl = "https://tradeautomate-ai.vercel.app",
  [int]$Port = 5001,
  [int]$PollSeconds = 2
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

$BackendBaseUrl = $BackendBaseUrl.TrimEnd("/")
$ApiBridgeUrl = "$BackendBaseUrl/api/bridge"
$ApiSignalsUrl = "$BackendBaseUrl/api/signals"

$script:State = @{
  running = $true
  client_id = $ClientId
  bridge_id = $BridgeId
  last_poll_ok = $false
  last_error = ""
  last_poll_time = $null
  settings = @{
    bot_enabled = $true
    account_mode = "LIVE"
    max_open_trades = 5
    auto_order_lot = 0.01
    auto_scan_enabled = $true
    max_daily_loss = 250
    max_lot = 0.1
    no_trade_windows_utc = ""
    allowed_symbols_csv = "XAUUSD,EURUSD,GBPUSD,USDJPY"
    xau_session_utc = "00:00-23:59"
    only_xau_session_filter = $false
    lock_symbol = ""
    scoped_symbols_csv = "EURUSD,GBPUSD,USDJPY,XAUUSD,BTCUSD,USDCAD,AUDUSD,US500,NAS100,USOIL"
    scalp_mode = $true
    spread_guard = $true
    ai_verify = $true
    smart_trailing = $false
    news_filter = $true
    candle_depth = 200
    concurrent_markets = 5
  }
  latest_signal = @{
    mode = "scalp"
    action = "HOLD"
    account_mode = "LIVE"
    symbol = "XAUUSD"
    lot = 0.01
    tp_pips = 12
    sl_pips = 7
    max_spread = 2
    magic = 54321
    comment = "TradeAutomate_Scalp"
    max_open_trades = 5
    max_daily_loss = 250
    max_lot = 0.1
    no_trade_windows_utc = ""
    allowed_symbols_csv = "XAUUSD,EURUSD,GBPUSD,USDJPY"
    xau_session_utc = "00:00-23:59"
    only_xau_session_filter = $false
    scoped_symbols_csv = "XAUUSD"
    bot_enabled = $true
    lock_symbol = ""
    scalp_mode = $true
    spread_guard = $true
    ai_verify = $true
    smart_trailing = $false
    news_filter = $true
    candle_depth = 200
    concurrent_markets = 5
    timestamp = [DateTime]::UtcNow.ToString("o")
  }
  risk = @{
    daily_pnl = 0.0
    pnl_day = [DateTime]::UtcNow.ToString("yyyy-MM-dd")
    last_block_reason = ""
  }
  last_emitted_scan_candle = @{}
}

$EMA_FAST_LEN = 9
$EMA_SLOW_LEN = 21
$ATR_LEN = 14
$ATR_STOP_MULT = 1.5
$RISK_REWARD_RATIO = 1.7

function Now-Iso {
  return [DateTime]::UtcNow.ToString("o")
}

function Write-JsonResponse($Context, [int]$StatusCode, $Payload) {
  $json = $Payload | ConvertTo-Json -Depth 12 -Compress
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  $Context.Response.StatusCode = $StatusCode
  $Context.Response.ContentType = "application/json"
  $Context.Response.ContentEncoding = [System.Text.Encoding]::UTF8
  $Context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  $Context.Response.OutputStream.Close()
}

function Read-JsonBody($Context) {
  $reader = New-Object System.IO.StreamReader($Context.Request.InputStream, $Context.Request.ContentEncoding)
  $raw = $reader.ReadToEnd()
  $reader.Close()
  if ([string]::IsNullOrWhiteSpace($raw)) { return @{} }
  try {
    return $raw | ConvertFrom-Json -AsHashtable
  } catch {
    $normalized = [regex]::Replace($raw, '(?<=\d),(?=\d)', '.')
    try {
      return $normalized | ConvertFrom-Json -AsHashtable
    } catch {
      return @{}
    }
  }
}

function Invoke-BackendJson {
  param(
    [string]$Method,
    [string]$Url,
    $Body = $null
  )

  if ($Method -eq "GET") {
    return Invoke-RestMethod -Method Get -Uri $Url -TimeoutSec 20
  }

  $json = if ($null -ne $Body) { $Body | ConvertTo-Json -Depth 12 -Compress } else { "" }
  return Invoke-RestMethod -Method $Method -Uri $Url -ContentType "application/json" -Body $json -TimeoutSec 20
}

function Merge-Settings([hashtable]$Payload) {
  foreach ($key in @($script:State.settings.Keys)) {
    if ($Payload.ContainsKey($key)) {
      $script:State.settings[$key] = $Payload[$key]
    }
  }
  $script:State.settings["scalp_mode"] = $true
  $script:State.settings["auto_scan_enabled"] = [bool]$script:State.settings["bot_enabled"]
}

function Force-AutoScan([string]$Reason) {
  $script:State.settings["scalp_mode"] = $true
  $script:State.settings["auto_scan_enabled"] = [bool]$script:State.settings["bot_enabled"]
  $latest = @{}
  foreach ($k in $script:State.latest_signal.Keys) { $latest[$k] = $script:State.latest_signal[$k] }
  foreach ($k in $script:State.settings.Keys) { $latest[$k] = $script:State.settings[$k] }
  $latest["mode"] = "scalp"
  $latest["action"] = "AUTO_SCAN"
  $latest["startup_reason"] = $Reason
  $latest["timestamp"] = Now-Iso
  $script:State.latest_signal = $latest
}

function Safe-Float($Value, [double]$Fallback) {
  try {
    if ($Value -is [string]) {
      $Value = $Value.Trim().Replace(" ", "").Replace(",", ".")
    }
    return [double]$Value
  } catch {
    return $Fallback
  }
}

function In-Window([string]$NowHm, [string]$StartHm, [string]$EndHm) {
  $nowM = ([int]$NowHm.Substring(0, 2) * 60) + [int]$NowHm.Substring(3, 2)
  $startM = ([int]$StartHm.Substring(0, 2) * 60) + [int]$StartHm.Substring(3, 2)
  $endM = ([int]$EndHm.Substring(0, 2) * 60) + [int]$EndHm.Substring(3, 2)
  if ($startM -le $endM) { return $nowM -ge $startM -and $nowM -le $endM }
  return $nowM -ge $startM -or $nowM -le $endM
}

function Match-NoTradeWindow([string]$NowHm, [string]$Csv) {
  if ([string]::IsNullOrWhiteSpace($Csv)) { return $false }
  foreach ($w in $Csv.Split(",")) {
    $part = $w.Trim()
    if ($part -notlike "*-*") { continue }
    $segments = $part.Split("-", 2)
    $startHm = $segments[0].Trim()
    $endHm = $segments[1].Trim()
    if ($startHm.Length -eq 5 -and $endHm.Length -eq 5 -and (In-Window $NowHm $startHm $endHm)) { return $true }
  }
  return $false
}

function Symbol-Allowed([string]$Symbol, [string]$AllowedCsv) {
  $allowed = @($AllowedCsv.Split(",") | ForEach-Object { $_.Trim().ToUpper() } | Where-Object { $_ })
  if ($allowed.Count -eq 0) { return $true }
  return $allowed -contains $Symbol.ToUpper()
}

function Is-PreciousMetal([string]$Symbol) {
  $s = $Symbol.ToUpper()
  return $s.Contains("XAU") -or $s.Contains("XAG")
}

function Xau-SessionOk([string]$Symbol, [string]$Session) {
  if (-not ($Symbol.ToUpper().StartsWith("XAU"))) { return $true }
  if ($Session -notlike "*-*") { return $true }
  $parts = $Session.Split("-", 2)
  if ($parts[0].Trim().Length -ne 5 -or $parts[1].Trim().Length -ne 5) { return $true }
  $nowHm = [DateTime]::UtcNow.ToString("HH:mm")
  return In-Window $nowHm $parts[0].Trim() $parts[1].Trim()
}

function Get-TickerForSymbol([string]$Symbol) {
  switch ($Symbol.ToUpper().Trim()) {
    "EURUSD" { return "EURUSD=X" }
    "GBPUSD" { return "GBPUSD=X" }
    "USDJPY" { return "JPY=X" }
    "USDCAD" { return "CAD=X" }
    "AUDUSD" { return "AUDUSD=X" }
    "BTCUSD" { return "BTC-USD" }
    "XAUUSD" { return "GC=F" }
    "XAGUSD" { return "SI=F" }
    "US500" { return "^GSPC" }
    "NAS100" { return "^NDX" }
    "USOIL" { return "CL=F" }
    default { return $Symbol.ToUpper().Trim() }
  }
}

function Get-RecentOHLC([string]$Symbol, [string]$Interval, [string]$Range) {
  $ticker = Get-TickerForSymbol $Symbol
  $url = "https://query1.finance.yahoo.com/v8/finance/chart/$ticker?interval=$Interval&range=$Range"
  $resp = Invoke-RestMethod -Method Get -Uri $url -TimeoutSec 20
  $result = $resp.chart.result[0]
  if ($null -eq $result) { return @() }
  $timestamps = @($result.timestamp)
  $quote = $result.indicators.quote[0]
  $closes = @($quote.close)
  $highs = @($quote.high)
  $lows = @($quote.low)
  $bars = New-Object System.Collections.Generic.List[object]
  $size = [Math]::Min($timestamps.Count, [Math]::Min($closes.Count, [Math]::Min($highs.Count, $lows.Count)))
  for ($i = 0; $i -lt $size; $i++) {
    if ($null -eq $timestamps[$i] -or $null -eq $closes[$i] -or $null -eq $highs[$i] -or $null -eq $lows[$i]) { continue }
    $bars.Add([pscustomobject]@{
      timestamp = [int64]$timestamps[$i]
      high = [double]$highs[$i]
      low = [double]$lows[$i]
      close = [double]$closes[$i]
    })
  }
  return @($bars | Select-Object -Last 600)
}

function Get-SmaLast([double[]]$Values, [int]$Period) {
  if ($Values.Count -lt $Period -or $Period -le 0) { return 0.0 }
  $start = $Values.Count - $Period
  $sum = 0.0
  for ($i = $start; $i -lt $Values.Count; $i++) { $sum += $Values[$i] }
  return $sum / $Period
}

function Get-EmaSeries([double[]]$Values, [int]$Period) {
  if ($Values.Count -eq 0 -or $Period -le 0) { return @() }
  $k = 2.0 / ($Period + 1.0)
  $out = New-Object System.Collections.Generic.List[double]
  $out.Add($Values[0])
  for ($i = 1; $i -lt $Values.Count; $i++) {
    $prev = $out[$out.Count - 1]
    $out.Add($prev + (($Values[$i] - $prev) * $k))
  }
  return [double[]]$out.ToArray()
}

function Get-RsiLast([double[]]$Values, [int]$Period) {
  if ($Values.Count -lt ($Period + 1)) { return 50.0 }
  $gains = 0.0
  $losses = 0.0
  $start = $Values.Count - $Period
  for ($i = $start; $i -lt $Values.Count; $i++) {
    $delta = $Values[$i] - $Values[$i - 1]
    if ($delta -gt 0) { $gains += $delta } elseif ($delta -lt 0) { $losses += -$delta }
  }
  $avgGain = $gains / $Period
  $avgLoss = $losses / $Period
  if ($avgLoss -eq 0) { return 100.0 }
  $rs = $avgGain / $avgLoss
  return 100.0 - (100.0 / (1.0 + $rs))
}

function Get-StdDevLast([double[]]$Values, [int]$Period) {
  if ($Values.Count -lt $Period -or $Period -le 0) { return 0.0 }
  $mean = Get-SmaLast $Values $Period
  $start = $Values.Count - $Period
  $sum = 0.0
  for ($i = $start; $i -lt $Values.Count; $i++) {
    $sum += [Math]::Pow($Values[$i] - $mean, 2)
  }
  return [Math]::Sqrt($sum / $Period)
}

function Get-AtrSeries([double[]]$Highs, [double[]]$Lows, [double[]]$Closes, [int]$Period) {
  if ($Highs.Count -eq 0 -or $Lows.Count -eq 0 -or $Closes.Count -eq 0 -or $Period -le 0) { return @() }
  $trs = New-Object System.Collections.Generic.List[double]
  for ($i = 0; $i -lt $Closes.Count; $i++) {
    if ($i -eq 0) {
      $tr = $Highs[$i] - $Lows[$i]
    } else {
      $prevClose = $Closes[$i - 1]
      $tr = [Math]::Max($Highs[$i] - $Lows[$i], [Math]::Max([Math]::Abs($Highs[$i] - $prevClose), [Math]::Abs($Lows[$i] - $prevClose)))
    }
    $trs.Add([Math]::Max(0.0, $tr))
  }
  $out = New-Object System.Collections.Generic.List[double]
  $out.Add($trs[0])
  for ($i = 1; $i -lt $trs.Count; $i++) {
    $out.Add((($out[$out.Count - 1] * ($Period - 1)) + $trs[$i]) / $Period)
  }
  return [double[]]$out.ToArray()
}

function Get-PipSize([string]$Symbol) {
  $s = $Symbol.ToUpper().Trim()
  if ($s.EndsWith("JPY")) { return 0.01 }
  if ($s.StartsWith("XAU")) { return 0.1 }
  if ($s.StartsWith("XAG")) { return 0.01 }
  if ($s.StartsWith("BTC")) { return 1.0 }
  if ($s -in @("US500", "NAS100")) { return 1.0 }
  if ($s -eq "USOIL") { return 0.01 }
  return 0.0001
}

function Invoke-MarketScan([string]$Symbol, [double]$BaseLot) {
  $h1Bars = @(Get-RecentOHLC $Symbol "1h" "5d")
  if ($h1Bars.Count -lt 20) { return @{ action = "HOLD"; reason = "insufficient_h1"; lot = $BaseLot; timeframe = "h1" } }
  [double[]]$h1Closes = @($h1Bars | ForEach-Object { [double]$_.close })
  $h1Sma20 = Get-SmaLast $h1Closes 20
  $h1Trend = if ($h1Closes[-1] -gt $h1Sma20) { "BULLISH" } else { "BEARISH" }

  $m5TrendBars = @(Get-RecentOHLC $Symbol "5m" "2d")
  if ($m5TrendBars.Count -lt 20) { return @{ action = "HOLD"; reason = "insufficient_m5_trend"; lot = $BaseLot; timeframe = "m5" } }
  [double[]]$m5Closes = @($m5TrendBars | ForEach-Object { [double]$_.close })
  $m5Sma20 = Get-SmaLast $m5Closes 20
  $m5Trend = if ($m5Closes[-1] -gt $m5Sma20) { "BULLISH" } else { "BEARISH" }

  $bars = @(Get-RecentOHLC $Symbol "5m" "2d")
  if ($bars.Count -lt 50) { return @{ action = "HOLD"; reason = "insufficient_5m"; lot = $BaseLot; timeframe = "5m" } }
  [double[]]$closes = @($bars | ForEach-Object { [double]$_.close })
  [double[]]$highs = @($bars | ForEach-Object { [double]$_.high })
  [double[]]$lows = @($bars | ForEach-Object { [double]$_.low })
  [long[]]$times = @($bars | ForEach-Object { [int64]$_.timestamp })

  $currentClose = $closes[-1]
  $sma5 = Get-SmaLast $closes 5
  $rsi14 = Get-RsiLast $closes 14
  [double[]]$ema12 = Get-EmaSeries $closes 12
  [double[]]$ema26 = Get-EmaSeries $closes 26
  $macdLine = New-Object System.Collections.Generic.List[double]
  $size = [Math]::Min($ema12.Count, $ema26.Count)
  for ($i = 0; $i -lt $size; $i++) { $macdLine.Add($ema12[$i] - $ema26[$i]) }
  [double[]]$macdArray = $macdLine.ToArray()
  [double[]]$signalLine = Get-EmaSeries $macdArray 9
  $currentMacd = if ($macdArray.Count -gt 0) { $macdArray[-1] } else { 0.0 }
  $currentSignal = if ($signalLine.Count -gt 0) { $signalLine[-1] } else { 0.0 }

  $bbMiddle = Get-SmaLast $closes 20
  $bbStd = Get-StdDevLast $closes 20
  $bbUpper = $bbMiddle + (2.0 * $bbStd)
  $bbLower = $bbMiddle - (2.0 * $bbStd)

  [double[]]$atrValues = Get-AtrSeries $highs $lows $closes $ATR_LEN
  $atrPrice = if ($atrValues.Count -gt 0) { [Math]::Max(0.0, $atrValues[-1] * $ATR_STOP_MULT) } else { 0.0 }
  $pipSize = Get-PipSize $Symbol
  $slPips = if ($pipSize -gt 0) { [Math]::Max(1, [int][Math]::Round($atrPrice / $pipSize)) } else { 7 }
  $tpPips = [Math]::Max(1, [int][Math]::Round($slPips * $RISK_REWARD_RATIO))

  $lotSize = if (Is-PreciousMetal $Symbol) { 0.02 } else { [Math]::Max(0.01, $BaseLot) }
  $action = "HOLD"
  $reason = "no_entry"

  $buyCond = ($currentClose -gt $sma5 -and $rsi14 -lt 70 -and $h1Trend -eq "BULLISH" -and $m5Trend -eq "BULLISH" -and $currentMacd -gt $currentSignal -and $currentClose -lt $bbUpper)
  $sellCond = ($currentClose -lt $sma5 -and $rsi14 -gt 30 -and $h1Trend -eq "BEARISH" -and $m5Trend -eq "BEARISH" -and $currentMacd -lt $currentSignal -and $currentClose -gt $bbLower)

  if ($buyCond) {
    $action = "BUY"
    $reason = "mtf_buy_confirmed"
    if ($rsi14 -lt 30) {
      $lotSize = if (Is-PreciousMetal $Symbol) { 0.04 } else { 0.20 }
      $reason = "mtf_buy_momentum"
    }
  } elseif ($sellCond) {
    $action = "SELL"
    $reason = "mtf_sell_confirmed"
    if ($rsi14 -gt 70) {
      $lotSize = if (Is-PreciousMetal $Symbol) { 0.10 } else { 0.20 }
      $reason = "mtf_sell_momentum"
    }
  }

  $score = [Math]::Abs($currentMacd - $currentSignal) * 1000.0 + [Math]::Abs($rsi14 - 50.0) * 0.5
  $candleTs = [DateTimeOffset]::FromUnixTimeSeconds($times[-1]).UtcDateTime.ToString("o")
  return @{
    action = $action
    score = [Math]::Round($score, 5)
    reason = $reason
    timeframe = "5m"
    sl_pips = $slPips
    tp_pips = $tpPips
    candle_ts = $candleTs
    price = $currentClose
    lot = $lotSize
    h1_trend = $h1Trend
    m5_trend = $m5Trend
    rsi14 = [Math]::Round($rsi14, 2)
  }
}

function Scan-Symbol([string]$Symbol) {
  $defaultLot = Safe-Float $script:State.settings["auto_order_lot"] 0.01
  try {
    $scan = Invoke-MarketScan $Symbol $defaultLot
    return @{
      symbol = $Symbol.ToUpper()
      action = [string]$scan.action
      score = [double]$scan.score
      reason = [string]$scan.reason
      timeframe = [string]$scan.timeframe
      sl_pips = [int]$scan.sl_pips
      tp_pips = [int]$scan.tp_pips
      candle_ts = [string]$scan.candle_ts
      price = [double]$scan.price
      lot = [double]$scan.lot
      h1_trend = [string]$scan.h1_trend
      m5_trend = [string]$scan.m5_trend
      rsi14 = [double]$scan.rsi14
    }
  } catch {
    return @{
      symbol = $Symbol.ToUpper()
      action = "HOLD"
      score = 0.0
      reason = "scan_error:$($_.Exception.Message)"
      timeframe = "5m"
      sl_pips = 7
      tp_pips = 12
      candle_ts = ""
      price = 0.0
      lot = $defaultLot
    }
  }
}

function Choose-ScanSymbol($Payload) {
  $lockSymbol = [string]($Payload["lock_symbol"])
  if (-not [string]::IsNullOrWhiteSpace($lockSymbol)) {
    return Scan-Symbol $lockSymbol
  }

  $scopedCsv = [string]($Payload["scoped_symbols_csv"])
  if ([string]::IsNullOrWhiteSpace($scopedCsv)) { $scopedCsv = [string]$script:State.settings["scoped_symbols_csv"] }
  $scoped = @($scopedCsv.Split(",") | ForEach-Object { $_.Trim().ToUpper() } | Where-Object { $_ })
  if ($scoped.Count -eq 0) {
    $fallback = [string]($Payload["symbol"])
    if ([string]::IsNullOrWhiteSpace($fallback)) { $fallback = "XAUUSD" }
    $scoped = @($fallback.ToUpper())
  }

  $scans = @()
  foreach ($sym in $scoped) { $scans += ,(Scan-Symbol $sym) }
  $tradable = @($scans | Where-Object { $_.action -in @("BUY", "SELL") } | Sort-Object { [Math]::Abs([double]$_.score) } -Descending)
  if ($tradable.Count -gt 0) { return $tradable[0] }
  return $scans[0]
}

function Build-AutoSignal($Payload) {
  $auto = @{}
  foreach ($k in $Payload.Keys) { $auto[$k] = $Payload[$k] }
  $selected = Choose-ScanSymbol $Payload
  $symbol = [string]$selected.symbol
  $action = [string]$selected.action
  $candleTs = [string]$selected.candle_ts

  if (($action -eq "BUY" -or $action -eq "SELL") -and -not [string]::IsNullOrWhiteSpace($candleTs)) {
    if ((-not (Is-PreciousMetal $symbol)) -and $script:State.last_emitted_scan_candle[$symbol] -eq $candleTs) {
      $action = "HOLD"
      $selected.reason = "already_sent_for_current_candle"
    } else {
      $script:State.last_emitted_scan_candle[$symbol] = $candleTs
    }
  }

  $auto["symbol"] = $symbol
  $auto["action"] = $action
  $auto["scan_score"] = $selected.score
  $auto["scan_reason"] = $selected.reason
  $auto["scan_timeframe"] = $selected.timeframe
  $auto["scan_candle_ts"] = $selected.candle_ts
  $auto["scan_price"] = $selected.price
  $auto["lot"] = Safe-Float $selected.lot (Safe-Float $script:State.settings["auto_order_lot"] 0.01)
  $auto["sl_pips"] = [int]$selected.sl_pips
  $auto["tp_pips"] = [int]$selected.tp_pips
  $auto["rr_ratio"] = $RISK_REWARD_RATIO
  $auto["atr_mult"] = $ATR_STOP_MULT
  return $auto
}

function Risk-Gate($Payload) {
  $today = [DateTime]::UtcNow.ToString("yyyy-MM-dd")
  if ($script:State.risk["pnl_day"] -ne $today) {
    $script:State.risk["pnl_day"] = $today
    $script:State.risk["daily_pnl"] = 0.0
  }

  $maxDailyLoss = Safe-Float $script:State.settings["max_daily_loss"] 0.0
  if ($maxDailyLoss -gt 0 -and (Safe-Float $script:State.risk["daily_pnl"] 0.0) -le (-1 * [Math]::Abs($maxDailyLoss))) {
    return "daily_loss_limit_reached($($script:State.risk["daily_pnl"]))"
  }

  $lot = Safe-Float $Payload["lot"] 0.01
  $maxLot = Safe-Float $script:State.settings["max_lot"] 0.1
  if ($lot -gt $maxLot) { return "lot_above_max($lot>$maxLot)" }

  $symbol = [string]$Payload["symbol"]
  if (-not (Symbol-Allowed $symbol ([string]$script:State.settings["allowed_symbols_csv"]))) { return "symbol_not_allowed($symbol)" }

  $nowHm = [DateTime]::UtcNow.ToString("HH:mm")
  if (Match-NoTradeWindow $nowHm ([string]$script:State.settings["no_trade_windows_utc"])) { return "no_trade_window($nowHm)" }

  if ([bool]$script:State.settings["only_xau_session_filter"] -and -not (Xau-SessionOk $symbol ([string]$script:State.settings["xau_session_utc"]))) {
    return "xau_session_block($($script:State.settings["xau_session_utc"]))"
  }

  return ""
}

function Post-BridgeEvent([string]$EventType, [string]$Symbol, [string]$Detail, $Payload) {
  try {
    Invoke-BackendJson -Method POST -Url $ApiBridgeUrl -Body @{
      kind = "event"
      client_id = $ClientId
      bridge_id = $BridgeId
      event_type = $EventType
      symbol = $Symbol
      detail = $Detail
      payload = $Payload
    } | Out-Null
  } catch {}
}

function Post-SignalsRejection([string]$Symbol, [string]$Detail) {
  try {
    Invoke-BackendJson -Method POST -Url $ApiSignalsUrl -Body @{
      client_id = $ClientId
      event_type = "rejection"
      reason = "powershell_risk_filter"
      detail = $Detail
      symbol = $Symbol
    } | Out-Null
  } catch {}
}

function Apply-Command($Command) {
  $cmdType = [string]$Command.type
  $payload = if ($Command.payload -is [hashtable]) { $Command.payload } else { @{} }

  if ($cmdType -eq "TRADE_COMMAND") {
    $latest = @{}
    foreach ($k in $script:State.latest_signal.Keys) { $latest[$k] = $script:State.latest_signal[$k] }
    foreach ($k in $payload.Keys) { $latest[$k] = $payload[$k] }
    $action = [string]$latest["action"]
    if ($action -in @("AUTO", "AUTO_SCAN", "SCAN")) {
      $latest = Build-AutoSignal $latest
      $script:State.settings["auto_scan_enabled"] = $true
    }
    $blockReason = Risk-Gate $latest
    if (-not [string]::IsNullOrWhiteSpace($blockReason) -and ([string]$latest["action"] -in @("BUY", "SELL"))) {
      $latest["action"] = "HOLD"
      $latest["bridge_block_reason"] = $blockReason
      $script:State.risk["last_block_reason"] = $blockReason
      Post-BridgeEvent "risk_block" ([string]$latest["symbol"]) $blockReason $latest
      Post-SignalsRejection ([string]$latest["symbol"]) $blockReason
    }
    $latest["timestamp"] = Now-Iso
    $latest["bot_enabled"] = [bool]$script:State.settings["bot_enabled"]
    $script:State.latest_signal = $latest
    return
  }

  if ($cmdType -eq "BOT_POWER") {
    if ($payload.ContainsKey("bot_enabled")) { $script:State.settings["bot_enabled"] = [bool]$payload["bot_enabled"] }
    if ([bool]$script:State.settings["bot_enabled"]) {
      $script:State.settings["auto_scan_enabled"] = [bool]$script:State.settings["scalp_mode"]
    } else {
      $script:State.settings["auto_scan_enabled"] = $false
    }
    $latest = @{}
    foreach ($k in $script:State.latest_signal.Keys) { $latest[$k] = $script:State.latest_signal[$k] }
    $latest["bot_enabled"] = [bool]$script:State.settings["bot_enabled"]
    if (-not [bool]$latest["bot_enabled"]) { $latest["action"] = "HOLD" }
    $latest["timestamp"] = Now-Iso
    $script:State.latest_signal = $latest
    return
  }

  if ($cmdType -eq "APPLY_SCOPING") {
    Merge-Settings $payload
    $script:State.settings["auto_scan_enabled"] = [bool]$script:State.settings["bot_enabled"] -and [bool]$script:State.settings["scalp_mode"]
    $latest = @{}
    foreach ($k in $script:State.latest_signal.Keys) { $latest[$k] = $script:State.latest_signal[$k] }
    foreach ($k in $script:State.settings.Keys) { $latest[$k] = $script:State.settings[$k] }
    $latest["timestamp"] = Now-Iso
    $script:State.latest_signal = $latest
    return
  }

  if ($cmdType -eq "STOP_ALL") {
    $script:State.settings["auto_scan_enabled"] = $false
    $latest = @{}
    foreach ($k in $script:State.latest_signal.Keys) { $latest[$k] = $script:State.latest_signal[$k] }
    $latest["action"] = "HOLD"
    $latest["timestamp"] = Now-Iso
    $script:State.latest_signal = $latest
  }
}

function Post-Ack([string]$CommandId, [string]$Status, [string]$Note) {
  try {
    Invoke-BackendJson -Method POST -Url $ApiBridgeUrl -Body @{
      kind = "ack"
      client_id = $ClientId
      bridge_id = $BridgeId
      command_id = $CommandId
      status = $Status
      note = $Note
    } | Out-Null
  } catch {}
}

function Poll-Backend {
  $wasPollOk = [bool]$script:State.last_poll_ok
  try {
    $url = "$ApiBridgeUrl?next=1&bridge_id=$([uri]::EscapeDataString($BridgeId))&client_id=$([uri]::EscapeDataString($ClientId))"
    $data = Invoke-BackendJson -Method GET -Url $url
    $script:State.last_poll_ok = $true
    $script:State.last_error = ""
    $script:State.last_poll_time = Now-Iso
    if ($null -ne $data.settings) {
      $settingsHash = $data.settings | ConvertTo-Json -Depth 12 | ConvertFrom-Json -AsHashtable
      Merge-Settings $settingsHash
    }
    if (-not $wasPollOk) { Force-AutoScan "powershell_reconnect" }
    if ($null -ne $data.command -and $data.command.id) {
      $commandHash = $data.command | ConvertTo-Json -Depth 12 | ConvertFrom-Json -AsHashtable
      Apply-Command $commandHash
      Post-Ack ([string]$commandHash.id) "applied" "applied by powershell relay"
    }
  } catch {
    $script:State.last_poll_ok = $false
    $script:State.last_error = $_.Exception.Message
    $script:State.last_poll_time = Now-Iso
  }
}

function Handle-SignalRequest($Context) {
  $mode = $Context.Request.QueryString["mode"]
  if ([string]::IsNullOrWhiteSpace($mode)) { $mode = "scalp" }
  $payload = @{}
  foreach ($k in $script:State.latest_signal.Keys) { $payload[$k] = $script:State.latest_signal[$k] }
  foreach ($k in $script:State.settings.Keys) { $payload[$k] = $script:State.settings[$k] }
  $payload["mode"] = $mode
  $payload["timestamp"] = Now-Iso

  if ([bool]$payload["bot_enabled"] -and [bool]$script:State.settings["auto_scan_enabled"] -and [bool]$script:State.settings["scalp_mode"]) {
    $payload = Build-AutoSignal $payload
    foreach ($k in $script:State.settings.Keys) { $payload[$k] = $script:State.settings[$k] }
    $payload["mode"] = $mode
    $payload["timestamp"] = Now-Iso
    $script:State.latest_signal = $payload
  }

  if (-not [bool]$payload["bot_enabled"]) { $payload["action"] = "HOLD" }
  Write-JsonResponse $Context 200 $payload
}

function Handle-EventRequest($Context) {
  $body = Read-JsonBody $Context
  if (-not ($body -is [hashtable])) { $body = @{} }

  if ([string]$body["event_type"] -eq "open_trades") {
    $today = [DateTime]::UtcNow.ToString("yyyy-MM-dd")
    if ($script:State.risk["pnl_day"] -ne $today) {
      $script:State.risk["pnl_day"] = $today
      $script:State.risk["daily_pnl"] = 0.0
    }
    $script:State.risk["daily_pnl"] = Safe-Float $body["open_profit"] 0.0
  }

  $signalPayload = @{}
  foreach ($k in $body.Keys) { $signalPayload[$k] = $body[$k] }
  $signalPayload["client_id"] = $ClientId

  $errors = New-Object System.Collections.Generic.List[string]
  $signalOk = $false
  $bridgeOk = $false
  try {
    Invoke-BackendJson -Method POST -Url $ApiSignalsUrl -Body $signalPayload | Out-Null
    $signalOk = $true
  } catch {
    $errors.Add("signals:$($_.Exception.Message)")
  }

  try {
    Invoke-BackendJson -Method POST -Url $ApiBridgeUrl -Body @{
      kind = "event"
      client_id = $ClientId
      bridge_id = $BridgeId
      event_type = [string]$body["event_type"]
      symbol = [string]$body["symbol"]
      detail = [string]$body["detail"]
      payload = $body
    } | Out-Null
    $bridgeOk = $true
  } catch {
    $errors.Add("bridge:$($_.Exception.Message)")
  }

  $code = if ($errors.Count -eq 0) { 200 } else { 502 }
  Write-JsonResponse $Context $code @{
    ok = ($errors.Count -eq 0)
    client_id = $ClientId
    signals = @{ ok = $signalOk }
    bridge = @{ ok = $bridgeOk }
    errors = @($errors)
  }
}

Force-AutoScan "powershell_startup"

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://127.0.0.1:$Port/")
$listener.Start()
Write-Host "[TradeAutomate Relay] Listening on http://127.0.0.1:$Port"
Write-Host "[TradeAutomate Relay] ClientId=$ClientId BridgeId=$BridgeId Backend=$BackendBaseUrl"

$nextPoll = Get-Date
try {
  while ($script:State.running) {
    if ((Get-Date) -ge $nextPoll) {
      Poll-Backend
      $nextPoll = (Get-Date).AddSeconds($PollSeconds)
    }

    if ($listener.Pending()) {
      $context = $listener.GetContext()
      $path = $context.Request.Url.AbsolutePath.ToLowerInvariant()
      switch ($path) {
        "/health" {
          Write-JsonResponse $context 200 @{
            ok = $true
            client_id = $ClientId
            bridge_id = $BridgeId
            backend = $BackendBaseUrl
            last_poll_ok = $script:State.last_poll_ok
            last_error = $script:State.last_error
            last_poll_time = $script:State.last_poll_time
            risk = $script:State.risk
            settings = $script:State.settings
          }
        }
        "/signal" { Handle-SignalRequest $context }
        "/event" { Handle-EventRequest $context }
        default {
          Write-JsonResponse $context 404 @{ ok = $false; error = "Not found." }
        }
      }
    } else {
      Start-Sleep -Milliseconds 200
    }
  }
} finally {
  $listener.Stop()
  $listener.Close()
}

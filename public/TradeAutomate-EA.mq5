//+------------------------------------------------------------------+
//| TradeAutomate AI - Expert Advisor v1.20 (MT5)                    |
//| Signal + Scalp execution bridge for MetaTrader 5                 |
//+------------------------------------------------------------------+
#property strict
#property version   "1.20"

#include <Trade\Trade.mqh>

input string AppURL      = "https://tradeautomate-ai.vercel.app/api/signals";
input string EventURL    = "https://tradeautomate-ai.vercel.app/api/signals";
input string BackupAppURL = "https://tradeautomate-ai.vercel.app/api/signals";
input string BackupEventURL = "https://tradeautomate-ai.vercel.app/api/signals";
input string ClientId    = "0000";
input string AuthToken   = "YOUR_AUTH_TOKEN";
input int    PollSeconds = 1;
input bool   ScalpMode   = true;
input double DefaultLot  = 0.10;
input int    MagicSignal = 12345;
input int    MagicScalp  = 54321;
input int    Slippage    = 3;
input bool   EnableLogs  = true;
input int    RequestTimeoutMs = 10000;
input int    MaxOpenTrades = 5;
input string ScopedSymbolsCSV = "EURUSD,GBPUSD,USDJPY,XAUUSD,BTCUSD,USDCAD,AUDUSD,US500,NAS100,USOIL";
input string RequiredAccountMode = "AUTO";
input bool   UseSignalFile = true;
input string SignalFileName = "TradeSignal.txt";
input int    DefaultSignalFileTrades = 3;

CTrade Trade;
string LastSignalId = "";
bool BotEnabledState = true;
int HeartbeatTickCount = 0;

int OnInit() {
  EventSetTimer(5);
  if (EnableLogs) {
    string mode = IsDemoAccount() ? "DEMO" : "LIVE";
    Print("[TradeAutomate-MT5] EA initialized. version=1.20 TimerSeconds=5 PollSeconds=", PollSeconds, " ScalpMode=", ScalpMode, " RequiredAccountMode=", RequiredAccountMode);
    Print("[TradeAutomate-MT5] Broker=", AccountInfoString(ACCOUNT_COMPANY), " Server=", AccountInfoString(ACCOUNT_SERVER), " Login=", (long)AccountInfoInteger(ACCOUNT_LOGIN), " CurrentAccountMode=", mode);
    Print("[TradeAutomate-MT5] AppURL=", AppURL, " RequestTimeoutMs=", RequestTimeoutMs, " MaxOpenTrades=", MaxOpenTrades, " ClientId=", ClientId);
  }
  return(INIT_SUCCEEDED);
}

void OnDeinit(const int reason) {
  EventKillTimer();
  if (EnableLogs) Print("[TradeAutomate-MT5] EA deinitialized. reason=", reason);
}

bool IsDemoAccount() {
  long mode = AccountInfoInteger(ACCOUNT_TRADE_MODE);
  return(mode == ACCOUNT_TRADE_MODE_DEMO);
}

double PipValueForSymbol(string sym) {
  double pt = SymbolInfoDouble(sym, SYMBOL_POINT);
  int digits = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
  if (digits == 3 || digits == 5) return(pt * 10.0);
  return(pt);
}

double NormalizePriceForSymbol(string sym, double value) {
  int digits = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
  return(NormalizeDouble(value, digits));
}

string JsonEscape(string s) {
  string x = s;
  StringReplace(x, "\\", "\\\\");
  StringReplace(x, "\"", "\\\"");
  return(x);
}

bool ReadSignalFileBody(string &bodyOut) {
  if (!UseSignalFile) return(false);
  int handle = FileOpen(SignalFileName, FILE_READ | FILE_TXT | FILE_ANSI | FILE_COMMON | FILE_SHARE_READ | FILE_SHARE_WRITE);
  if (handle == INVALID_HANDLE) return(false);

  string text = "";
  while (!FileIsEnding(handle)) {
    string line = FileReadString(handle);
    if (text != "") text += "\n";
    text += line;
  }
  FileClose(handle);

  StringTrimLeft(text);
  StringTrimRight(text);
  if (text == "") return(false);

  bodyOut = text;
  return(true);
}

string ErrorHint(int err) {
  if (err == 4014) return("Allow WebRequest URL in terminal options.");
  if (err == 4060) return("Enable Algo Trading and allow WebRequest.");
  if (err == 5204) return("Connection timeout. Increase timeout/check network.");
  if (err == 5203) return("HTTP request failed. Verify URL and SSL.");
  return("");
}

string TradeErrorMessage(int err) {
  if (err == 0) return("ok");
  if (err == 10004) return("requote");
  if (err == 10006) return("reject");
  if (err == 10015) return("invalid_price");
  if (err == 10016) return("invalid_stops");
  if (err == 10019) return("not_enough_money");
  if (err == 10021) return("price_off");
  if (err == 10027) return("autotrading_disabled");
  return("err_" + IntegerToString(err));
}

bool PostEvent(string payload, string tag) {
  string headers = "Content-Type: application/json\r\nAuthorization: Bearer " + AuthToken;
  char postData[], result[];
  string resultHeaders;
  StringToCharArray(payload, postData, 0, WHOLE_ARRAY, CP_UTF8);

  string postUrl = EventURL;
  if (postUrl == "") postUrl = AppURL;

  ResetLastError();
  int response = WebRequest("POST", postUrl, headers, RequestTimeoutMs, postData, result, resultHeaders);
  if (response != 200 && BackupEventURL != "" && postUrl != BackupEventURL) {
    ResetLastError();
    response = WebRequest("POST", BackupEventURL, headers, RequestTimeoutMs, postData, result, resultHeaders);
    if (response == 200) return(true);
  }

  if (response != 200) {
    if (EnableLogs) {
      int err = GetLastError();
      Print("[TradeAutomate-MT5] ", tag, " POST failed. response=", response, " err=", err, " url=", postUrl, " ", ErrorHint(err));
    }
    return(false);
  }
  return(true);
}

int CountOpenBotTrades() {
  int count = 0;
  int total = PositionsTotal();
  for (int i = total - 1; i >= 0; i--) {
    ulong ticket = PositionGetTicket(i);
    if (ticket == 0 || !PositionSelectByTicket(ticket)) continue;
    long type = PositionGetInteger(POSITION_TYPE);
    if (type != POSITION_TYPE_BUY && type != POSITION_TYPE_SELL) continue;
    long magic = PositionGetInteger(POSITION_MAGIC);
    if (magic == MagicSignal || magic == MagicScalp) count++;
  }
  return(count);
}

int CountOpenAllTrades() {
  int count = 0;
  int total = PositionsTotal();
  for (int i = total - 1; i >= 0; i--) {
    ulong ticket = PositionGetTicket(i);
    if (ticket == 0 || !PositionSelectByTicket(ticket)) continue;
    long type = PositionGetInteger(POSITION_TYPE);
    if (type != POSITION_TYPE_BUY && type != POSITION_TYPE_SELL) continue;
    count++;
  }
  return(count);
}

double OpenProfitAllTrades() {
  double total = 0.0;
  int count = PositionsTotal();
  for (int i = count - 1; i >= 0; i--) {
    ulong ticket = PositionGetTicket(i);
    if (ticket == 0 || !PositionSelectByTicket(ticket)) continue;
    long type = PositionGetInteger(POSITION_TYPE);
    if (type != POSITION_TYPE_BUY && type != POSITION_TYPE_SELL) continue;
    total += PositionGetDouble(POSITION_PROFIT) + PositionGetDouble(POSITION_SWAP) + 0.0; // POSITION_COMMISSION removed (deprecated)
  }
  return(total);
}

void SendHeartbeat(string sym) {
  string accountMode = IsDemoAccount() ? "DEMO" : "LIVE";
  int openCount = CountOpenAllTrades();
  double openProfit = OpenProfitAllTrades();

  string payload = StringFormat(
    "{\"client_id\":\"%s\",\"event_type\":\"heartbeat\",\"account_mode\":\"%s\",\"broker\":\"%s\",\"server\":\"%s\",\"account_number\":\"%I64d\",\"symbol\":\"%s\",\"ea_version\":\"v1.20-mt5\",\"open_count\":%d,\"open_profit\":%G}",
    JsonEscape(ClientId),
    accountMode,
    JsonEscape(AccountInfoString(ACCOUNT_COMPANY)),
    JsonEscape(AccountInfoString(ACCOUNT_SERVER)),
    (long)AccountInfoInteger(ACCOUNT_LOGIN),
    JsonEscape(sym),
    openCount,
    openProfit
  );
  PostEvent(payload, "heartbeat");
}

void SendOpenTradesSnapshot(string sym) {
  string accountMode = IsDemoAccount() ? "DEMO" : "LIVE";
  string tradesJson = "";
  int openCount = 0;
  double openProfit = 0.0;
  int total = PositionsTotal();

  for (int i = total - 1; i >= 0; i--) {
    ulong ticket = PositionGetTicket(i);
    if (ticket == 0 || !PositionSelectByTicket(ticket)) continue;
    long type = PositionGetInteger(POSITION_TYPE);
    if (type != POSITION_TYPE_BUY && type != POSITION_TYPE_SELL) continue;

    string side = type == POSITION_TYPE_BUY ? "BUY" : "SELL";
    string psym = PositionGetString(POSITION_SYMBOL);
    double lot = PositionGetDouble(POSITION_VOLUME);
    double openPrice = PositionGetDouble(POSITION_PRICE_OPEN);
    double profit = PositionGetDouble(POSITION_PROFIT) + PositionGetDouble(POSITION_SWAP) + 0.0; // POSITION_COMMISSION removed (deprecated)
    long magic = PositionGetInteger(POSITION_MAGIC);
    double sl = PositionGetDouble(POSITION_SL);
    double tp = PositionGetDouble(POSITION_TP);

    if (tradesJson != "") tradesJson += ",";
    tradesJson += StringFormat(
      "{\"ticket\":%I64u,\"symbol\":\"%s\",\"side\":\"%s\",\"lot\":%G,\"open_price\":%G,\"profit\":%G,\"magic\":%d,\"stop_loss\":%G,\"take_profit\":%G}",
      ticket, JsonEscape(psym), side, lot, openPrice, profit, (int)magic, sl, tp
    );
    openCount++;
    openProfit += profit;
  }

  string payload = StringFormat(
    "{\"client_id\":\"%s\",\"event_type\":\"open_trades\",\"account_mode\":\"%s\",\"broker\":\"%s\",\"server\":\"%s\",\"account_number\":\"%I64d\",\"symbol\":\"%s\",\"ea_version\":\"v1.20-mt5\",\"open_count\":%d,\"open_profit\":%G,\"open_trades\":[%s]}",
    JsonEscape(ClientId),
    accountMode,
    JsonEscape(AccountInfoString(ACCOUNT_COMPANY)),
    JsonEscape(AccountInfoString(ACCOUNT_SERVER)),
    (long)AccountInfoInteger(ACCOUNT_LOGIN),
    JsonEscape(sym),
    openCount,
    openProfit,
    tradesJson
  );
  PostEvent(payload, "open_trades");
}

void SendExecutionEvent(string action, string sym, ulong ticket, double lot, double price) {
  double sl = 0.0;
  double tp = 0.0;
  if (ticket > 0 && PositionSelectByTicket(ticket)) {
    sl = PositionGetDouble(POSITION_SL);
    tp = PositionGetDouble(POSITION_TP);
  }
  string payload = StringFormat(
    "{\"client_id\":\"%s\",\"event_type\":\"execution\",\"action\":\"%s\",\"symbol\":\"%s\",\"ticket\":%I64u,\"lot\":%G,\"price\":%G,\"stop_loss\":%G,\"take_profit\":%G}",
    JsonEscape(ClientId),
    action, JsonEscape(sym), ticket, lot, price, sl, tp
  );
  PostEvent(payload, "execution");
}

void SendRejectionEvent(string reason, string detail, string sym) {
  string payload = StringFormat(
    "{\"client_id\":\"%s\",\"event_type\":\"rejection\",\"reason\":\"%s\",\"detail\":\"%s\",\"symbol\":\"%s\"}",
    JsonEscape(ClientId),
    JsonEscape(reason), JsonEscape(detail), JsonEscape(sym)
  );
  PostEvent(payload, "rejection");
}

int SkipWs(string text, int idx) {
  int len = StringLen(text);
  while (idx < len) {
    int c = StringGetCharacter(text, idx);
    if (c != 32 && c != 9 && c != 10 && c != 13) break;
    idx++;
  }
  return(idx);
}

string ExtractJsonValue(string body, string key) {
  string k = "\"" + key + "\"";
  int keyPos = StringFind(body, k);
  if (keyPos < 0) return("");
  int colonPos = StringFind(body, ":", keyPos + StringLen(k));
  if (colonPos < 0) return("");
  int i = SkipWs(body, colonPos + 1);
  if (i >= StringLen(body)) return("");

  int first = StringGetCharacter(body, i);
  if (first == 34) {
    i++;
    int end = StringFind(body, "\"", i);
    if (end < 0) return("");
    return(StringSubstr(body, i, end - i));
  }

  int j = i;
  while (j < StringLen(body)) {
    int c = StringGetCharacter(body, j);
    if (c == 44 || c == 125 || c == 93) break;
    j++;
  }

  string raw = StringSubstr(body, i, j - i);
  StringTrimLeft(raw);
  StringTrimRight(raw);
  return(raw);
}

string NormalizeAction(string raw) {
  if (raw == "") return("");
  string v = raw;
  StringTrimLeft(v); StringTrimRight(v); StringToUpper(v);
  if (v == "B" || v == "LONG") return("BUY");
  if (v == "S" || v == "SHORT") return("SELL");
  if (StringFind(v, "BUY") == 0) return("BUY");
  if (StringFind(v, "SELL") == 0) return("SELL");
  if (v == "HOLD" || v == "NONE" || v == "UNKNOWN" || v == "NULL") return("");
  return("");
}

string ExtractActionFromBody(string body) {
  string action = NormalizeAction(ExtractJsonValue(body, "action"));
  if (action == "") action = NormalizeAction(ExtractJsonValue(body, "side"));
  if (action == "") action = NormalizeAction(ExtractJsonValue(body, "direction"));
  if (action == "") action = NormalizeAction(ExtractJsonValue(body, "signal"));
  if (action == "") action = NormalizeAction(ExtractJsonValue(body, "type"));
  return(action);
}

string NormalizeSymbol(string raw) {
  string s = raw;
  StringTrimLeft(s); StringTrimRight(s); StringToUpper(s);
  return(s);
}

bool ParseBool(string raw, bool fallback) {
  string v = raw;
  StringTrimLeft(v); StringTrimRight(v); StringToUpper(v);
  if (v == "1" || v == "TRUE" || v == "YES" || v == "ON") return(true);
  if (v == "0" || v == "FALSE" || v == "NO" || v == "OFF") return(false);
  return(fallback);
}

bool SymbolAllowed(string sym, string csv) {
  string target = NormalizeSymbol(sym);
  if (target == "") return(false);
  string list = csv;
  StringTrimLeft(list); StringTrimRight(list);
  if (list == "") return(true);
  string up = list;
  StringToUpper(up);
  string parts[];
  int n = StringSplit(up, ',', parts);
  if (n <= 0) return(true);
  for (int i = 0; i < n; i++) {
    string p = parts[i];
    StringTrimLeft(p); StringTrimRight(p);
    if (p == target) return(true);
  }
  return(false);
}

string ResolveBrokerSymbol(string requested) {
  string target = NormalizeSymbol(requested);
  if (target == "") return("");
  if (SymbolSelect(target, true)) return(target);

  int totalVisible = SymbolsTotal(true);
  for (int i = 0; i < totalVisible; i++) {
    string s = NormalizeSymbol(SymbolName(i, true));
    if (s == "") continue;
    if (StringFind(s, target) == 0 || StringFind(s, target) >= 0) {
      if (SymbolSelect(s, true)) return(s);
    }
  }

  int totalAll = SymbolsTotal(false);
  for (int j = 0; j < totalAll; j++) {
    string s2 = NormalizeSymbol(SymbolName(j, false));
    if (s2 == "") continue;
    if (StringFind(s2, target) == 0 || StringFind(s2, target) >= 0) {
      if (SymbolSelect(s2, true)) return(s2);
    }
  }
  return("");
}

string BuildSignalFingerprint(string body, string source) {
  return(source + "|" + ExtractActionFromBody(body) + "|" + NormalizeSymbol(ExtractJsonValue(body, "symbol")) + "|" + ExtractJsonValue(body, "lot") + "|" + ExtractJsonValue(body, "tp_pips") + "|" + ExtractJsonValue(body, "sl_pips") + "|" + ExtractJsonValue(body, "trade_count") + "|" + ExtractJsonValue(body, "timestamp"));
}

int ExtractTradeCopies(string body, bool fileSignal) {
  string raw = ExtractJsonValue(body, "trade_count");
  if (raw == "") raw = ExtractJsonValue(body, "copies");
  if (raw == "") raw = ExtractJsonValue(body, "positions");
  if (raw == "") raw = ExtractJsonValue(body, "trades");
  int count = (int)StringToDouble(raw);
  if (count <= 0) count = fileSignal ? DefaultSignalFileTrades : 1;
  if (count < 1) count = 1;
  if (count > 3) count = 3;
  return(count);
}

bool FetchSignalBody(string mode, string &bodyOut) {
  string headers = "Authorization: Bearer " + AuthToken;
  char postData[], result[];
  string resultHeaders;
  string url = AppURL + "?mode=" + mode + "&limit=1&client_id=" + ClientId;
  ResetLastError();
  int response = WebRequest("GET", url, headers, RequestTimeoutMs, postData, result, resultHeaders);
  if (response != 200 && BackupAppURL != "") {
    string backupUrl = BackupAppURL + "?mode=" + mode + "&limit=1&client_id=" + ClientId;
    ResetLastError();
    response = WebRequest("GET", backupUrl, headers, RequestTimeoutMs, postData, result, resultHeaders);
    if (response == 200) {
      bodyOut = CharArrayToString(result);
      return(true);
    }
  }
  if (response != 200) return(false);
  bodyOut = CharArrayToString(result);
  return(true);
}

bool FetchPreferredSignalBody(string mode, string &bodyOut, string &sourceOut) {
  string fileBody = "";
  if (ReadSignalFileBody(fileBody) && StringFind(fileBody, "action") >= 0) {
    string fp = BuildSignalFingerprint(fileBody, "file");
    if (fp != LastSignalId) {
      bodyOut = fileBody;
      sourceOut = "file";
      return(true);
    }
  }
  if (FetchSignalBody(mode, bodyOut)) {
    sourceOut = "web";
    return(true);
  }
  return(false);
}

double EffectiveStopDistance(string sym) {
  double point = SymbolInfoDouble(sym, SYMBOL_POINT);
  int stops = (int)SymbolInfoInteger(sym, SYMBOL_TRADE_STOPS_LEVEL);
  int freeze = (int)SymbolInfoInteger(sym, SYMBOL_TRADE_FREEZE_LEVEL);
  int minPoints = MathMax(stops, freeze);
  return(minPoints * point);
}

void EnforceStopDistance(string sym, int orderType, double marketPrice, double &sl, double &tp) {
  double minDist = EffectiveStopDistance(sym);
  if (minDist <= 0) {
    sl = NormalizePriceForSymbol(sym, sl);
    tp = NormalizePriceForSymbol(sym, tp);
    return;
  }

  if (orderType == POSITION_TYPE_BUY) {
    if (sl > 0 && (marketPrice - sl) < minDist) sl = marketPrice - minDist;
    if (tp > 0 && (tp - marketPrice) < minDist) tp = marketPrice + minDist;
  } else {
    if (sl > 0 && (sl - marketPrice) < minDist) sl = marketPrice + minDist;
    if (tp > 0 && (marketPrice - tp) < minDist) tp = marketPrice - minDist;
  }

  sl = NormalizePriceForSymbol(sym, sl);
  tp = NormalizePriceForSymbol(sym, tp);
}

bool ApplyStopsIfPossible(string sym, ulong ticket, int orderType, double sl, double tp) {
  if (ticket == 0 || (sl <= 0 && tp <= 0)) return(false);
  for (int attempt = 0; attempt < 3; attempt++) {
    MqlTick _tick; SymbolInfoTick(sym, _tick);
    double marketRef = orderType == POSITION_TYPE_BUY ? SymbolInfoDouble(sym, SYMBOL_BID) : SymbolInfoDouble(sym, SYMBOL_ASK);
    double nextSl = sl;
    double nextTp = tp;
    EnforceStopDistance(sym, orderType, marketRef, nextSl, nextTp);

    MqlTradeRequest req;
    MqlTradeResult res;
    ZeroMemory(req);
    ZeroMemory(res);
    req.action = TRADE_ACTION_SLTP;
    req.symbol = sym;
    req.position = ticket;
    req.sl = nextSl;
    req.tp = nextTp;
    ResetLastError();
    bool sent = OrderSend(req, res);
    if (sent && (res.retcode == TRADE_RETCODE_DONE || res.retcode == TRADE_RETCODE_DONE_PARTIAL)) return(true);

    int err = GetLastError();
    if (EnableLogs) {
      Print("[TradeAutomate-MT5] SL/TP modify failed. ticket=", ticket, " attempt=", (attempt + 1), " retcode=", (int)res.retcode, " err=", err, " ", TradeErrorMessage(err));
    }
    Sleep(250);
  }
  SendRejectionEvent("order_stops_failed", "Could not apply SL/TP after order fill", sym);
  return(false);
}

ulong FindLatestPositionTicket(string sym, int magic, int positionType) {
  ulong bestTicket = 0;
  long bestTime = 0;
  int total = PositionsTotal();
  for (int i = total - 1; i >= 0; i--) {
    ulong ticket = PositionGetTicket(i);
    if (ticket == 0 || !PositionSelectByTicket(ticket)) continue;
    if (PositionGetString(POSITION_SYMBOL) != sym) continue;
    if ((int)PositionGetInteger(POSITION_MAGIC) != magic) continue;
    if ((int)PositionGetInteger(POSITION_TYPE) != positionType) continue;
    long openTime = PositionGetInteger(POSITION_TIME_MSC);
    if (openTime >= bestTime) {
      bestTime = openTime;
      bestTicket = ticket;
    }
  }
  return(bestTicket);
}

void OnTimer() {
  string mode = ScalpMode ? "scalp" : "signal";
  string source = "web";
  string chartSym = _Symbol;
  HeartbeatTickCount++;
  SendHeartbeat(chartSym);
  // Send open_trades snapshot every 3rd tick (every 15 seconds) to reduce API load
  if (HeartbeatTickCount % 3 == 0) {
    SendOpenTradesSnapshot(chartSym);
  }

  string body = "";
  if (!FetchPreferredSignalBody(mode, body, source)) return;
  if (StringFind(body, "action") < 0) return;

  string signalId = BuildSignalFingerprint(body, source);
  if (signalId == LastSignalId) return;

  string payloadBotEnabled = ExtractJsonValue(body, "bot_enabled");
  if (payloadBotEnabled != "") {
    BotEnabledState = ParseBool(payloadBotEnabled, BotEnabledState);
  }
  if (!BotEnabledState) {
    LastSignalId = signalId;
    return;
  }

  string action = ExtractActionFromBody(body);
  if (action == "") {
    LastSignalId = signalId;
    return;
  }

  string sym = NormalizeSymbol(ExtractJsonValue(body, "symbol"));
  if (sym == "") sym = chartSym;
  if (!BotEnabledState) return;
  if (!SymbolAllowed(sym, ScopedSymbolsCSV)) return;

  string resolvedSym = ResolveBrokerSymbol(sym);
  if (resolvedSym == "") {
    SendRejectionEvent("symbol_select_failed", sym, sym);
    return;
  }
  sym = resolvedSym;

  int payloadMaxOpen = (int)StringToDouble(ExtractJsonValue(body, "max_open_trades"));
  int maxOpen = payloadMaxOpen > 0 ? payloadMaxOpen : MaxOpenTrades;
  if (maxOpen < 1) maxOpen = 1;

  int openTrades = CountOpenBotTrades();
  int availableSlots = maxOpen - openTrades;
  if (availableSlots < 1) return;

  bool fileSignal = (source == "file");
  int requestedTrades = ExtractTradeCopies(body, fileSignal);
  int tradesToSend = requestedTrades > availableSlots ? availableSlots : requestedTrades;
  if (tradesToSend < 1) return;

  double lot = DefaultLot;
  int lotIdx = StringFind(body, "\"lot\":");
  if (lotIdx >= 0) lot = StringToDouble(StringSubstr(body, lotIdx + 6, 8));

  bool payloadScalpMode = ParseBool(ExtractJsonValue(body, "scalp_mode"), ScalpMode);
  int tpPips = payloadScalpMode ? 10 : 20;
  int slPips = payloadScalpMode ? 7 : 15;
  int tpIdx = StringFind(body, "\"tp_pips\":");
  if (tpIdx >= 0) tpPips = (int)StringToDouble(StringSubstr(body, tpIdx + 10, 5));
  int slIdx = StringFind(body, "\"sl_pips\":");
  if (slIdx >= 0) slPips = (int)StringToDouble(StringSubstr(body, slIdx + 10, 5));

  double pip = PipValueForSymbol(sym);
  int magic = payloadScalpMode ? MagicScalp : MagicSignal;
  string comment = payloadScalpMode ? "TradeAutomate_Scalp" : "TradeAutomate_Signal";
  Trade.SetExpertMagicNumber((ulong)magic);
  Trade.SetDeviationInPoints(Slippage);

  if (!TerminalInfoInteger(TERMINAL_TRADE_ALLOWED) || !AccountInfoInteger(ACCOUNT_TRADE_ALLOWED)) {
    SendRejectionEvent("trade_not_allowed", "Enable AutoTrading in MT5", sym);
    return;
  }

  long tradeMode = SymbolInfoInteger(sym, SYMBOL_TRADE_MODE);
  if (tradeMode == SYMBOL_TRADE_MODE_DISABLED) {
    SendRejectionEvent("symbol_trade_disabled", "Broker disabled trading for symbol", sym);
    return;
  }

  int successCount = 0;
  for (int i = 0; i < tradesToSend; i++) {
    MqlTick _tick; SymbolInfoTick(sym, _tick);
    double ask = SymbolInfoDouble(sym, SYMBOL_ASK);
    double bid = SymbolInfoDouble(sym, SYMBOL_BID);
    if (ask <= 0 || bid <= 0) {
      SendRejectionEvent("invalid_market_price", "ask/bid <= 0", sym);
      break;
    }

    bool ok = false;
    double openPrice = 0.0;
    int side = action == "BUY" ? POSITION_TYPE_BUY : POSITION_TYPE_SELL;
    if (action == "BUY") {
      openPrice = NormalizePriceForSymbol(sym, ask);
      ok = Trade.Buy(lot, sym, openPrice, 0.0, 0.0, comment);
    } else if (action == "SELL") {
      openPrice = NormalizePriceForSymbol(sym, bid);
      ok = Trade.Sell(lot, sym, openPrice, 0.0, 0.0, comment);
    }

    if (!ok) {
      int err = GetLastError();
      SendRejectionEvent("order_send_failed", TradeErrorMessage(err) + " (" + IntegerToString(err) + ")", sym);
      continue;
    }

    ulong ticket = FindLatestPositionTicket(sym, magic, side);
    if (ticket == 0) ticket = (ulong)Trade.ResultOrder();
    double sl = side == POSITION_TYPE_BUY ? NormalizePriceForSymbol(sym, openPrice - slPips * pip) : NormalizePriceForSymbol(sym, openPrice + slPips * pip);
    double tp = side == POSITION_TYPE_BUY ? NormalizePriceForSymbol(sym, openPrice + tpPips * pip) : NormalizePriceForSymbol(sym, openPrice - tpPips * pip);
    ApplyStopsIfPossible(sym, ticket, side, sl, tp);
    SendExecutionEvent(action, sym, ticket, lot, openPrice);
    successCount++;
  }

  if (successCount > 0) LastSignalId = signalId;
}

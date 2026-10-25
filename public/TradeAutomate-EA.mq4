//+------------------------------------------------------------------+
//| TradeAutomate AI - Expert Advisor v1.00                          |
//| Signal + Scalp execution bridge for MT4                          |
//+------------------------------------------------------------------+
#property strict
#property version   "1.10"

extern string AppURL      = "https://tradeautomate-ai.vercel.app/api/signals";
extern string EventURL    = "https://tradeautomate-ai.vercel.app/api/signals";
extern string BackupAppURL = "https://tradeautomate-ai.vercel.app/api/signals";
extern string BackupEventURL = "https://tradeautomate-ai.vercel.app/api/signals";
extern string ClientId    = "0000";
extern string AuthToken   = "YOUR_AUTH_TOKEN";
extern int    PollSeconds = 1;
extern bool   ScalpMode   = true;
extern double DefaultLot  = 0.10;
extern int    MagicSignal = 12345;
extern int    MagicScalp  = 54321;
extern int    Slippage    = 3;
extern bool   EnableLogs  = true;
extern int    RequestTimeoutMs = 10000;
extern int    MaxOpenTrades = 5;
extern string ScopedSymbolsCSV = "EURUSD,GBPUSD,USDJPY,XAUUSD,BTCUSD,USDCAD,AUDUSD,US500,NAS100,USOIL";
extern string RequiredAccountMode = "AUTO";
extern bool   UseSignalFile = true;
extern string SignalFileName = "TradeSignal.txt";
extern int    DefaultSignalFileTrades = 3;

string LastSignalId = "";
bool BotEnabledState = true;
int HeartbeatTickCount = 0;

int OnInit() {
  EventSetTimer(5);
  if (EnableLogs) {
    string mode = IsDemo() ? "DEMO" : "LIVE";
    Print("[TradeAutomate] EA initialized. version=1.10 TimerSeconds=5 PollSeconds=", PollSeconds, " ScalpMode=", ScalpMode, " RequiredAccountMode=", RequiredAccountMode);
    Print("[TradeAutomate] Broker=", AccountCompany(), " Server=", AccountServer(), " Login=", AccountNumber(), " CurrentAccountMode=", mode);
    Print("[TradeAutomate] AppURL=", AppURL, " RequestTimeoutMs=", RequestTimeoutMs, " MaxOpenTrades=", MaxOpenTrades, " ClientId=", ClientId);
  }
  return(INIT_SUCCEEDED);
}

void OnDeinit(const int reason) {
  EventKillTimer();
  if (EnableLogs) Print("[TradeAutomate] EA deinitialized. reason=", reason);
}

double PipValue() {
  double pt = MarketInfo(Symbol(), MODE_POINT);
  if (Digits == 3 || Digits == 5) return(pt * 10.0);
  return(pt);
}

double PipValueForSymbol(string sym) {
  double pt = MarketInfo(sym, MODE_POINT);
  int digits = (int)MarketInfo(sym, MODE_DIGITS);
  if (digits == 3 || digits == 5) return(pt * 10.0);
  return(pt);
}

double NormalizePrice(double value) {
  return(NormalizeDouble(value, Digits));
}

double NormalizePriceForSymbol(string sym, double value) {
  int digits = (int)MarketInfo(sym, MODE_DIGITS);
  return(NormalizeDouble(value, digits));
}

void LogOrderResult(string action, int ticket, int err) {
  if (!EnableLogs) return;
  if (ticket > 0) {
    Print("[TradeAutomate] ", action, " order success. ticket=", ticket);
  } else {
    Print("[TradeAutomate] ", action, " order failed. err=", err);
  }
}

string ErrorHint(int err) {
  if (err == 4014) return("Allow WebRequest URL in MT4 options.");
  if (err == 4060) return("Enable Algo Trading and allow DLL/WebRequest.");
  if (err == 5204) return("Connection timeout. Increase timeout/check network.");
  if (err == 5203) return("HTTP request failed. Verify URL and SSL.");
  return("");
}

string TradeErrorMessage(int err) {
  if (err == 0) return("ok");
  if (err == 129) return("invalid_price");
  if (err == 130) return("invalid_stops");
  if (err == 131) return("invalid_trade_volume");
  if (err == 132) return("market_closed");
  if (err == 133) return("trade_disabled");
  if (err == 134) return("not_enough_money");
  if (err == 136) return("off_quotes");
  if (err == 138) return("requote");
  if (err == 146) return("trade_context_busy");
  if (err == 4109) return("autotrading_disabled");
  return("err_" + IntegerToString(err));
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

bool PostEvent(string payload, string tag) {
  string headers = "Content-Type: application/json\r\nAuthorization: Bearer " + AuthToken;
  char postData[], result[];
  string resultHeaders;
  StringToCharArray(payload, postData, 0, WHOLE_ARRAY, CP_UTF8);
  string postUrl = EventURL;
  if (postUrl == "") postUrl = AppURL;

  int response = WebRequest("POST", postUrl, headers, RequestTimeoutMs, postData, result, resultHeaders);
  if (response != 200 && BackupEventURL != "" && postUrl != BackupEventURL) {
    ResetLastError();
    response = WebRequest("POST", BackupEventURL, headers, RequestTimeoutMs, postData, result, resultHeaders);
    if (response == 200) return(true);
  }
  if (response != 200) {
    if (EnableLogs) {
      int err = GetLastError();
      Print("[TradeAutomate] ", tag, " POST failed. response=", response, " err=", err, " url=", postUrl, " ", ErrorHint(err));
    }
    return(false);
  }
  return(true);
}

void SendHeartbeat(string sym) {
  string accountMode = IsDemo() ? "DEMO" : "LIVE";
  int openCount = CountOpenAllTrades();
  double openProfit = OpenProfitAllTrades();
  string payload = StringFormat(
    "{\"client_id\":\"%s\",\"event_type\":\"heartbeat\",\"account_mode\":\"%s\",\"broker\":\"%s\",\"server\":\"%s\",\"account_number\":\"%d\",\"symbol\":\"%s\",\"ea_version\":\"v1.10\",\"open_count\":%d,\"open_profit\":%G}",
    JsonEscape(ClientId),
    accountMode,
    JsonEscape(AccountCompany()),
    JsonEscape(AccountServer()),
    AccountNumber(),
    JsonEscape(sym),
    openCount,
    openProfit
  );
  PostEvent(payload, "heartbeat");
}

void SendOpenTradesSnapshot(string sym) {
  string accountMode = IsDemo() ? "DEMO" : "LIVE";
  string tradesJson = "";
  int openCount = 0;
  double openProfit = 0.0;

  for (int i = OrdersTotal() - 1; i >= 0; i--) {
    if (!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
    int type = OrderType();
    if (type != OP_BUY && type != OP_SELL) continue;

    string side = type == OP_BUY ? "BUY" : "SELL";
    double itemProfit = OrderProfit() + OrderSwap() + OrderCommission();

    if (tradesJson != "") tradesJson += ",";
    tradesJson += StringFormat(
      "{\"ticket\":%d,\"symbol\":\"%s\",\"side\":\"%s\",\"lot\":%G,\"open_price\":%G,\"profit\":%G,\"magic\":%d,\"stop_loss\":%G,\"take_profit\":%G}",
      OrderTicket(),
      JsonEscape(OrderSymbol()),
      side,
      OrderLots(),
      OrderOpenPrice(),
      itemProfit,
      OrderMagicNumber(),
      OrderStopLoss(),
      OrderTakeProfit()
    );

    openCount++;
    openProfit += itemProfit;
  }

  string payload = StringFormat(
    "{\"client_id\":\"%s\",\"event_type\":\"open_trades\",\"account_mode\":\"%s\",\"broker\":\"%s\",\"server\":\"%s\",\"account_number\":\"%d\",\"symbol\":\"%s\",\"ea_version\":\"v1.10\",\"open_count\":%d,\"open_profit\":%G,\"open_trades\":[%s]}",
    JsonEscape(ClientId),
    accountMode,
    JsonEscape(AccountCompany()),
    JsonEscape(AccountServer()),
    AccountNumber(),
    JsonEscape(sym),
    openCount,
    openProfit,
    tradesJson
  );
  PostEvent(payload, "open_trades");
}

void SendExecutionEvent(string action, string sym, int ticket, double lot, double price) {
  if (ticket <= 0) return;
  double stopLoss = 0.0;
  double takeProfit = 0.0;
  if (OrderSelect(ticket, SELECT_BY_TICKET)) {
    stopLoss = OrderStopLoss();
    takeProfit = OrderTakeProfit();
  }
  string payload = StringFormat(
    "{\"client_id\":\"%s\",\"event_type\":\"execution\",\"action\":\"%s\",\"symbol\":\"%s\",\"ticket\":%d,\"lot\":%G,\"price\":%G,\"stop_loss\":%G,\"take_profit\":%G}",
    JsonEscape(ClientId),
    action,
    JsonEscape(sym),
    ticket,
    lot,
    price,
    stopLoss,
    takeProfit
  );
  PostEvent(payload, "execution");
}

void SendRejectionEvent(string reason, string detail, string sym) {
  string payload = StringFormat(
    "{\"client_id\":\"%s\",\"event_type\":\"rejection\",\"reason\":\"%s\",\"detail\":\"%s\",\"symbol\":\"%s\"}",
    JsonEscape(ClientId),
    JsonEscape(reason),
    JsonEscape(detail),
    JsonEscape(sym)
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
  StringTrimLeft(v);
  StringTrimRight(v);
  StringToUpper(v);

  if (v == "B" || v == "LONG") return("BUY");
  if (v == "S" || v == "SHORT") return("SELL");
  if (StringFind(v, "BUY") == 0) return("BUY");
  if (StringFind(v, "SELL") == 0) return("SELL");
  if (v == "HOLD" || v == "NONE" || v == "UNKNOWN" || v == "NULL") return("");
  return("");
}

string NormalizeSymbol(string raw) {
  string s = raw;
  StringTrimLeft(s);
  StringTrimRight(s);
  StringToUpper(s);
  return(s);
}

bool SymbolAllowed(string sym, string csv) {
  string target = NormalizeSymbol(sym);
  if (target == "") return(false);

  string list = csv;
  StringTrimLeft(list);
  StringTrimRight(list);
  if (list == "") return(true);

  string up = list;
  StringToUpper(up);
  string parts[];
  int n = StringSplit(up, ',', parts);
  if (n <= 0) return(true);

  for (int i = 0; i < n; i++) {
    string p = parts[i];
    StringTrimLeft(p);
    StringTrimRight(p);
    if (p == target) return(true);
  }
  return(false);
}

string ResolveBrokerSymbol(string requested) {
  string target = NormalizeSymbol(requested);
  if (target == "") return("");

  if (SymbolSelect(target, true)) return(target);

  string current = NormalizeSymbol(Symbol());
  int pos = StringFind(current, target);
  if (pos >= 0) {
    int targetLen = StringLen(target);
    string prefix = pos > 0 ? StringSubstr(current, 0, pos) : "";
    string suffix = (pos + targetLen < StringLen(current)) ? StringSubstr(current, pos + targetLen) : "";
    string candidate = prefix + target + suffix;
    if (candidate != "" && SymbolSelect(candidate, true)) return(candidate);
  }

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

bool AccountModeAllowed(string requiredMode) {
  string req = requiredMode;
  StringToUpper(req);
  StringTrimLeft(req);
  StringTrimRight(req);
  if (req == "") req = "AUTO";
  if (req == "AUTO" || req == "ANY" || req == "BOTH") return(true);

  bool demo = IsDemo();
  if (req == "LIVE" && demo) return(false);
  if (req == "DEMO" && !demo) return(false);
  return(true);
}

bool ParseBool(string raw, bool fallback) {
  string v = raw;
  StringTrimLeft(v);
  StringTrimRight(v);
  StringToUpper(v);
  if (v == "1" || v == "TRUE" || v == "YES" || v == "ON") return(true);
  if (v == "0" || v == "FALSE" || v == "NO" || v == "OFF") return(false);
  return(fallback);
}

bool IsCleanSymbolToken(string value) {
  if (value == "") return(false);
  int len = StringLen(value);
  if (len < 3 || len > 16) return(false);

  for (int i = 0; i < len; i++) {
    int c = StringGetCharacter(value, i);
    bool isUpper = (c >= 65 && c <= 90);
    bool isDigit = (c >= 48 && c <= 57);
    bool isDot = (c == 46);
    bool isUnderscore = (c == 95);
    if (!isUpper && !isDigit && !isDot && !isUnderscore) return(false);
  }
  return(true);
}

int CountOpenBotTrades() {
  int count = 0;
  for (int i = OrdersTotal() - 1; i >= 0; i--) {
    if (!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
    int type = OrderType();
    if (type != OP_BUY && type != OP_SELL) continue;
    int magic = OrderMagicNumber();
    if (magic == MagicSignal || magic == MagicScalp) count++;
  }
  return(count);
}

double OpenProfitBotTrades() {
  double total = 0.0;
  for (int i = OrdersTotal() - 1; i >= 0; i--) {
    if (!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
    int type = OrderType();
    if (type != OP_BUY && type != OP_SELL) continue;
    int magic = OrderMagicNumber();
    if (magic != MagicSignal && magic != MagicScalp) continue;
    total += (OrderProfit() + OrderSwap() + OrderCommission());
  }
  return(total);
}

int CountOpenAllTrades() {
  int count = 0;
  for (int i = OrdersTotal() - 1; i >= 0; i--) {
    if (!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
    int type = OrderType();
    if (type != OP_BUY && type != OP_SELL) continue;
    count++;
  }
  return(count);
}

double OpenProfitAllTrades() {
  double total = 0.0;
  for (int i = OrdersTotal() - 1; i >= 0; i--) {
    if (!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
    int type = OrderType();
    if (type != OP_BUY && type != OP_SELL) continue;
    total += (OrderProfit() + OrderSwap() + OrderCommission());
  }
  return(total);
}

double EffectiveStopDistance(string sym) {
  double point = MarketInfo(sym, MODE_POINT);
  int stopLevelPoints = (int)MarketInfo(sym, MODE_STOPLEVEL);
  int freezeLevelPoints = (int)MarketInfo(sym, MODE_FREEZELEVEL);
  int minPoints = MathMax(stopLevelPoints, freezeLevelPoints);
  return(minPoints * point);
}

void EnforceStopDistance(string sym, int orderType, double marketPrice, double &sl, double &tp) {
  double minDist = EffectiveStopDistance(sym);

  if (minDist <= 0) {
    sl = NormalizePriceForSymbol(sym, sl);
    tp = NormalizePriceForSymbol(sym, tp);
    return;
  }

  if (orderType == OP_BUY) {
    if (sl > 0 && (marketPrice - sl) < minDist) sl = marketPrice - minDist;
    if (tp > 0 && (tp - marketPrice) < minDist) tp = marketPrice + minDist;
  }

  if (orderType == OP_SELL) {
    if (sl > 0 && (sl - marketPrice) < minDist) sl = marketPrice + minDist;
    if (tp > 0 && (marketPrice - tp) < minDist) tp = marketPrice - minDist;
  }

  sl = NormalizePriceForSymbol(sym, sl);
  tp = NormalizePriceForSymbol(sym, tp);
}

bool ApplyStopsIfPossible(string sym, int ticket, int orderType, double sl, double tp) {
  if (ticket <= 0) return(false);
  if (!OrderSelect(ticket, SELECT_BY_TICKET)) return(false);
  if (sl <= 0 && tp <= 0) return(true);

  for (int attempt = 0; attempt < 3; attempt++) {
    if (!OrderSelect(ticket, SELECT_BY_TICKET)) return(false);

    RefreshRates();
    double openPrice = OrderOpenPrice();
    double marketRefPrice = orderType == OP_BUY ? MarketInfo(sym, MODE_BID) : MarketInfo(sym, MODE_ASK);
    double nextSl = sl;
    double nextTp = tp;
    EnforceStopDistance(sym, orderType, marketRefPrice, nextSl, nextTp);

    ResetLastError();
    bool modified = OrderModify(ticket, openPrice, nextSl, nextTp, 0, clrNONE);
    if (modified) {
      if (EnableLogs) {
        Print("[TradeAutomate] Stops applied. ticket=", ticket, " sl=", DoubleToString(nextSl, (int)MarketInfo(sym, MODE_DIGITS)), " tp=", DoubleToString(nextTp, (int)MarketInfo(sym, MODE_DIGITS)));
      }
      return(true);
    }

    int err = GetLastError();
    if (EnableLogs) {
      Print("[TradeAutomate] OrderModify failed. ticket=", ticket, " attempt=", (attempt + 1), " err=", err, " ", TradeErrorMessage(err), " sl=", DoubleToString(nextSl, (int)MarketInfo(sym, MODE_DIGITS)), " tp=", DoubleToString(nextTp, (int)MarketInfo(sym, MODE_DIGITS)));
    }

    if (err != 130 && err != 136 && err != 138 && err != 146) break;
    Sleep(250);
  }

  SendRejectionEvent("order_stops_failed", "Could not apply SL/TP after order fill", sym);
  return(false);
}

string ExtractActionFromBody(string body) {
  string action = NormalizeAction(ExtractJsonValue(body, "action"));
  if (action == "") action = NormalizeAction(ExtractJsonValue(body, "side"));
  if (action == "") action = NormalizeAction(ExtractJsonValue(body, "direction"));
  if (action == "") action = NormalizeAction(ExtractJsonValue(body, "signal"));
  if (action == "") action = NormalizeAction(ExtractJsonValue(body, "type"));
  return(action);
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

string BuildSignalFingerprint(string body, string source) {
  return(
    source + "|" +
    ExtractActionFromBody(body) + "|" +
    NormalizeSymbol(ExtractJsonValue(body, "symbol")) + "|" +
    ExtractJsonValue(body, "lot") + "|" +
    ExtractJsonValue(body, "tp_pips") + "|" +
    ExtractJsonValue(body, "sl_pips") + "|" +
    ExtractJsonValue(body, "trade_count") + "|" +
    ExtractJsonValue(body, "timestamp")
  );
}

bool FetchSignalBody(string mode, string &bodyOut) {
  string headers = "Authorization: Bearer " + AuthToken;
  char postData[], result[];
  string resultHeaders;
  string url = AppURL + "?mode=" + mode + "&limit=1&client_id=" + ClientId;

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
  if (response != 200) {
    if (EnableLogs) {
      int err = GetLastError();
      string hint = ErrorHint(err);
      Print("[TradeAutomate] WebRequest non-200 response=", response, " err=", err, " url=", url, " ", hint);
    }
    return(false);
  }

  bodyOut = CharArrayToString(result);
  return(true);
}

bool FetchPreferredSignalBody(string mode, string &bodyOut, string &sourceOut) {
  string fileBody = "";
  if (ReadSignalFileBody(fileBody)) {
    if (StringFind(fileBody, "action") >= 0) {
      string fileFingerprint = BuildSignalFingerprint(fileBody, "file");
      if (fileFingerprint != LastSignalId) {
        bodyOut = fileBody;
        sourceOut = "file";
        return(true);
      }
    }
  }

  if (FetchSignalBody(mode, bodyOut)) {
    sourceOut = "web";
    return(true);
  }

  return(false);
}

void OnTimer() {
  string mode = ScalpMode ? "scalp" : "signal";
  string source = "web";
  HeartbeatTickCount++;
  SendHeartbeat(Symbol());
  // Send open_trades snapshot every 3rd tick (every 15 seconds) to reduce API load
  if (HeartbeatTickCount % 3 == 0) {
    SendOpenTradesSnapshot(Symbol());
  }

  string body = "";
  if (!FetchPreferredSignalBody(mode, body, source)) {
    SendRejectionEvent("signal_fetch_failed", "No file or web signal could be read", Symbol());
    return;
  }

  if (StringFind(body, "action") < 0) {
    if (EnableLogs) Print("[TradeAutomate] No actionable payload.");
    return;
  }

  string signalId = BuildSignalFingerprint(body, source);
  if (signalId == LastSignalId) {
    return;
  }

  string payloadBotEnabled = ExtractJsonValue(body, "bot_enabled");
  if (payloadBotEnabled != "") {
    BotEnabledState = ParseBool(payloadBotEnabled, BotEnabledState);
  }
  if (!BotEnabledState) {
    LastSignalId = signalId;
    return;
  }

  string action = ExtractActionFromBody(body);
  if (action == "" && mode == "signal") {
    if (EnableLogs) Print("[TradeAutomate] HOLD/unknown action in signal mode. Trying scalp fallback.");
    string scalpBody = "";
    string scalpSource = source;
    if (FetchPreferredSignalBody("scalp", scalpBody, scalpSource) && StringFind(scalpBody, "action") >= 0) {
      string scalpAction = ExtractActionFromBody(scalpBody);
      if (scalpAction != "") {
        body = scalpBody;
        action = scalpAction;
        mode = "scalp";
        source = scalpSource;
        if (EnableLogs) Print("[TradeAutomate] Fallback scalp action=", action);
      }
    }
  }

  string activeSignalId = BuildSignalFingerprint(body, source);
  if (activeSignalId == LastSignalId) {
    return;
  }

  payloadBotEnabled = ExtractJsonValue(body, "bot_enabled");
  if (payloadBotEnabled != "") {
    BotEnabledState = ParseBool(payloadBotEnabled, BotEnabledState);
  }
  if (!BotEnabledState) {
    LastSignalId = activeSignalId;
    return;
  }

  if (action == "") {
    LastSignalId = activeSignalId;
    return;
  }

  string sym = NormalizeSymbol(ExtractJsonValue(body, "symbol"));
  if (sym == "") sym = Symbol();

  if (!BotEnabledState) {
    if (EnableLogs) Print("[TradeAutomate] Trading blocked. bot_enabled=false");
    SendRejectionEvent("bot_disabled", "bot_enabled=false", sym);
    return;
  }

  string payloadAccountMode = ExtractJsonValue(body, "account_mode");
  string requiredAccountMode = payloadAccountMode != "" ? payloadAccountMode : RequiredAccountMode;
  if (!AccountModeAllowed(requiredAccountMode)) {
    if (EnableLogs) {
      string currentMode = IsDemo() ? "DEMO" : "LIVE";
      string requiredModeUpper = requiredAccountMode;
      StringToUpper(requiredModeUpper);
      Print("[TradeAutomate] Skipped. Account mode mismatch. required=", requiredModeUpper, " current=", currentMode);
    }
    SendRejectionEvent("account_mode_mismatch", requiredAccountMode, sym);
    return;
  }

  string payloadScope = ExtractJsonValue(body, "scoped_symbols_csv");
  string scoped = payloadScope != "" ? payloadScope : ScopedSymbolsCSV;

  string lockSymbol = NormalizeSymbol(ExtractJsonValue(body, "lock_symbol"));
  if (!IsCleanSymbolToken(lockSymbol)) {
    // Ignore malformed lock payloads so valid trade commands are not blocked.
    lockSymbol = "";
  }
  if (lockSymbol != "" && sym != lockSymbol) {
    if (EnableLogs) Print("[TradeAutomate] Skipped. Highlight lock active. lock_symbol=", lockSymbol, " requested=", sym);
    SendRejectionEvent("highlight_lock", lockSymbol, sym);
    return;
  }

  if (!SymbolAllowed(sym, scoped)) {
    if (EnableLogs) Print("[TradeAutomate] Skipped. Symbol outside scope: ", sym, " scope=", scoped);
    SendRejectionEvent("symbol_out_of_scope", scoped, sym);
    return;
  }

  int payloadMaxOpen = (int)StringToDouble(ExtractJsonValue(body, "max_open_trades"));
  int maxOpen = payloadMaxOpen > 0 ? payloadMaxOpen : MaxOpenTrades;
  if (maxOpen < 1) maxOpen = 1;

  int openTrades = CountOpenBotTrades();
  if (openTrades >= maxOpen) {
    if (EnableLogs) Print("[TradeAutomate] Max open trades reached. open=", openTrades, " limit=", maxOpen);
    SendRejectionEvent("max_open_reached", IntegerToString(maxOpen), sym);
    return;
  }

  string resolvedSym = ResolveBrokerSymbol(sym);
  if (resolvedSym == "") {
    if (EnableLogs) Print("[TradeAutomate] Symbol resolution failed for ", sym, ". Ensure symbol is visible in Market Watch.");
    SendRejectionEvent("symbol_select_failed", sym, sym);
    return;
  }
  sym = resolvedSym;
  if (EnableLogs && sym != NormalizeSymbol(ExtractJsonValue(body, "symbol"))) {
    Print("[TradeAutomate] Resolved symbol mapping. requested=", ExtractJsonValue(body, "symbol"), " resolved=", sym);
  }

  double lot = DefaultLot;
  int lotIdx = StringFind(body, "\"lot\":");
  if (lotIdx >= 0) lot = StringToDouble(StringSubstr(body, lotIdx + 6, 8));

  double maxSpread = 2.0;
  int spreadIdx = StringFind(body, "\"max_spread\":");
  if (spreadIdx >= 0) maxSpread = StringToDouble(StringSubstr(body, spreadIdx + 13, 6));

  bool spreadGuardEnabled = ParseBool(ExtractJsonValue(body, "spread_guard"), true);
  double currentSpread = MarketInfo(sym, MODE_SPREAD) * PipValueForSymbol(sym);
  if (spreadGuardEnabled && currentSpread > maxSpread) {
    if (EnableLogs) Print("[TradeAutomate] Spread guard blocked order. current=", currentSpread, " max=", maxSpread);
    SendRejectionEvent("spread_guard", DoubleToString(currentSpread, 2), sym);
    return;
  }

  bool payloadScalpMode = ParseBool(ExtractJsonValue(body, "scalp_mode"), ScalpMode);

  int tpPips = payloadScalpMode ? 10 : 20;
  int slPips = payloadScalpMode ? 7 : 15;

  int tpIdx = StringFind(body, "\"tp_pips\":");
  if (tpIdx >= 0) tpPips = (int)StringToDouble(StringSubstr(body, tpIdx + 10, 5));

  int slIdx = StringFind(body, "\"sl_pips\":");
  if (slIdx >= 0) slPips = (int)StringToDouble(StringSubstr(body, slIdx + 10, 5));

  int magic = payloadScalpMode ? MagicScalp : MagicSignal;
  string comment = payloadScalpMode ? "TradeAutomate_Scalp" : "TradeAutomate_Signal";
  bool fileSignal = (source == "file");
  int requestedTrades = ExtractTradeCopies(body, fileSignal);
  int availableSlots = maxOpen - openTrades;
  int tradesToSend = requestedTrades;
  if (availableSlots < tradesToSend) tradesToSend = availableSlots;
  if (tradesToSend < 1) {
    SendRejectionEvent("max_open_reached", IntegerToString(maxOpen), sym);
    return;
  }
  if (EnableLogs && tradesToSend < requestedTrades) {
    Print("[TradeAutomate] Trade copies reduced by max-open limit. requested=", requestedTrades, " sending=", tradesToSend);
  }

  double pip = PipValueForSymbol(sym);

  if (!IsTradeAllowed()) {
    SendRejectionEvent("trade_not_allowed", "Enable AutoTrading in MT4", sym);
    return;
  }

  if (!MarketInfo(sym, MODE_TRADEALLOWED)) {
    SendRejectionEvent("symbol_trade_disabled", "Broker disabled trading for symbol", sym);
    return;
  }

  int successCount = 0;
  if (action == "BUY") {
    for (int buyIndex = 0; buyIndex < tradesToSend; buyIndex++) {
      RefreshRates();
      double ask = MarketInfo(sym, MODE_ASK);
      double bid = MarketInfo(sym, MODE_BID);
      if (ask <= 0 || bid <= 0) {
        if (EnableLogs) Print("[TradeAutomate] Invalid market price for ", sym, ". Check Market Watch visibility.");
        SendRejectionEvent("invalid_market_price", "ask/bid <= 0", sym);
        break;
      }

      double price = NormalizePriceForSymbol(sym, ask);
      double sl = NormalizePriceForSymbol(sym, price - slPips * pip);
      double tp = NormalizePriceForSymbol(sym, price + tpPips * pip);
      int ticket = OrderSend(sym, OP_BUY, lot, price, Slippage, 0, 0, comment, magic, 0, clrGreen);
      int err = GetLastError();
      LogOrderResult("BUY", ticket, err);
      if (ticket > 0) {
        ApplyStopsIfPossible(sym, ticket, OP_BUY, sl, tp);
        SendExecutionEvent("BUY", sym, ticket, lot, price);
        successCount++;
      } else {
        SendRejectionEvent("order_send_failed", TradeErrorMessage(err) + " (" + IntegerToString(err) + ")", sym);
      }
    }
  }

  if (action == "SELL") {
    for (int sellIndex = 0; sellIndex < tradesToSend; sellIndex++) {
      RefreshRates();
      double ask = MarketInfo(sym, MODE_ASK);
      double bid = MarketInfo(sym, MODE_BID);
      if (ask <= 0 || bid <= 0) {
        if (EnableLogs) Print("[TradeAutomate] Invalid market price for ", sym, ". Check Market Watch visibility.");
        SendRejectionEvent("invalid_market_price", "ask/bid <= 0", sym);
        break;
      }

      double price = NormalizePriceForSymbol(sym, bid);
      double sl = NormalizePriceForSymbol(sym, price + slPips * pip);
      double tp = NormalizePriceForSymbol(sym, price - tpPips * pip);
      int ticket = OrderSend(sym, OP_SELL, lot, price, Slippage, 0, 0, comment, magic, 0, clrRed);
      int err = GetLastError();
      LogOrderResult("SELL", ticket, err);
      if (ticket > 0) {
        ApplyStopsIfPossible(sym, ticket, OP_SELL, sl, tp);
        SendExecutionEvent("SELL", sym, ticket, lot, price);
        successCount++;
      } else {
        SendRejectionEvent("order_send_failed", TradeErrorMessage(err) + " (" + IntegerToString(err) + ")", sym);
      }
    }
  }

  if (successCount > 0) LastSignalId = activeSignalId;
}

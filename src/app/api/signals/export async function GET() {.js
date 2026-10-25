export async function GET() {
  const action = Math.random() > 0.5 ? "BUY" : "SELL";
  return Response.json({
    action,
    symbol: "EURUSD",
    lot: 0.01,
    takeProfit: 12,
    stopLoss: 8,
    signalId: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  });
}
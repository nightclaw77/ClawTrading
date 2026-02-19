import { NextResponse } from 'next/server';

async function fetchTicker(symbol: string) {
  const r = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`, {
    signal: AbortSignal.timeout(5000),
    cache: 'no-store',
  });
  if (!r.ok) throw new Error(`Binance ${symbol} ${r.status}`);
  const d = await r.json();
  return {
    symbol,
    price: Number(d.lastPrice || 0),
    change24h: Number(d.priceChangePercent || 0),
  };
}

export async function GET() {
  try {
    const [btc, sol] = await Promise.all([fetchTicker('BTCUSDT'), fetchTicker('SOLUSDT')]);
    return NextResponse.json({ success: true, btc, sol, ts: Date.now() });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

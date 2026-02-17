import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol') || 'BTCUSDT';
    const interval = searchParams.get('interval') || '5m';
    const limit = parseInt(searchParams.get('limit') || '500');

    // Fetch from Binance
    const response = await fetch(
      `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
      { signal: AbortSignal.timeout(10000) }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch chart data');
    }

    const data = await response.json();

    // Transform to candlestick format
    const candles = data.map((k: any[]) => ({
      timestamp: k[0],
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
      close_time: k[6],
      quote_volume: parseFloat(k[7]),
      trades: k[8],
      taker_buy_volume: parseFloat(k[9]),
      taker_buy_quote_volume: parseFloat(k[10])
    }));

    return NextResponse.json({
      symbol,
      interval,
      candles,
      source: 'binance',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Chart API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch chart data', candles: [] },
      { status: 500 }
    );
  }
}

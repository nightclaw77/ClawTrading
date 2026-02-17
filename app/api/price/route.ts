import { NextResponse } from 'next/server';

// Use environment variable or default to localhost
const BOT_API_URL = process.env.BOT_API_URL || 'http://localhost:8080';

export async function GET() {
  try {
    // Try to fetch from Python bot if running
    const response = await fetch(`${BOT_API_URL}/api/price`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      // Short timeout to not block if bot isn't running
      signal: AbortSignal.timeout(3000)
    }).catch(() => null);

    if (response?.ok) {
      const data = await response.json();
      return NextResponse.json(data);
    }

    // Fallback: fetch directly from Binance
    const binanceResponse = await fetch('https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT', {
      signal: AbortSignal.timeout(5000)
    });

    if (!binanceResponse.ok) {
      throw new Error('Failed to fetch from Binance');
    }

    const binanceData = await binanceResponse.json();

    return NextResponse.json({
      symbol: binanceData.symbol,
      price: parseFloat(binanceData.lastPrice),
      price_change_24h: parseFloat(binanceData.priceChange),
      price_change_pct_24h: parseFloat(binanceData.priceChangePercent),
      high_24h: parseFloat(binanceData.highPrice),
      low_24h: parseFloat(binanceData.lowPrice),
      volume_24h: parseFloat(binanceData.volume),
      quote_volume_24h: parseFloat(binanceData.quoteVolume),
      source: 'binance',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Price API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch price data', symbol: 'BTCUSDT', price: 0 },
      { status: 500 }
    );
  }
}

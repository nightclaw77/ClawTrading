import { NextResponse } from 'next/server';

// In-memory cache for signals (since bot might not be running)
let cachedSignals: any = { timestamp: null, data: null };

export async function GET() {
  try {
    // For now, return mock signals structure
    // In production, this would fetch from the Python bot
    
    const now = new Date();
    
    // Simple signal generation based on time (for demo purposes)
    const hour = now.getHours();
    let signal = {
      type: 'NONE',
      side: 'LONG',
      confidence: 0,
      price: 0,
      timestamp: now.toISOString(),
      timeframe: '5m',
      indicators: {},
      reason: 'No signal',
      market_regime: 'NEUTRAL',
      session: hour < 8 ? 'ASIAN' : hour < 16 ? 'LONDON' : 'NY'
    };

    // Try to get price for context
    try {
      const priceRes = await fetch('http://localhost:3000/api/price', {
        signal: AbortSignal.timeout(2000)
      });
      if (priceRes.ok) {
        const priceData = await priceRes.json();
        signal.price = priceData.price;
      }
    } catch {
      // Use default
    }

    return NextResponse.json({
      latest: signal,
      timestamp: now.toISOString()
    });
  } catch (error) {
    console.error('Signals API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch signals', latest: null },
      { status: 500 }
    );
  }
}

// File-based realtime data - Convex alternative
import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import { join } from "path";

const DATA_DIR = join(process.cwd(), "..", "bot", "data"); // Access bot data directory

export async function GET() {
  try {
    // Read bot status from file
    const statusPath = join(DATA_DIR, "bot_status.json");
    const indicatorsPath = join(DATA_DIR, "indicators.json");
    const signalsPath = join(DATA_DIR, "signals.json");
    
    let status = {};
    let indicators = {};
    let signals = [];
    
    try {
      const statusData = await fs.readFile(statusPath, "utf8");
      status = JSON.parse(statusData);
    } catch {
      // Default data
      status = {
        balance: 1000,
        peak_balance: 1000,
        drawdown: 0,
        active_trades: 0,
        win_rate: 0,
        risk_multiplier: 1,
        session: "london",
        running: false,
        current_price: 68245.50,
        timestamp: new Date().toISOString()
      };
    }
    
    try {
      const indicatorsData = await fs.readFile(indicatorsPath, "utf8");
      indicators = JSON.parse(indicatorsData);
    } catch {
      indicators = {
        rsi: 45,
        macd: 0,
        macd_signal: 0,
        ema_9: 68000,
        ema_21: 67800,
        ema_50: 67000,
        ema_200: 65000,
        volume_ratio: 1.0,
        regime: "unknown",
        session: "london"
      };
    }
    
    try {
      const signalsData = await fs.readFile(signalsPath, "utf8");
      signals = JSON.parse(signalsData);
    } catch {
      signals = [];
    }
    
    return NextResponse.json({
      ...status,
      indicators,
      recent_signals: signals.slice(-5)
    });
  } catch (error) {
    console.error("Error reading bot data:", error);
    return NextResponse.json(
      { error: "Failed to fetch status" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/engine
 * Returns the trading engine's dashboard data and current state
 *
 * Response: DashboardData with all metrics, positions, signals, stats
 */

import { NextRequest, NextResponse } from 'next/server';
import { TradingEngine } from '@/lib/engine/main';
import { DataPipeline } from '@/lib/data/pipeline';
import { PolymarketClient } from '@/lib/polymarket/client';
import { BotConfig } from '@/lib/types/index';

// Default bot configuration
const DEFAULT_BOT_CONFIG: BotConfig = {
  enabled: true,
  symbol: 'BTC/SOL',
  primaryTimeframe: '15m',
  secondaryTimeframe: '5m',
  assets: ['BTC', 'SOL'] as any,
  maxLookbackCandles: 200,

  indicators: {
    emaLengths: [5, 9, 20, 50, 200],
    rsi: {
      period: 14,
      overbought: 70,
      oversold: 30,
    },
    macd: {
      fastLength: 12,
      slowLength: 26,
      signalLength: 9,
    },
    bollingerBands: {
      period: 20,
      stdDev: 2,
    },
    atr: {
      period: 14,
    },
    adx: {
      period: 14,
    },
    stochastic: {
      kPeriod: 14,
      dPeriod: 3,
      smoothing: 3,
    },
    vwap: {
      enabled: true,
    },
    obv: {
      enabled: true,
      maPeriod: 20,
    },
  },

  risk: {
    maxPositionSizePercent: 0,
    maxOpenPositions: 0,
    dailyLossLimitPercent: 5,
    maxDrawdownPercent: 8,
    maxTradesPerHour: 20,
    minConfidenceThreshold: 65,
    stopLossPercent: 0.002,
    stopLossUseAtr: true,
    atrMultiplier: 1.5,
  },

  takeProfitLevels: {
    levels: [
      { profitPercent: 0.01, positionReduction: 0.33 },
      { profitPercent: 0.02, positionReduction: 0.33 },
      { profitPercent: 0.03, positionReduction: 0.34 },
    ],
  },

  trailingStop: {
    enabled: true,
    activationPercent: 0.3,
    trailingDistance: 0.15,
  },

  sessions: {
    ASIAN: {
      enabled: true,
      multiplier: 0.5,
      startHour: 21,
      startMinute: 0,
      endHour: 6,
      endMinute: 0,
    },
    LONDON: {
      enabled: true,
      multiplier: 1.0,
      startHour: 6,
      startMinute: 0,
      endHour: 13,
      endMinute: 0,
    },
    NY: {
      enabled: true,
      multiplier: 1.0,
      startHour: 13,
      startMinute: 0,
      endHour: 21,
      endMinute: 0,
    },
    LONDON_NY_OVERLAP: {
      enabled: true,
      multiplier: 1.5,
      startHour: 12,
      startMinute: 0,
      endHour: 17,
      endMinute: 0,
    },
  },

  volume: {
    minRatioVs20MA: 0.8,
    enabled: true,
  },

  trading: {
    minRiskRewardRatio: 1.5,
    maxSpread: 0.001,
    minVolume: 1000,
    feeRate: 0.002,
  },

  polymarket: {
    enabled: true,
    apiUrl: 'https://clob.polymarket.com',
    signatureType: 1,
    maxPositionSize: 0.1,
  },

  strategyWeights: {
    EMA_CROSSOVER: 0.2,
    RSI_REVERSAL: 0.2,
    BREAKOUT: 0.2,
    VWAP_REVERSION: 0.2,
    ORDER_FLOW: 0.2,
  },

  logging: {
    level: 'INFO',
    logTrades: true,
    logSignals: true,
    logIndicators: false,
  },
};

/**
 * Initialize engine if not already initialized
 */
function getEngine(): TradingEngine {
  try {
    return TradingEngine.getInstance();
  } catch (error) {
    // First time initialization
    const dataPipeline = new DataPipeline();
    const polymarketClient = PolymarketClient.fromEnv();

    const engine = TradingEngine.getInstance(dataPipeline, polymarketClient, DEFAULT_BOT_CONFIG);
    return engine;
  }
}

/**
 * GET - Retrieve engine status and dashboard data
 */
export async function GET(request: NextRequest) {
  try {
    const engine = getEngine();
    const dashboardData = engine.getDashboardData();
    const state = engine.getStatus();
    const metrics = engine.getMetrics();

    return NextResponse.json(
      {
        success: true,
        data: {
          dashboard: dashboardData,
          state,
          metrics,
          timestamp: Date.now(),
        },
      },
      { status: 200 }
    );
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    return NextResponse.json(
      {
        success: false,
        error: errorMsg,
        timestamp: Date.now(),
      },
      { status: 500 }
    );
  }
}

/**
 * POST - Not supported on this endpoint
 */
export async function POST(request: NextRequest) {
  return NextResponse.json(
    {
      success: false,
      error: 'Use /api/engine/control for engine control operations',
    },
    { status: 400 }
  );
}

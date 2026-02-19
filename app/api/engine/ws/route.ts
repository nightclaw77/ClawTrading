/**
 * GET /api/engine/ws
 * Server-Sent Events (SSE) endpoint for real-time engine updates
 *
 * Pushes updates every 2 seconds:
 * - Price updates
 * - Signal updates
 * - Position updates
 * - Bot state changes
 * - Alerts and warnings
 *
 * Usage:
 * const eventSource = new EventSource('/api/engine/ws');
 * eventSource.addEventListener('price:update', (e) => console.log(JSON.parse(e.data)));
 * eventSource.addEventListener('signal', (e) => console.log(JSON.parse(e.data)));
 * eventSource.addEventListener('trade:opened', (e) => console.log(JSON.parse(e.data)));
 */

import { NextRequest, NextResponse } from 'next/server';
import { TradingEngine } from '@/lib/engine/main';
import { DataPipeline } from '@/lib/data/pipeline';
import { PolymarketClient } from '@/lib/polymarket/client';
import { BotConfig, TradingAsset } from '@/lib/types/index';

// Default bot configuration
const DEFAULT_BOT_CONFIG: BotConfig = {
  enabled: true,
  symbol: 'BTC/SOL',
  primaryTimeframe: '15m',
  secondaryTimeframe: '5m',
  assets: [TradingAsset.BTC, TradingAsset.SOL],
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

interface SSEEvent {
  event: string;
  data: Record<string, any>;
  timestamp: number;
}

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
 * Format SSE message
 */
function formatSSEMessage(event: string, data: Record<string, any>): string {
  const eventName = `event: ${event}\n`;
  const eventData = `data: ${JSON.stringify(data)}\n\n`;
  return eventName + eventData;
}

/**
 * GET - SSE stream
 */
export async function GET(request: NextRequest) {
  try {
    const engine = getEngine();
    let isConnected = true;

    // Create SSE stream
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Send initial connection message
          controller.enqueue(
            formatSSEMessage('connected', {
              message: 'SSE stream established',
              timestamp: Date.now(),
            })
          );

          // Setup engine event listeners
          const eventHandlers = {
            'signal': (data: any) => {
              if (isConnected) {
                controller.enqueue(formatSSEMessage('signal', data));
              }
            },
            'trade:opened': (data: any) => {
              if (isConnected) {
                controller.enqueue(formatSSEMessage('trade:opened', data));
              }
            },
            'trade:closed': (data: any) => {
              if (isConnected) {
                controller.enqueue(formatSSEMessage('trade:closed', data));
              }
            },
            'alert': (data: any) => {
              if (isConnected) {
                controller.enqueue(formatSSEMessage('alert', data));
              }
            },
            'error': (data: any) => {
              if (isConnected) {
                controller.enqueue(formatSSEMessage('error', data));
              }
            },
            'state:updated': (data: any) => {
              if (isConnected) {
                controller.enqueue(formatSSEMessage('state:updated', data));
              }
            },
            'positions:monitored': (data: any) => {
              if (isConnected) {
                controller.enqueue(formatSSEMessage('positions:updated', data));
              }
            },
            'dashboard:update': (data: any) => {
              if (isConnected) {
                controller.enqueue(formatSSEMessage('dashboard:update', data));
              }
            },
            'arbitrage:detected': (data: any) => {
              if (isConnected) {
                controller.enqueue(formatSSEMessage('arbitrage:detected', data));
              }
            },
            'cycle:complete': (data: any) => {
              if (isConnected) {
                controller.enqueue(formatSSEMessage('cycle:complete', data));
              }
            },
          };

          // Register all event listeners
          Object.entries(eventHandlers).forEach(([event, handler]) => {
            engine.on(event, handler as any);
          });

          // Send dashboard update every 2 seconds
          const updateInterval = setInterval(() => {
            if (isConnected) {
              try {
                const dashboardData = engine.getDashboardData();
                controller.enqueue(
                  formatSSEMessage('dashboard:update', {
                    data: dashboardData,
                    timestamp: Date.now(),
                  })
                );
              } catch (error) {
                // Silently fail on update error
              }
            }
          }, 2000);

          // Cleanup on stream close
          const originalClose = controller.close.bind(controller);
          controller.close = function () {
            isConnected = false;
            clearInterval(updateInterval);

            // Unregister all event listeners
            Object.entries(eventHandlers).forEach(([event, handler]) => {
              engine.removeListener(event, handler as any);
            });

            originalClose();
          };

          // Detect stream closure from client
          request.signal.addEventListener('abort', () => {
            isConnected = false;
            clearInterval(updateInterval);

            // Unregister all event listeners
            Object.entries(eventHandlers).forEach(([event, handler]) => {
              engine.removeListener(event, handler as any);
            });

            controller.close();
          });
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          controller.enqueue(
            formatSSEMessage('error', {
              message: 'SSE initialization error: ' + errorMsg,
              timestamp: Date.now(),
            })
          );
          controller.close();
        }
      },
    });

    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no', // Disable buffering in nginx
      },
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to establish SSE connection: ' + errorMsg,
        timestamp: Date.now(),
      },
      { status: 500 }
    );
  }
}

/**
 * POST/PUT/DELETE - Not supported on SSE endpoint
 */
export async function POST(request: NextRequest) {
  return NextResponse.json(
    {
      success: false,
      error: 'SSE endpoint only supports GET for streaming',
    },
    { status: 405 }
  );
}

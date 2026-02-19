import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  trades: defineTable({
    // Core trade information
    id: v.string(),
    asset: v.union(v.literal("BTC"), v.literal("SOL")),
    timeframe: v.union(
      v.literal("1m"),
      v.literal("5m"),
      v.literal("15m"),
      v.literal("1h"),
      v.literal("4h"),
      v.literal("1d")
    ),
    direction: v.union(v.literal("long"), v.literal("short")),

    // Price information
    entryPrice: v.number(),
    exitPrice: v.number(),

    // Timing
    entryTime: v.number(), // milliseconds timestamp
    exitTime: v.number(),

    // P&L
    pnl: v.number(),
    pnlPercent: v.number(),
    fees: v.number(),

    // Strategy and regime
    strategy: v.string(),
    marketRegime: v.union(
      v.literal("trending_up"),
      v.literal("trending_down"),
      v.literal("ranging"),
      v.literal("high_volatility"),
      v.literal("low_volatility")
    ),
    session: v.union(
      v.literal("asia"),
      v.literal("london"),
      v.literal("newyork"),
      v.literal("weekend")
    ),

    // Indicators snapshot at entry
    indicators: v.object({
      rsi: v.number(),
      macd: v.object({
        macdLine: v.number(),
        signalLine: v.number(),
        histogram: v.number(),
      }),
      ema12: v.number(),
      ema26: v.number(),
      ema50: v.number(),
      ema200: v.number(),
      volume: v.number(),
      volatility: v.number(),
    }),

    // Entry and exit reasoning
    entryReason: v.string(),
    exitReason: v.string(),

    // Trade outcome
    maxWin: v.number(), // max profit reached during trade
    maxLoss: v.number(), // max loss during trade
    won: v.boolean(),

    // Arbitrage
    arbitrageUsed: v.boolean(),
    arbitrageEdge: v.optional(v.number()),

    // Metadata
    _creationTime: v.number(),
  })
    .index("by_asset", ["asset"])
    .index("by_strategy", ["strategy"])
    .index("by_creationTime", ["_creationTime"])
    .index("by_won", ["won"])
    .index("by_regime", ["marketRegime"]),

  learningRecords: defineTable({
    tradeId: v.string(),
    timestamp: v.number(),

    // Outcome classification
    outcome: v.union(
      v.literal("win"),
      v.literal("loss"),
      v.literal("breakeven")
    ),

    // Lessons learned
    lessons: v.array(v.string()),
    patterns: v.array(v.string()),
    improvements: v.array(v.string()),

    // Confidence in this learning
    confidence: v.number(), // 0-1

    // Context when trade happened
    contextFactors: v.object({
      volatility: v.number(),
      trend: v.string(),
      time_of_day: v.string(),
      position_size: v.number(),
      leverage: v.number(),
      volume_regime: v.string(),
    }),

    // Whether these lessons were applied
    applied: v.boolean(),
    appliedAt: v.optional(v.number()),

    // Optional Claude analysis
    claudeInsight: v.optional(v.string()),
    claudeRecommendations: v.optional(v.array(v.string())),

    // Metadata
    _creationTime: v.number(),
  })
    .index("by_tradeId", ["tradeId"])
    .index("by_outcome", ["outcome"])
    .index("by_creationTime", ["_creationTime"])
    .index("by_applied", ["applied"]),

  patterns: defineTable({
    patternName: v.string(),
    patternType: v.string(), // e.g., "indicator_combination", "price_action", "volume_pattern"
    description: v.string(),

    // Statistics
    occurrences: v.number(),
    wins: v.number(),
    losses: v.number(),
    successRate: v.number(), // 0-1
    avgPnl: v.number(),

    // Performance by context
    bestRegime: v.string(),
    bestSession: v.string(),
    worstRegime: v.optional(v.string()),
    worstSession: v.optional(v.string()),

    // Pattern definition
    conditions: v.object({
      indicators: v.optional(v.any()),
      priceAction: v.optional(v.string()),
      volumeCharacteristics: v.optional(v.string()),
      timeframes: v.optional(v.array(v.string())),
    }),

    // Activity tracking
    lastSeen: v.number(),
    active: v.boolean(),

    // Classification
    classification: v.union(
      v.literal("golden_setup"),
      v.literal("trap_setup"),
      v.literal("neutral")
    ),

    // Metadata
    _creationTime: v.number(),
  })
    .index("by_successRate", ["successRate"])
    .index("by_active", ["active"])
    .index("by_classification", ["classification"])
    .index("by_creationTime", ["_creationTime"]),

  botConfig: defineTable({
    configKey: v.string(),
    configValue: v.string(), // JSON stringified
    configType: v.union(
      v.literal("string"),
      v.literal("number"),
      v.literal("boolean"),
      v.literal("json")
    ),

    // Change tracking
    updatedAt: v.number(),
    updatedBy: v.union(
      v.literal("human"),
      v.literal("bot"),
      v.literal("learning-system"),
      v.literal("claude-ai")
    ),

    // Previous value for rollback
    previousValue: v.optional(v.string()),

    // Metadata
    description: v.optional(v.string()),
    _creationTime: v.number(),
  })
    .index("by_configKey", ["configKey"])
    .index("by_updatedAt", ["updatedAt"]),

  botState: defineTable({
    timestamp: v.number(),
    status: v.union(
      v.literal("running"),
      v.literal("paused"),
      v.literal("stopped"),
      v.literal("error")
    ),

    // Financial state
    balance: v.number(),
    equity: v.number(),
    dailyPnl: v.number(),
    dailyReturn: v.number(),

    // Position tracking
    openPositionsCount: v.number(),
    totalTrades: v.number(),
    winRate: v.number(),

    // Market data
    btcPrice: v.number(),
    solPrice: v.number(),

    // Market conditions
    regime: v.union(
      v.literal("trending_up"),
      v.literal("trending_down"),
      v.literal("ranging"),
      v.literal("high_volatility"),
      v.literal("low_volatility")
    ),
    session: v.union(
      v.literal("asia"),
      v.literal("london"),
      v.literal("newyork"),
      v.literal("weekend")
    ),

    // System state
    alerts: v.array(v.string()),
    errorMessage: v.optional(v.string()),
    lastActivity: v.number(),

    // Metadata
    _creationTime: v.number(),
  })
    .index("by_timestamp", ["timestamp"])
    .index("by_status", ["status"])
    .index("by_creationTime", ["_creationTime"]),

  signals: defineTable({
    timestamp: v.number(),
    asset: v.union(v.literal("BTC"), v.literal("SOL")),
    timeframe: v.string(),

    // Signal details
    direction: v.union(v.literal("long"), v.literal("short"), v.literal("neutral")),
    confidence: v.number(), // 0-1
    strategy: v.string(),

    // What happened with signal
    action: v.union(v.literal("entered"), v.literal("skipped")),
    skipReason: v.optional(v.string()),

    // Indicator state
    indicators: v.object({
      rsi: v.number(),
      macd: v.object({
        macdLine: v.number(),
        signalLine: v.number(),
        histogram: v.number(),
      }),
      ema12: v.number(),
      ema26: v.number(),
      ema50: v.number(),
      ema200: v.number(),
      volume: v.number(),
    }),

    // Market context
    marketRegime: v.string(),
    session: v.string(),

    // Metadata
    _creationTime: v.number(),
  })
    .index("by_asset", ["asset"])
    .index("by_action", ["action"])
    .index("by_timestamp", ["timestamp"])
    .index("by_creationTime", ["_creationTime"]),

  strategyPerformance: defineTable({
    strategyName: v.string(),

    // Trade statistics
    totalTrades: v.number(),
    wins: v.number(),
    losses: v.number(),
    breakevens: v.number(),

    // Performance metrics
    winRate: v.number(), // 0-1
    avgPnl: v.number(),
    profitFactor: v.number(),
    sharpeRatio: v.number(),
    maxDrawdown: v.number(),

    // Performance by asset
    btcStats: v.object({
      totalTrades: v.number(),
      wins: v.number(),
      winRate: v.number(),
      avgPnl: v.number(),
    }),
    solStats: v.object({
      totalTrades: v.number(),
      wins: v.number(),
      winRate: v.number(),
      avgPnl: v.number(),
    }),

    // Performance by regime
    bestRegime: v.string(),
    bestRegimeWinRate: v.number(),
    worstRegime: v.optional(v.string()),
    worstRegimeWinRate: v.optional(v.number()),

    // Performance by session
    bestSession: v.string(),
    bestSessionWinRate: v.number(),
    worstSession: v.optional(v.string()),
    worstSessionWinRate: v.optional(v.number()),

    // Trend
    trendsUp: v.boolean(),
    trend7d: v.number(), // win rate 7 days
    trend30d: v.number(), // win rate 30 days

    // Meta
    lastUpdated: v.number(),
    _creationTime: v.number(),
  })
    .index("by_strategyName", ["strategyName"])
    .index("by_winRate", ["winRate"])
    .index("by_lastUpdated", ["lastUpdated"])
    .index("by_creationTime", ["_creationTime"]),
});

// @ts-nocheck
// Note: TypeScript errors here are resolved when `npx convex dev` generates _generated/ folder
import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";

// Save a completed trade
export const saveTrade = mutation({
  args: {
    id: v.string(),
    asset: v.union(v.literal("BTC"), v.literal("SOL")),
    timeframe: v.string(),
    direction: v.union(v.literal("long"), v.literal("short")),
    entryPrice: v.number(),
    exitPrice: v.number(),
    entryTime: v.number(),
    exitTime: v.number(),
    pnl: v.number(),
    pnlPercent: v.number(),
    strategy: v.string(),
    marketRegime: v.string(),
    session: v.string(),
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
    entryReason: v.string(),
    exitReason: v.string(),
    maxWin: v.number(),
    maxLoss: v.number(),
    won: v.boolean(),
    fees: v.number(),
    arbitrageUsed: v.boolean(),
    arbitrageEdge: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const tradeId = await ctx.db.insert("trades", {
      id: args.id,
      asset: args.asset,
      timeframe: args.timeframe,
      direction: args.direction,
      entryPrice: args.entryPrice,
      exitPrice: args.exitPrice,
      entryTime: args.entryTime,
      exitTime: args.exitTime,
      pnl: args.pnl,
      pnlPercent: args.pnlPercent,
      strategy: args.strategy,
      marketRegime: args.marketRegime as any,
      session: args.session as any,
      indicators: args.indicators,
      entryReason: args.entryReason,
      exitReason: args.exitReason,
      maxWin: args.maxWin,
      maxLoss: args.maxLoss,
      won: args.won,
      fees: args.fees,
      arbitrageUsed: args.arbitrageUsed,
      arbitrageEdge: args.arbitrageEdge,
    });

    return tradeId;
  },
});

// Save a learning record from a trade
export const saveLearningRecord = mutation({
  args: {
    tradeId: v.string(),
    outcome: v.union(v.literal("win"), v.literal("loss"), v.literal("breakeven")),
    lessons: v.array(v.string()),
    patterns: v.array(v.string()),
    improvements: v.array(v.string()),
    confidence: v.number(),
    contextFactors: v.object({
      volatility: v.number(),
      trend: v.string(),
      time_of_day: v.string(),
      position_size: v.number(),
      leverage: v.number(),
      volume_regime: v.string(),
    }),
    claudeInsight: v.optional(v.string()),
    claudeRecommendations: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const recordId = await ctx.db.insert("learningRecords", {
      tradeId: args.tradeId,
      timestamp: Date.now(),
      outcome: args.outcome,
      lessons: args.lessons,
      patterns: args.patterns,
      improvements: args.improvements,
      confidence: Math.max(0, Math.min(1, args.confidence)), // Clamp 0-1
      contextFactors: args.contextFactors,
      applied: false,
      claudeInsight: args.claudeInsight,
      claudeRecommendations: args.claudeRecommendations,
    });

    return recordId;
  },
});

// Update or insert a pattern
export const updatePattern = mutation({
  args: {
    patternName: v.string(),
    patternType: v.string(),
    description: v.string(),
    occurrences: v.number(),
    wins: v.number(),
    losses: v.number(),
    successRate: v.number(),
    avgPnl: v.number(),
    bestRegime: v.string(),
    bestSession: v.string(),
    worstRegime: v.optional(v.string()),
    worstSession: v.optional(v.string()),
    conditions: v.object({
      indicators: v.optional(v.any()),
      priceAction: v.optional(v.string()),
      volumeCharacteristics: v.optional(v.string()),
      timeframes: v.optional(v.array(v.string())),
    }),
    active: v.boolean(),
    classification: v.union(
      v.literal("golden_setup"),
      v.literal("trap_setup"),
      v.literal("neutral")
    ),
  },
  handler: async (ctx, args) => {
    // Check if pattern exists
    const existing = await ctx.db
      .query("patterns")
      .filter((q) => q.eq(q.field("patternName"), args.patternName))
      .first();

    if (existing) {
      // Update existing
      await ctx.db.patch(existing._id, {
        occurrences: args.occurrences,
        wins: args.wins,
        losses: args.losses,
        successRate: args.successRate,
        avgPnl: args.avgPnl,
        bestRegime: args.bestRegime,
        bestSession: args.bestSession,
        worstRegime: args.worstRegime,
        worstSession: args.worstSession,
        conditions: args.conditions,
        active: args.active,
        classification: args.classification,
        lastSeen: Date.now(),
      });

      return existing._id;
    } else {
      // Insert new
      const patternId = await ctx.db.insert("patterns", {
        patternName: args.patternName,
        patternType: args.patternType,
        description: args.description,
        occurrences: args.occurrences,
        wins: args.wins,
        losses: args.losses,
        successRate: args.successRate,
        avgPnl: args.avgPnl,
        bestRegime: args.bestRegime,
        bestSession: args.bestSession,
        worstRegime: args.worstRegime,
        worstSession: args.worstSession,
        conditions: args.conditions,
        lastSeen: Date.now(),
        active: args.active,
        classification: args.classification,
      });

      return patternId;
    }
  },
});

// Update bot configuration
export const updateBotConfig = mutation({
  args: {
    configKey: v.string(),
    configValue: v.string(),
    configType: v.union(
      v.literal("string"),
      v.literal("number"),
      v.literal("boolean"),
      v.literal("json")
    ),
    updatedBy: v.union(
      v.literal("human"),
      v.literal("bot"),
      v.literal("learning-system"),
      v.literal("claude-ai")
    ),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Find existing config
    const existing = await ctx.db
      .query("botConfig")
      .filter((q) => q.eq(q.field("configKey"), args.configKey))
      .first();

    if (existing) {
      // Update existing
      await ctx.db.patch(existing._id, {
        configValue: args.configValue,
        configType: args.configType,
        updatedAt: Date.now(),
        updatedBy: args.updatedBy,
        previousValue: existing.configValue,
        description: args.description || existing.description,
      });

      return existing._id;
    } else {
      // Insert new
      const configId = await ctx.db.insert("botConfig", {
        configKey: args.configKey,
        configValue: args.configValue,
        configType: args.configType,
        updatedAt: Date.now(),
        updatedBy: args.updatedBy,
        description: args.description,
      });

      return configId;
    }
  },
});

// Update bot state snapshot
export const updateBotState = mutation({
  args: {
    status: v.union(
      v.literal("running"),
      v.literal("paused"),
      v.literal("stopped"),
      v.literal("error")
    ),
    balance: v.number(),
    equity: v.number(),
    dailyPnl: v.number(),
    dailyReturn: v.number(),
    openPositionsCount: v.number(),
    totalTrades: v.number(),
    winRate: v.number(),
    btcPrice: v.number(),
    solPrice: v.number(),
    regime: v.string(),
    session: v.string(),
    alerts: v.array(v.string()),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const stateId = await ctx.db.insert("botState", {
      timestamp: Date.now(),
      status: args.status,
      balance: args.balance,
      equity: args.equity,
      dailyPnl: args.dailyPnl,
      dailyReturn: args.dailyReturn,
      openPositionsCount: args.openPositionsCount,
      totalTrades: args.totalTrades,
      winRate: args.winRate,
      btcPrice: args.btcPrice,
      solPrice: args.solPrice,
      regime: args.regime as any,
      session: args.session as any,
      alerts: args.alerts,
      errorMessage: args.errorMessage,
      lastActivity: Date.now(),
    });

    return stateId;
  },
});

// Save a signal
export const saveSignal = mutation({
  args: {
    asset: v.union(v.literal("BTC"), v.literal("SOL")),
    timeframe: v.string(),
    direction: v.union(v.literal("long"), v.literal("short"), v.literal("neutral")),
    confidence: v.number(),
    strategy: v.string(),
    action: v.union(v.literal("entered"), v.literal("skipped")),
    skipReason: v.optional(v.string()),
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
    marketRegime: v.string(),
    session: v.string(),
  },
  handler: async (ctx, args) => {
    const signalId = await ctx.db.insert("signals", {
      timestamp: Date.now(),
      asset: args.asset,
      timeframe: args.timeframe,
      direction: args.direction,
      confidence: Math.max(0, Math.min(1, args.confidence)),
      strategy: args.strategy,
      action: args.action,
      skipReason: args.skipReason,
      indicators: args.indicators,
      marketRegime: args.marketRegime,
      session: args.session,
    });

    return signalId;
  },
});

// Update strategy performance statistics
export const updateStrategyPerformance = mutation({
  args: {
    strategyName: v.string(),
    totalTrades: v.number(),
    wins: v.number(),
    losses: v.number(),
    breakevens: v.number(),
    winRate: v.number(),
    avgPnl: v.number(),
    profitFactor: v.number(),
    sharpeRatio: v.number(),
    maxDrawdown: v.number(),
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
    bestRegime: v.string(),
    bestRegimeWinRate: v.number(),
    worstRegime: v.optional(v.string()),
    worstRegimeWinRate: v.optional(v.number()),
    bestSession: v.string(),
    bestSessionWinRate: v.number(),
    worstSession: v.optional(v.string()),
    worstSessionWinRate: v.optional(v.number()),
    trend7d: v.number(),
    trend30d: v.number(),
  },
  handler: async (ctx, args) => {
    // Find existing strategy performance
    const existing = await ctx.db
      .query("strategyPerformance")
      .filter((q) => q.eq(q.field("strategyName"), args.strategyName))
      .first();

    const trendsUp = args.winRate > 0.5; // Simple trend indicator

    if (existing) {
      // Update existing
      await ctx.db.patch(existing._id, {
        totalTrades: args.totalTrades,
        wins: args.wins,
        losses: args.losses,
        breakevens: args.breakevens,
        winRate: args.winRate,
        avgPnl: args.avgPnl,
        profitFactor: args.profitFactor,
        sharpeRatio: args.sharpeRatio,
        maxDrawdown: args.maxDrawdown,
        btcStats: args.btcStats,
        solStats: args.solStats,
        bestRegime: args.bestRegime,
        bestRegimeWinRate: args.bestRegimeWinRate,
        worstRegime: args.worstRegime,
        worstRegimeWinRate: args.worstRegimeWinRate,
        bestSession: args.bestSession,
        bestSessionWinRate: args.bestSessionWinRate,
        worstSession: args.worstSession,
        worstSessionWinRate: args.worstSessionWinRate,
        trendsUp,
        trend7d: args.trend7d,
        trend30d: args.trend30d,
        lastUpdated: Date.now(),
      });

      return existing._id;
    } else {
      // Insert new
      const perfId = await ctx.db.insert("strategyPerformance", {
        strategyName: args.strategyName,
        totalTrades: args.totalTrades,
        wins: args.wins,
        losses: args.losses,
        breakevens: args.breakevens,
        winRate: args.winRate,
        avgPnl: args.avgPnl,
        profitFactor: args.profitFactor,
        sharpeRatio: args.sharpeRatio,
        maxDrawdown: args.maxDrawdown,
        btcStats: args.btcStats,
        solStats: args.solStats,
        bestRegime: args.bestRegime,
        bestRegimeWinRate: args.bestRegimeWinRate,
        worstRegime: args.worstRegime,
        worstRegimeWinRate: args.worstRegimeWinRate,
        bestSession: args.bestSession,
        bestSessionWinRate: args.bestSessionWinRate,
        worstSession: args.worstSession,
        worstSessionWinRate: args.worstSessionWinRate,
        trendsUp,
        trend7d: args.trend7d,
        trend30d: args.trend30d,
        lastUpdated: Date.now(),
      });

      return perfId;
    }
  },
});

// Mark learning record as applied
export const applyLearningRecord = mutation({
  args: {
    recordId: v.id("learningRecords"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.recordId, {
      applied: true,
      appliedAt: Date.now(),
    });

    return args.recordId;
  },
});

// Batch delete old records (for cleanup)
export const deleteOldRecords = mutation({
  args: {
    olderThanMs: v.number(),
    recordType: v.union(
      v.literal("learningRecords"),
      v.literal("signals"),
      v.literal("botState")
    ),
  },
  handler: async (ctx, args) => {
    const cutoffTime = Date.now() - args.olderThanMs;
    const records = await ctx.db
      .query(args.recordType)
      .filter((q) => q.lt(q.field("_creationTime"), cutoffTime))
      .collect();

    let deletedCount = 0;
    for (const record of records) {
      await ctx.db.delete(record._id);
      deletedCount++;
    }

    return { deletedCount, recordType: args.recordType };
  },
});

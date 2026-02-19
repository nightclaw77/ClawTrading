// @ts-nocheck
// Note: TypeScript errors here are resolved when `npx convex dev` generates _generated/ folder
import { query } from "./_generated/server";
import { v } from "convex/values";

// Get most recent trades
export const getRecentTrades = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 50;
    const trades = await ctx.db
      .query("trades")
      .order("desc")
      .take(limit);

    return trades;
  },
});

// Get trades by asset
export const getTradesByAsset = query({
  args: {
    asset: v.union(v.literal("BTC"), v.literal("SOL")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 50;
    const trades = await ctx.db
      .query("trades")
      .withIndex("by_asset", (q) => q.eq("asset", args.asset))
      .order("desc")
      .take(limit);

    return trades;
  },
});

// Get trades by strategy
export const getTradesByStrategy = query({
  args: {
    strategy: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 50;
    const trades = await ctx.db
      .query("trades")
      .withIndex("by_strategy", (q) => q.eq("strategy", args.strategy))
      .order("desc")
      .take(limit);

    return trades;
  },
});

// Get winning patterns (success rate > 55%)
export const getWinningPatterns = query({
  handler: async (ctx) => {
    const patterns = await ctx.db
      .query("patterns")
      .withIndex("by_successRate", (q) => q.gt("successRate", 0.55))
      .order("desc")
      .collect();

    return patterns.filter((p) => p.active);
  },
});

// Get losing patterns (success rate < 45%)
export const getLosingPatterns = query({
  handler: async (ctx) => {
    const patterns = await ctx.db
      .query("patterns")
      .withIndex("by_successRate", (q) => q.lt("successRate", 0.45))
      .order("asc")
      .collect();

    return patterns.filter((p) => p.active);
  },
});

// Get golden setups (patterns with >70% success rate)
export const getGoldenSetups = query({
  handler: async (ctx) => {
    const patterns = await ctx.db
      .query("patterns")
      .withIndex("by_classification", (q) =>
        q.eq("classification", "golden_setup")
      )
      .order("desc")
      .collect();

    return patterns;
  },
});

// Get trap setups (patterns with <40% success rate)
export const getTrapSetups = query({
  handler: async (ctx) => {
    const patterns = await ctx.db
      .query("patterns")
      .withIndex("by_classification", (q) => q.eq("classification", "trap_setup"))
      .order("asc")
      .collect();

    return patterns;
  },
});

// Get current bot state
export const getBotState = query({
  handler: async (ctx) => {
    const state = await ctx.db
      .query("botState")
      .order("desc")
      .first();

    return state || null;
  },
});

// Get all bot configuration
export const getBotConfig = query({
  handler: async (ctx) => {
    const config = await ctx.db.query("botConfig").collect();

    // Convert to key-value object
    const configMap: Record<string, any> = {};
    for (const item of config) {
      try {
        // Parse based on type
        if (item.configType === "number") {
          configMap[item.configKey] = parseFloat(item.configValue);
        } else if (item.configType === "boolean") {
          configMap[item.configKey] = item.configValue === "true";
        } else if (item.configType === "json") {
          configMap[item.configKey] = JSON.parse(item.configValue);
        } else {
          configMap[item.configKey] = item.configValue;
        }
      } catch (e) {
        configMap[item.configKey] = item.configValue;
      }
    }

    return configMap;
  },
});

// Get specific config value
export const getBotConfigValue = query({
  args: {
    key: v.string(),
  },
  handler: async (ctx, args) => {
    const config = await ctx.db
      .query("botConfig")
      .withIndex("by_configKey", (q) => q.eq("configKey", args.key))
      .first();

    if (!config) return null;

    try {
      if (config.configType === "number") {
        return parseFloat(config.configValue);
      } else if (config.configType === "boolean") {
        return config.configValue === "true";
      } else if (config.configType === "json") {
        return JSON.parse(config.configValue);
      } else {
        return config.configValue;
      }
    } catch (e) {
      return config.configValue;
    }
  },
});

// Get all strategy performance
export const getStrategyPerformance = query({
  handler: async (ctx) => {
    const strategies = await ctx.db
      .query("strategyPerformance")
      .order("desc")
      .collect();

    return strategies;
  },
});

// Get specific strategy performance
export const getStrategyPerformanceByName = query({
  args: {
    strategyName: v.string(),
  },
  handler: async (ctx, args) => {
    const strategy = await ctx.db
      .query("strategyPerformance")
      .withIndex("by_strategyName", (q) =>
        q.eq("strategyName", args.strategyName)
      )
      .first();

    return strategy || null;
  },
});

// Get learning records for a trade
export const getLearningRecordsByTradeId = query({
  args: {
    tradeId: v.string(),
  },
  handler: async (ctx, args) => {
    const records = await ctx.db
      .query("learningRecords")
      .withIndex("by_tradeId", (q) => q.eq("tradeId", args.tradeId))
      .collect();

    return records;
  },
});

// Get unapplied learning records
export const getUnappliedLearningRecords = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 100;
    const records = await ctx.db
      .query("learningRecords")
      .withIndex("by_applied", (q) => q.eq("applied", false))
      .order("desc")
      .take(limit);

    return records;
  },
});

// Get learning records by outcome
export const getLearningRecordsByOutcome = query({
  args: {
    outcome: v.union(v.literal("win"), v.literal("loss"), v.literal("breakeven")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 100;
    const records = await ctx.db
      .query("learningRecords")
      .withIndex("by_outcome", (q) => q.eq("outcome", args.outcome))
      .order("desc")
      .take(limit);

    return records;
  },
});

// Get daily statistics
export const getDailyStats = query({
  args: {
    date: v.string(), // YYYY-MM-DD format
  },
  handler: async (ctx, args) => {
    // Parse date to milliseconds range
    const [year, month, day] = args.date.split("-").map(Number);
    const startOfDay = new Date(year, month - 1, day, 0, 0, 0).getTime();
    const endOfDay = new Date(year, month - 1, day, 23, 59, 59).getTime();

    const trades = await ctx.db
      .query("trades")
      .filter((q) =>
        q.and(
          q.gte(q.field("entryTime"), startOfDay),
          q.lte(q.field("entryTime"), endOfDay)
        )
      )
      .collect();

    // Calculate statistics
    const totalTrades = trades.length;
    const wonTrades = trades.filter((t) => t.won).length;
    const lostTrades = totalTrades - wonTrades;
    const totalPnl = trades.reduce((sum, t) => sum + t.pnl, 0);
    const avgPnl = totalTrades > 0 ? totalPnl / totalTrades : 0;
    const winRate = totalTrades > 0 ? wonTrades / totalTrades : 0;

    // Group by asset
    const btcTrades = trades.filter((t) => t.asset === "BTC");
    const solTrades = trades.filter((t) => t.asset === "SOL");

    // Group by session
    const sessionStats: Record<string, any> = {};
    trades.forEach((trade) => {
      if (!sessionStats[trade.session]) {
        sessionStats[trade.session] = {
          trades: [],
          count: 0,
          wins: 0,
        };
      }
      sessionStats[trade.session].trades.push(trade);
      sessionStats[trade.session].count++;
      if (trade.won) sessionStats[trade.session].wins++;
    });

    return {
      date: args.date,
      totalTrades,
      wonTrades,
      lostTrades,
      winRate,
      totalPnl,
      avgPnl,
      btcCount: btcTrades.length,
      btcPnl: btcTrades.reduce((sum, t) => sum + t.pnl, 0),
      solCount: solTrades.length,
      solPnl: solTrades.reduce((sum, t) => sum + t.pnl, 0),
      sessionStats,
      trades,
    };
  },
});

// Get signal history
export const getSignalHistory = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 100;
    const signals = await ctx.db
      .query("signals")
      .order("desc")
      .take(limit);

    return signals;
  },
});

// Get signals by action
export const getSignalsByAction = query({
  args: {
    action: v.union(v.literal("entered"), v.literal("skipped")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 100;
    const signals = await ctx.db
      .query("signals")
      .withIndex("by_action", (q) => q.eq("action", args.action))
      .order("desc")
      .take(limit);

    return signals;
  },
});

// Get signals by asset
export const getSignalsByAsset = query({
  args: {
    asset: v.union(v.literal("BTC"), v.literal("SOL")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 100;
    const signals = await ctx.db
      .query("signals")
      .withIndex("by_asset", (q) => q.eq("asset", args.asset))
      .order("desc")
      .take(limit);

    return signals;
  },
});

// Get recent patterns (active only)
export const getActivePatterns = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 100;
    const patterns = await ctx.db
      .query("patterns")
      .withIndex("by_active", (q) => q.eq("active", true))
      .order("desc")
      .take(limit);

    return patterns;
  },
});

// Get pattern by name
export const getPatternByName = query({
  args: {
    patternName: v.string(),
  },
  handler: async (ctx, args) => {
    const pattern = await ctx.db
      .query("patterns")
      .filter((q) => q.eq(q.field("patternName"), args.patternName))
      .first();

    return pattern || null;
  },
});

// Compute trade statistics
export const computeTradeStats = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 100;
    const trades = await ctx.db
      .query("trades")
      .order("desc")
      .take(limit);

    if (trades.length === 0) {
      return {
        totalTrades: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        totalPnl: 0,
        avgPnl: 0,
        maxWin: 0,
        maxLoss: 0,
        profitFactor: 0,
      };
    }

    const wins = trades.filter((t) => t.won).length;
    const losses = trades.length - wins;
    const totalPnl = trades.reduce((sum, t) => sum + t.pnl, 0);
    const avgPnl = totalPnl / trades.length;
    const maxWin = Math.max(...trades.map((t) => t.pnl), 0);
    const maxLoss = Math.min(...trades.map((t) => t.pnl), 0);

    // Profit factor = sum of winning trades / sum of losing trades (absolute)
    const winSum = trades.filter((t) => t.won).reduce((sum, t) => sum + t.pnl, 0);
    const lossSum = Math.abs(
      trades.filter((t) => !t.won).reduce((sum, t) => sum + t.pnl, 0)
    );
    const profitFactor = lossSum > 0 ? winSum / lossSum : 0;

    return {
      totalTrades: trades.length,
      wins,
      losses,
      winRate: wins / trades.length,
      totalPnl,
      avgPnl,
      maxWin,
      maxLoss,
      profitFactor,
    };
  },
});

// Get high-confidence signals
export const getHighConfidenceSignals = query({
  args: {
    minConfidence: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const minConf = args.minConfidence || 0.7;
    const limit = args.limit || 50;

    const signals = await ctx.db
      .query("signals")
      .order("desc")
      .filter((q) => q.gte(q.field("confidence"), minConf))
      .take(limit);

    return signals;
  },
});

// Get winning patterns by regime
export const getWinningPatternsByRegime = query({
  args: {
    regime: v.string(),
  },
  handler: async (ctx, args) => {
    const patterns = await ctx.db
      .query("patterns")
      .filter((q) =>
        q.and(
          q.eq(q.field("bestRegime"), args.regime),
          q.gt(q.field("successRate"), 0.55),
          q.eq(q.field("active"), true)
        )
      )
      .order("desc")
      .collect();

    return patterns;
  },
});

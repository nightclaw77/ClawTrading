import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import Anthropic from "@anthropic-ai/sdk";

/**
 * Types for the learning engine
 */
export interface Trade {
  id: string;
  asset: "BTC" | "SOL";
  timeframe: string;
  direction: "long" | "short";
  entryPrice: number;
  exitPrice: number;
  entryTime: number;
  exitTime: number;
  pnl: number;
  pnlPercent: number;
  strategy: string;
  marketRegime: string;
  session: string;
  indicators: {
    rsi: number;
    macd: {
      macdLine: number;
      signalLine: number;
      histogram: number;
    };
    ema12: number;
    ema26: number;
    ema50: number;
    ema200: number;
    volume: number;
    volatility: number;
  };
  entryReason: string;
  exitReason: string;
  maxWin: number;
  maxLoss: number;
  won: boolean;
  fees: number;
  arbitrageUsed: boolean;
  arbitrageEdge?: number;
}

export interface PreTradeState {
  btcPrice: number;
  solPrice: number;
  regime: string;
  session: string;
  volatility: number;
  trend: string;
  timeOfDay: string;
  positionSize: number;
  leverage: number;
  volumeRegime: string;
}

export interface LearningRecord {
  tradeId: string;
  outcome: "win" | "loss" | "breakeven";
  lessons: string[];
  patterns: string[];
  improvements: string[];
  confidence: number;
  contextFactors: {
    volatility: number;
    trend: string;
    time_of_day: string;
    position_size: number;
    leverage: number;
    volume_regime: string;
  };
  claudeInsight?: string;
  claudeRecommendations?: string[];
}

export interface PatternRecord {
  patternName: string;
  patternType: string;
  description: string;
  occurrences: number;
  wins: number;
  losses: number;
  successRate: number;
  avgPnl: number;
  bestRegime: string;
  bestSession: string;
  worstRegime?: string;
  worstSession?: string;
  conditions: {
    indicators?: any;
    priceAction?: string;
    volumeCharacteristics?: string;
    timeframes?: string[];
  };
  active: boolean;
  classification: "golden_setup" | "trap_setup" | "neutral";
}

export interface StrategyStats {
  strategyName: string;
  totalTrades: number;
  wins: number;
  losses: number;
  breakevens: number;
  winRate: number;
  avgPnl: number;
  profitFactor: number;
  sharpeRatio: number;
  maxDrawdown: number;
}

/**
 * AI Learning Engine for the trading bot
 * Analyzes trades, identifies patterns, and adapts parameters
 */
export class LearningEngine {
  private convex: ConvexHttpClient;
  private anthropic: Anthropic | null = null;
  private tradesSinceLastAdapt = 0;
  private tradesSinceLastClaudeAnalysis = 0;

  // Golden setup threshold: >70% win rate
  private readonly GOLDEN_SETUP_THRESHOLD = 0.7;

  // Trap setup threshold: <40% win rate
  private readonly TRAP_SETUP_THRESHOLD = 0.4;

  // Parameter tuning frequency
  private readonly ADAPT_FREQUENCY = 50;

  // Claude analysis frequency
  private readonly CLAUDE_ANALYSIS_FREQUENCY = 100;

  // Minimum confidence threshold for lessons
  private readonly MIN_CONFIDENCE_THRESHOLD = 0.6;

  constructor(convexUrl: string) {
    this.convex = new ConvexHttpClient(convexUrl);

    // Initialize Anthropic client only if API key is available
    if (process.env.ANTHROPIC_API_KEY) {
      this.anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });
    }
  }

  /**
   * Main entry point: Analyze a completed trade
   * Returns learning record to be saved
   */
  async analyzeTrade(trade: Trade, preTradeState: PreTradeState): Promise<LearningRecord> {
    console.log(`[LEARNING ENGINE] Analyzing trade: ${trade.id} (${trade.asset} ${trade.direction})`);

    // Determine outcome
    const outcome: "win" | "loss" | "breakeven" =
      trade.pnl > 10 ? "win" : trade.pnl < -10 ? "loss" : "breakeven";

    // Extract lessons from trade
    const lessons = this.extractLessons(trade, preTradeState);

    // Identify patterns
    const patterns = this.identifyPatterns(trade, preTradeState);

    // Generate improvements
    const improvements = this.generateImprovements(trade, outcome);

    // Calculate confidence (0-1)
    const confidence = this.calculateConfidence(trade, lessons.length);

    // Create learning record
    const learningRecord: LearningRecord = {
      tradeId: trade.id,
      outcome,
      lessons,
      patterns,
      improvements,
      confidence,
      contextFactors: {
        volatility: preTradeState.volatility,
        trend: preTradeState.trend,
        time_of_day: preTradeState.timeOfDay,
        position_size: preTradeState.positionSize,
        leverage: preTradeState.leverage,
        volume_regime: preTradeState.volumeRegime,
      },
    };

    // Save to Convex
    try {
      await this.convex.mutation(anyApi.mutations.saveLearningRecord, learningRecord);
      console.log(
        `[LEARNING ENGINE] Saved learning record for trade ${trade.id}`
      );
    } catch (error) {
      console.error(`[LEARNING ENGINE] Error saving learning record:`, error);
    }

    // Increment trade counter
    this.tradesSinceLastAdapt++;
    this.tradesSinceLastClaudeAnalysis++;

    // Trigger parameter tuning if needed
    if (this.tradesSinceLastAdapt >= this.ADAPT_FREQUENCY) {
      await this.tuneParameters();
      this.tradesSinceLastAdapt = 0;
    }

    // Trigger Claude analysis if needed and API is available
    if (
      this.anthropic &&
      this.tradesSinceLastClaudeAnalysis >= this.CLAUDE_ANALYSIS_FREQUENCY
    ) {
      await this.performClaudeAnalysis(learningRecord);
      this.tradesSinceLastClaudeAnalysis = 0;
    }

    // Update patterns
    await this.updatePatterns(trade);

    return learningRecord;
  }

  /**
   * Extract specific lessons from a trade
   */
  private extractLessons(trade: Trade, preTradeState: PreTradeState): string[] {
    const lessons: string[] = [];

    // Check RSI levels
    if (trade.indicators.rsi > 65 && trade.direction === "long") {
      if (!trade.won) {
        lessons.push(
          "RSI above 65 on long entry correlated with loss - consider higher RSI threshold"
        );
      }
    }

    if (trade.indicators.rsi < 35 && trade.direction === "short") {
      if (!trade.won) {
        lessons.push(
          "RSI below 35 on short entry correlated with loss - consider lower RSI threshold"
        );
      }
    }

    // Check volume confirmation
    if (trade.indicators.volume < 100000 && !trade.won) {
      lessons.push(
        "Low volume at entry correlated with loss - require minimum volume confirmation"
      );
    }

    // Check MACD alignment
    const macdAlignedWithDirection =
      (trade.direction === "long" && trade.indicators.macd.histogram > 0) ||
      (trade.direction === "short" && trade.indicators.macd.histogram < 0);

    if (!macdAlignedWithDirection && !trade.won) {
      lessons.push(
        "MACD not aligned with trade direction at entry - improve MACD filter"
      );
    }

    // Check EMA alignment
    const emaAligned =
      (trade.direction === "long" &&
        trade.indicators.ema12 > trade.indicators.ema26 &&
        trade.indicators.ema26 > trade.indicators.ema50) ||
      (trade.direction === "short" &&
        trade.indicators.ema12 < trade.indicators.ema26 &&
        trade.indicators.ema26 < trade.indicators.ema50);

    if (!emaAligned && !trade.won) {
      lessons.push(
        "EMA alignment poor at entry - consider stricter EMA order requirement"
      );
    }

    // Check volatility appropriateness
    if (preTradeState.volatility > 0.05 && !trade.won) {
      lessons.push(
        `High volatility (${(preTradeState.volatility * 100).toFixed(2)}%) at entry may have increased risk`
      );
    }

    // Check session appropriateness
    if (!trade.won) {
      lessons.push(
        `Trade lost during ${trade.session} session - analyze session-specific performance`
      );
    }

    // Check regime appropriateness
    if (!trade.won) {
      lessons.push(
        `Trade lost during ${trade.marketRegime} regime - may not suit current market conditions`
      );
    }

    // Positive lessons from wins
    if (trade.won) {
      lessons.push(
        `${trade.strategy} strategy performed well with these indicator values`
      );

      if (trade.indicators.rsi > 50 && trade.indicators.rsi < 70) {
        lessons.push(
          "RSI 50-70 range on long entries appears favorable in this regime"
        );
      }

      if (preTradeState.volatility < 0.03) {
        lessons.push("Lower volatility environment favorable for this strategy");
      }
    }

    return lessons.filter((lesson) => lesson); // Remove empty strings
  }

  /**
   * Identify patterns in the trade
   */
  private identifyPatterns(trade: Trade, preTradeState: PreTradeState): string[] {
    const patterns: string[] = [];

    // Indicator combination patterns
    const rsi = Math.round(trade.indicators.rsi);
    const macdPos = trade.indicators.macd.histogram > 0 ? "positive" : "negative";
    const volumeQuality = trade.indicators.volume > 200000 ? "high" : "low";

    patterns.push(
      `RSI_${rsi}_MACD_${macdPos}_Volume_${volumeQuality}_${trade.direction}`
    );

    // EMA relationship pattern
    const emaOrder =
      trade.indicators.ema12 > trade.indicators.ema26
        ? "bullish"
        : "bearish";
    patterns.push(`EMA_${emaOrder}_${trade.direction}`);

    // Session-regime combination
    patterns.push(
      `${trade.session}_session_${trade.marketRegime}_regime_${trade.direction}`
    );

    // Volatility pattern
    const volBand =
      preTradeState.volatility < 0.02
        ? "low"
        : preTradeState.volatility < 0.04
          ? "medium"
          : "high";
    patterns.push(`Volatility_${volBand}_${trade.direction}`);

    // Time of day pattern
    patterns.push(`Time_${preTradeState.timeOfDay}_${trade.direction}`);

    return patterns;
  }

  /**
   * Generate concrete improvements based on trade outcome
   */
  private generateImprovements(trade: Trade, outcome: string): string[] {
    const improvements: string[] = [];

    if (outcome === "loss") {
      improvements.push("Review entry criteria - consider adding confirmation indicator");
      improvements.push("Implement tighter stop-loss based on recent volatility");
      improvements.push("Reduce position size in this regime/session combination");

      if (trade.indicators.volume < 100000) {
        improvements.push("Require higher volume confirmation before entry");
      }

      if (trade.maxLoss < -2 * trade.pnl) {
        improvements.push(
          "Trade hit wider stops than final exit - improve stop placement logic"
        );
      }
    } else if (outcome === "win") {
      improvements.push("Analyze what worked - consider increasing position size");
      improvements.push("Document this setup for pattern recognition");
      improvements.push("Consider holding longer for larger wins");

      if (trade.maxWin > 2 * trade.pnl) {
        improvements.push(
          "Trade had larger profit potential - improve exit criteria"
        );
      }
    } else {
      // Breakeven
      improvements.push("Analyze breakeven trades - consider tighter exits");
      improvements.push("Verify exit logic is working as intended");
    }

    return improvements;
  }

  /**
   * Calculate confidence in the learning (0-1)
   */
  private calculateConfidence(trade: Trade, lessonCount: number): number {
    let confidence = 0.5; // Base confidence

    // Higher pnl% = higher confidence in lesson
    if (Math.abs(trade.pnlPercent) > 2) confidence += 0.2;
    if (Math.abs(trade.pnlPercent) > 5) confidence += 0.15;

    // More lessons = higher confidence in analysis
    confidence += Math.min(lessonCount * 0.1, 0.2);

    // Clamp to 0-1
    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Update pattern statistics based on new trade
   */
  async updatePatterns(trade: Trade): Promise<void> {
    console.log(`[LEARNING ENGINE] Updating patterns for trade ${trade.id}`);

    const patterns = this.identifyPatterns(trade, {
      btcPrice: 0,
      solPrice: 0,
      regime: trade.marketRegime,
      session: trade.session,
      volatility: trade.indicators.volatility,
      trend: "",
      timeOfDay: "",
      positionSize: 0,
      leverage: 1,
      volumeRegime: "",
    });

    for (const patternName of patterns) {
      try {
        // Query existing pattern
        const existingPattern = await this.convex.query(anyApi.queries.getPatternByName, {
          patternName,
        });

        let updateData: any;

        if (existingPattern) {
          // Update existing
          const newOccurrences = existingPattern.occurrences + 1;
          const newWins = existingPattern.wins + (trade.won ? 1 : 0);
          const newLosses = existingPattern.losses + (!trade.won ? 1 : 0);
          const newSuccessRate = newWins / newOccurrences;
          const newAvgPnl =
            (existingPattern.avgPnl * existingPattern.occurrences +
              trade.pnl) /
            newOccurrences;

          // Determine classification
          let classification: "golden_setup" | "trap_setup" | "neutral" =
            "neutral";
          if (newSuccessRate > this.GOLDEN_SETUP_THRESHOLD) {
            classification = "golden_setup";
          } else if (newSuccessRate < this.TRAP_SETUP_THRESHOLD) {
            classification = "trap_setup";
          }

          updateData = {
            patternName,
            patternType: "indicator_combination",
            description: `Pattern: ${patternName}`,
            occurrences: newOccurrences,
            wins: newWins,
            losses: newLosses,
            successRate: newSuccessRate,
            avgPnl: newAvgPnl,
            bestRegime: trade.marketRegime,
            bestSession: trade.session,
            conditions: { indicators: trade.indicators },
            active: true,
            classification,
          };
        } else {
          // Create new
          const wins = trade.won ? 1 : 0;
          const losses = trade.won ? 0 : 1;

          let classification: "golden_setup" | "trap_setup" | "neutral" =
            "neutral";
          if (wins === 1) classification = "golden_setup"; // First trade wins
          if (losses === 1) classification = "trap_setup"; // First trade losses

          updateData = {
            patternName,
            patternType: "indicator_combination",
            description: `Pattern: ${patternName}`,
            occurrences: 1,
            wins,
            losses,
            successRate: wins / 1,
            avgPnl: trade.pnl,
            bestRegime: trade.marketRegime,
            bestSession: trade.session,
            conditions: { indicators: trade.indicators },
            active: true,
            classification,
          };
        }

        await this.convex.mutation(anyApi.mutations.updatePattern, updateData);
      } catch (error) {
        console.error(`[LEARNING ENGINE] Error updating pattern ${patternName}:`, error);
      }
    }
  }

  /**
   * Tune parameters based on recent trade performance
   */
  async tuneParameters(): Promise<void> {
    console.log(
      `[LEARNING ENGINE] Tuning parameters (every ${this.ADAPT_FREQUENCY} trades)`
    );

    try {
      // Get recent trades
      const recentTrades = await this.convex.query(anyApi.queries.getRecentTrades, {
        limit: this.ADAPT_FREQUENCY,
      });

      if (recentTrades.length < 20) {
        console.log(
          "[LEARNING ENGINE] Not enough trades for tuning, skipping"
        );
        return;
      }

      const recentWinRate =
        recentTrades.filter((t: any) => t.won).length / recentTrades.length;

      // Get current config
      const currentConfig = await this.convex.query(anyApi.queries.getBotConfig, {});

      console.log(
        `[LEARNING ENGINE] Recent win rate: ${(recentWinRate * 100).toFixed(2)}%`
      );

      // Tuning rule 1: If win rate drops below 50%, reduce position size
      if (recentWinRate < 0.5) {
        const currentPositionSize = currentConfig.position_size || 0.1;
        const newPositionSize = currentPositionSize * 0.9; // 10% reduction

        console.log(
          `[LEARNING ENGINE] Win rate low (${(recentWinRate * 100).toFixed(2)}%), reducing position size from ${currentPositionSize} to ${newPositionSize}`
        );

        await this.convex.mutation(anyApi.mutations.updateBotConfig, {
          configKey: "position_size",
          configValue: newPositionSize.toString(),
          configType: "number",
          updatedBy: "learning-system",
          description: "Reduced due to low win rate",
        });
      }

      // Tuning rule 2: Analyze by regime
      const regimeStats = this.analyzeByRegime(recentTrades);
      for (const [regime, stats] of Object.entries(regimeStats) as any) {
        if (stats.winRate < 0.45) {
          console.log(
            `[LEARNING ENGINE] Poor performance in ${regime} regime (${(stats.winRate * 100).toFixed(2)}%), reducing confidence threshold`
          );

          const confKey = `confidence_threshold_${regime}`;
          const currentConf = currentConfig[confKey] || 0.6;
          const newConf = currentConf - 0.05; // Lower confidence requirement

          await this.convex.mutation(anyApi.mutations.updateBotConfig, {
            configKey: confKey,
            configValue: newConf.toString(),
            configType: "number",
            updatedBy: "learning-system",
            description: `Reduced for ${regime} regime`,
          });
        }
      }

      // Tuning rule 3: Analyze by session
      const sessionStats = this.analyzeBySession(recentTrades);
      for (const [session, stats] of Object.entries(sessionStats) as any) {
        if (stats.count < 5) continue; // Skip if not enough data

        if (stats.winRate < 0.45) {
          console.log(
            `[LEARNING ENGINE] Poor performance in ${session} session (${(stats.winRate * 100).toFixed(2)}%), may reduce activity`
          );

          const enableKey = `enable_trading_${session}`;
          await this.convex.mutation(anyApi.mutations.updateBotConfig, {
            configKey: enableKey,
            configValue: "false",
            configType: "boolean",
            updatedBy: "learning-system",
            description: `Disabled ${session} session due to low win rate`,
          });
        }
      }

      // Tuning rule 4: Adjust indicator thresholds
      const rsiStats = this.analyzeRSIThresholds(recentTrades);
      if (rsiStats.highRsiLossRate > 0.6) {
        console.log(
          `[LEARNING ENGINE] High RSI (>65) has ${(rsiStats.highRsiLossRate * 100).toFixed(2)}% loss rate, tightening threshold`
        );

        await this.convex.mutation(anyApi.mutations.updateBotConfig, {
          configKey: "max_rsi_long",
          configValue: "60",
          configType: "number",
          updatedBy: "learning-system",
          description: "Tightened due to high loss rate",
        });
      }

      console.log("[LEARNING ENGINE] Parameter tuning complete");
    } catch (error) {
      console.error("[LEARNING ENGINE] Error during parameter tuning:", error);
    }
  }

  /**
   * Analyze trade statistics by regime
   */
  private analyzeByRegime(trades: any[]): Record<string, any> {
    const regimeMap: Record<string, any> = {};

    trades.forEach((trade) => {
      if (!regimeMap[trade.marketRegime]) {
        regimeMap[trade.marketRegime] = { wins: 0, count: 0, pnls: [] };
      }
      regimeMap[trade.marketRegime].count++;
      if (trade.won) regimeMap[trade.marketRegime].wins++;
      regimeMap[trade.marketRegime].pnls.push(trade.pnl);
    });

    const stats: Record<string, any> = {};
    for (const [regime, data] of Object.entries(regimeMap)) {
      stats[regime] = {
        count: data.count,
        wins: data.wins,
        winRate: data.wins / data.count,
        avgPnl:
          data.pnls.reduce((a: number, b: number) => a + b, 0) / data.count,
      };
    }

    return stats;
  }

  /**
   * Analyze trade statistics by session
   */
  private analyzeBySession(trades: any[]): Record<string, any> {
    const sessionMap: Record<string, any> = {};

    trades.forEach((trade) => {
      if (!sessionMap[trade.session]) {
        sessionMap[trade.session] = { wins: 0, count: 0, pnls: [] };
      }
      sessionMap[trade.session].count++;
      if (trade.won) sessionMap[trade.session].wins++;
      sessionMap[trade.session].pnls.push(trade.pnl);
    });

    const stats: Record<string, any> = {};
    for (const [session, data] of Object.entries(sessionMap)) {
      stats[session] = {
        count: data.count,
        wins: data.wins,
        winRate: data.wins / data.count,
        avgPnl:
          data.pnls.reduce((a: number, b: number) => a + b, 0) / data.count,
      };
    }

    return stats;
  }

  /**
   * Analyze RSI threshold effectiveness
   */
  private analyzeRSIThresholds(trades: any[]): {
    highRsiLossRate: number;
    lowRsiLossRate: number;
  } {
    const highRsi = trades.filter(
      (t) => t.direction === "long" && t.indicators.rsi > 65
    );
    const lowRsi = trades.filter(
      (t) => t.direction === "short" && t.indicators.rsi < 35
    );

    const highRsiLossRate =
      highRsi.length > 0
        ? highRsi.filter((t) => !t.won).length / highRsi.length
        : 0;
    const lowRsiLossRate =
      lowRsi.length > 0
        ? lowRsi.filter((t) => !t.won).length / lowRsi.length
        : 0;

    return { highRsiLossRate, lowRsiLossRate };
  }

  /**
   * Get golden setups (patterns with >70% win rate)
   */
  async getGoldenSetups(): Promise<PatternRecord[]> {
    try {
      const patterns = await this.convex.query(anyApi.queries.getGoldenSetups, {});
      return patterns;
    } catch (error) {
      console.error("[LEARNING ENGINE] Error getting golden setups:", error);
      return [];
    }
  }

  /**
   * Get trap setups (patterns with <40% win rate)
   */
  async getTrapSetups(): Promise<PatternRecord[]> {
    try {
      const patterns = await this.convex.query(anyApi.queries.getTrapSetups, {});
      return patterns;
    } catch (error) {
      console.error("[LEARNING ENGINE] Error getting trap setups:", error);
      return [];
    }
  }

  /**
   * Perform deep analysis using Claude API
   * Only called if API key is available
   */
  private async performClaudeAnalysis(recentLearning: LearningRecord): Promise<void> {
    if (!this.anthropic) {
      console.log(
        "[LEARNING ENGINE] Claude API key not available, skipping analysis"
      );
      return;
    }

    console.log(
      "[LEARNING ENGINE] Performing Claude analysis (every 100 trades)..."
    );

    try {
      // Get recent trades and learning records for context
      const recentTrades = await this.convex.query(anyApi.queries.getRecentTrades, {
        limit: 20,
      });

      const winningPatterns = await this.convex.query(anyApi.queries.getWinningPatterns, {});
      const losingPatterns = await this.convex.query(anyApi.queries.getLosingPatterns, {});

      // Build summary for Claude
      const summary = {
        totalTrades: recentTrades.length,
        wins: recentTrades.filter((t: any) => t.won).length,
        losses: recentTrades.filter((t: any) => !t.won).length,
        avgPnl: recentTrades.reduce((sum: number, t: any) => sum + t.pnl, 0) / recentTrades.length,
        topWinningPattern: winningPatterns[0],
        topLosingPattern: losingPatterns[0],
        recentLearning,
      };

      const prompt = `You are analyzing a trading bot's recent performance. Here's the data:

${JSON.stringify(summary, null, 2)}

Please provide:
1. Key non-obvious patterns you notice in the trading data
2. Specific recommendations to improve win rate
3. Risk management improvements
4. Any concerning trends that need attention
5. Highest-value strategic changes the bot should consider

Be concise and actionable. Focus on patterns not visible from simple statistics.`;

      const message = await this.anthropic.messages.create({
        model: "claude-opus-4-6",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      });

      // Extract text response
      const insight =
        message.content[0].type === "text" ? message.content[0].text : "";

      console.log("[LEARNING ENGINE] Claude analysis:\n", insight);

      // Parse recommendations from response
      const recommendations = this.parseRecommendations(insight);

      // Save Claude insight to a new learning record
      // (In a real system, you might create a separate table for AI insights)
      console.log(
        "[LEARNING ENGINE] Claude recommendations:",
        recommendations
      );

      // You could apply top recommendations automatically here
      // For now, just log them
    } catch (error) {
      console.error("[LEARNING ENGINE] Error performing Claude analysis:", error);
    }
  }

  /**
   * Parse recommendations from Claude's response
   */
  private parseRecommendations(response: string): string[] {
    // Simple parsing: split by numbered items
    const lines = response.split("\n");
    const recommendations: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (/^\d+\./.test(trimmed)) {
        recommendations.push(trimmed.replace(/^\d+\.\s*/, ""));
      }
    }

    return recommendations;
  }

  /**
   * Ask Claude a specific question about the trading history
   * For manual queries - this can be called with custom questions
   */
  async askClaude(tradeHistory: Trade[], question: string): Promise<string> {
    if (!this.anthropic) {
      return "Claude API key not available. Set ANTHROPIC_API_KEY environment variable.";
    }

    console.log(`[LEARNING ENGINE] Asking Claude: ${question}`);

    try {
      // Calculate summary statistics
      const wins = tradeHistory.filter((t) => t.won).length;
      const winRate = wins / tradeHistory.length;
      const totalPnl = tradeHistory.reduce((sum, t) => sum + t.pnl, 0);
      const avgPnl = totalPnl / tradeHistory.length;

      const summary = {
        totalTrades: tradeHistory.length,
        wins,
        winRate,
        totalPnl,
        avgPnl,
        trades: tradeHistory.slice(0, 10), // Include last 10 trades
      };

      const prompt = `Trade data: ${JSON.stringify(summary, null, 2)}

Question: ${question}

Provide a detailed, actionable response based on the trading data.`;

      const message = await this.anthropic.messages.create({
        model: "claude-opus-4-6",
        max_tokens: 2048,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      });

      const response =
        message.content[0].type === "text" ? message.content[0].text : "";

      console.log("[LEARNING ENGINE] Claude response:\n", response);

      return response;
    } catch (error) {
      console.error("[LEARNING ENGINE] Error asking Claude:", error);
      return `Error: ${error instanceof Error ? error.message : "Unknown error"}`;
    }
  }

  /**
   * Generate comprehensive weekly performance report
   */
  async generateWeeklyReport(): Promise<any> {
    console.log("[LEARNING ENGINE] Generating weekly report...");

    try {
      // Get all strategy performance
      const strategies = await this.convex.query(
        anyApi.queries.getStrategyPerformance, {}
      );

      // Get golden and trap setups
      const golden = await this.getGoldenSetups();
      const traps = await this.getTrapSetups();

      // Get recent trades
      const recentTrades = await this.convex.query(anyApi.queries.getRecentTrades, {
        limit: 100,
      });

      // Calculate statistics
      const wins = recentTrades.filter((t: any) => t.won).length;
      const losses = recentTrades.length - wins;
      const totalPnl = recentTrades.reduce((sum: number, t: any) => sum + t.pnl, 0);
      const avgPnl = totalPnl / recentTrades.length;

      // Group by asset
      const btcTrades = recentTrades.filter((t: any) => t.asset === "BTC");
      const solTrades = recentTrades.filter((t: any) => t.asset === "SOL");

      const report = {
        timestamp: new Date().toISOString(),
        period: "Last 100 trades",
        overallStats: {
          totalTrades: recentTrades.length,
          wins,
          losses,
          winRate: wins / recentTrades.length,
          totalPnl,
          avgPnl,
          maxWin: Math.max(...recentTrades.map((t: any) => t.pnl)),
          maxLoss: Math.min(...recentTrades.map((t: any) => t.pnl)),
        },
        assetPerformance: {
          btc: {
            trades: btcTrades.length,
            wins: btcTrades.filter((t: any) => t.won).length,
            winRate: btcTrades.filter((t: any) => t.won).length / btcTrades.length,
            pnl: btcTrades.reduce((sum: number, t: any) => sum + t.pnl, 0),
          },
          sol: {
            trades: solTrades.length,
            wins: solTrades.filter((t: any) => t.won).length,
            winRate: solTrades.filter((t: any) => t.won).length / solTrades.length,
            pnl: solTrades.reduce((sum: number, t: any) => sum + t.pnl, 0),
          },
        },
        strategyPerformance: strategies,
        topPatterns: {
          golden: golden.slice(0, 5),
          traps: traps.slice(0, 5),
        },
        recommendations: this.generateRecommendations(
          recentTrades,
          golden,
          traps
        ),
      };

      console.log("[LEARNING ENGINE] Weekly report generated");

      return report;
    } catch (error) {
      console.error("[LEARNING ENGINE] Error generating weekly report:", error);
      return null;
    }
  }

  /**
   * Generate recommendations based on current performance
   */
  private generateRecommendations(
    trades: any[],
    golden: PatternRecord[],
    traps: PatternRecord[]
  ): string[] {
    const recommendations: string[] = [];

    const winRate = trades.filter((t) => t.won).length / trades.length;

    if (winRate < 0.45) {
      recommendations.push(
        "Win rate is below 45%. Consider reducing leverage or position size."
      );
    } else if (winRate > 0.65) {
      recommendations.push(
        "Win rate is strong at " +
          (winRate * 100).toFixed(1) +
          "%. Consider increasing position size."
      );
    }

    if (golden.length > 0) {
      recommendations.push(
        `Focus on golden setups: ${golden.slice(0, 3).map((p) => p.patternName).join(", ")}`
      );
    }

    if (traps.length > 0) {
      recommendations.push(
        `Avoid trap setups: ${traps.slice(0, 3).map((p) => p.patternName).join(", ")}`
      );
    }

    // Check for regime-specific issues
    const regimes: Record<string, any> = {};
    trades.forEach((trade) => {
      if (!regimes[trade.marketRegime]) {
        regimes[trade.marketRegime] = { wins: 0, count: 0 };
      }
      regimes[trade.marketRegime].count++;
      if (trade.won) regimes[trade.marketRegime].wins++;
    });

    for (const [regime, stats] of Object.entries(regimes)) {
      const regimeWinRate = stats.wins / stats.count;
      if (regimeWinRate < 0.4) {
        recommendations.push(
          `Strategy underperforms in ${regime} regime (${(regimeWinRate * 100).toFixed(1)}% win rate)`
        );
      }
    }

    return recommendations;
  }
}

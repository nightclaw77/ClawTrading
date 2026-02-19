/**
 * Ensemble Strategy Engine for Multi-Strategy Trading
 * Combines 5 independent strategies with adaptive weighting
 * Handles conflict resolution and market regime awareness
 * Production-ready for real money trading
 */

import {
  Candle,
  Signal,
  SignalDirection,
  IndicatorValues,
  RegimeAnalysis,
  MarketRegime,
  TradingSession,
  OrderFlowData,
  Trade,
  StrategyWeight,
  SessionInfo,
} from '../types/index';

import {
  Strategy,
  EmaStrategy,
  RsiStrategy,
  BreakoutStrategy,
  VwapReversalStrategy,
  OrderFlowStrategy,
} from './index';

/**
 * ===========================
 * ENSEMBLE CONFIGURATION
 * ===========================
 */

interface EnsembleConfig {
  minConfidenceThreshold: number; // 0-100, default 65%
  requireMajorityVote: boolean; // 3/5 strategies must agree on direction
  regimeWeightMultipliers: {
    [key in MarketRegime]: {
      [strategyName: string]: number;
    };
  };
}

const DEFAULT_CONFIG: EnsembleConfig = {
  minConfidenceThreshold: 65,
  requireMajorityVote: true,
  regimeWeightMultipliers: {
    [MarketRegime.TRENDING_UP]: {
      EMA_CROSSOVER: 1.5,
      RSI_REVERSAL: 0.8,
      BREAKOUT: 1.5,
      VWAP_REVERSION: 0.7,
      ORDER_FLOW: 1.0,
    },
    [MarketRegime.TRENDING_DOWN]: {
      EMA_CROSSOVER: 1.5,
      RSI_REVERSAL: 0.8,
      BREAKOUT: 1.5,
      VWAP_REVERSION: 0.7,
      ORDER_FLOW: 1.0,
    },
    [MarketRegime.RANGING]: {
      EMA_CROSSOVER: 0.8,
      RSI_REVERSAL: 1.5,
      BREAKOUT: 0.9,
      VWAP_REVERSION: 1.5,
      ORDER_FLOW: 1.0,
    },
    [MarketRegime.VOLATILE]: {
      EMA_CROSSOVER: 0.7,
      RSI_REVERSAL: 0.9,
      BREAKOUT: 1.2,
      VWAP_REVERSION: 0.6,
      ORDER_FLOW: 2.0,
    },
    [MarketRegime.CHOPPY]: {
      EMA_CROSSOVER: 0.6,
      RSI_REVERSAL: 1.3,
      BREAKOUT: 0.8,
      VWAP_REVERSION: 1.4,
      ORDER_FLOW: 1.5,
    },
  },
};

/**
 * ===========================
 * ENSEMBLE ENGINE
 * ===========================
 */

export class EnsembleEngine {
  private strategies: Strategy[];
  private config: EnsembleConfig;
  private strategyWeights: Map<string, number>;
  private performanceHistory: Map<string, Trade[]>;
  private lastEnsembleSignal?: Signal;

  constructor(config: Partial<EnsembleConfig> = {}) {
    // Initialize strategies
    this.strategies = [
      new EmaStrategy(),
      new RsiStrategy(),
      new BreakoutStrategy(),
      new VwapReversalStrategy(),
      new OrderFlowStrategy(),
    ];

    // Merge config
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Initialize weights (equal initially)
    this.strategyWeights = new Map(
      this.strategies.map((s) => [s.name, s.weight])
    );

    // Initialize performance tracking
    this.performanceHistory = new Map(
      this.strategies.map((s) => [s.name, []])
    );
  }

  /**
   * Run all strategies and produce ensemble signal
   * This is the main entry point for the trading engine
   */
  public analyze(
    candles: Candle[],
    indicators: IndicatorValues,
    regime: RegimeAnalysis,
    session: SessionInfo,
    orderFlow: OrderFlowData
  ): Signal {
    // Validate inputs
    if (
      !candles ||
      candles.length === 0 ||
      !indicators ||
      !regime ||
      !session ||
      !orderFlow
    ) {
      return this.createNeutralSignal(
        'Invalid inputs provided to ensemble',
        indicators
      );
    }

    // Get signals from all 5 strategies
    const strategySignals = this.runAllStrategies(
      candles,
      indicators,
      regime,
      session,
      orderFlow
    );

    // Apply regime-based weight multipliers
    const adjustedWeights = this.applyRegimeWeights(
      strategySignals,
      regime.currentRegime
    );

    // Check for majority vote if required
    if (this.config.requireMajorityVote) {
      const voteCheck = this.checkMajorityVote(strategySignals);
      const voteResult = voteCheck[0];
      const hasConsensus = voteCheck[1];
      if (!hasConsensus) {
        // No majority agreement - reduce confidence significantly
        if (!voteResult) {
          return this.createNeutralSignal(
            'No majority vote from strategies',
            indicators,
            SignalDirection.NEUTRAL,
            20 // Low confidence
          );
        }
        return this.createNeutralSignal(
          'No majority vote from strategies',
          indicators,
          voteResult.direction,
          20 // Low confidence
        );
      }
    }

    // Calculate ensemble signal
    const ensembleSignal = this.calculateEnsembleSignal(
      strategySignals,
      adjustedWeights,
      indicators,
      regime
    );

    // Validate ensemble signal
    if (ensembleSignal.confidence < this.config.minConfidenceThreshold) {
      return this.createNeutralSignal(
        `Ensemble confidence (${ensembleSignal.confidence.toFixed(1)}) below threshold (${this.config.minConfidenceThreshold})`,
        indicators,
        ensembleSignal.direction,
        ensembleSignal.confidence
      );
    }

    // Store for reference
    this.lastEnsembleSignal = ensembleSignal;

    return ensembleSignal;
  }

  /**
   * Update strategy weights based on trade performance
   * Called after each trade completion
   */
  public updateStrategyWeights(tradeResult: Trade): void {
    // Find which strategy was used
    const strategy = this.strategies.find((s) => s.name === tradeResult.strategyUsed);
    if (!strategy) return;

    // Track trade result
    const history = this.performanceHistory.get(strategy.name) || [];
    history.push(tradeResult);

    // Keep last 50 trades per strategy
    if (history.length > 50) history.shift();

    this.performanceHistory.set(strategy.name, history);

    // Update strategy's internal weight
    strategy.updateWeight(tradeResult);

    // Recalculate weights
    this.recalculateStrategyWeights();
  }

  /**
   * Get current strategy weights and performance metrics
   */
  public getStrategyMetrics(): StrategyWeight[] {
    return this.strategies.map((strategy) => {
      const trades = this.performanceHistory.get(strategy.name) || [];
      const wins = trades.filter((t) => t.winTrade).length;
      const losses = trades.length - wins;

      const winRate = trades.length > 0 ? wins / trades.length : 0;
      const avgWin =
        wins > 0
          ? trades
              .filter((t) => t.winTrade)
              .reduce((sum, t) => sum + t.pnlPercent, 0) / wins
          : 0;
      const avgLoss =
        losses > 0
          ? trades
              .filter((t) => !t.winTrade)
              .reduce((sum, t) => sum + t.pnlPercent, 0) / losses
          : 0;

      const profitFactor =
        avgLoss !== 0
          ? Math.abs(avgWin * wins) / Math.abs(avgLoss * losses)
          : 0;

      const grossProfit = trades
        .filter((t) => t.winTrade)
        .reduce((sum, t) => sum + t.pnl, 0);
      const grossLoss = Math.abs(
        trades
          .filter((t) => !t.winTrade)
          .reduce((sum, t) => sum + t.pnl, 0)
      );

      return {
        strategyName: strategy.name,
        currentWeight: this.strategyWeights.get(strategy.name) || strategy.weight,
        recentWinRate: winRate,
        tradesToday: trades.length,
        winsToday: wins,
        pnlToday: grossProfit - grossLoss,
        lastTradedTime: trades.length > 0 ? trades[trades.length - 1].exitTime : 0,
        performance: {
          winRate,
          avgWin,
          avgLoss,
          profitFactor,
          sharpeRatio: this.calculateSharpeRatio(trades),
        },
      };
    });
  }

  /**
   * Get last ensemble signal
   */
  public getLastSignal(): Signal | undefined {
    return this.lastEnsembleSignal;
  }

  /**
   * Reset ensemble (useful for day start)
   */
  public reset(): void {
    this.performanceHistory.clear();
    this.strategies.forEach((s) => {
      this.strategyWeights.set(s.name, s.weight);
      this.performanceHistory.set(s.name, []);
    });
    this.lastEnsembleSignal = undefined;
  }

  // ===========================
  // PRIVATE METHODS
  // ===========================

  /**
   * Run all 5 strategies and collect their signals
   */
  private runAllStrategies(
    candles: Candle[],
    indicators: IndicatorValues,
    regime: RegimeAnalysis,
    session: SessionInfo,
    orderFlow: OrderFlowData
  ): Map<string, Signal> {
    const signals = new Map<string, Signal>();

    for (const strategy of this.strategies) {
      try {
        const signal = strategy.analyze(
          candles,
          indicators,
          regime,
          session,
          orderFlow
        );
        signals.set(strategy.name, signal);
      } catch (error) {
        console.error(`Error in ${strategy.name}:`, error);
        // Create neutral signal on error
        signals.set(strategy.name, {
          direction: SignalDirection.NEUTRAL,
          confidence: 0,
          reasons: [`Error in strategy: ${error}`],
          timestamp: Date.now(),
          indicators: this.createMinimalIndicatorSnapshot(indicators),
          strength: 'WEAK',
        });
      }
    }

    return signals;
  }

  /**
   * Apply regime-based weight multipliers
   */
  private applyRegimeWeights(
    signals: Map<string, Signal>,
    regime: MarketRegime
  ): Map<string, number> {
    const regimeMultipliers = this.config.regimeWeightMultipliers[regime];
    const adjustedWeights = new Map<string, number>();

    for (const strategy of this.strategies) {
      const baseWeight = this.strategyWeights.get(strategy.name) || 1.0;
      const multiplier = regimeMultipliers[strategy.name] || 1.0;
      const adjustedWeight = baseWeight * multiplier;

      adjustedWeights.set(strategy.name, adjustedWeight);
    }

    return adjustedWeights;
  }

  /**
   * Check if strategies have majority vote (3/5)
   * Returns: [direction that won, hasConsensus]
   */
  private checkMajorityVote(
    signals: Map<string, Signal>
  ): [Signal | null, boolean] {
    const longVotes = Array.from(signals.values()).filter(
      (s) => s.direction === SignalDirection.LONG
    ).length;
    const shortVotes = Array.from(signals.values()).filter(
      (s) => s.direction === SignalDirection.SHORT
    ).length;

    const majorityThreshold = Math.floor(this.strategies.length / 2) + 1;

    if (longVotes >= majorityThreshold) {
      // Find a LONG signal to return
      const longSignal = Array.from(signals.values()).find(
        (s) => s.direction === SignalDirection.LONG
      );
      return [longSignal || null, true];
    }

    if (shortVotes >= majorityThreshold) {
      // Find a SHORT signal to return
      const shortSignal = Array.from(signals.values()).find(
        (s) => s.direction === SignalDirection.SHORT
      );
      return [shortSignal || null, true];
    }

    // No majority
    return [null, false];
  }

  /**
   * Calculate ensemble signal from weighted strategy signals
   */
  private calculateEnsembleSignal(
    signals: Map<string, Signal>,
    weights: Map<string, number>,
    indicators: IndicatorValues,
    regime: RegimeAnalysis
  ): Signal {
    // Calculate weighted direction
    let weightedLongScore = 0;
    let weightedShortScore = 0;
    let totalWeight = 0;
    const reasons: string[] = [];
    const strategyReasons: { [key: string]: string[] } = {};

    for (const strategy of this.strategies) {
      const signal = signals.get(strategy.name);
      const weight = weights.get(strategy.name) || 1.0;

      if (!signal) continue;

      totalWeight += weight;

      // Accumulate weighted confidence scores
      if (signal.direction === SignalDirection.LONG) {
        weightedLongScore += signal.confidence * weight;
        strategyReasons[strategy.name] = signal.reasons;
      } else if (signal.direction === SignalDirection.SHORT) {
        weightedShortScore += signal.confidence * weight;
        strategyReasons[strategy.name] = signal.reasons;
      }
    }

    // Normalize scores
    const normalizedLongScore =
      totalWeight > 0 ? weightedLongScore / totalWeight : 0;
    const normalizedShortScore =
      totalWeight > 0 ? weightedShortScore / totalWeight : 0;

    // Determine direction
    let direction = SignalDirection.NEUTRAL;
    let confidence = 0;

    if (normalizedLongScore > normalizedShortScore && normalizedLongScore > 0) {
      direction = SignalDirection.LONG;
      confidence = normalizedLongScore;
    } else if (normalizedShortScore > normalizedLongScore && normalizedShortScore > 0) {
      direction = SignalDirection.SHORT;
      confidence = normalizedShortScore;
    }

    // ===== CONFLICT RESOLUTION =====
    // If strategies disagree, reduce confidence
    const longCount = Array.from(signals.values()).filter(
      (s) => s.direction === SignalDirection.LONG
    ).length;
    const shortCount = Array.from(signals.values()).filter(
      (s) => s.direction === SignalDirection.SHORT
    ).length;
    const neutralCount = Array.from(signals.values()).filter(
      (s) => s.direction === SignalDirection.NEUTRAL
    ).length;

    const hasDisagreement = longCount > 0 && shortCount > 0;
    if (hasDisagreement) {
      confidence = confidence * 0.7; // 30% confidence penalty for conflict
      reasons.push('Strategies in conflict - confidence reduced');
    }

    // ===== BUILD REASONING =====
    reasons.push(`Ensemble: ${longCount} LONG, ${shortCount} SHORT, ${neutralCount} NEUTRAL`);

    // Add top contributing strategies
    const strategyContributions = this.strategies
      .map((s) => ({
        name: s.name,
        signal: signals.get(s.name),
        weight: weights.get(s.name) || 1.0,
      }))
      .filter((c) => c.signal && c.signal.direction !== SignalDirection.NEUTRAL)
      .sort((a, b) => {
        const aScore = (a.signal?.confidence || 0) * a.weight;
        const bScore = (b.signal?.confidence || 0) * b.weight;
        return bScore - aScore;
      });

    if (strategyContributions.length > 0) {
      const top = strategyContributions[0];
      reasons.push(
        `Top contributor: ${top.name} (weight: ${top.weight.toFixed(2)}, confidence: ${top.signal?.confidence.toFixed(1)}%)`
      );
    }

    // Add regime information
    reasons.push(`Market regime: ${regime.currentRegime} (confidence: ${regime.confidence.toFixed(1)}%)`);

    // Determine strength
    const strength =
      confidence >= 70 ? 'STRONG' : confidence >= 50 ? 'MODERATE' : 'WEAK';

    return {
      direction,
      confidence: Math.round(confidence),
      reasons,
      timestamp: Date.now(),
      indicators: this.createMinimalIndicatorSnapshot(indicators),
      strength,
      entryPrice: candles[candles.length - 1]?.close || 0,
      riskRewardRatio: 1.5,
    };
  }

  /**
   * Recalculate adaptive strategy weights based on performance
   */
  private recalculateStrategyWeights(): void {
    const metrics = this.getStrategyMetrics();
    let totalProfit = 0;

    // Calculate total profit across all strategies
    for (const metric of metrics) {
      totalProfit += Math.max(metric.pnlToday, 0);
    }

    // Adjust weights: high performers get higher weight
    for (const metric of metrics) {
      let newWeight = 1.0; // Base weight

      if (metric.recentWinRate > 0.6) {
        newWeight += 0.3; // High win rate boost
      } else if (metric.recentWinRate < 0.4) {
        newWeight -= 0.2; // Low win rate penalty
      }

      if (metric.performance.profitFactor > 2.0) {
        newWeight += 0.2; // Excellent profit factor
      }

      if (metric.performance.sharpeRatio > 1.0) {
        newWeight += 0.1; // Good risk-adjusted returns
      }

      // Normalize to range [0.5, 1.5]
      newWeight = Math.max(0.5, Math.min(1.5, newWeight));

      this.strategyWeights.set(metric.strategyName, newWeight);
    }
  }

  /**
   * Create neutral signal
   */
  private createNeutralSignal(
    reason: string,
    indicators: IndicatorValues,
    direction: SignalDirection = SignalDirection.NEUTRAL,
    confidence: number = 0
  ): Signal {
    return {
      direction,
      confidence: Math.max(0, Math.min(100, confidence)),
      reasons: [reason],
      timestamp: Date.now(),
      indicators: this.createMinimalIndicatorSnapshot(indicators),
      strength: 'WEAK',
    };
  }

  /**
   * Create minimal indicator snapshot for signal
   */
  private createMinimalIndicatorSnapshot(indicators: IndicatorValues): any {
    return {
      rsi: indicators.rsi,
      macdLine: indicators.macd.line,
      macdSignal: indicators.macd.signal,
      macdHistogram: indicators.macd.histogram,
      emaValues: indicators.ema.values,
      bollingerBands: indicators.bollingerBands,
      atr: indicators.atr.value,
      atrPercent: indicators.atr.percent,
      adx: indicators.adx.value,
      diPlus: indicators.adx.diPlus,
      diMinus: indicators.adx.diMinus,
      vwap: indicators.vwap,
      volumeDelta: indicators.volumeDelta.value,
      stochastic: indicators.stochastic,
      obv: indicators.obv.value,
      obvMA: indicators.obv.sma,
      timestamp: indicators.timestamp,
    };
  }

  /**
   * Calculate Sharpe Ratio for a set of trades
   * Sharpe = (Avg Return - Risk Free Rate) / Std Dev
   * Assuming risk-free rate of 0 for simplicity
   */
  private calculateSharpeRatio(trades: Trade[]): number {
    if (trades.length < 2) return 0;

    const returns = trades.map((t) => t.pnlPercent);
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;

    const variance =
      returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) /
      returns.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev === 0) return 0;

    // Annualize for 5m candles (288 per day, 250 trading days = ~72,000 per year)
    return (avgReturn / stdDev) * Math.sqrt(72000);
  }
}

/**
 * Export singleton instance
 */
export const ensembleEngine = new EnsembleEngine();

/**
 * Export factory function for custom config
 */
export function createEnsembleEngine(
  config?: Partial<EnsembleConfig>
): EnsembleEngine {
  return new EnsembleEngine(config);
}

/**
 * Export default config
 */
export type { EnsembleConfig };
export { DEFAULT_CONFIG };

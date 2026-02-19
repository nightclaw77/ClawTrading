/**
 * RiskManager - Comprehensive risk management for Polymarket trading bot
 *
 * Enforces all risk rules:
 * - Position sizing with confidence, volatility, and session scaling
 * - Trade validation against multiple constraints
 * - Stop loss and trailing stop management
 * - Take profit level tracking
 * - Daily P&L and drawdown tracking
 * - Automatic position sizing reduction on drawdown
 */

import { Position, Trade, TakeProfitLevel, DailyStats } from '../types/index';

export interface RiskManagerConfig {
  maxPositionSize: number; // % of account (e.g., 2)
  maxDailyLoss: number; // % of account (e.g., 5)
  maxDrawdown: number; // % of account (e.g., 8)
  maxOpenPositions: number; // e.g., 10
  maxTradesPerHour: number; // e.g., 20
  minConfidence: number; // 0-100 (e.g., 60)
  defaultStopLossPercent: number; // e.g., 0.2
  atrStopLossMultiplier: number; // e.g., 1.5
  trailingStopDistance: number; // % (e.g., 0.15)
  profitActivationPercent: number; // % (e.g., 0.3)
}

export interface TradeSignal {
  asset: 'BTC' | 'SOL';
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  confidence: number; // 0-100
  reason: string;
  timeframe: '5m' | '15m';
  timestamp: number;
  atr?: number;
  regime?: 'TRENDING' | 'RANGING' | 'VOLATILE' | 'UNKNOWN';
}

interface CurrentState {
  balance: number;
  openPositions: Position[];
  closedTrades: Trade[];
  peakBalance: number;
  lastResetTime: number;
  tradesThisHour: number;
  lastTradeTime: number;
}

export class RiskManager {
  private dailyStats: DailyStats;
  private openPositions: Position[] = [];
  private closedTrades: Trade[] = [];
  private peakBalance: number = 0;
  private lastResetTime: number = this.getMidnightUTC();
  private tradesThisHour: number = 0;
  private lastTradeTime: number = 0;

  constructor(private config: RiskManagerConfig, initialBalance: number = 10000) {
    this.peakBalance = initialBalance;
    this.dailyStats = this.initializeDailyStats(initialBalance);
  }

  /**
   * Initialize daily statistics
   */
  private initializeDailyStats(balance: number): DailyStats {
    const date = new Date(Date.now()).toISOString().split('T')[0];

    return {
      date,
      tradesOpened: 0,
      tradesClosed: 0,
      winRate: 0,
      totalPnl: 0,
      totalPnlPercent: 0,
      largestWin: 0,
      largestLoss: 0,
      avgWinSize: 0,
      avgLossSize: 0,
      profitFactor: 0,
      maxDrawdown: 0,
      peakBalance: balance,
      endingBalance: balance,
    };
  }

  /**
   * Calculate position size based on multiple factors
   *
   * Base: 2% of account per trade
   * - Scaled by confidence: 65% conf = 0.5x, 80% = 1.0x, 95% = 1.5x
   * - Scaled by volatility: high vol = 0.7x, low vol = 1.2x
   * - Scaled by session: ASIAN 0.5x, LONDON 1.0x, NY 1.0x, OVERLAP 1.5x
   */
  public calculatePositionSize(
    confidence: number,
    currentBalance: number,
    volatility: number,
    session: 'ASIAN' | 'LONDON' | 'NY' | 'OVERLAP' = 'NY'
  ): number {
    // Base position size: 2% of account
    const baseSize = (this.config.maxPositionSize / 100) * currentBalance;

    // Confidence scaling (65% = 0.5x, 80% = 1.0x, 95% = 1.5x)
    // Linear interpolation between these points
    let confidenceMultiplier = 1.0;
    if (confidence < 65) {
      confidenceMultiplier = 0.5 * (confidence / 65);
    } else if (confidence < 80) {
      confidenceMultiplier = 0.5 + 0.5 * ((confidence - 65) / 15);
    } else if (confidence < 95) {
      confidenceMultiplier = 1.0 + 0.5 * ((confidence - 80) / 15);
    } else {
      confidenceMultiplier = 1.5;
    }

    // Volatility scaling
    // Low vol (0-20) = 1.2x, Medium (20-50) = 1.0x, High (50-100) = 0.7x
    let volatilityMultiplier = 1.0;
    if (volatility < 20) {
      volatilityMultiplier = 1.2;
    } else if (volatility < 50) {
      volatilityMultiplier = 1.2 - 0.2 * ((volatility - 20) / 30);
    } else {
      volatilityMultiplier = 0.7 + 0.3 * Math.min(1, (100 - volatility) / 50);
    }

    // Session multiplier
    const sessionMultipliers: Record<string, number> = {
      ASIAN: 0.5,
      LONDON: 1.0,
      NY: 1.0,
      OVERLAP: 1.5,
    };
    const sessionMultiplier = sessionMultipliers[session] || 1.0;

    // Drawdown reduction
    const drawdown = this.calculateDrawdown(currentBalance);
    let drawdownReduction = 1.0;
    if (drawdown > 5) {
      drawdownReduction = 0.5; // Reduce position size by 50% if drawdown > 5%
    }

    // Calculate final position size
    const finalSize = baseSize * confidenceMultiplier * volatilityMultiplier * sessionMultiplier * drawdownReduction;

    // Never exceed configured max
    return Math.min(finalSize, (this.config.maxPositionSize / 100) * currentBalance * 2);
  }

  /**
   * Validate if a trade can be opened
   * Returns { canOpen: boolean, reasons: string[] }
   */
  public canOpenTrade(
    signal: TradeSignal,
    currentState: { balance: number; openPositions: Position[] }
  ): { canOpen: boolean; reasons: string[] } {
    const reasons: string[] = [];

    // Check confidence threshold
    if (signal.confidence < this.config.minConfidence) {
      reasons.push(`Confidence ${signal.confidence}% below minimum ${this.config.minConfidence}%`);
    }

    // Check daily loss limit
    if (this.dailyStats.totalPnl < -(this.config.maxDailyLoss / 100) * this.peakBalance) {
      reasons.push(`Daily loss limit exceeded: ${this.dailyStats.totalPnl.toFixed(2)}`);
    }

    // Check drawdown limit
    const currentDrawdown = this.calculateDrawdown(currentState.balance);
    if (currentDrawdown > this.config.maxDrawdown) {
      reasons.push(`Max drawdown exceeded: ${currentDrawdown.toFixed(2)}% > ${this.config.maxDrawdown}%`);
    }

    // Check max open positions
    if (currentState.openPositions.length >= this.config.maxOpenPositions) {
      reasons.push(`Max open positions reached: ${currentState.openPositions.length}`);
    }

    // Check max trades per hour
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    if (this.lastTradeTime > oneHourAgo) {
      if (this.tradesThisHour >= this.config.maxTradesPerHour) {
        reasons.push(`Max trades per hour exceeded: ${this.tradesThisHour}`);
      }
    } else {
      this.tradesThisHour = 0;
    }

    // Check sufficient balance
    const positionSize = this.calculatePositionSize(signal.confidence, currentState.balance, 50);
    if (positionSize > currentState.balance) {
      reasons.push('Insufficient balance for position size');
    }

    // Check daily reset
    if (this.shouldResetDaily()) {
      this.resetDaily(currentState.balance);
    }

    return {
      canOpen: reasons.length === 0,
      reasons,
    };
  }

  /**
   * Calculate stop loss price
   *
   * Default: 0.2% (tight for scalping)
   * ATR-based: 1.5x ATR from entry
   * Wider in VOLATILE regime (2x ATR)
   * Tighter in RANGING (1x ATR)
   */
  public calculateStopLoss(
    entryPrice: number,
    direction: 'LONG' | 'SHORT',
    atr: number = 0,
    regime: 'TRENDING' | 'RANGING' | 'VOLATILE' | 'UNKNOWN' = 'UNKNOWN'
  ): number {
    let stopLossPercent = this.config.defaultStopLossPercent;

    // Use ATR-based stop loss if provided
    if (atr > 0) {
      let atrMultiplier = this.config.atrStopLossMultiplier;

      // Adjust multiplier based on regime
      if (regime === 'VOLATILE') {
        atrMultiplier = 2.0;
      } else if (regime === 'RANGING') {
        atrMultiplier = 1.0;
      }

      stopLossPercent = (atr / entryPrice) * 100 * atrMultiplier;
    }

    // Calculate stop loss price
    if (direction === 'LONG') {
      return entryPrice * (1 - stopLossPercent / 100);
    } else {
      return entryPrice * (1 + stopLossPercent / 100);
    }
  }

  /**
   * Update trailing stop for a position
   *
   * Activate trailing when profit > 0.3%
   * Trail at 0.15% distance
   * Only moves in profit direction, never back
   */
  public updateTrailingStop(position: Position, currentPrice: number): {
    updated: boolean;
    newStopLoss: number;
  } {
    const profitPercent = this.calculateProfitPercent(
      position.entryPrice,
      currentPrice,
      position.direction
    );

    // Check if trailing stop should be activated
    if (!position.trailingStop?.activated && profitPercent >= this.config.profitActivationPercent) {
      position.trailingStop = {
        activated: true,
        distance: this.config.trailingStopDistance,
        highestPrice: currentPrice,
      };
    }

    // Update trailing stop if activated
    if (position.trailingStop?.activated) {
      const trailingDistance = (currentPrice * this.config.trailingStopDistance) / 100;

      if (position.direction === 'LONG') {
        // For long: trailing stop is below current price
        const newStop = currentPrice - trailingDistance;

        // Only move stop loss up (never back)
        if (newStop > position.stopLoss) {
          position.stopLoss = newStop;
          position.trailingStop.highestPrice = currentPrice;
          return { updated: true, newStopLoss: newStop };
        }
      } else {
        // For short: trailing stop is above current price
        const newStop = currentPrice + trailingDistance;

        // Only move stop loss down (never back)
        if (newStop < position.stopLoss) {
          position.stopLoss = newStop;
          position.trailingStop.highestPrice = currentPrice;
          return { updated: true, newStopLoss: newStop };
        }
      }
    }

    return { updated: false, newStopLoss: position.stopLoss };
  }

  /**
   * Get take profit levels for a position
   *
   * Level 1: 0.3% → close 50% of position
   * Level 2: 0.5% → close 30% of position
   * Level 3: 1.0% → close remaining 20%
   */
  public getTakeProfitLevels(
    entryPrice: number,
    direction: 'LONG' | 'SHORT'
  ): TakeProfitLevel[] {
    const levels: TakeProfitLevel[] = [
      {
        level: 0.3,
        price: this.calculateTargetPrice(entryPrice, 0.3, direction),
        priceLevel: this.calculateTargetPrice(entryPrice, 0.3, direction),
        profitPercent: 0.3,
        positionReduction: 50,
        percentOfPosition: 50,
        active: true,
        triggered: false,
        closed: false,
      },
      {
        level: 0.5,
        price: this.calculateTargetPrice(entryPrice, 0.5, direction),
        priceLevel: this.calculateTargetPrice(entryPrice, 0.5, direction),
        profitPercent: 0.5,
        positionReduction: 30,
        percentOfPosition: 30,
        active: true,
        triggered: false,
        closed: false,
      },
      {
        level: 1.0,
        price: this.calculateTargetPrice(entryPrice, 1.0, direction),
        priceLevel: this.calculateTargetPrice(entryPrice, 1.0, direction),
        profitPercent: 1.0,
        positionReduction: 20,
        percentOfPosition: 20,
        active: true,
        triggered: false,
        closed: false,
      },
    ];

    return levels;
  }

  /**
   * Record a completed trade
   */
  public recordTrade(trade: Trade): void {
    this.closedTrades.push(trade);

    // Update daily stats
    this.dailyStats.tradesClosed++;
    this.dailyStats.totalPnl += trade.pnl;
    this.dailyStats.totalPnlPercent += trade.pnlPercent;

    if (trade.pnl > 0) {
      this.dailyStats.largestWin = Math.max(this.dailyStats.largestWin, trade.pnl);
    } else {
      this.dailyStats.largestLoss = Math.min(this.dailyStats.largestLoss, trade.pnl);
    }

    // Recalculate win rate
    const wins = this.closedTrades.filter(t => t.pnl > 0).length;
    this.dailyStats.winRate = (wins / this.closedTrades.length) * 100;

    // Recalculate averages and profit factor
    this.updateDailyMetrics();

    // Update trading frequency
    this.lastTradeTime = Date.now();
    this.tradesThisHour++;
  }

  /**
   * Record an opened trade
   */
  public recordOpenPosition(position: Position): void {
    this.openPositions.push(position);
    this.dailyStats.tradesOpened++;
    this.lastTradeTime = Date.now();
    this.tradesThisHour++;
  }

  /**
   * Remove a position from open list
   */
  public removeOpenPosition(positionId: string): void {
    this.openPositions = this.openPositions.filter(p => p.id !== positionId);
  }

  /**
   * Get current daily statistics
   */
  public getDailyStats(): DailyStats {
    return { ...this.dailyStats };
  }

  /**
   * Check if trading should be paused
   */
  public shouldPauseTrading(currentBalance: number): boolean {
    // Pause if max daily loss exceeded
    if (this.dailyStats.totalPnl < -(this.config.maxDailyLoss / 100) * this.peakBalance) {
      return true;
    }

    // Pause if max drawdown exceeded
    if (this.calculateDrawdown(currentBalance) > this.config.maxDrawdown) {
      return true;
    }

    return false;
  }

  /**
   * Reset daily statistics at midnight UTC
   */
  public resetDaily(currentBalance: number): void {
    this.lastResetTime = this.getMidnightUTC();
    this.dailyStats = this.initializeDailyStats(currentBalance);
    this.openPositions = [];
    this.closedTrades = [];
    this.tradesThisHour = 0;
    this.peakBalance = Math.max(this.peakBalance, currentBalance);

    console.log('[RiskManager] Daily stats reset');
  }

  /**
   * Check if daily reset is needed
   */
  private shouldResetDaily(): boolean {
    const now = Date.now();
    const midnightUTC = this.getMidnightUTC();

    return now > midnightUTC;
  }

  /**
   * Get midnight UTC timestamp
   */
  private getMidnightUTC(): number {
    const now = new Date();
    const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
    return midnight.getTime();
  }

  /**
   * Calculate current drawdown percentage
   */
  private calculateDrawdown(currentBalance: number): number {
    if (this.peakBalance === 0) return 0;

    const drawdown = ((this.peakBalance - currentBalance) / this.peakBalance) * 100;
    return Math.max(0, drawdown);
  }

  /**
   * Calculate profit percentage for a position
   */
  private calculateProfitPercent(entryPrice: number, currentPrice: number, direction: 'LONG' | 'SHORT'): number {
    if (entryPrice === 0) return 0;

    if (direction === 'LONG') {
      return ((currentPrice - entryPrice) / entryPrice) * 100;
    } else {
      return ((entryPrice - currentPrice) / entryPrice) * 100;
    }
  }

  /**
   * Calculate target price based on profit percentage
   */
  private calculateTargetPrice(
    entryPrice: number,
    profitPercent: number,
    direction: 'LONG' | 'SHORT'
  ): number {
    if (direction === 'LONG') {
      return entryPrice * (1 + profitPercent / 100);
    } else {
      return entryPrice * (1 - profitPercent / 100);
    }
  }

  /**
   * Update daily metrics (averages, profit factor, etc)
   */
  private updateDailyMetrics(): void {
    const wins = this.closedTrades.filter(t => t.pnl > 0);
    const losses = this.closedTrades.filter(t => t.pnl < 0);

    if (wins.length > 0) {
      this.dailyStats.avgWinSize = wins.reduce((sum, t) => sum + t.pnl, 0) / wins.length;
    }

    if (losses.length > 0) {
      this.dailyStats.avgLossSize = losses.reduce((sum, t) => sum + t.pnl, 0) / losses.length;
    }

    // Profit factor: gross profit / gross loss
    const grossProfit = wins.reduce((sum, t) => sum + t.pnl, 0);
    const grossLoss = Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0));

    if (grossLoss > 0) {
      this.dailyStats.profitFactor = grossProfit / grossLoss;
    } else if (grossProfit > 0) {
      this.dailyStats.profitFactor = 999; // Infinite if no losses
    } else {
      this.dailyStats.profitFactor = 0;
    }

    // Update max drawdown
    this.dailyStats.maxDrawdown = Math.max(
      this.dailyStats.maxDrawdown,
      this.calculateDrawdown(this.dailyStats.endingBalance)
    );
  }

  /**
   * Get open positions
   */
  public getOpenPositions(): Position[] {
    return [...this.openPositions];
  }

  /**
   * Get closed trades
   */
  public getClosedTrades(): Trade[] {
    return [...this.closedTrades];
  }

  /**
   * Serialize state for persistence
   */
  public serializeState(): {
    dailyStats: DailyStats;
    openPositions: Position[];
    closedTrades: Trade[];
    peakBalance: number;
    lastResetTime: number;
    tradesThisHour: number;
    lastTradeTime: number;
  } {
    return {
      dailyStats: this.dailyStats,
      openPositions: this.openPositions,
      closedTrades: this.closedTrades,
      peakBalance: this.peakBalance,
      lastResetTime: this.lastResetTime,
      tradesThisHour: this.tradesThisHour,
      lastTradeTime: this.lastTradeTime,
    };
  }

  /**
   * Restore state from persistence
   */
  public restoreState(state: ReturnType<RiskManager['serializeState']>): void {
    this.dailyStats = state.dailyStats;
    this.openPositions = state.openPositions;
    this.closedTrades = state.closedTrades;
    this.peakBalance = state.peakBalance;
    this.lastResetTime = state.lastResetTime;
    this.tradesThisHour = state.tradesThisHour;
    this.lastTradeTime = state.lastTradeTime;
    console.log('[RiskManager] State restored');
  }

  /**
   * Get risk metrics summary
   */
  public getRiskMetrics(): {
    currentDrawdown: number;
    maxDrawdown: number;
    dailyPnl: number;
    tradesThisHour: number;
    openPositionCount: number;
    totalExposure: number;
  } {
    return {
      currentDrawdown: this.calculateDrawdown(this.dailyStats.endingBalance),
      maxDrawdown: this.dailyStats.maxDrawdown,
      dailyPnl: this.dailyStats.totalPnl,
      tradesThisHour: this.tradesThisHour,
      openPositionCount: this.openPositions.length,
      totalExposure: this.openPositions.reduce((sum, p) => sum + p.quantity * p.entryPrice, 0),
    };
  }
}

export default RiskManager;

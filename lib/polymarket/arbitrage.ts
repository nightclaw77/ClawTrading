/**
 * Polymarket Arbitrage Detector - Micro-movement trading engine
 * Identifies mispricings between exchange prices and Polymarket predictions
 */

import { EventEmitter } from 'events';
import {
  Asset,
  Timeframe,
  PolymarketWindow,
  ArbitrageSignal,
  ExchangePricePoint,
} from '../types';
import { PolymarketClient } from './client';

interface PriceHistory {
  windowId: string;
  openPrice: number;
  openTimestamp: number;
  prices: Map<number, number>; // timestamp -> price
}

interface ExchangeFeed {
  asset: Asset;
  price: number;
  timestamp: number;
  volume24h?: number;
  source: string;
}

interface SignalAccuracy {
  asset: Asset;
  timeframe: Timeframe;
  totalSignals: number;
  profitableSignals: number;
  accuracy: number; // Percentage
  avgProfit: number;
  avgLoss: number;
}

/**
 * Arbitrage detection with machine learning ready architecture
 */
export class ArbitrageDetector extends EventEmitter {
  private client: PolymarketClient;
  private priceHistory: Map<string, PriceHistory> = new Map();
  private exchangePrices: Map<Asset, ExchangeFeed[]> = new Map();
  private signalAccuracy: Map<string, SignalAccuracy> = new Map();
  private activeSignals: Map<string, ArbitrageSignal> = new Map();

  // Configuration
  private readonly minEdgePercentage: number = 0.01; // 1% minimum edge
  private readonly minConfidence: number = 0.6; // 60% minimum confidence
  private readonly momentumWindow: number = 5 * 60 * 1000; // 5 minute window for momentum
  private readonly signalExpiry: number = 2 * 60 * 1000; // 2 minute signal validity

  constructor(client: PolymarketClient, minEdge: number = 0.01, minConfidence: number = 0.6) {
    super();
    this.client = client;
    this.minEdgePercentage = minEdge;
    this.minConfidence = minConfidence;

    // Initialize price tracking for common assets
    this.exchangePrices.set('BTC', []);
    this.exchangePrices.set('SOL', []);
  }

  /**
   * Feed real-time price data from exchanges (Binance, Coinbase, Kraken)
   * In production, would connect to WebSocket feeds
   */
  async updateExchangePrice(
    asset: Asset,
    price: number,
    source: string = 'BINANCE',
    volume24h?: number
  ): Promise<void> {
    const feed: ExchangeFeed = {
      asset,
      price,
      timestamp: Date.now(),
      volume24h,
      source,
    };

    const prices = this.exchangePrices.get(asset) || [];
    prices.push(feed);

    // Keep only last 100 price points per asset (~5 minutes at 1 update/sec)
    if (prices.length > 100) {
      prices.shift();
    }

    this.exchangePrices.set(asset, prices);
  }

  /**
   * Analyze a prediction window for arbitrage opportunities
   * Core logic: compare exchange momentum against Polymarket pricing
   */
  async analyzeWindow(window: PolymarketWindow): Promise<ArbitrageSignal | null> {
    try {
      const now = Date.now();
      const timeElapsed = now - window.openTimestamp;
      const timeRemaining = window.closeTimestamp - now;
      const windowProgress = timeElapsed / (window.closeTimestamp - window.openTimestamp);

      // Skip windows with insufficient time remaining
      const minTimeRemaining = window.timeframe === '5m' ? 60000 : 120000;
      if (timeRemaining < minTimeRemaining) {
        return null;
      }

      // Get current prices
      const polyPrice = await this.client.getPrice(window.tokenId);
      const exchangePrices = this.exchangePrices.get(window.asset) || [];

      if (exchangePrices.length === 0) {
        return null; // No exchange data yet
      }

      // Calculate price movement since window open
      const historicalPrice = this.getPriceAtTime(
        window.windowId,
        window.openTimestamp
      );
      const currentExchangePrice = exchangePrices[exchangePrices.length - 1].price;
      const windowOpenExchangePrice = this.getWindowOpenPrice(
        window.asset,
        window.openTimestamp
      );

      if (!historicalPrice || !windowOpenExchangePrice) {
        return null;
      }

      const priceMovement = (currentExchangePrice - windowOpenExchangePrice) / windowOpenExchangePrice;
      const momentum = priceMovement > 0 ? 'UP' : 'DOWN';

      // Calculate momentum strength (velocity of price change)
      const momentumStrength = this.calculateMomentumStrength(
        exchangePrices,
        window.openTimestamp
      );

      // Detect mismatch between exchange momentum and Polymarket pricing
      const theoreticalPrice = this.calculateTheoreticalPrice(priceMovement, window.direction);
      const mispriceAmount = theoreticalPrice - polyPrice;
      const edgePercentage = Math.abs(mispriceAmount) / theoreticalPrice;

      // Check market health (UP + DOWN should sum to ~1.0)
      const combinedPrice = await this.client.getCombinedPrice(
        window.upTokenId || window.tokenId,
        window.downTokenId || window.tokenId
      );
      const combinedPriceHealth = this.calculatePriceHealth(combinedPrice);

      // Verify momentum aligns with misprice direction
      const momentumAlignment = this.checkMomentumAlignment(
        momentum,
        window.direction,
        mispriceAmount
      );

      if (!momentumAlignment) {
        return null; // Misprice goes against momentum - risky
      }

      // Calculate confidence score
      const windowTiming = this.calculateWindowTiming(windowProgress);
      const exchangeAgreement = this.calculateExchangeAgreement(exchangePrices);

      const confidence = (
        momentumStrength * 0.35 +
        windowTiming * 0.25 +
        exchangeAgreement * 0.25 +
        combinedPriceHealth * 0.15
      );

      // Skip if edge too small or confidence too low
      if (edgePercentage < this.minEdgePercentage || confidence < this.minConfidence) {
        return null;
      }

      // Calculate recommended position size
      const balance = await this.client.getBalance();
      const maxPositionSize = balance.usdc * 0.1; // 10% of balance per position
      const recommendedSize = Math.min(maxPositionSize, balance.usdc * edgePercentage);

      // Determine action
      const action = this.determineAction(
        window.direction,
        mispriceAmount,
        polyPrice,
        confidence
      );

      // Create signal
      const signal: ArbitrageSignal = {
        signalId: `${window.windowId}-${Date.now()}`,
        asset: window.asset,
        timeframe: window.timeframe,
        window,

        exchangePrice: currentExchangePrice,
        windowOpenPrice: windowOpenExchangePrice,
        priceMovement,
        momentum,

        polymarketPrice: polyPrice,
        theoreticalPrice,
        mispriceAmount,
        edgePercentage,

        timeElapsed,
        timeRemaining,
        windowProgress,

        confidence,
        confidenceFactors: {
          momentumStrength,
          windowTiming,
          exchangeAgreement,
          combinedPriceHealth,
        },

        action,
        recommendedSize,
        estimatedProfit: this.calculateEstimatedProfit(
          recommendedSize,
          polyPrice,
          theoreticalPrice,
          edgePercentage
        ),
        riskScore: this.calculateRiskScore(
          edgePercentage,
          windowProgress,
          combinedPriceHealth,
          confidence
        ),

        detectedAt: now,
        expiresAt: now + this.signalExpiry,
        historicalAccuracy: this.getHistoricalAccuracy(window.asset, window.timeframe),
      };

      // Store and emit
      this.activeSignals.set(signal.signalId, signal);
      this.emit('signal', signal);

      return signal;
    } catch (error) {
      console.error(`Error analyzing window ${window.windowId}:`, error);
      return null;
    }
  }

  /**
   * Calculate theoretical price based on exchange movement
   * If exchange moved 2% up, UP token should be roughly 2% more likely
   */
  private calculateTheoreticalPrice(priceMovement: number, direction: 'UP' | 'DOWN'): number {
    // Base theoretical price (0.5 = equal probability)
    let theoretical = 0.5;

    // Adjust based on momentum (max 0.4 adjustment)
    const adjustment = Math.min(Math.abs(priceMovement), 0.4) * 0.5;

    if (direction === 'UP' && priceMovement > 0) {
      theoretical += adjustment;
    } else if (direction === 'DOWN' && priceMovement < 0) {
      theoretical += adjustment;
    }

    // Clamp to valid range
    return Math.max(0.01, Math.min(0.99, theoretical));
  }

  /**
   * Calculate momentum strength on 0-1 scale
   * Based on velocity and consistency of price movement
   */
  private calculateMomentumStrength(prices: ExchangeFeed[], windowOpenTime: number): number {
    if (prices.length < 2) return 0;

    const recentPrices = prices.filter(p => p.timestamp >= windowOpenTime - 300000); // Last 5 min
    if (recentPrices.length < 2) return 0;

    // Calculate returns over time windows
    const returns: number[] = [];
    for (let i = 1; i < recentPrices.length; i++) {
      const ret = (recentPrices[i].price - recentPrices[i - 1].price) / recentPrices[i - 1].price;
      returns.push(ret);
    }

    // Strength = average absolute return * consistency
    const avgAbsReturn = returns.reduce((a, b) => a + Math.abs(b), 0) / returns.length;
    const consistency = this.calculateConsistency(returns);

    return Math.min(1, avgAbsReturn * 100 * consistency);
  }

  /**
   * Calculate consistency of momentum (0-1)
   * Higher if returns consistently move in same direction
   */
  private calculateConsistency(returns: number[]): number {
    if (returns.length < 2) return 0;

    let sameDirectionCount = 0;
    for (let i = 1; i < returns.length; i++) {
      if (Math.sign(returns[i]) === Math.sign(returns[i - 1])) {
        sameDirectionCount++;
      }
    }

    return sameDirectionCount / (returns.length - 1);
  }

  /**
   * Timing factor - confidence higher early in window
   * Decays linearly from 1.0 to 0.3 as window progresses
   */
  private calculateWindowTiming(windowProgress: number): number {
    return Math.max(0.3, 1.0 - windowProgress * 0.7);
  }

  /**
   * Calculate how many exchanges agree on direction
   * In production, would track Binance, Coinbase, Kraken separately
   */
  private calculateExchangeAgreement(prices: ExchangeFeed[]): number {
    if (prices.length < 2) return 0.5;

    // For now, using single exchange - in production would compare multiple
    const sources = new Set(prices.map(p => p.source)).size;
    const recentConsistency = this.calculateConsistency(
      prices.slice(-10).map(p => p.price).reduce((acc, price, i) => {
        if (i === 0) return acc;
        acc.push((price - prices[Math.max(0, prices.length - 10 + i - 1)].price) /
                 prices[Math.max(0, prices.length - 10 + i - 1)].price);
        return acc;
      }, [] as number[])
    );

    return Math.min(1, sources * 0.3 + recentConsistency);
  }

  /**
   * Check market health: UP + DOWN prices should sum close to 1.0
   */
  private calculatePriceHealth(combinedPrice: number): number {
    // Perfect health at 1.0, decays away from it
    const deviation = Math.abs(combinedPrice - 1.0);
    return Math.max(0.5, 1.0 - deviation * 2);
  }

  /**
   * Verify momentum direction matches misprice direction
   */
  private checkMomentumAlignment(
    momentum: 'UP' | 'DOWN',
    direction: 'UP' | 'DOWN',
    mispriceAmount: number
  ): boolean {
    // If momentum is UP and token is UP, misprice should be positive (token underpriced)
    // If momentum is DOWN and token is DOWN, misprice should be positive (token underpriced)
    if (momentum === direction) {
      return mispriceAmount > 0; // Token should be underpriced
    }

    // If momentum opposes direction, misprice should be negative (token overpriced)
    return mispriceAmount < 0;
  }

  /**
   * Determine recommended action based on signal
   */
  private determineAction(
    direction: 'UP' | 'DOWN',
    mispriceAmount: number,
    currentPrice: number,
    confidence: number
  ): 'BUY' | 'SELL' | 'WAIT' | 'SKIP' {
    // If low confidence, wait
    if (confidence < this.minConfidence + 0.05) {
      return 'WAIT';
    }

    // If token underpriced (positive misprice), BUY
    if (mispriceAmount > 0) {
      return 'BUY';
    }

    // If token overpriced (negative misprice), SELL
    if (mispriceAmount < 0) {
      return 'SELL';
    }

    return 'SKIP';
  }

  /**
   * Calculate estimated profit from the arbitrage
   */
  private calculateEstimatedProfit(
    size: number,
    buyPrice: number,
    sellPrice: number,
    edgePercentage: number
  ): number {
    return size * edgePercentage * 0.95; // Subtract 5% for slippage/fees
  }

  /**
   * Calculate risk score (0-1, higher = riskier)
   */
  private calculateRiskScore(
    edgePercentage: number,
    windowProgress: number,
    priceHealth: number,
    confidence: number
  ): number {
    // Riskier if: small edge, late in window, poor price health, low confidence
    const edgeRisk = Math.max(0, 1.0 - edgePercentage * 100); // Inverse
    const timingRisk = windowProgress; // Riskier later in window
    const healthRisk = 1.0 - priceHealth;
    const confidenceRisk = 1.0 - confidence;

    return (edgeRisk * 0.25 + timingRisk * 0.25 + healthRisk * 0.25 + confidenceRisk * 0.25);
  }

  /**
   * Get historical accuracy for signal type
   */
  private getHistoricalAccuracy(asset: Asset, timeframe: Timeframe): number | undefined {
    const key = `${asset}-${timeframe}`;
    const accuracy = this.signalAccuracy.get(key);
    return accuracy?.accuracy;
  }

  /**
   * Get price at specific time (with interpolation)
   */
  private getPriceAtTime(windowId: string, timestamp: number): number | null {
    const history = this.priceHistory.get(windowId);
    if (!history) return null;

    const price = history.prices.get(timestamp);
    if (price !== undefined) return price;

    // Interpolate between closest prices
    const times = Array.from(history.prices.keys()).sort((a, b) => a - b);
    for (let i = 1; i < times.length; i++) {
      if (times[i - 1] <= timestamp && timestamp <= times[i]) {
        const p1 = history.prices.get(times[i - 1])!;
        const p2 = history.prices.get(times[i])!;
        const ratio = (timestamp - times[i - 1]) / (times[i] - times[i - 1]);
        return p1 + (p2 - p1) * ratio;
      }
    }

    return null;
  }

  /**
   * Get window open price for an asset
   */
  private getWindowOpenPrice(asset: Asset, windowOpenTime: number): number | null {
    const prices = this.exchangePrices.get(asset) || [];
    if (prices.length === 0) return null;

    // Find price closest to window open time
    let closest = prices[0];
    let minDiff = Math.abs(prices[0].timestamp - windowOpenTime);

    for (const price of prices) {
      const diff = Math.abs(price.timestamp - windowOpenTime);
      if (diff < minDiff) {
        minDiff = diff;
        closest = price;
      }
    }

    return minDiff < 60000 ? closest.price : null; // Must be within 60 seconds
  }

  /**
   * Record signal result for accuracy tracking
   */
  recordSignalResult(signalId: string, profitable: boolean, profitAmount: number): void {
    const signal = this.activeSignals.get(signalId);
    if (!signal) return;

    const key = `${signal.asset}-${signal.timeframe}`;
    let accuracy = this.signalAccuracy.get(key);

    if (!accuracy) {
      accuracy = {
        asset: signal.asset,
        timeframe: signal.timeframe,
        totalSignals: 0,
        profitableSignals: 0,
        accuracy: 0,
        avgProfit: 0,
        avgLoss: 0,
      };
    }

    accuracy.totalSignals++;
    if (profitable) {
      accuracy.profitableSignals++;
      accuracy.avgProfit = (accuracy.avgProfit * (accuracy.profitableSignals - 1) + profitAmount) /
                           accuracy.profitableSignals;
    } else {
      accuracy.avgLoss = (accuracy.avgLoss * (accuracy.totalSignals - accuracy.profitableSignals - 1) +
                          Math.abs(profitAmount)) / (accuracy.totalSignals - accuracy.profitableSignals);
    }

    accuracy.accuracy = accuracy.profitableSignals / accuracy.totalSignals;
    this.signalAccuracy.set(key, accuracy);

    this.activeSignals.delete(signalId);
  }

  /**
   * Get all active signals
   */
  getActiveSignals(): ArbitrageSignal[] {
    const now = Date.now();
    const active: ArbitrageSignal[] = [];

    for (const [id, signal] of this.activeSignals) {
      if (signal.expiresAt > now) {
        active.push(signal);
      } else {
        this.activeSignals.delete(id);
      }
    }

    return active;
  }

  /**
   * Track price for historical analysis
   */
  trackWindowPrice(windowId: string, openTimestamp: number, openPrice: number): void {
    if (!this.priceHistory.has(windowId)) {
      this.priceHistory.set(windowId, {
        windowId,
        openPrice,
        openTimestamp,
        prices: new Map(),
      });
    }

    const history = this.priceHistory.get(windowId)!;
    history.prices.set(Date.now(), openPrice);

    // Clean old histories (keep last 100)
    if (this.priceHistory.size > 100) {
      const oldest = Array.from(this.priceHistory.entries())
        .sort((a, b) => a[1].openTimestamp - b[1].openTimestamp)[0];
      this.priceHistory.delete(oldest[0]);
    }
  }

  /**
   * Get accuracy statistics
   */
  getAccuracyStats(): SignalAccuracy[] {
    return Array.from(this.signalAccuracy.values());
  }

  /**
   * Clear old signals and data
   */
  cleanup(): void {
    const now = Date.now();
    const expired: string[] = [];

    for (const [id, signal] of this.activeSignals) {
      if (signal.expiresAt < now) {
        expired.push(id);
      }
    }

    expired.forEach(id => this.activeSignals.delete(id));
  }
}

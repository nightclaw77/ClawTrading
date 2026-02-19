/**
 * Multi-Strategy Trading Engine for BTC 5m Scalping Bot
 * Implements 5 complementary trading strategies with adaptive weighting
 * Production-ready TypeScript implementation
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
  SessionInfo,
} from '../types/index';

/**
 * ===========================
 * STRATEGY INTERFACE
 * ===========================
 */

export interface Strategy {
  name: string;
  weight: number;
  analyze(
    candles: Candle[],
    indicators: IndicatorValues,
    regime: RegimeAnalysis,
    session: SessionInfo,
    orderFlow: OrderFlowData
  ): Signal;
  getConfidence(): number;
  updateWeight(tradeResult: Trade): void;
}

/**
 * ===========================
 * STRATEGY 1: EMA CROSSOVER
 * ===========================
 * Primary: 5/20 EMA crossover
 * Confirmation: 9/50 EMA alignment
 * Filters: RSI, volume confirmation
 */
export class EmaStrategy implements Strategy {
  name = 'EMA_CROSSOVER';
  weight = 1.0;
  private recentTrades: Trade[] = [];
  private winRate = 0.5;

  constructor() {
    this.weight = 1.0;
  }

  analyze(
    candles: Candle[],
    indicators: IndicatorValues,
    regime: RegimeAnalysis,
    session: SessionInfo,
    orderFlow: OrderFlowData
  ): Signal {
    const reasons: string[] = [];
    let direction = SignalDirection.NEUTRAL;
    let confidence = 0;

    // Validate minimum candles
    if (candles.length < 20) {
      return {
        direction: SignalDirection.NEUTRAL,
        confidence: 0,
        reasons: ['Insufficient candles for EMA analysis'],
        timestamp: Date.now(),
        indicators: this.createIndicatorSnapshot(indicators),
        strength: 'WEAK',
      };
    }

    const ema5 = indicators.ema.ema5;
    const ema9 = indicators.ema.ema9;
    const ema20 = indicators.ema.ema20;
    const ema50 = indicators.ema.ema50;
    const rsi = indicators.rsi;
    const volumeAvg = this.calculateVolumeMA(candles, 20);
    const currentVolume = candles[candles.length - 1].volume;

    // Check for NaN values
    if (
      isNaN(ema5) ||
      isNaN(ema20) ||
      isNaN(ema9) ||
      isNaN(ema50) ||
      isNaN(rsi)
    ) {
      return {
        direction: SignalDirection.NEUTRAL,
        confidence: 0,
        reasons: ['Missing indicator values'],
        timestamp: Date.now(),
        indicators: this.createIndicatorSnapshot(indicators),
        strength: 'WEAK',
      };
    }

    // ===== SIGNAL GENERATION =====

    // Fast EMA (5) crosses above Slow EMA (20) = LONG
    const prevEma5 = this.getEmaAtIndex(candles, 5, candles.length - 2);
    const prevEma20 = this.getEmaAtIndex(candles, 20, candles.length - 2);

    let crossoverSignal = false;
    if (prevEma5 < prevEma20 && ema5 > ema20) {
      // Golden cross
      crossoverSignal = true;
      direction = SignalDirection.LONG;
      reasons.push('EMA5 crossed above EMA20 (Golden Cross)');
      confidence = 40;
    } else if (prevEma5 > prevEma20 && ema5 < ema20) {
      // Death cross
      crossoverSignal = true;
      direction = SignalDirection.SHORT;
      reasons.push('EMA5 crossed below EMA20 (Death Cross)');
      confidence = 40;
    }

    // ===== CONFIRMATION FILTERS =====

    if (crossoverSignal) {
      // Confirmation 1: 9/50 EMA alignment
      if (direction === SignalDirection.LONG && ema9 > ema50) {
        confidence += 20;
        reasons.push('EMA9 > EMA50 confirms uptrend');
      } else if (direction === SignalDirection.SHORT && ema9 < ema50) {
        confidence += 20;
        reasons.push('EMA9 < EMA50 confirms downtrend');
      } else {
        confidence -= 15;
        reasons.push('EMA9/50 alignment weak');
      }

      // Confirmation 2: RSI filter
      if (direction === SignalDirection.LONG) {
        if (rsi > 30 && rsi < 70) {
          confidence += 15;
          reasons.push('RSI in neutral zone (30-70)');
        } else if (rsi >= 70) {
          confidence -= 20;
          reasons.push('RSI overbought - reduced confidence');
          confidence = Math.max(0, confidence);
        }
      } else if (direction === SignalDirection.SHORT) {
        if (rsi > 30 && rsi < 70) {
          confidence += 15;
          reasons.push('RSI in neutral zone (30-70)');
        } else if (rsi <= 30) {
          confidence -= 20;
          reasons.push('RSI oversold - reduced confidence');
          confidence = Math.max(0, confidence);
        }
      }

      // Confirmation 3: Volume surge
      if (currentVolume >= volumeAvg * 1.3) {
        confidence += 10;
        reasons.push(`Volume surge detected (${(currentVolume / volumeAvg).toFixed(2)}x avg)`);
      } else {
        confidence -= 5;
        reasons.push('Low volume confirmation');
      }

      // Session penalty: reduce confidence during Asian session
      if (session.currentSession === TradingSession.ASIAN) {
        confidence = Math.floor(confidence * 0.7);
        reasons.push('Asian session - confidence reduced');
      }
    }

    // Ensure confidence is in valid range
    confidence = Math.max(0, Math.min(100, confidence));

    const strength =
      confidence >= 70 ? 'STRONG' : confidence >= 40 ? 'MODERATE' : 'WEAK';

    return {
      direction,
      confidence,
      reasons,
      timestamp: Date.now(),
      indicators: this.createIndicatorSnapshot(indicators),
      strength,
      entryPrice: candles[candles.length - 1].close,
      riskRewardRatio: 1.5,
    };
  }

  getConfidence(): number {
    if (this.recentTrades.length === 0) return 0.5;
    const wins = this.recentTrades.filter((t) => t.winTrade).length;
    this.winRate = wins / this.recentTrades.length;
    return Math.max(0.3, Math.min(1.0, this.winRate));
  }

  updateWeight(tradeResult: Trade): void {
    this.recentTrades.push(tradeResult);
    if (this.recentTrades.length > 50) {
      this.recentTrades.shift();
    }
    const confidence = this.getConfidence();
    this.weight = 0.5 + confidence * 1.0; // Range: 0.5 to 1.5
  }

  private getEmaAtIndex(
    candles: Candle[],
    period: number,
    index: number
  ): number {
    if (index < period - 1) return NaN;
    const slice = candles.slice(0, index + 1);
    const closes = slice.map((c) => c.close);
    return this.calculateEMA(closes, period);
  }

  private calculateEMA(closes: number[], period: number): number {
    if (closes.length < period) return NaN;
    const multiplier = 2 / (period + 1);
    let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < closes.length; i++) {
      ema = (closes[i] - ema) * multiplier + ema;
    }
    return ema;
  }

  private calculateVolumeMA(candles: Candle[], period: number): number {
    if (candles.length < period) return 0;
    const volumes = candles.slice(-period).map((c) => c.volume);
    return volumes.reduce((a, b) => a + b, 0) / period;
  }

  private createIndicatorSnapshot(indicators: IndicatorValues): any {
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
}

/**
 * ===========================
 * STRATEGY 2: RSI REVERSAL
 * ===========================
 * Detects RSI divergences
 * Oversold bounces (RSI > 30)
 * Overbought rejections (RSI < 70)
 */
export class RsiStrategy implements Strategy {
  name = 'RSI_REVERSAL';
  weight = 1.0;
  private recentTrades: Trade[] = [];
  private winRate = 0.5;

  analyze(
    candles: Candle[],
    indicators: IndicatorValues,
    regime: RegimeAnalysis,
    session: SessionInfo,
    orderFlow: OrderFlowData
  ): Signal {
    const reasons: string[] = [];
    let direction = SignalDirection.NEUTRAL;
    let confidence = 0;

    if (candles.length < 15) {
      return {
        direction: SignalDirection.NEUTRAL,
        confidence: 0,
        reasons: ['Insufficient candles'],
        timestamp: Date.now(),
        indicators: this.createIndicatorSnapshot(indicators),
        strength: 'WEAK',
      };
    }

    const rsi = indicators.rsi;
    const rsiPrev = this.getRSIAtIndex(candles, candles.length - 2);
    const bbUpper = indicators.bollingerBands.upper;
    const bbLower = indicators.bollingerBands.lower;
    const bbMiddle = indicators.bollingerBands.middle;
    const currentPrice = candles[candles.length - 1].close;
    const stochK = indicators.stochastic.k;
    const stochD = indicators.stochastic.d;

    if (isNaN(rsi) || isNaN(rsiPrev) || isNaN(bbUpper) || isNaN(bbLower)) {
      return {
        direction: SignalDirection.NEUTRAL,
        confidence: 0,
        reasons: ['Missing indicator values'],
        timestamp: Date.now(),
        indicators: this.createIndicatorSnapshot(indicators),
        strength: 'WEAK',
      };
    }

    // ===== OVERSOLD BOUNCE =====
    if (rsiPrev < 30 && rsi > 30) {
      // RSI crosses back above 30 from oversold
      direction = SignalDirection.LONG;
      confidence = 35;
      reasons.push('RSI crossed above 30 from oversold');

      // Bollinger Band touch confirmation
      if (currentPrice < bbLower) {
        confidence += 20;
        reasons.push('Price touched lower Bollinger Band');
      } else if (currentPrice < bbMiddle) {
        confidence += 10;
        reasons.push('Price in lower half of Bollinger Bands');
      }

      // Stochastic confirmation
      if (!isNaN(stochK) && !isNaN(stochD) && stochK > stochD) {
        confidence += 15;
        reasons.push('Stochastic K > D (upward momentum)');
      }
    }

    // ===== OVERBOUGHT REJECTION =====
    if (rsiPrev > 70 && rsi < 70) {
      // RSI crosses back below 70 from overbought
      direction = SignalDirection.SHORT;
      confidence = 35;
      reasons.push('RSI crossed below 70 from overbought');

      // Bollinger Band touch confirmation
      if (currentPrice > bbUpper) {
        confidence += 20;
        reasons.push('Price touched upper Bollinger Band');
      } else if (currentPrice > bbMiddle) {
        confidence += 10;
        reasons.push('Price in upper half of Bollinger Bands');
      }

      // Stochastic confirmation
      if (!isNaN(stochK) && !isNaN(stochD) && stochK < stochD) {
        confidence += 15;
        reasons.push('Stochastic K < D (downward momentum)');
      }
    }

    // ===== RSI DIVERGENCE DETECTION =====
    // Bullish divergence: price makes new low but RSI makes higher low
    const rsiTwoBack = this.getRSIAtIndex(candles, candles.length - 3);
    const priceTwoBack = candles[candles.length - 3]?.close || currentPrice;
    const priceOneBack = candles[candles.length - 2]?.close || currentPrice;

    if (
      !isNaN(rsiTwoBack) &&
      priceOneBack < priceTwoBack &&
      currentPrice < priceOneBack &&
      rsi > rsiTwoBack
    ) {
      // Bullish divergence
      direction = SignalDirection.LONG;
      confidence = Math.max(confidence, 45);
      reasons.push('Bullish divergence detected (price low, RSI high)');
    }

    if (
      !isNaN(rsiTwoBack) &&
      priceOneBack > priceTwoBack &&
      currentPrice > priceOneBack &&
      rsi < rsiTwoBack
    ) {
      // Bearish divergence
      direction = SignalDirection.SHORT;
      confidence = Math.max(confidence, 45);
      reasons.push('Bearish divergence detected (price high, RSI low)');
    }

    // Extreme RSI readings
    if (rsi > 85) {
      confidence = Math.max(confidence - 10, 0);
      reasons.push('Extreme RSI level - caution advised');
    } else if (rsi < 15) {
      confidence = Math.max(confidence - 10, 0);
      reasons.push('Extreme RSI level - caution advised');
    }

    confidence = Math.max(0, Math.min(100, confidence));
    const strength =
      confidence >= 70 ? 'STRONG' : confidence >= 40 ? 'MODERATE' : 'WEAK';

    return {
      direction,
      confidence,
      reasons,
      timestamp: Date.now(),
      indicators: this.createIndicatorSnapshot(indicators),
      strength,
      entryPrice: currentPrice,
      riskRewardRatio: 1.5,
    };
  }

  getConfidence(): number {
    if (this.recentTrades.length === 0) return 0.5;
    const wins = this.recentTrades.filter((t) => t.winTrade).length;
    this.winRate = wins / this.recentTrades.length;
    return Math.max(0.3, Math.min(1.0, this.winRate));
  }

  updateWeight(tradeResult: Trade): void {
    this.recentTrades.push(tradeResult);
    if (this.recentTrades.length > 50) {
      this.recentTrades.shift();
    }
    const confidence = this.getConfidence();
    this.weight = 0.5 + confidence * 1.0;
  }

  private getRSIAtIndex(candles: Candle[], index: number): number {
    if (index < 14) return NaN;
    const slice = candles.slice(0, index + 1);
    return this.calculateRSI(slice, 14);
  }

  private calculateRSI(candles: Candle[], period: number): number {
    if (candles.length < period + 1) return NaN;

    let gainSum = 0;
    let lossSum = 0;

    for (let i = 1; i < period; i++) {
      const change = candles[i].close - candles[i - 1].close;
      if (change > 0) {
        gainSum += change;
      } else {
        lossSum += Math.abs(change);
      }
    }

    let avgGain = gainSum / period;
    let avgLoss = lossSum / period;

    for (let i = period; i < candles.length; i++) {
      const change = candles[i].close - candles[i - 1].close;
      const gain = change > 0 ? change : 0;
      const loss = change < 0 ? Math.abs(change) : 0;

      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
    }

    if (avgLoss === 0) return avgGain === 0 ? 50 : 100;

    const rs = avgGain / avgLoss;
    return 100 - 100 / (1 + rs);
  }

  private createIndicatorSnapshot(indicators: IndicatorValues): any {
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
}

/**
 * ===========================
 * STRATEGY 3: BREAKOUT
 * ===========================
 * Detects consolidation + squeeze
 * Waits for Bollinger Band expansion
 * Volume surge + ADX confirmation
 */
export class BreakoutStrategy implements Strategy {
  name = 'BREAKOUT';
  weight = 1.0;
  private recentTrades: Trade[] = [];
  private winRate = 0.5;
  private bbWidthHistory: number[] = [];

  analyze(
    candles: Candle[],
    indicators: IndicatorValues,
    regime: RegimeAnalysis,
    session: SessionInfo,
    orderFlow: OrderFlowData
  ): Signal {
    const reasons: string[] = [];
    let direction = SignalDirection.NEUTRAL;
    let confidence = 0;

    if (candles.length < 30) {
      return {
        direction: SignalDirection.NEUTRAL,
        confidence: 0,
        reasons: ['Insufficient candles'],
        timestamp: Date.now(),
        indicators: this.createIndicatorSnapshot(indicators),
        strength: 'WEAK',
      };
    }

    const bbWidth = indicators.bollingerBands.width;
    const bbUpper = indicators.bollingerBands.upper;
    const bbLower = indicators.bollingerBands.lower;
    const atr = indicators.atr.value;
    const adx = indicators.adx.value;
    const currentPrice = candles[candles.length - 1].close;
    const volumeAvg = this.calculateVolumeMA(candles, 20);
    const currentVolume = candles[candles.length - 1].volume;

    if (
      isNaN(bbWidth) ||
      isNaN(atr) ||
      isNaN(adx) ||
      currentVolume === 0 ||
      volumeAvg === 0
    ) {
      return {
        direction: SignalDirection.NEUTRAL,
        confidence: 0,
        reasons: ['Missing indicator values'],
        timestamp: Date.now(),
        indicators: this.createIndicatorSnapshot(indicators),
        strength: 'WEAK',
      };
    }

    // Track BB width history
    this.bbWidthHistory.push(bbWidth);
    if (this.bbWidthHistory.length > 50) this.bbWidthHistory.shift();

    // ===== DETECT SQUEEZE (CONSOLIDATION) =====
    const avgBBWidth =
      this.bbWidthHistory.reduce((a, b) => a + b, 0) /
      this.bbWidthHistory.length;
    const isSqueezeDetected = bbWidth < avgBBWidth * 0.7; // 30% tighter than average

    let squeezeConfidence = 0;
    if (isSqueezeDetected) {
      squeezeConfidence = 30;
      reasons.push(`Bollinger Band squeeze detected (${(bbWidth / avgBBWidth).toFixed(2)}x avg)`);

      // ===== DETECT SQUEEZE BREAKOUT =====
      // Price breaks out of squeeze with volume
      const breakoutUp = currentPrice > bbUpper;
      const breakoutDown = currentPrice < bbLower;

      if ((breakoutUp || breakoutDown) && currentVolume >= volumeAvg * 1.5) {
        const bbExpanded =
          this.bbWidthHistory.length >= 2 &&
          bbWidth > this.bbWidthHistory[this.bbWidthHistory.length - 2];

        if (bbExpanded) {
          confidence = 50 + squeezeConfidence;
          reasons.push(
            `Bollinger Band expansion ${breakoutUp ? 'up' : 'down'} breakout`
          );
          reasons.push(
            `Volume surge: ${(currentVolume / volumeAvg).toFixed(2)}x average`
          );

          direction = breakoutUp ? SignalDirection.LONG : SignalDirection.SHORT;
        }
      } else if (isSqueezeDetected && !breakoutUp && !breakoutDown) {
        // Still in squeeze waiting for breakout
        direction = SignalDirection.NEUTRAL;
        confidence = 10;
        reasons.push('In consolidation, awaiting breakout');
      }
    }

    // ===== ADX TREND CONFIRMATION =====
    if (confidence > 0) {
      if (adx > 25) {
        confidence += 15;
        reasons.push(`ADX > 25 confirms trend strength (${adx.toFixed(1)})`);
      } else if (adx > 20) {
        confidence += 8;
        reasons.push(`ADX rising: ${adx.toFixed(1)}`);
      } else {
        confidence = Math.max(0, confidence - 10);
        reasons.push('ADX weak - reduced confidence');
      }
    }

    // ===== VOLATILITY CHECK =====
    const atrPercent = (atr / currentPrice) * 100;
    if (atrPercent > 1.5) {
      confidence = Math.max(0, confidence - 5);
      reasons.push('High volatility - reduced confidence');
    }

    confidence = Math.max(0, Math.min(100, confidence));
    const strength =
      confidence >= 70 ? 'STRONG' : confidence >= 40 ? 'MODERATE' : 'WEAK';

    return {
      direction,
      confidence,
      reasons,
      timestamp: Date.now(),
      indicators: this.createIndicatorSnapshot(indicators),
      strength,
      entryPrice: currentPrice,
      riskRewardRatio: 2.0,
    };
  }

  getConfidence(): number {
    if (this.recentTrades.length === 0) return 0.5;
    const wins = this.recentTrades.filter((t) => t.winTrade).length;
    this.winRate = wins / this.recentTrades.length;
    return Math.max(0.3, Math.min(1.0, this.winRate));
  }

  updateWeight(tradeResult: Trade): void {
    this.recentTrades.push(tradeResult);
    if (this.recentTrades.length > 50) {
      this.recentTrades.shift();
    }
    const confidence = this.getConfidence();
    this.weight = 0.5 + confidence * 1.0;
  }

  private calculateVolumeMA(candles: Candle[], period: number): number {
    if (candles.length < period) return 0;
    const volumes = candles.slice(-period).map((c) => c.volume);
    return volumes.reduce((a, b) => a + b, 0) / period;
  }

  private createIndicatorSnapshot(indicators: IndicatorValues): any {
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
}

/**
 * ===========================
 * STRATEGY 4: VWAP MEAN REVERSION
 * ===========================
 * Trades price deviations from VWAP
 * Best in ranging/choppy markets
 * MFI confirmation for money flow
 */
export class VwapReversalStrategy implements Strategy {
  name = 'VWAP_REVERSION';
  weight = 1.0;
  private recentTrades: Trade[] = [];
  private winRate = 0.5;

  analyze(
    candles: Candle[],
    indicators: IndicatorValues,
    regime: RegimeAnalysis,
    session: SessionInfo,
    orderFlow: OrderFlowData
  ): Signal {
    const reasons: string[] = [];
    let direction = SignalDirection.NEUTRAL;
    let confidence = 0;

    if (candles.length < 30) {
      return {
        direction: SignalDirection.NEUTRAL,
        confidence: 0,
        reasons: ['Insufficient candles'],
        timestamp: Date.now(),
        indicators: this.createIndicatorSnapshot(indicators),
        strength: 'WEAK',
      };
    }

    const vwap = indicators.vwap;
    const atr = indicators.atr.value;
    const currentPrice = candles[candles.length - 1].close;
    const mfi = this.calculateMFI(candles, 14);

    if (isNaN(vwap) || isNaN(atr) || currentPrice === 0) {
      return {
        direction: SignalDirection.NEUTRAL,
        confidence: 0,
        reasons: ['Missing indicator values'],
        timestamp: Date.now(),
        indicators: this.createIndicatorSnapshot(indicators),
        strength: 'WEAK',
      };
    }

    // ===== VWAP DEVIATION DETECTION =====
    const deviation = Math.abs(currentPrice - vwap);
    const deviationPercent = (deviation / vwap) * 100;
    const atrPercent = (atr / vwap) * 100;

    // Trading range: deviation > 1.5 ATR suggests reversion opportunity
    if (deviation > atr * 1.5) {
      confidence = 35;

      if (currentPrice < vwap) {
        // Price below VWAP - expect reversion UP
        direction = SignalDirection.LONG;
        reasons.push(
          `Price ${deviationPercent.toFixed(2)}% below VWAP - reversion expected`
        );

        // MFI confirmation
        if (!isNaN(mfi) && mfi > 50) {
          confidence += 20;
          reasons.push(`MFI > 50 (${mfi.toFixed(1)}) - bullish money flow`);
        } else if (!isNaN(mfi) && mfi < 30) {
          confidence -= 10;
          reasons.push('MFI < 30 - weak money flow for upside');
        }
      } else {
        // Price above VWAP - expect reversion DOWN
        direction = SignalDirection.SHORT;
        reasons.push(
          `Price ${deviationPercent.toFixed(2)}% above VWAP - reversion expected`
        );

        // MFI confirmation
        if (!isNaN(mfi) && mfi < 50) {
          confidence += 20;
          reasons.push(`MFI < 50 (${mfi.toFixed(1)}) - bearish money flow`);
        } else if (!isNaN(mfi) && mfi > 70) {
          confidence -= 10;
          reasons.push('MFI > 70 - weak money flow for downside');
        }
      }

      // Extreme deviation
      if (deviationPercent > atrPercent * 2) {
        confidence = Math.max(0, confidence - 15);
        reasons.push('Extreme deviation - extreme reversion risk');
      }
    } else {
      confidence = 0;
      direction = SignalDirection.NEUTRAL;
      reasons.push('Price near VWAP - no reversion signal');
    }

    // ===== REGIME FILTER =====
    // VWAP reversion works best in RANGING or CHOPPY markets
    if (
      regime.currentRegime === MarketRegime.RANGING ||
      regime.currentRegime === MarketRegime.CHOPPY
    ) {
      confidence = Math.min(100, confidence + 10);
      reasons.push('RANGING regime - favorable for mean reversion');
    } else if (
      regime.currentRegime === MarketRegime.TRENDING_UP ||
      regime.currentRegime === MarketRegime.TRENDING_DOWN
    ) {
      confidence = Math.max(0, confidence - 20);
      reasons.push('TRENDING regime - lower confidence for reversion');
    }

    // Reduce position size (cautious approach)
    confidence = Math.max(0, Math.min(100, confidence * 0.8));

    confidence = Math.max(0, Math.min(100, confidence));
    const strength =
      confidence >= 70 ? 'STRONG' : confidence >= 40 ? 'MODERATE' : 'WEAK';

    return {
      direction,
      confidence,
      reasons,
      timestamp: Date.now(),
      indicators: this.createIndicatorSnapshot(indicators),
      strength,
      entryPrice: currentPrice,
      riskRewardRatio: 1.5,
    };
  }

  getConfidence(): number {
    if (this.recentTrades.length === 0) return 0.5;
    const wins = this.recentTrades.filter((t) => t.winTrade).length;
    this.winRate = wins / this.recentTrades.length;
    return Math.max(0.3, Math.min(1.0, this.winRate));
  }

  updateWeight(tradeResult: Trade): void {
    this.recentTrades.push(tradeResult);
    if (this.recentTrades.length > 50) {
      this.recentTrades.shift();
    }
    const confidence = this.getConfidence();
    this.weight = 0.5 + confidence * 1.0;
  }

  private calculateMFI(candles: Candle[], period: number): number {
    if (candles.length < period + 1) return NaN;

    let positiveMoneyFlow = 0;
    let negativeMoneyFlow = 0;

    for (let i = 1; i < candles.length; i++) {
      const typicalPriceCurrent =
        (candles[i].high + candles[i].low + candles[i].close) / 3;
      const typicalPricePrev =
        (candles[i - 1].high + candles[i - 1].low + candles[i - 1].close) / 3;

      const moneyFlow = typicalPriceCurrent * candles[i].volume;

      if (typicalPriceCurrent > typicalPricePrev) {
        positiveMoneyFlow += moneyFlow;
      } else if (typicalPriceCurrent < typicalPricePrev) {
        negativeMoneyFlow += moneyFlow;
      }
    }

    const moneyFlowRatio =
      negativeMoneyFlow === 0 ? 100 : positiveMoneyFlow / negativeMoneyFlow;

    return 100 - 100 / (1 + moneyFlowRatio);
  }

  private createIndicatorSnapshot(indicators: IndicatorValues): any {
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
}

/**
 * ===========================
 * STRATEGY 5: ORDER FLOW
 * ===========================
 * Analyzes bid-ask imbalance
 * Volume delta direction
 * Large order detection
 * Highest confidence only (>75%)
 */
export class OrderFlowStrategy implements Strategy {
  name = 'ORDER_FLOW';
  weight = 1.0;
  private recentTrades: Trade[] = [];
  private winRate = 0.5;

  analyze(
    candles: Candle[],
    indicators: IndicatorValues,
    regime: RegimeAnalysis,
    session: SessionInfo,
    orderFlow: OrderFlowData
  ): Signal {
    const reasons: string[] = [];
    let direction = SignalDirection.NEUTRAL;
    let confidence = 0;

    if (candles.length < 10) {
      return {
        direction: SignalDirection.NEUTRAL,
        confidence: 0,
        reasons: ['Insufficient candles'],
        timestamp: Date.now(),
        indicators: this.createIndicatorSnapshot(indicators),
        strength: 'WEAK',
      };
    }

    const currentPrice = candles[candles.length - 1].close;
    const volumeDelta = indicators.volumeDelta.value;
    const volumeDeltaMA = indicators.volumeDelta.sma20;

    // ===== BID-ASK IMBALANCE ANALYSIS =====
    const bidAskRatio = orderFlow.bidAskRatio;
    let biasBullish = false;
    let biasAmount = 0;

    if (bidAskRatio > 1.2) {
      // More bid volume than ask = buy pressure
      biasBullish = true;
      biasAmount = Math.min((bidAskRatio - 1.0) * 50, 100); // Scale: 1.2 -> 10, 1.4 -> 20, etc
      direction = SignalDirection.LONG;
      reasons.push(
        `Strong bid pressure: bid/ask ratio ${bidAskRatio.toFixed(2)}`
      );
    } else if (bidAskRatio < 0.83) {
      // More ask volume than bid = sell pressure
      biasBullish = false;
      biasAmount = Math.min((1.0 - bidAskRatio) * 50, 100);
      direction = SignalDirection.SHORT;
      reasons.push(
        `Strong ask pressure: bid/ask ratio ${bidAskRatio.toFixed(2)}`
      );
    } else {
      // Neutral bias
      confidence = 0;
      reasons.push('Bid/ask ratio neutral');
    }

    // ===== VOLUME DELTA ANALYSIS =====
    if (confidence > 0) {
      if (!isNaN(volumeDeltaMA)) {
        if (biasBullish && volumeDelta > volumeDeltaMA) {
          confidence += 15;
          reasons.push('Volume delta bullish confirmation');
        } else if (!biasBullish && volumeDelta < volumeDeltaMA) {
          confidence += 15;
          reasons.push('Volume delta bearish confirmation');
        } else {
          confidence = Math.max(0, confidence - 10);
          reasons.push('Volume delta divergence');
        }
      }

      // ===== LARGE ORDER DETECTION =====
      if (orderFlow.largeOrdersDetected) {
        const orderSide = orderFlow.largeOrdersSide;
        if (
          (biasBullish && orderSide === 'BUY') ||
          (!biasBullish && orderSide === 'SELL')
        ) {
          confidence += 15;
          reasons.push(
            `Large ${orderSide} orders detected (${orderFlow.largeOrdersSide})`
          );
        } else if (
          (biasBullish && orderSide === 'SELL') ||
          (!biasBullish && orderSide === 'BUY')
        ) {
          confidence = Math.max(0, confidence - 15);
          reasons.push('Large orders diverge from imbalance');
        }
      }

      // ===== SPOOFING DETECTION =====
      if (orderFlow.spoofingDetected) {
        confidence = Math.max(0, confidence - 25);
        reasons.push('Spoofing detected - reduced confidence');
      }
    }

    // ===== ONLY ACT ON HIGHEST CONFIDENCE =====
    // Order flow is very short-term, only take signals > 75%
    if (confidence < 75) {
      return {
        direction: SignalDirection.NEUTRAL,
        confidence,
        reasons: [
          ...reasons,
          'Confidence below 75% threshold for order flow strategy',
        ],
        timestamp: Date.now(),
        indicators: this.createIndicatorSnapshot(indicators),
        strength: 'WEAK',
      };
    }

    confidence = Math.max(0, Math.min(100, confidence));
    const strength =
      confidence >= 75 ? 'STRONG' : confidence >= 60 ? 'MODERATE' : 'WEAK';

    return {
      direction,
      confidence,
      reasons,
      timestamp: Date.now(),
      indicators: this.createIndicatorSnapshot(indicators),
      strength,
      entryPrice: currentPrice,
      riskRewardRatio: 1.2, // Very short scalps
    };
  }

  getConfidence(): number {
    if (this.recentTrades.length === 0) return 0.5;
    const wins = this.recentTrades.filter((t) => t.winTrade).length;
    this.winRate = wins / this.recentTrades.length;
    return Math.max(0.3, Math.min(1.0, this.winRate));
  }

  updateWeight(tradeResult: Trade): void {
    this.recentTrades.push(tradeResult);
    if (this.recentTrades.length > 50) {
      this.recentTrades.shift();
    }
    const confidence = this.getConfidence();
    this.weight = 0.5 + confidence * 1.0;
  }

  private createIndicatorSnapshot(indicators: IndicatorValues): any {
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
}

/**
 * Export all strategies
 */
export const STRATEGIES = [
  EmaStrategy,
  RsiStrategy,
  BreakoutStrategy,
  VwapReversalStrategy,
  OrderFlowStrategy,
];

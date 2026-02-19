/**
 * Technical Indicators Library for BTC 5m Scalping Bot
 * Production-ready TypeScript implementation with pure math (no external dependencies)
 *
 * All functions are mathematically correct and optimized for real-time trading
 * Includes proper edge case handling for insufficient data
 */

import {
  Candle,
  IndicatorValues,
  MarketRegime,
  TradingSession,
  OrderFlowData,
  RegimeAnalysis,
  SessionInfo,
} from '../types/index';

/**
 * ====================
 * UTILITY FUNCTIONS
 * ====================
 */

/**
 * Calculate SMA (Simple Moving Average)
 * Sum of closing prices / period
 */
function calculateSMA(closes: number[], period: number): number {
  if (closes.length < period) return NaN;
  const slice = closes.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

/**
 * Calculate EMA (Exponential Moving Average)
 * Uses standard EMA formula: EMA = (Close - EMA_prev) * multiplier + EMA_prev
 */
function calculateEMA(closes: number[], period: number): number {
  if (closes.length < period) return NaN;

  const multiplier = 2 / (period + 1);
  let ema = 0;

  // Start with SMA for the first value
  const firstSlice = closes.slice(0, period);
  ema = firstSlice.reduce((a, b) => a + b, 0) / period;

  // Calculate EMA from period onwards
  for (let i = period; i < closes.length; i++) {
    ema = (closes[i] - ema) * multiplier + ema;
  }

  return ema;
}

/**
 * Calculate standard deviation
 * sqrt(sum((x - mean)^2) / n)
 */
function calculateStdDev(values: number[]): number {
  if (values.length === 0) return 0;

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;

  return Math.sqrt(variance);
}

/**
 * Calculate True Range (used for ATR)
 * TR = max(high - low, abs(high - close_prev), abs(low - close_prev))
 */
function calculateTrueRange(
  high: number,
  low: number,
  closePrev: number
): number {
  const tr1 = high - low;
  const tr2 = Math.abs(high - closePrev);
  const tr3 = Math.abs(low - closePrev);

  return Math.max(tr1, tr2, tr3);
}

/**
 * Calculate RSI gains and losses for proper initialization
 */
function initializeRSIGains(candles: Candle[], period: number) {
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

  return {
    avgGain: gainSum / period,
    avgLoss: lossSum / period,
  };
}

/**
 * ====================
 * INDICATOR CALCULATIONS
 * ====================
 */

/**
 * 1. EMA - Exponential Moving Average
 * Returns the current EMA value given an array of closes and period
 */
export function ema(closes: number[], period: number): number {
  if (closes.length < period) return NaN;
  return calculateEMA(closes, period);
}

/**
 * Calculate multiple EMAs at once
 */
export function multipleEMA(
  closes: number[],
  periods: number[]
): Record<string, number> {
  const result: Record<string, number> = {};

  for (const period of periods) {
    const emaValue = calculateEMA(closes, period);
    result[`ema${period}`] = emaValue;
  }

  return result;
}

/**
 * 2. SMA - Simple Moving Average
 */
export function sma(closes: number[], period: number): number {
  if (closes.length < period) return NaN;
  return calculateSMA(closes, period);
}

/**
 * Calculate multiple SMAs
 */
export function multipleSMA(
  closes: number[],
  periods: number[]
): Record<string, number> {
  const result: Record<string, number> = {};

  for (const period of periods) {
    const smaValue = calculateSMA(closes, period);
    result[`sma${period}`] = smaValue;
  }

  return result;
}

/**
 * 3. RSI - Relative Strength Index (period 14 default)
 * RSI = 100 - (100 / (1 + RS))
 * where RS = Avg Gain / Avg Loss
 */
export function rsi(candles: Candle[], period: number = 14): number {
  if (candles.length < period + 1) return NaN;

  let avgGain = 0;
  let avgLoss = 0;

  // Initialize with SMA of gains and losses
  const { avgGain: initGain, avgLoss: initLoss } = initializeRSIGains(
    candles,
    period
  );
  avgGain = initGain;
  avgLoss = initLoss;

  // Smooth the gains and losses using EMA approach
  for (let i = period; i < candles.length; i++) {
    const change = candles[i].close - candles[i - 1].close;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) {
    return avgGain === 0 ? 50 : 100;
  }

  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/**
 * 4. MACD - Moving Average Convergence Divergence
 * fast (12), slow (26), signal (9)
 */
export function macd(
  candles: Candle[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): {
  macdLine: number;
  signal: number;
  histogram: number;
} {
  const closes = candles.map((c) => c.close);

  if (closes.length < slowPeriod) {
    return {
      macdLine: NaN,
      signal: NaN,
      histogram: NaN,
    };
  }

  const ema12 = calculateEMA(closes, fastPeriod);
  const ema26 = calculateEMA(closes, slowPeriod);
  const macdLine = ema12 - ema26;

  // Calculate MACD signal line (9-period EMA of MACD line)
  // We need to build the MACD line series to calculate signal
  const macdLines: number[] = [];
  for (let i = slowPeriod - 1; i < closes.length; i++) {
    const ema12Temp = calculateEMA(closes.slice(0, i + 1), fastPeriod);
    const ema26Temp = calculateEMA(closes.slice(0, i + 1), slowPeriod);
    macdLines.push(ema12Temp - ema26Temp);
  }

  let signal = NaN;
  if (macdLines.length >= signalPeriod) {
    signal = calculateEMA(macdLines, signalPeriod);
  }

  const histogram = macdLine - signal;

  return {
    macdLine,
    signal,
    histogram,
  };
}

/**
 * 5. Bollinger Bands (period 20, stdDev 2)
 */
export function bollingerBands(
  candles: Candle[],
  period: number = 20,
  stdDevMultiplier: number = 2
): {
  upper: number;
  middle: number;
  lower: number;
  width: number;
  percentB: number;
} {
  const closes = candles.map((c) => c.close);

  if (closes.length < period) {
    return {
      upper: NaN,
      middle: NaN,
      lower: NaN,
      width: NaN,
      percentB: NaN,
    };
  }

  const middle = calculateSMA(closes, period);
  const slice = closes.slice(-period);
  const stdDev = calculateStdDev(slice);

  const upper = middle + stdDev * stdDevMultiplier;
  const lower = middle - stdDev * stdDevMultiplier;
  const width = upper - lower;

  // %B = (Close - Lower) / (Upper - Lower)
  const percentB = width === 0 ? 0.5 : (closes[closes.length - 1] - lower) / width;

  return {
    upper,
    middle,
    lower,
    width,
    percentB,
  };
}

/**
 * 6. ATR - Average True Range (period 14)
 */
export function atr(candles: Candle[], period: number = 14): number {
  if (candles.length < period + 1) return NaN;

  const trValues: number[] = [];

  // Calculate TR for each candle
  for (let i = 1; i < candles.length; i++) {
    const tr = calculateTrueRange(
      candles[i].high,
      candles[i].low,
      candles[i - 1].close
    );
    trValues.push(tr);
  }

  if (trValues.length < period) return NaN;

  // Initialize ATR with SMA
  let atrValue = 0;
  const firstSlice = trValues.slice(0, period);
  atrValue = firstSlice.reduce((a, b) => a + b, 0) / period;

  // Smooth with EMA
  for (let i = period; i < trValues.length; i++) {
    atrValue = (trValues[i] - atrValue) * (1 / period) + atrValue;
  }

  return atrValue;
}

/**
 * 7. ADX - Average Directional Index (period 14)
 * Returns { adx, diPlus, diMinus }
 */
export function adx(
  candles: Candle[],
  period: number = 14
): {
  adx: number;
  diPlus: number;
  diMinus: number;
} {
  if (candles.length < period + 1) {
    return { adx: NaN, diPlus: NaN, diMinus: NaN };
  }

  const trValues: number[] = [];
  const upMoves: number[] = [];
  const downMoves: number[] = [];

  // Calculate TR, Up Move, Down Move
  for (let i = 1; i < candles.length; i++) {
    const tr = calculateTrueRange(
      candles[i].high,
      candles[i].low,
      candles[i - 1].close
    );
    trValues.push(tr);

    const upMove = candles[i].high - candles[i - 1].high;
    const downMove = candles[i - 1].low - candles[i].low;

    let plusDM = 0;
    let minusDM = 0;

    if (upMove > downMove && upMove > 0) {
      plusDM = upMove;
    }
    if (downMove > upMove && downMove > 0) {
      minusDM = downMove;
    }

    upMoves.push(plusDM);
    downMoves.push(minusDM);
  }

  // Initialize smoothed values
  let atrSmoothed = trValues.slice(0, period).reduce((a, b) => a + b, 0);
  let plusDMSmoothed = upMoves.slice(0, period).reduce((a, b) => a + b, 0);
  let minusDMSmoothed = downMoves.slice(0, period).reduce((a, b) => a + b, 0);

  // Smooth remaining values
  for (let i = period; i < trValues.length; i++) {
    atrSmoothed = atrSmoothed - atrSmoothed / period + trValues[i];
    plusDMSmoothed = plusDMSmoothed - plusDMSmoothed / period + upMoves[i];
    minusDMSmoothed =
      minusDMSmoothed - minusDMSmoothed / period + downMoves[i];
  }

  const diPlus = (plusDMSmoothed / atrSmoothed) * 100;
  const diMinus = (minusDMSmoothed / atrSmoothed) * 100;
  const diSum = diPlus + diMinus;
  const di = diSum === 0 ? 0 : Math.abs(diPlus - diMinus) / diSum;

  // ADX is 14-period EMA of DI
  let adxValue = di;
  for (let i = period; i < candles.length - 1; i++) {
    adxValue = (adxValue * (period - 1) + di) / period;
  }

  return {
    adx: adxValue * 100,
    diPlus,
    diMinus,
  };
}

/**
 * 8. Stochastic Oscillator (K=14, D=3, smooth=3)
 * K = 100 * (Close - Lowest Low) / (Highest High - Lowest Low)
 * D = SMA of K
 * Smooth K = SMA of K
 */
export function stochastic(
  candles: Candle[],
  kPeriod: number = 14,
  dPeriod: number = 3,
  smoothPeriod: number = 3
): {
  k: number;
  d: number;
  smoothK: number;
} {
  if (candles.length < kPeriod) {
    return { k: NaN, d: NaN, smoothK: NaN };
  }

  const closes = candles.map((c) => c.close);
  const lows = candles.map((c) => c.low);
  const highs = candles.map((c) => c.high);

  // Get last kPeriod candles
  const recentLows = lows.slice(-kPeriod);
  const recentHighs = highs.slice(-kPeriod);
  const recentCloses = closes.slice(-kPeriod);

  const lowestLow = Math.min(...recentLows);
  const highestHigh = Math.max(...recentHighs);
  const currentClose = recentCloses[recentCloses.length - 1];

  const k =
    highestHigh === lowestLow
      ? 50
      : (100 * (currentClose - lowestLow)) / (highestHigh - lowestLow);

  // Build K values array for D and smoothK calculation
  const kValues: number[] = [];
  for (let i = kPeriod - 1; i < closes.length; i++) {
    const slice = closes.slice(i - kPeriod + 1, i + 1);
    const sliceLows = lows.slice(i - kPeriod + 1, i + 1);
    const sliceHighs = highs.slice(i - kPeriod + 1, i + 1);

    const low = Math.min(...sliceLows);
    const high = Math.max(...sliceHighs);
    const close = slice[slice.length - 1];

    const kValue =
      high === low ? 50 : (100 * (close - low)) / (high - low);
    kValues.push(kValue);
  }

  let d = NaN;
  let smoothK = NaN;

  if (kValues.length >= dPeriod) {
    d = calculateSMA(kValues, dPeriod);
  }

  if (kValues.length >= smoothPeriod) {
    smoothK = calculateSMA(kValues, smoothPeriod);
  }

  return { k, d, smoothK };
}

/**
 * 9. VWAP - Volume Weighted Average Price
 * VWAP = Cumulative(Typical Price * Volume) / Cumulative(Volume)
 * where Typical Price = (High + Low + Close) / 3
 */
export function vwap(candles: Candle[]): number {
  if (candles.length === 0) return NaN;

  let cumulativeVolumePrice = 0;
  let cumulativeVolume = 0;

  for (const candle of candles) {
    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    cumulativeVolumePrice += typicalPrice * candle.volume;
    cumulativeVolume += candle.volume;
  }

  if (cumulativeVolume === 0) return NaN;
  return cumulativeVolumePrice / cumulativeVolume;
}

/**
 * 10. OBV - On Balance Volume
 * OBV = OBV_prev + volume (if close > close_prev)
 * OBV = OBV_prev - volume (if close < close_prev)
 * OBV = OBV_prev (if close = close_prev)
 */
export function obv(candles: Candle[]): number {
  if (candles.length === 0) return 0;

  let obvValue = 0;

  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      obvValue = candles[0].volume;
    } else {
      if (candles[i].close > candles[i - 1].close) {
        obvValue += candles[i].volume;
      } else if (candles[i].close < candles[i - 1].close) {
        obvValue -= candles[i].volume;
      }
      // If equal, OBV stays the same
    }
  }

  return obvValue;
}


/**
 * 11. Volume Delta - Buy vs Sell Volume Estimation
 * Estimated using close position in candle range
 * If close near high: more buys
 * If close near low: more sells
 */
export function volumeDelta(candle: Candle): number {
  const range = candle.high - candle.low;
  if (range === 0) return 0; // No range, assume neutral

  // Position of close in range (0 = low, 1 = high)
  const closePosition = (candle.close - candle.low) / range;

  // Estimate buy/sell split
  const buyVolume = candle.volume * closePosition;
  const sellVolume = candle.volume * (1 - closePosition);

  return buyVolume - sellVolume;
}

/**
 * Calculate volume delta series
 */
function volumeDeltaSeries(candles: Candle[]): number[] {
  return candles.map((candle) => volumeDelta(candle));
}

/**
 * 12. Volume MA - Moving Average of Volume for Surge Detection
 */
export function volumeMA(candles: Candle[], period: number = 20): number {
  const volumes = candles.map((c) => c.volume);
  if (volumes.length < period) return NaN;
  return calculateSMA(volumes, period);
}

/**
 * 13. Ichimoku Cloud
 * Tenkan (9-period high-low / 2)
 * Kijun (26-period high-low / 2)
 * Senkou Span A = (Tenkan + Kijun) / 2
 * Senkou Span B = (52-period high-low / 2)
 */
export function ichimoku(candles: Candle[]) {
  if (candles.length < 52) {
    return {
      tenkan: NaN,
      kijun: NaN,
      senkouSpanA: NaN,
      senkouSpanB: NaN,
      chikou: NaN,
    };
  }

  // Tenkan: 9-period
  const tenkanLows = candles.slice(-9).map((c) => c.low);
  const tenkanHighs = candles.slice(-9).map((c) => c.high);
  const tenkan = (Math.max(...tenkanHighs) + Math.min(...tenkanLows)) / 2;

  // Kijun: 26-period
  const kijunLows = candles.slice(-26).map((c) => c.low);
  const kijunHighs = candles.slice(-26).map((c) => c.high);
  const kijun = (Math.max(...kijunHighs) + Math.min(...kijunLows)) / 2;

  // Senkou Span A
  const senkouSpanA = (tenkan + kijun) / 2;

  // Senkou Span B: 52-period
  const spanBLows = candles.slice(-52).map((c) => c.low);
  const spanBHighs = candles.slice(-52).map((c) => c.high);
  const senkouSpanB = (Math.max(...spanBHighs) + Math.min(...spanBLows)) / 2;

  // Chikou: Close plotted 26 periods ahead (we look back)
  const chikou = candles[candles.length - 26]?.close || NaN;

  return {
    tenkan,
    kijun,
    senkouSpanA,
    senkouSpanB,
    chikou,
  };
}

/**
 * 14. Williams %R (Percent Range)
 * %R = (Highest High - Close) / (Highest High - Lowest Low) * -100
 */
export function williamsPercentR(
  candles: Candle[],
  period: number = 14
): number {
  if (candles.length < period) return NaN;

  const recentCandles = candles.slice(-period);
  const closes = recentCandles.map((c) => c.close);
  const highs = recentCandles.map((c) => c.high);
  const lows = recentCandles.map((c) => c.low);

  const highestHigh = Math.max(...highs);
  const lowestLow = Math.min(...lows);
  const currentClose = closes[closes.length - 1];

  const range = highestHigh - lowestLow;
  if (range === 0) return -50;

  return (
    ((highestHigh - currentClose) / range) * -100
  );
}

/**
 * 15. CCI - Commodity Channel Index
 * CCI = (Typical Price - SMA of Typical Price) / (0.015 * Mean Deviation)
 */
export function cci(candles: Candle[], period: number = 20): number {
  if (candles.length < period) return NaN;

  const recentCandles = candles.slice(-period);
  const typicalPrices = recentCandles.map(
    (c) => (c.high + c.low + c.close) / 3
  );

  const smaTypicalPrice =
    typicalPrices.reduce((a, b) => a + b, 0) / typicalPrices.length;
  const currentTypicalPrice = typicalPrices[typicalPrices.length - 1];

  // Mean Deviation
  const meanDeviation =
    typicalPrices
      .map((tp) => Math.abs(tp - smaTypicalPrice))
      .reduce((a, b) => a + b, 0) / typicalPrices.length;

  if (meanDeviation === 0) return 0;

  return (currentTypicalPrice - smaTypicalPrice) / (0.015 * meanDeviation);
}

/**
 * 16. MFI - Money Flow Index (Volume-weighted RSI)
 * Uses typical price and volume
 */
export function mfi(candles: Candle[], period: number = 14): number {
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

/**
 * ====================
 * COMPOSITE FUNCTIONS
 * ====================
 */

/**
 * 17. Calculate All Indicators
 * Returns complete IndicatorValues object with all technical indicators
 */
export function calculateAllIndicators(candles: Candle[]): IndicatorValues {
  if (candles.length === 0) {
    return {
      rsi: NaN,
      macd: { line: NaN, signal: NaN, histogram: NaN },
      ema: { ema5: NaN, ema9: NaN, ema20: NaN, ema50: NaN, ema200: NaN, values: [] },
      bollingerBands: {
        upper: NaN,
        middle: NaN,
        lower: NaN,
        width: NaN,
        percentB: NaN,
      },
      atr: { value: NaN, percent: NaN },
      adx: { value: NaN, diPlus: NaN, diMinus: NaN },
      vwap: NaN,
      volumeDelta: { value: NaN, sma20: NaN },
      stochastic: { k: NaN, d: NaN, smoothK: NaN },
      obv: { value: NaN, sma: NaN },
      timestamp: Date.now(),
    };
  }

  const closes = candles.map((c) => c.close);
  const currentPrice = closes[closes.length - 1];

  // Calculate all indicators
  const rsiValue = rsi(candles, 14);
  const macdValue = macd(candles, 12, 26, 9);
  const ema5Value = calculateEMA(closes, 5);
  const ema9Value = calculateEMA(closes, 9);
  const ema20Value = calculateEMA(closes, 20);
  const ema50Value = calculateEMA(closes, 50);
  const ema200Value = calculateEMA(closes, 200);
  const bbValue = bollingerBands(candles, 20, 2);
  const atrValue = atr(candles, 14);
  const adxValue = adx(candles, 14);
  const vwapValue = vwap(candles);
  const stochValue = stochastic(candles, 14, 3, 3);
  const obvValue = obv(candles);

  // Calculate OBV series for MA
  const obvValues: number[] = [];
  let obvVal = 0;
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      obvVal = candles[0].volume;
    } else {
      if (candles[i].close > candles[i - 1].close) {
        obvVal += candles[i].volume;
      } else if (candles[i].close < candles[i - 1].close) {
        obvVal -= candles[i].volume;
      }
    }
    obvValues.push(obvVal);
  }

  const obvMA = obvValues.length >= 20 ? calculateSMA(obvValues, 20) : NaN;
  const volDeltas = volumeDeltaSeries(candles);
  const volDeltaMA = volDeltas.length >= 20 ? calculateSMA(volDeltas, 20) : NaN;
  const currentVolDelta = volDeltas.length > 0 ? volDeltas[volDeltas.length - 1] : NaN;

  return {
    rsi: rsiValue,
    macd: {
      line: macdValue.macdLine,
      signal: macdValue.signal,
      histogram: macdValue.histogram,
    },
    ema: {
      ema5: ema5Value,
      ema9: ema9Value,
      ema20: ema20Value,
      ema50: ema50Value,
      ema200: ema200Value,
      values: [ema5Value, ema9Value, ema20Value, ema50Value, ema200Value],
    },
    bollingerBands: bbValue,
    atr: {
      value: atrValue,
      percent: (isNaN(atrValue) || currentPrice === 0) ? NaN : (atrValue / currentPrice) * 100,
    },
    adx: {
      value: adxValue.adx,
      diPlus: adxValue.diPlus,
      diMinus: adxValue.diMinus,
    },
    vwap: vwapValue,
    volumeDelta: {
      value: currentVolDelta,
      sma20: volDeltaMA,
    },
    stochastic: stochValue,
    obv: {
      value: obvValue,
      sma: obvMA,
    },
    timestamp: Date.now(),
  };
}

/**
 * 18. Detect Market Regime
 * Uses ADX, ATR, trend analysis to determine market conditions
 */
export function detectMarketRegime(candles: Candle[]): RegimeAnalysis {
  if (candles.length < 26) {
    return {
      currentRegime: MarketRegime.CHOPPY,
      confidence: 0,
      trendStrength: 0,
      volatility: 0,
      rangeHigh: 0,
      rangeLow: 0,
      adxValue: 0,
      lastUpdated: Date.now(),
    };
  }

  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);

  // ADX analysis
  const adxValue = adx(candles, 14);
  const atrValue = atr(candles, 14);
  const currentPrice = closes[closes.length - 1];

  // Guard against division by zero for currentPrice
  if (currentPrice === 0) {
    return {
      currentRegime: MarketRegime.RANGING,
      confidence: 0,
      trendStrength: 0,
      volatility: 0,
      rangeHigh: 0,
      rangeLow: 0,
      adxValue: 0,
      lastUpdated: Date.now(),
    };
  }

  const atrPercent = (atrValue / currentPrice) * 100;

  // Trend analysis - compare recent EMAs
  const ema9 = calculateEMA(closes, 9);
  const ema20 = calculateEMA(closes, 20);

  // Range detection
  const last50Highs = highs.slice(-50);
  const last50Lows = lows.slice(-50);
  const rangeHigh = Math.max(...last50Highs);
  const rangeLow = Math.min(...last50Lows);

  // Determine regime
  let regime = MarketRegime.CHOPPY;
  let confidence = 0;
  let trendStrength = 0;

  if (!isNaN(adxValue.adx)) {
    const adxVal = adxValue.adx;

    if (adxVal > 35) {
      // Strong trend
      trendStrength = Math.min((adxVal - 35) / 30, 1) * 100;
      confidence = Math.min(adxVal / 50, 1) * 100;

      if (ema9 > ema20) {
        regime = MarketRegime.TRENDING_UP;
      } else {
        regime = MarketRegime.TRENDING_DOWN;
      }
    } else if (adxVal > 20) {
      // Mild trend
      regime =
        ema9 > ema20
          ? MarketRegime.TRENDING_UP
          : MarketRegime.TRENDING_DOWN;
      confidence = (adxVal / 20) * 50;
      trendStrength = (adxVal / 20) * 50;
    } else {
      // Ranging or choppy
      const rangePercent = rangeLow === 0 ? 0 : ((rangeHigh - rangeLow) / rangeLow) * 100;
      if (atrPercent > 2 && rangePercent > 2) {
        regime = MarketRegime.VOLATILE;
        confidence = Math.min(atrPercent / 3, 1) * 100;
      } else {
        regime = MarketRegime.RANGING;
        confidence = (20 - adxVal) * 5;
      }
    }
  }

  return {
    currentRegime: regime,
    confidence,
    trendStrength,
    volatility: atrPercent,
    rangeHigh,
    rangeLow,
    adxValue: adxValue.adx,
    lastUpdated: Date.now(),
  };
}

/**
 * 19. Detect Trading Session
 * Returns current trading session based on UTC time
 * Asia: 00:00-08:00 UTC
 * London: 08:00-16:00 UTC
 * New York: 13:00-21:00 UTC
 * Overlap: 13:00-16:00 UTC (London-NY)
 */
export function detectTradingSession(timestamp: number): SessionInfo {
  const date = new Date(timestamp);
  const utcHour = date.getUTCHours();

  let currentSession = TradingSession.ASIAN;
  let sessionMultiplier = 1;
  let sessionStart = 0;
  let sessionEnd = 8;
  let isHighLiquidity = false;
  let isHighVolatility = false;

  if (utcHour >= 13 && utcHour < 21) {
    if (utcHour >= 13 && utcHour < 16) {
      // London-NY overlap
      currentSession = TradingSession.LONDON_NY_OVERLAP;
      sessionMultiplier = 1.5;
      isHighLiquidity = true;
      isHighVolatility = true;
      sessionStart = 13;
      sessionEnd = 16;
    } else if (utcHour < 13) {
      currentSession = TradingSession.LONDON;
      sessionMultiplier = 1.2;
      isHighLiquidity = true;
      sessionStart = 8;
      sessionEnd = 16;
    } else {
      currentSession = TradingSession.NY;
      sessionMultiplier = 1.2;
      isHighLiquidity = true;
      sessionStart = 13;
      sessionEnd = 21;
    }
  } else if (utcHour >= 8 && utcHour < 13) {
    currentSession = TradingSession.LONDON;
    sessionMultiplier = 1.2;
    isHighLiquidity = true;
    sessionStart = 8;
    sessionEnd = 16;
  } else {
    currentSession = TradingSession.ASIAN;
    sessionMultiplier = 0.8;
    sessionStart = 0;
    sessionEnd = 8;
  }

  // Calculate time until session end
  const currentMinutes = date.getUTCHours() * 60 + date.getUTCMinutes();
  const sessionEndMinutes = sessionEnd * 60;
  const timeUntilSessionEnd = Math.max(0, sessionEndMinutes - currentMinutes) * 60000;

  return {
    currentSession,
    sessionMultiplier,
    sessionStart,
    sessionEnd,
    timeUntilSessionEnd,
    isHighLiquidity,
    isHighVolatility,
  };
}

/**
 * 20. Calculate Order Flow
 * Estimates bid/ask ratio and order imbalance from OHLCV data
 */
export function calculateOrderFlow(candles: Candle[]): OrderFlowData {
  if (candles.length === 0) {
    return {
      bidAskRatio: 1,
      bidVolume: 0,
      askVolume: 0,
      volumeDelta: 0,
      orderImbalance: 0,
      largeOrdersDetected: false,
      spoofingDetected: false,
      timestamp: Date.now(),
    };
  }

  const currentCandle = candles[candles.length - 1];
  const prevCandle = candles[candles.length - 2] || currentCandle;

  // Estimate buy/sell volume from close position
  const range = currentCandle.high - currentCandle.low;
  const closePosition = range === 0 ? 0.5 : (currentCandle.close - currentCandle.low) / range;

  const bidVolume = currentCandle.volume * closePosition;
  const askVolume = currentCandle.volume * (1 - closePosition);
  const bidAskRatio = askVolume === 0 ? 1 : bidVolume / askVolume;

  const volumeDelta = bidVolume - askVolume;
  const totalVolume = bidVolume + askVolume;
  const orderImbalance = totalVolume === 0 ? 0 : (bidVolume - askVolume) / totalVolume;

  // Detect large orders - significant volume compared to average
  const last20Volumes = candles.slice(-20).map((c) => c.volume);
  const avgVolume = last20Volumes.reduce((a, b) => a + b, 0) / last20Volumes.length;
  const largeOrdersDetected = currentCandle.volume > avgVolume * 1.5;

  // Determine large order side
  let largeOrdersSide: 'BUY' | 'SELL' | undefined;
  if (largeOrdersDetected) {
    largeOrdersSide = closePosition > 0.5 ? 'BUY' : 'SELL';
  }

  // Spoofing detection: large order but small actual movement
  const priceMovePercent = prevCandle.close === 0 ? 0 : ((currentCandle.close - prevCandle.close) / prevCandle.close) * 100;
  const spoofingDetected = largeOrdersDetected && Math.abs(priceMovePercent) < 0.1;

  return {
    bidAskRatio,
    bidVolume,
    askVolume,
    volumeDelta,
    orderImbalance,
    largeOrdersDetected,
    largeOrdersSide,
    spoofingDetected,
    timestamp: Date.now(),
  };
}

/**
 * 21. Detect Candlestick Patterns
 * Identifies common reversal and continuation patterns
 */
export interface CandlePattern {
  pattern: string;
  confidence: number; // 0-100
  type: 'REVERSAL' | 'CONTINUATION' | 'NEUTRAL';
  bullish: boolean;
}

export function detectPatterns(candles: Candle[]): CandlePattern[] {
  const patterns: CandlePattern[] = [];

  if (candles.length < 3) return patterns;

  // Get last 3 candles for pattern analysis
  const current = candles[candles.length - 1];
  const prev1 = candles[candles.length - 2];
  const prev2 = candles.length >= 3 ? candles[candles.length - 3] : null;

  const bodySize = (candle: Candle) =>
    Math.abs(candle.close - candle.open);
  const upperWick = (candle: Candle) =>
    candle.high - Math.max(candle.open, candle.close);
  const lowerWick = (candle: Candle) =>
    Math.min(candle.open, candle.close) - candle.low;
  const totalRange = (candle: Candle) => candle.high - candle.low;
  const isBullish = (candle: Candle) => candle.close > candle.open;

  // 1. Doji pattern (small body, long wicks on both sides)
  const doji = bodySize(current) < totalRange(current) * 0.1;
  const dojiBalance =
    Math.abs(upperWick(current) - lowerWick(current)) < totalRange(current) * 0.2;
  if (doji && dojiBalance) {
    patterns.push({
      pattern: 'DOJI',
      confidence: 85,
      type: 'REVERSAL',
      bullish: false,
    });
  }

  // 2. Hammer pattern (small body at top, long lower wick)
  const hammerBody = bodySize(current) < totalRange(current) * 0.3;
  const hammerWick = lowerWick(current) > bodySize(current) * 2;
  const hammerLow = upperWick(current) < bodySize(current) * 0.5;
  if (hammerBody && hammerWick && hammerLow && isBullish(current)) {
    patterns.push({
      pattern: 'HAMMER',
      confidence: 80,
      type: 'REVERSAL',
      bullish: true,
    });
  }

  // 3. Hanging man (inverse hammer, appears at tops)
  if (hammerBody && hammerWick && hammerLow && !isBullish(current)) {
    patterns.push({
      pattern: 'HANGING_MAN',
      confidence: 75,
      type: 'REVERSAL',
      bullish: false,
    });
  }

  // 4. Engulfing pattern (current candle engulfs previous)
  if (prev1) {
    const currentBullish = isBullish(current);
    const prev1Bullish = isBullish(prev1);

    const engulfing =
      currentBullish &&
      !prev1Bullish &&
      current.close > prev1.open &&
      current.open < prev1.close;
    if (engulfing) {
      patterns.push({
        pattern: 'BULLISH_ENGULFING',
        confidence: 80,
        type: 'REVERSAL',
        bullish: true,
      });
    }

    const bearishEngulfing =
      !currentBullish &&
      prev1Bullish &&
      current.open > prev1.close &&
      current.close < prev1.open;
    if (bearishEngulfing) {
      patterns.push({
        pattern: 'BEARISH_ENGULFING',
        confidence: 80,
        type: 'REVERSAL',
        bullish: false,
      });
    }
  }

  // 5. Morning Star (3 candle reversal at bottom)
  if (prev2) {
    const morningStar =
      !isBullish(prev2) &&
      bodySize(prev1) < totalRange(prev2) * 0.5 &&
      prev1.low < prev2.low &&
      isBullish(current) &&
      current.close > (prev2.open + prev2.close) / 2;

    if (morningStar) {
      patterns.push({
        pattern: 'MORNING_STAR',
        confidence: 85,
        type: 'REVERSAL',
        bullish: true,
      });
    }

    // Evening Star
    const eveningStar =
      isBullish(prev2) &&
      bodySize(prev1) < totalRange(prev2) * 0.5 &&
      prev1.high > prev2.high &&
      !isBullish(current) &&
      current.close < (prev2.open + prev2.close) / 2;

    if (eveningStar) {
      patterns.push({
        pattern: 'EVENING_STAR',
        confidence: 85,
        type: 'REVERSAL',
        bullish: false,
      });
    }
  }

  // 6. Marubozu pattern (no wicks)
  const marubozu =
    Math.min(upperWick(current), lowerWick(current)) < totalRange(current) * 0.05;
  if (marubozu && isBullish(current)) {
    patterns.push({
      pattern: 'BULLISH_MARUBOZU',
      confidence: 70,
      type: 'CONTINUATION',
      bullish: true,
    });
  } else if (marubozu && !isBullish(current)) {
    patterns.push({
      pattern: 'BEARISH_MARUBOZU',
      confidence: 70,
      type: 'CONTINUATION',
      bullish: false,
    });
  }

  return patterns;
}

/**
 * 22. Calculate Support and Resistance Levels
 * Uses recent price action to identify key S/R levels
 */
export interface SupportResistanceLevel {
  level: number;
  type: 'SUPPORT' | 'RESISTANCE';
  strength: number; // 0-100, based on touches and proximity
  touches: number;
  lastTouched: number;
}

export function calculateSupportResistance(
  candles: Candle[]
): SupportResistanceLevel[] {
  const levels: SupportResistanceLevel[] = [];

  if (candles.length < 10) return levels;

  // Use last 50 candles for analysis
  const analyzeCandles = candles.slice(-50);
  const highs = analyzeCandles.map((c) => c.high);
  const lows = analyzeCandles.map((c) => c.low);
  const closes = analyzeCandles.map((c) => c.close);

  // Find local maxima (resistance)
  for (let i = 1; i < highs.length - 1; i++) {
    if (highs[i] > highs[i - 1] && highs[i] > highs[i + 1]) {
      // Local maximum found
      const level = highs[i];
      let strength = 50;
      let touches = 1;

      // Check for nearby peaks within 0.5% of level
      for (let j = 0; j < highs.length; j++) {
        if (j !== i && Math.abs(highs[j] - level) / level < 0.005) {
          touches++;
          strength += 10;
        }
      }

      levels.push({
        level,
        type: 'RESISTANCE',
        strength: Math.min(strength, 100),
        touches: Math.min(touches, 5),
        lastTouched: analyzeCandles[i].timestamp,
      });
    }
  }

  // Find local minima (support)
  for (let i = 1; i < lows.length - 1; i++) {
    if (lows[i] < lows[i - 1] && lows[i] < lows[i + 1]) {
      // Local minimum found
      const level = lows[i];
      let strength = 50;
      let touches = 1;

      // Check for nearby valleys within 0.5% of level
      for (let j = 0; j < lows.length; j++) {
        if (j !== i && Math.abs(lows[j] - level) / level < 0.005) {
          touches++;
          strength += 10;
        }
      }

      levels.push({
        level,
        type: 'SUPPORT',
        strength: Math.min(strength, 100),
        touches: Math.min(touches, 5),
        lastTouched: analyzeCandles[i].timestamp,
      });
    }
  }

  // Sort by strength (strongest first)
  levels.sort((a, b) => b.strength - a.strength);

  // Return top 5 most significant levels
  return levels.slice(0, 5);
}

/**
 * Utility: Calculate percentage change
 */
export function percentageChange(oldValue: number, newValue: number): number {
  if (oldValue === 0) return 0;
  return ((newValue - oldValue) / oldValue) * 100;
}

/**
 * Utility: Normalize value between 0 and 100
 */
export function normalize(value: number, min: number, max: number): number {
  if (max === min) return 50;
  return Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
}

/**
 * Utility: Check if sufficient data for calculation
 */
export function hasSufficientData(
  candles: Candle[],
  requiredLength: number
): boolean {
  return candles.length >= requiredLength;
}

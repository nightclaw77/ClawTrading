/**
 * Default Configuration for BTC 5m Scalping Trading Bot
 * Production-ready, optimized parameters for scalping strategy
 */

import {
  BotConfig,
  TradingSession,
  TradingAsset,
} from './index';

/**
 * Default bot configuration optimized for BTC 5m scalping
 * All values are tuned for high-frequency, low-risk trading
 */
export const DEFAULT_BOT_CONFIG: BotConfig = {
  // General Settings
  enabled: true,
  symbol: 'BTCUSDT',
  primaryTimeframe: '15m',
  secondaryTimeframe: '5m',
  assets: [TradingAsset.BTC, TradingAsset.SOL],
  maxLookbackCandles: 200,

  // Technical Indicators Configuration
  indicators: {
    // EMA periods optimized for 5m timeframe
    emaLengths: [5, 9, 20, 50, 200],

    // RSI for overbought/oversold detection
    rsi: {
      period: 14,
      overbought: 70,
      oversold: 30,
    },

    // MACD for momentum and trend confirmation
    macd: {
      fastLength: 12,
      slowLength: 26,
      signalLength: 9,
    },

    // Bollinger Bands for volatility and support/resistance
    bollingerBands: {
      period: 20,
      stdDev: 2,
    },

    // ATR for dynamic stop losses and volatility adjustment
    atr: {
      period: 14,
    },

    // ADX for trend strength confirmation
    adx: {
      period: 14,
    },

    // Stochastic for momentum divergence and pullbacks
    stochastic: {
      kPeriod: 14,
      dPeriod: 3,
      smoothing: 3,
    },

    // Volume Weighted Average Price for trend validation
    vwap: {
      enabled: true,
    },

    // On-Balance Volume for volume trend analysis
    obv: {
      enabled: true,
      maPeriod: 20,
    },
  },

  // Risk Management Settings - CRITICAL for capital preservation
  risk: {
    // Maximum position size per trade (percentage of account)
    // 2% per trade = max 50 trades before full account exposure
    maxPositionSizePercent: 2,

    // Maximum number of concurrent open positions
    // Conservative limit to prevent over-leverage
    maxOpenPositions: 3,

    // Daily loss limit - stop trading after this loss percentage
    // Protects against consecutive losing streaks
    dailyLossLimitPercent: 3,

    // Maximum drawdown percentage before emergency stop
    // Prevents catastrophic account damage
    maxDrawdownPercent: 8,

    // Maximum trades per hour to prevent over-trading
    // 8 trades/hour = 1 trade every 7.5 minutes (reasonable for 5m)
    maxTradesPerHour: 8,

    // Minimum confidence threshold for trade entry (0-100)
    // Only take trades with 65%+ signal confidence
    minConfidenceThreshold: 65,

    // Default stop loss percentage
    // 0.2% = 20 pips on BTC (tight for scalping)
    stopLossPercent: 0.2,

    // Use ATR-based dynamic stop loss instead of fixed percentage
    stopLossUseAtr: true,

    // ATR multiplier for dynamic stop loss calculation
    // e.g., 1.5 * ATR(14) = dynamic stop distance
    atrMultiplier: 1.5,
  },

  // Take Profit Configuration - Partial exit strategy for risk management
  takeProfitLevels: {
    levels: [
      {
        // First take profit at 0.3% gain (30 pips on BTC)
        // Close 50% of position to lock in quick wins
        profitPercent: 0.3,
        positionReduction: 0.5,
      },
      {
        // Second take profit at 0.5% gain (50 pips)
        // Close another 30% to reduce exposure
        profitPercent: 0.5,
        positionReduction: 0.3,
      },
      {
        // Final take profit at 1.0% gain (100 pips)
        // Close remaining 20% position for maximum profit potential
        profitPercent: 1.0,
        positionReduction: 0.2,
      },
    ],
  },

  // Trailing Stop Configuration - Capture extended moves while protecting gains
  trailingStop: {
    // Enable trailing stops after targets are hit
    enabled: true,

    // Activate trailing stop after 0.3% profit
    // Protects wins while staying in profitable moves
    activationPercent: 0.3,

    // Trailing distance of 0.15% (15 pips)
    // Tighter distance for scalping, more aggressive
    trailingDistance: 0.15,
  },

  // Trading Session Configuration - Adjust strategy by market session
  sessions: {
    [TradingSession.ASIAN]: {
      enabled: true,
      // Reduce position size during Asian session (lower liquidity)
      multiplier: 0.5,
      startHour: 0,
      startMinute: 0,
      endHour: 8,
      endMinute: 0,
    },
    [TradingSession.LONDON]: {
      enabled: true,
      // Full position size during London session
      multiplier: 1.0,
      startHour: 8,
      startMinute: 0,
      endHour: 17,
      endMinute: 0,
    },
    [TradingSession.NY]: {
      enabled: true,
      // Full position size during NY session
      multiplier: 1.0,
      startHour: 13,
      startMinute: 30,
      endHour: 21,
      endMinute: 0,
    },
    [TradingSession.LONDON_NY_OVERLAP]: {
      enabled: true,
      // Increase position size during overlap (highest liquidity and volatility)
      multiplier: 1.5,
      startHour: 13,
      startMinute: 30,
      endHour: 17,
      endMinute: 0,
    },
  },

  // Volume and Liquidity Requirements
  volume: {
    // Minimum volume ratio compared to 20-candle moving average
    // 1.3x = only trade if volume is 30% above average
    // Ensures adequate liquidity for clean fills
    minRatioVs20MA: 1.3,
    enabled: true,
  },

  // General Trading Conditions
  trading: {
    // Minimum risk/reward ratio to take a trade
    // 1.5 = must risk $1 to make $1.50 (positive expectancy)
    minRiskRewardRatio: 1.5,

    // Maximum acceptable spread in percentage
    // Prevents trading during illiquid conditions
    maxSpread: 0.05,

    // Minimum volume in base currency to trade
    minVolume: 10,

    // Trading fee rate (0.1% = 0.001)
    // Binance standard maker/taker fee
    feeRate: 0.001,
  },

  // Polymarket Configuration for options/derivatives trading
  polymarket: {
    enabled: false,
    apiUrl: 'https://gamma-api.polymarket.com',
    // Signature type for Magic wallet authentication
    // 1 = POLY_PROXY (Magic wallet integration)
    signatureType: 1,
    // Max position size on Polymarket (independent from spot)
    maxPositionSize: 500,
  },

  // Strategy Weighting for Ensemble Learning
  strategyWeights: {
    'EMA_Crossover': 1.0,
    'RSI_Overbought_Oversold': 0.8,
    'MACD_Signal_Cross': 0.9,
    'Bollinger_Bands_Bounce': 0.7,
    'Support_Resistance': 0.6,
    'Volume_Profile': 0.5,
    'Order_Flow': 0.8,
  },

  // Logging Configuration for monitoring and debugging
  logging: {
    // Log level: DEBUG includes all logs, ERROR only errors
    level: 'INFO',
    // Log every trade entry/exit with full details
    logTrades: true,
    // Log signal generation for analysis
    logSignals: true,
    // Log indicator values for debugging (verbose)
    logIndicators: false,
  },
};

/**
 * Aggressive Configuration - Higher risk for higher rewards
 * Use with caution and proper monitoring
 */
export const AGGRESSIVE_CONFIG: BotConfig = {
  ...DEFAULT_BOT_CONFIG,
  risk: {
    ...DEFAULT_BOT_CONFIG.risk,
    maxPositionSizePercent: 5,
    maxOpenPositions: 5,
    dailyLossLimitPercent: 5,
    maxDrawdownPercent: 15,
    maxTradesPerHour: 15,
    minConfidenceThreshold: 55,
    stopLossPercent: 0.3,
    atrMultiplier: 1.0,
  },
  sessions: {
    ...DEFAULT_BOT_CONFIG.sessions,
    [TradingSession.LONDON_NY_OVERLAP]: {
      ...DEFAULT_BOT_CONFIG.sessions[TradingSession.LONDON_NY_OVERLAP],
      multiplier: 2.0,
    },
  },
};

/**
 * Conservative Configuration - Lower risk for capital preservation
 * Ideal for small account or learning phase
 */
export const CONSERVATIVE_CONFIG: BotConfig = {
  ...DEFAULT_BOT_CONFIG,
  risk: {
    ...DEFAULT_BOT_CONFIG.risk,
    maxPositionSizePercent: 0.5,
    maxOpenPositions: 1,
    dailyLossLimitPercent: 1,
    maxDrawdownPercent: 5,
    maxTradesPerHour: 4,
    minConfidenceThreshold: 75,
    stopLossPercent: 0.15,
    atrMultiplier: 2.0,
  },
  sessions: {
    ...DEFAULT_BOT_CONFIG.sessions,
    [TradingSession.ASIAN]: {
      ...DEFAULT_BOT_CONFIG.sessions[TradingSession.ASIAN],
      enabled: false, // Skip Asian session entirely
    },
    [TradingSession.LONDON_NY_OVERLAP]: {
      ...DEFAULT_BOT_CONFIG.sessions[TradingSession.LONDON_NY_OVERLAP],
      multiplier: 1.0,
    },
  },
};

/**
 * Scalping-Focused Configuration - Ultra-tight stops and frequent trades
 * Designed for advanced traders with excellent execution
 */
export const SCALPING_CONFIG: BotConfig = {
  ...DEFAULT_BOT_CONFIG,
  risk: {
    ...DEFAULT_BOT_CONFIG.risk,
    maxPositionSizePercent: 3,
    maxOpenPositions: 5,
    dailyLossLimitPercent: 2,
    maxDrawdownPercent: 6,
    maxTradesPerHour: 20, // Aggressive scalping
    minConfidenceThreshold: 60,
    stopLossPercent: 0.1, // Ultra-tight stops
    atrMultiplier: 0.8,
  },
  takeProfitLevels: {
    levels: [
      {
        // Very tight first target
        profitPercent: 0.15,
        positionReduction: 0.4,
      },
      {
        profitPercent: 0.25,
        positionReduction: 0.35,
      },
      {
        profitPercent: 0.5,
        positionReduction: 0.25,
      },
    ],
  },
  trailingStop: {
    enabled: true,
    activationPercent: 0.15, // Activate earlier on scalps
    trailingDistance: 0.08, // Very tight trailing
  },
};

/**
 * Trend-Following Configuration - Larger moves, bigger position sizing
 * For swing trading bias within 5m timeframe
 */
export const TREND_FOLLOWING_CONFIG: BotConfig = {
  ...DEFAULT_BOT_CONFIG,
  risk: {
    ...DEFAULT_BOT_CONFIG.risk,
    maxPositionSizePercent: 2.5,
    maxOpenPositions: 3,
    dailyLossLimitPercent: 4,
    maxDrawdownPercent: 10,
    maxTradesPerHour: 4, // Fewer, larger moves
    minConfidenceThreshold: 70,
    stopLossPercent: 0.3,
    atrMultiplier: 2.0,
  },
  takeProfitLevels: {
    levels: [
      {
        profitPercent: 0.5,
        positionReduction: 0.33,
      },
      {
        profitPercent: 1.0,
        positionReduction: 0.33,
      },
      {
        profitPercent: 2.0,
        positionReduction: 0.34,
      },
    ],
  },
  trailingStop: {
    enabled: true,
    activationPercent: 0.5,
    trailingDistance: 0.3,
  },
};

/**
 * Paper Trading Configuration - For backtesting and simulated trading
 * Uses real parameters but with safety flags
 */
export const PAPER_TRADING_CONFIG: BotConfig = {
  ...DEFAULT_BOT_CONFIG,
  risk: {
    ...DEFAULT_BOT_CONFIG.risk,
    maxPositionSizePercent: 5, // More aggressive for paper trading
    maxDrawdownPercent: 20,
  },
};

/**
 * Type-safe configuration selector
 */
export type ConfigPreset =
  | 'DEFAULT'
  | 'AGGRESSIVE'
  | 'CONSERVATIVE'
  | 'SCALPING'
  | 'TREND_FOLLOWING'
  | 'PAPER_TRADING';

/**
 * Get configuration preset by name
 */
export function getConfigPreset(preset: ConfigPreset): BotConfig {
  const presets: Record<ConfigPreset, BotConfig> = {
    DEFAULT: DEFAULT_BOT_CONFIG,
    AGGRESSIVE: AGGRESSIVE_CONFIG,
    CONSERVATIVE: CONSERVATIVE_CONFIG,
    SCALPING: SCALPING_CONFIG,
    TREND_FOLLOWING: TREND_FOLLOWING_CONFIG,
    PAPER_TRADING: PAPER_TRADING_CONFIG,
  };

  return presets[preset];
}

/**
 * Merge custom configuration with defaults
 * Allows partial config overrides while maintaining type safety
 */
export function mergeConfig(
  baseConfig: BotConfig,
  overrides: Partial<BotConfig>
): BotConfig {
  return {
    ...baseConfig,
    ...overrides,
    indicators: {
      ...baseConfig.indicators,
      ...overrides.indicators,
    },
    risk: {
      ...baseConfig.risk,
      ...overrides.risk,
    },
    takeProfitLevels: {
      ...baseConfig.takeProfitLevels,
      ...overrides.takeProfitLevels,
    },
    trailingStop: {
      ...baseConfig.trailingStop,
      ...overrides.trailingStop,
    },
    sessions: {
      ...baseConfig.sessions,
      ...overrides.sessions,
    },
    volume: {
      ...baseConfig.volume,
      ...overrides.volume,
    },
    trading: {
      ...baseConfig.trading,
      ...overrides.trading,
    },
    polymarket: {
      ...baseConfig.polymarket,
      ...overrides.polymarket,
    },
    logging: {
      ...baseConfig.logging,
      ...overrides.logging,
    },
    strategyWeights: {
      ...baseConfig.strategyWeights,
      ...overrides.strategyWeights,
    },
  };
}

/**
 * Validate configuration parameters
 * Returns array of validation errors, empty if valid
 */
export function validateConfig(config: BotConfig): string[] {
  const errors: string[] = [];

  // Risk validation
  if (config.risk.maxPositionSizePercent <= 0 || config.risk.maxPositionSizePercent > 10) {
    errors.push('maxPositionSizePercent must be between 0 and 10');
  }

  if (config.risk.dailyLossLimitPercent <= 0 || config.risk.dailyLossLimitPercent > 10) {
    errors.push('dailyLossLimitPercent must be between 0 and 10');
  }

  if (config.risk.minConfidenceThreshold < 0 || config.risk.minConfidenceThreshold > 100) {
    errors.push('minConfidenceThreshold must be between 0 and 100');
  }

  if (config.risk.stopLossPercent <= 0 || config.risk.stopLossPercent > 1) {
    errors.push('stopLossPercent must be between 0 and 1');
  }

  // Indicator validation
  if (config.indicators.rsi.period < 1) {
    errors.push('RSI period must be at least 1');
  }

  if (config.indicators.rsi.overbought <= config.indicators.rsi.oversold) {
    errors.push('RSI overbought must be greater than oversold');
  }

  if (config.indicators.bollingerBands.period < 1) {
    errors.push('Bollinger Bands period must be at least 1');
  }

  if (config.indicators.bollingerBands.stdDev <= 0) {
    errors.push('Bollinger Bands stdDev must be positive');
  }

  // Trading validation
  if (config.trading.feeRate < 0 || config.trading.feeRate > 0.01) {
    errors.push('feeRate must be between 0 and 0.01');
  }

  if (config.trading.minRiskRewardRatio <= 0) {
    errors.push('minRiskRewardRatio must be positive');
  }

  // Take profit validation
  let previousProfitPercent = 0;
  for (let i = 0; i < config.takeProfitLevels.levels.length; i++) {
    const level = config.takeProfitLevels.levels[i];
    if (level.profitPercent <= previousProfitPercent) {
      errors.push(`Take profit level ${i} must be greater than previous level`);
    }
    if (level.positionReduction <= 0 || level.positionReduction > 1) {
      errors.push(`Take profit level ${i} positionReduction must be between 0 and 1`);
    }
    previousProfitPercent = level.profitPercent;
  }

  return errors;
}

/**
 * Get safe risk parameters based on account size
 * Scales parameters automatically for different account sizes
 */
export function getScaledConfig(
  baseConfig: BotConfig,
  accountSize: number
): BotConfig {
  let scaleFactor = 1;

  if (accountSize < 1000) {
    scaleFactor = 0.5; // Micro account
  } else if (accountSize < 5000) {
    scaleFactor = 0.75; // Small account
  } else if (accountSize > 100000) {
    scaleFactor = 1.5; // Large account (increase size)
  }

  return mergeConfig(baseConfig, {
    risk: {
      ...baseConfig.risk,
      maxPositionSizePercent: Math.min(
        baseConfig.risk.maxPositionSizePercent * scaleFactor,
        10
      ),
      maxOpenPositions: Math.max(
        Math.floor(baseConfig.risk.maxOpenPositions * scaleFactor),
        1
      ),
    },
  });
}

export default DEFAULT_BOT_CONFIG;

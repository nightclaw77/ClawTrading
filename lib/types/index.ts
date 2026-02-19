/**
 * ClawTrading - Revolutionary Polymarket Trading Bot
 * Multi-asset (BTC + SOL), multi-timeframe (15m primary, 5m on solid signals)
 * Micro-movement arbitrage + technical analysis + AI learning
 */

/**
 * Market candle data (OHLCV with timestamp)
 */
export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  vwap?: number;
  quoteAssetVolume?: number;
  asset?: 'BTC' | 'SOL';
  timeframe?: '5m' | '15m' | '1h' | '4h';
}

/**
 * Real-time price update
 */
export interface PriceUpdate {
  asset: 'BTC' | 'SOL';
  price: number;
  timestamp: number;
  source: 'binance' | 'polymarket' | 'chainlink';
  volume24h?: number;
  changePercent24h?: number;
}

/**
 * Daily trading statistics
 */
export interface DailyStats {
  date: string;
  tradesOpened: number;
  tradesClosed: number;
  winRate: number;
  totalPnl: number;
  totalPnlPercent: number;
  largestWin: number;
  largestLoss: number;
  avgWinSize: number;
  avgLossSize: number;
  profitFactor: number;
  maxDrawdown: number;
  peakBalance: number;
  endingBalance: number;
}

/**
 * Signal directions for trading decisions
 */
export enum SignalDirection {
  LONG = 'LONG',
  SHORT = 'SHORT',
  NEUTRAL = 'NEUTRAL',
}

/**
 * Trading signal with confidence and reasoning
 */
export interface Signal {
  direction: SignalDirection;
  confidence: number; // 0-100
  reasons: string[];
  timestamp: number;
  indicators: IndicatorSnapshot;
  strength: 'WEAK' | 'MODERATE' | 'STRONG';
  entryPrice?: number;
  riskRewardRatio?: number;
}

/**
 * Snapshot of all indicator values at signal time
 */
export interface IndicatorSnapshot {
  rsi: number;
  macdLine: number;
  macdSignal: number;
  macdHistogram: number;
  emaValues: number[]; // [5, 9, 20, 50, 200]
  bollingerBands: {
    upper: number;
    middle: number;
    lower: number;
    width: number;
  };
  atr: number;
  atrPercent: number;
  adx: number;
  diPlus: number;
  diMinus: number;
  vwap: number;
  volumeDelta: number;
  stochastic: {
    k: number;
    d: number;
    smoothK: number;
  };
  obv: number;
  obvMA: number;
  timestamp: number;
}

/**
 * Market regime states
 */
export enum MarketRegime {
  TRENDING_UP = 'TRENDING_UP',
  TRENDING_DOWN = 'TRENDING_DOWN',
  RANGING = 'RANGING',
  VOLATILE = 'VOLATILE',
  CHOPPY = 'CHOPPY',
}

/**
 * Trading session periods
 */
export enum TradingSession {
  ASIAN = 'ASIAN',
  LONDON = 'LONDON',
  NY = 'NY',
  LONDON_NY_OVERLAP = 'LONDON_NY_OVERLAP',
}

/**
 * Open position with current metrics
 */
export interface Position {
  id: string;
  entryPrice: number;
  entryTime: number;
  quantity: number;
  direction: 'LONG' | 'SHORT';
  currentPrice: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
  initialStopLoss: number;
  currentStopLoss: number;
  stopLoss: number; // Alias for currentStopLoss
  trailingStopPrice?: number;
  trailingStopActive: boolean;
  trailingStop?: {
    activated: boolean;
    distance: number;
    highestPrice?: number;
  };
  takeProfitLevels: TakeProfitLevel[];
  marketRegime: MarketRegime;
  tradingSession: TradingSession;
  entrySignalStrength: number; // 0-100
  riskRewardRatio: number;
  maxWinPercent?: number;
  maxLossPercent?: number;
  durationMinutes: number;
  status: 'OPEN' | 'CLOSING' | 'CLOSED';
  asset?: 'BTC' | 'SOL';
}

/**
 * Take profit level with partial exit
 */
export interface TakeProfitLevel {
  level?: number; // Take profit level number (1, 2, 3)
  price?: number; // Alias for priceLevel
  priceLevel: number;
  profitPercent: number;
  positionReduction: number; // percentage to close at this level
  percentOfPosition?: number; // Alias for positionReduction
  active: boolean;
  triggered: boolean;
  closed?: boolean;
  triggeredTime?: number;
  closingPrice?: number;
  closingTime?: number;
}

/**
 * Completed trade record
 */
export interface Trade {
  id: string;
  entryPrice: number;
  exitPrice: number;
  entryTime: number;
  exitTime: number;
  quantity: number;
  direction: 'LONG' | 'SHORT';
  pnl: number;
  pnlPercent: number;
  durationMinutes: number;
  durationSeconds: number;
  strategyUsed: string;
  marketRegime: MarketRegime;
  tradingSession: TradingSession;
  entryReason: string;
  exitReason: string;
  maxWinDuringTrade: number;
  maxLossDuringTrade: number;
  riskRewardRatioAchieved: number;
  winTrade: boolean;
  fees: number;
  signals: {
    entry: Signal;
    exit: Signal;
  };
  indicators: {
    entry: IndicatorSnapshot;
    exit: IndicatorSnapshot;
  };
  notes?: string;
}

/**
 * Market regime detection
 */
export interface RegimeAnalysis {
  currentRegime: MarketRegime;
  confidence: number; // 0-100
  trendStrength: number; // 0-100
  volatility: number;
  rangeHigh: number;
  rangeLow: number;
  adxValue: number;
  lastUpdated: number;
}

/**
 * Risk management profile
 */
export interface RiskProfile {
  maxPositionSizePercent: number; // % of account
  maxOpenPositions: number;
  dailyLossLimitPercent: number;
  maxDrawdownPercent: number;
  maxTradesPerHour: number;
  minConfidenceThreshold: number; // 0-100
  stopLossPercent: number;
  defaultTrailingStopActivationPercent: number;
  defaultTrailingStopDistancePercent: number;
  maxRiskPerTrade: number; // percentage of account
  riskRewardMinimum: number; // e.g., 1.5 for 1:1.5
}

/**
 * Strategy weighting for adaptive trading
 */
export interface StrategyWeight {
  strategyName: string;
  currentWeight: number; // 0-1
  recentWinRate: number; // 0-1
  tradesToday: number;
  winsToday: number;
  pnlToday: number;
  lastTradedTime: number;
  performance: {
    winRate: number;
    avgWin: number;
    avgLoss: number;
    profitFactor: number;
    sharpeRatio: number;
  };
}

/**
 * Order flow and market microstructure data
 */
export interface OrderFlowData {
  bidAskRatio: number;
  bidVolume: number;
  askVolume: number;
  volumeDelta: number; // buy vol - sell vol
  orderImbalance: number; // -1 to 1, where 1 is all buys
  largeOrdersDetected: boolean;
  largeOrdersSide?: 'BUY' | 'SELL';
  spoofingDetected: boolean;
  timestamp: number;
}

/**
 * Learning record from completed trades
 */
export interface LearningRecord {
  id: string;
  timestamp: number;
  tradeId: string;
  outcome: 'WIN' | 'LOSS' | 'BREAKEVEN';
  profit: number;
  lessons: string[];
  patterns: string[]; // patterns that led to this outcome
  improvements: string[]; // suggested adjustments
  confidence: number; // how confident in lessons learned
  contextFactors: {
    volatilityLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    marketTrend: MarketRegime;
    timeOfDay: TradingSession;
    volumeLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  };
}

/**
 * Pattern detection and tracking
 */
export interface PatternRecord {
  id: string;
  patternName: string;
  patternType: 'TECHNICAL' | 'VOLUME' | 'PRICE_ACTION' | 'ORDER_FLOW';
  detectionTime: number;
  successRate: number; // 0-1
  occurrences: number;
  winningOccurrences: number;
  losingOccurrences: number;
  averageWin: number;
  averageLoss: number;
  lastSeenTime: number;
  description: string;
  confidence: number; // 0-100
  active: boolean;
}

/**
 * Polymarket order structure
 */
export interface PolymarketOrder {
  id?: string;
  tokenId: string;
  isMaker: boolean;
  side: 'BUY' | 'SELL';
  price: number;
  amount: number;
  timestamp?: number;
  signature?: string;
  nonce?: string;
}

/**
 * Polymarket market information
 */
export interface PolymarketMarket {
  id: string;
  question: string;
  outcomeTokens: string[];
  tokens: string[];
  resolved: boolean;
  resolutionTime?: number;
  outcomes?: string[];
  liquidity?: number;
  volume24h?: number;
  midPrice?: number;
}

/**
 * Polymarket position tracking
 */
export interface PolymarketPosition {
  marketId: string;
  tokenId: string;
  balance: number;
  averageCost: number;
  unrealizedPnL: number;
  realized: number;
}

/**
 * All indicator values for analysis
 */
export interface IndicatorValues {
  rsi: number;
  macd: {
    line: number;
    signal: number;
    histogram: number;
  };
  ema: {
    ema5: number;
    ema9: number;
    ema20: number;
    ema50: number;
    ema200: number;
    values: number[]; // [5, 9, 20, 50, 200] for easy access
  };
  bollingerBands: {
    upper: number;
    middle: number;
    lower: number;
    width: number;
    percentB: number;
  };
  atr: {
    value: number;
    percent: number;
  };
  adx: {
    value: number;
    diPlus: number;
    diMinus: number;
  };
  vwap: number;
  volumeDelta: {
    value: number;
    sma20: number;
  };
  stochastic: {
    k: number;
    d: number;
    smoothK: number;
  };
  obv: {
    value: number;
    sma: number;
  };
  timestamp: number;
}

/**
 * Trading session information
 */
export interface SessionInfo {
  currentSession: TradingSession;
  sessionMultiplier: number;
  sessionStart: number;
  sessionEnd: number;
  timeUntilSessionEnd: number;
  isHighLiquidity: boolean;
  isHighVolatility: boolean;
}

/**
 * Dashboard data for UI consumption
 */
export interface DashboardData {
  // Account info
  accountBalance: number;
  availableBalance: number;
  totalPnL: number;
  totalPnLPercent: number;
  dailyPnL: number;
  dailyPnLPercent: number;
  dailyTradesCount: number;
  dailyWinsCount: number;
  dailyWinRate: number;

  // Current positions
  openPositions: Position[];
  totalOpenPositionCount: number;
  totalExposure: number;
  totalExposurePercent: number;

  // Recent trades
  recentTrades: Trade[];
  allTimeStats: {
    totalTrades: number;
    totalWins: number;
    totalLosses: number;
    winRate: number;
    averageWin: number;
    averageLoss: number;
    profitFactor: number;
    largestWin: number;
    largestLoss: number;
    averageTradeDuration: number;
    sharpeRatio: number;
  };

  // Current market state
  currentPrice: number;
  marketRegime: RegimeAnalysis;
  currentSession: SessionInfo;
  recentCandles: Candle[];
  latestIndicators: IndicatorValues;

  // Active signal
  currentSignal?: Signal;
  lastSignal?: Signal;

  // Risk metrics
  maxDailyDrawdown: number;
  currentDrawdown: number;
  currentDrawdownPercent: number;
  dailyLossRemaining: number;
  maxPositionSizeAvailable: number;

  // Bot status
  botStatus: 'RUNNING' | 'PAUSED' | 'STOPPED' | 'ERROR';
  lastUpdate: number;
  uptime: number;
  connectionStatus: 'CONNECTED' | 'DISCONNECTED' | 'ERROR';

  // Strategy performance
  strategyWeights: StrategyWeight[];
  topPerformingStrategy: string;

  // Alerts
  alerts: Alert[];
  warnings: Warning[];
}

/**
 * Alert for important events
 */
export interface Alert {
  id: string;
  timestamp: number;
  level: 'INFO' | 'WARNING' | 'CRITICAL';
  title: string;
  message: string;
  actionRequired: boolean;
  dismissible: boolean;
}

/**
 * Warning for potential issues
 */
export interface Warning {
  id: string;
  timestamp: number;
  type: 'DRAWDOWN' | 'LOSS_LIMIT' | 'EXPOSURE' | 'VOLATILITY' | 'CONNECTION';
  message: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  autoResolves: boolean;
}

/**
 * Bot configuration - all tunable parameters
 */
export interface BotConfig {
  // General
  enabled: boolean;
  symbol: string;
  primaryTimeframe: '15m'; // 15m is primary for BTC and SOL
  secondaryTimeframe: '5m'; // 5m only on solid signals
  assets: TradingAsset[]; // BTC and SOL
  maxLookbackCandles: number;

  // Indicators
  indicators: {
    emaLengths: number[];
    rsi: {
      period: number;
      overbought: number;
      oversold: number;
    };
    macd: {
      fastLength: number;
      slowLength: number;
      signalLength: number;
    };
    bollingerBands: {
      period: number;
      stdDev: number;
    };
    atr: {
      period: number;
    };
    adx: {
      period: number;
    };
    stochastic: {
      kPeriod: number;
      dPeriod: number;
      smoothing: number;
    };
    vwap: {
      enabled: boolean;
    };
    obv: {
      enabled: boolean;
      maPeriod: number;
    };
  };

  // Risk Management
  risk: {
    maxPositionSizePercent: number;
    maxOpenPositions: number;
    dailyLossLimitPercent: number;
    maxDrawdownPercent: number;
    maxTradesPerHour: number;
    minConfidenceThreshold: number;
    stopLossPercent: number;
    stopLossUseAtr: boolean;
    atrMultiplier: number;
  };

  // Take Profit
  takeProfitLevels: {
    levels: Array<{
      profitPercent: number;
      positionReduction: number;
    }>;
  };

  // Trailing Stop
  trailingStop: {
    enabled: boolean;
    activationPercent: number;
    trailingDistance: number;
  };

  // Session Configuration
  sessions: {
    [key in TradingSession]: {
      enabled: boolean;
      multiplier: number;
      startHour: number;
      startMinute: number;
      endHour: number;
      endMinute: number;
    };
  };

  // Volume and liquidity
  volume: {
    minRatioVs20MA: number;
    enabled: boolean;
  };

  // Trading conditions
  trading: {
    minRiskRewardRatio: number;
    maxSpread: number;
    minVolume: number;
    feeRate: number;
  };

  // Polymarket specific
  polymarket: {
    enabled: boolean;
    apiUrl: string;
    signatureType: number; // 1 = POLY_PROXY (Magic wallet)
    maxPositionSize: number;
  };

  // Strategy weights
  strategyWeights: {
    [strategyName: string]: number;
  };

  // Logging and debugging
  logging: {
    level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
    logTrades: boolean;
    logSignals: boolean;
    logIndicators: boolean;
  };
}

/**
 * Current bot runtime state
 */
export interface BotState {
  // Status
  status: 'RUNNING' | 'PAUSED' | 'STOPPED' | 'ERROR';
  startTime: number;
  lastUpdate: number;
  error?: string;

  // Account state
  balance: number;
  equity: number;
  unrealizedPnL: number;
  realizedPnL: number;
  dailyPnL: number;
  dayStartBalance: number;
  dayStartTime: number;

  // Positions
  openPositions: Position[];
  closedTodayCount: number;
  wins: number;
  losses: number;

  // Market state
  currentPrice: number;
  lastCandle: Candle;
  allCandles: Candle[];
  currentRegime: MarketRegime;
  currentSession: TradingSession;

  // Indicators
  indicators: IndicatorValues;

  // Signals
  lastSignal?: Signal;
  signalCount: number;
  entriesCount: number;
  exitsCount: number;

  // Risk tracking
  dailyLossUsed: number;
  maxDrawdown: number;
  tradesThisHour: number;

  // Learning
  learningRecords: LearningRecord[];
  patterns: PatternRecord[];

  // Connection
  isConnected: boolean;
  lastConnectionCheck: number;

  // Config
  activeConfig: BotConfig;

  // Metrics
  metrics: {
    avgWin: number;
    avgLoss: number;
    winRate: number;
    profitFactor: number;
    sharpeRatio: number;
    drawdownRatio: number;
  };
}

/**
 * Historical trade statistics for analysis
 */
export interface TradeStatistics {
  totalTrades: number;
  totalWins: number;
  totalLosses: number;
  winRate: number;
  averageWin: number;
  averageLoss: number;
  largestWin: number;
  largestLoss: number;
  profitFactor: number; // gross profit / gross loss
  expectancy: number; // average win per trade
  sharpeRatio: number;
  sortinoDrawdownRatio: number;
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
  averageTradeDuration: number;
  totalTradingTime: number;
  totalPnL: number;
  ROI: number;
  tradingSessionStats: {
    [key in TradingSession]: {
      trades: number;
      wins: number;
      winRate: number;
      avgPnL: number;
    };
  };
  regimeStats: {
    [key in MarketRegime]: {
      trades: number;
      wins: number;
      winRate: number;
      avgPnL: number;
    };
  };
}

/**
 * Webhook payload for external notifications
 */
export interface WebhookPayload {
  eventType: 'SIGNAL' | 'TRADE_OPENED' | 'TRADE_CLOSED' | 'ALERT' | 'ERROR';
  timestamp: number;
  data: Record<string, unknown>;
  botId?: string;
}

/**
 * API request/response types
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: number;
}

/**
 * Backtest result for strategy evaluation
 */
export interface BacktestResult {
  strategyName: string;
  startDate: number;
  endDate: number;
  totalTrades: number;
  winRate: number;
  profitFactor: number;
  totalReturn: number;
  maxDrawdown: number;
  sharpeRatio: number;
  trades: Trade[];
  equity: number[];
  timestamps: number[];
}

/**
 * Order type for exchange operations
 */
export enum OrderType {
  MARKET = 'MARKET',
  LIMIT = 'LIMIT',
  STOP = 'STOP',
  STOP_LIMIT = 'STOP_LIMIT',
}

/**
 * Execution order for placing trades
 */
export interface ExecutionOrder {
  symbol: string;
  side: 'BUY' | 'SELL';
  type: OrderType;
  quantity: number;
  price?: number;
  stopPrice?: number;
  timeInForce?: 'IOC' | 'FOK' | 'GTC';
  timestamp: number;
  clientOrderId?: string;
}

/**
 * Execution result from order placement
 */
export interface ExecutionResult {
  orderId: string;
  clientOrderId?: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  executedQuantity: number;
  executedPrice: number;
  totalCost: number;
  fee: number;
  timestamp: number;
  status: 'FILLED' | 'PARTIAL' | 'PENDING' | 'CANCELLED' | 'REJECTED';
  error?: string;
}

/**
 * Supported trading assets
 */
export enum TradingAsset {
  BTC = 'BTC',
  SOL = 'SOL',
}

/**
 * Polymarket 15m/5m market window
 */
export interface PolymarketWindow {
  asset: TradingAsset;
  timeframe: '5m' | '15m';
  windowStart: number; // unix timestamp
  windowEnd: number;
  tokenIdUp: string;
  tokenIdDown: string;
  priceUp: number; // current YES price for UP
  priceDown: number; // current YES price for DOWN
  combinedPrice: number; // priceUp + priceDown (should be ~1.0)
  volume: number;
  liquidity: number;
  resolved: boolean;
  resolution?: 'UP' | 'DOWN';
  slug: string;
}

/**
 * Price feed from exchange (Binance/Coinbase)
 */
export interface PriceFeed {
  asset: TradingAsset;
  price: number;
  timestamp: number;
  source: 'binance' | 'coinbase' | 'chainlink';
  change1m: number; // % change last 1 minute
  change5m: number; // % change last 5 minutes
  change15m: number; // % change last 15 minutes
  momentum: number; // -100 to 100
  volumeSpike: boolean;
}

/**
 * Micro-arbitrage signal - the core Polymarket edge
 * Detects when exchange price momentum makes a Polymarket outcome near-certain
 * but Polymarket prices haven't adjusted yet
 */
export interface ArbitrageSignal {
  asset: TradingAsset;
  timeframe: '5m' | '15m';
  direction: 'UP' | 'DOWN';
  confidence: number; // 0-100
  exchangePrice: number;
  exchangeMomentum: number; // % momentum in the current window
  polymarketPrice: number; // current YES price for this direction
  edge: number; // estimated profit margin
  windowTimeRemaining: number; // seconds until resolution
  reasons: string[];
  spotPriceSources: PriceFeed[];
  timestamp: number;
}

/**
 * Combined signal from both technical analysis AND arbitrage detection
 */
export interface CombinedSignal {
  // Technical analysis signal (from indicators/strategies)
  technicalSignal: Signal;
  // Arbitrage signal (from price feed lag detection)
  arbitrageSignal?: ArbitrageSignal;
  // Combined confidence (weighted average)
  combinedConfidence: number;
  // Final decision
  action: 'ENTER_15M' | 'ENTER_5M' | 'SKIP' | 'EXIT';
  asset: TradingAsset;
  direction: SignalDirection;
  // Whether this qualifies for 5m entry (needs very high confidence)
  qualifiesFor5m: boolean;
  timestamp: number;
}

/**
 * Asset-specific bot state (one per asset)
 */
export interface AssetState {
  asset: TradingAsset;
  currentPrice: number;
  candles15m: Candle[];
  candles5m: Candle[];
  indicators15m: IndicatorValues;
  indicators5m: IndicatorValues;
  regime15m: RegimeAnalysis;
  regime5m: RegimeAnalysis;
  activeWindows: PolymarketWindow[];
  currentPosition?: PolymarketPosition;
  recentTrades: Trade[];
  priceFeed: PriceFeed;
}

export default {
  SignalDirection,
  MarketRegime,
  TradingSession,
  OrderType,
  TradingAsset,
};

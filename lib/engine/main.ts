/**
 * ====================================================================
 * ClawTrading - Main Trading Engine Orchestrator
 * ====================================================================
 *
 * The BRAIN of the entire system. Ties together:
 * - Data collection from DataPipeline
 * - Technical analysis via Ensemble strategy
 * - Arbitrage detection from Polymarket price feeds
 * - Risk management enforcement
 * - Position lifecycle management
 * - Learning and optimization
 *
 * Runs as singleton with 10-second main loop cycle
 */

import { EventEmitter } from 'events';
import * as crypto from 'crypto';

import {
  Candle,
  Signal,
  SignalDirection,
  Position,
  Trade,
  BotState,
  BotConfig,
  DashboardData,
  Alert,
  Warning,
  MarketRegime,
  RegimeAnalysis,
  TradingSession,
  IndicatorValues,
  OrderFlowData,
  CombinedSignal,
  PolymarketWindow,
  ArbitrageSignal,
  TradingAsset,
  SessionInfo,
} from '../types/index';

import { DataPipeline } from '../data/pipeline';
import { PolymarketClient } from '../polymarket/client';
import { ArbitrageDetector } from '../polymarket/arbitrage';
import { RiskManager } from '../risk/manager';
import { EnsembleEngine } from '../strategies/ensemble';
import { LearningEngine } from '../learning/engine';

/**
 * Market regime detection helper
 */
export interface RegimeDetectionParams {
  adx: number;
  diPlus: number;
  diMinus: number;
  atr: number;
  closePrice: number;
  emaValues: number[];
  rsi: number;
}

/**
 * Main Trading Engine - Singleton pattern
 */
export class TradingEngine extends EventEmitter {
  // Singleton instance
  private static instance: TradingEngine | null = null;

  // Core components
  private dataPipeline: DataPipeline;
  private polymarketClient: PolymarketClient;
  private arbitrageDetector: ArbitrageDetector;
  private riskManager: RiskManager;
  private ensembleEngine: EnsembleEngine;
  private learningEngine: LearningEngine;

  // State management
  private botState: BotState;
  private botConfig: BotConfig;
  private isRunning = false;
  private mainLoopInterval: NodeJS.Timer | null = null;
  private analyticsInterval: NodeJS.Timer | null = null;

  // Asset-specific tracking
  private btcPosition: Position | null = null;
  private solPosition: Position | null = null;
  private btcLastSignalTime = 0;
  private solLastSignalTime = 0;

  // Trading history for session
  private tradeHistory: Trade[] = [];
  private signalHistory: Signal[] = [];
  private closedTrades: Trade[] = [];
  private dayStartBalance = 0;
  private dayStartTime = Date.now();

  // Alert management
  private alerts: Alert[] = [];
  private warnings: Warning[] = [];
  private maxAlertsKept = 100;

  // Metrics tracking
  private performanceMetrics = {
    cyclesExecuted: 0,
    signalsGenerated: 0,
    tradesOpened: 0,
    tradesClosed: 0,
    wins: 0,
    losses: 0,
    totalPnL: 0,
    maxDrawdown: 0,
    peakBalance: 0,
  };

  // Cycle tracking
  private lastCandle15m: Candle | null = null;
  private lastCycleTime = 0;
  private lastIndicatorCalculation = 0;

  /**
   * Private constructor - use getInstance()
   */
  private constructor(
    dataPipeline: DataPipeline,
    polymarketClient: PolymarketClient,
    config: BotConfig
  ) {
    super();

    this.dataPipeline = dataPipeline;
    this.polymarketClient = polymarketClient;
    this.botConfig = config;

    // Initialize components
    this.arbitrageDetector = new ArbitrageDetector(polymarketClient, 0.01, 0.6);
    this.riskManager = new RiskManager({
      maxPositionSize: config.risk.maxPositionSizePercent,
      maxDailyLoss: config.risk.dailyLossLimitPercent,
      maxDrawdown: config.risk.maxDrawdownPercent,
      maxOpenPositions: config.risk.maxOpenPositions,
      maxTradesPerHour: config.risk.maxTradesPerHour,
      minConfidence: config.risk.minConfidenceThreshold,
      defaultStopLossPercent: config.risk.stopLossPercent,
      atrStopLossMultiplier: config.risk.atrMultiplier,
      trailingStopDistance: config.trailingStop.trailingDistance,
      profitActivationPercent: config.trailingStop.activationPercent,
    });

    this.ensembleEngine = new EnsembleEngine({
      minConfidenceThreshold: config.risk.minConfidenceThreshold,
      requireMajorityVote: true,
      regimeWeightMultipliers: {
        [MarketRegime.TRENDING_UP]: { EMA_CROSSOVER: 1.5, RSI_STRATEGY: 1.2, BREAKOUT: 1.4, VWAP_REVERSAL: 0.8, ORDER_FLOW: 1.0 },
        [MarketRegime.TRENDING_DOWN]: { EMA_CROSSOVER: 1.5, RSI_STRATEGY: 1.2, BREAKOUT: 1.4, VWAP_REVERSAL: 0.8, ORDER_FLOW: 1.0 },
        [MarketRegime.RANGING]: { EMA_CROSSOVER: 0.8, RSI_STRATEGY: 1.5, BREAKOUT: 0.5, VWAP_REVERSAL: 1.4, ORDER_FLOW: 1.0 },
        [MarketRegime.VOLATILE]: { EMA_CROSSOVER: 0.7, RSI_STRATEGY: 1.0, BREAKOUT: 0.8, VWAP_REVERSAL: 0.6, ORDER_FLOW: 1.0 },
        [MarketRegime.CHOPPY]: { EMA_CROSSOVER: 0.6, RSI_STRATEGY: 1.2, BREAKOUT: 0.4, VWAP_REVERSAL: 1.0, ORDER_FLOW: 0.8 },
      },
    });

    this.learningEngine = new LearningEngine(process.env.CONVEX_URL || 'http://localhost:3210');

    // Initialize bot state
    this.botState = this.initializeBotState();
    this.dayStartBalance = this.botState.balance;
    this.performanceMetrics.peakBalance = this.botState.balance;

    this.setupEventListeners();
  }

  /**
   * Get or create singleton instance
   */
  public static getInstance(
    dataPipeline?: DataPipeline,
    polymarketClient?: PolymarketClient,
    config?: BotConfig
  ): TradingEngine {
    if (!TradingEngine.instance) {
      if (!dataPipeline || !polymarketClient || !config) {
        throw new Error(
          'First initialization of TradingEngine requires dataPipeline, polymarketClient, and config'
        );
      }
      TradingEngine.instance = new TradingEngine(dataPipeline, polymarketClient, config);
    }
    return TradingEngine.instance;
  }

  /**
   * Reset singleton (for testing)
   */
  public static resetInstance(): void {
    TradingEngine.instance = null;
  }

  /**
   * Initialize bot state
   */
  private initializeBotState(): BotState {
    return {
      status: 'STOPPED',
      startTime: 0,
      lastUpdate: Date.now(),
      error: undefined,
      balance: 10000, // Default - would come from API in production
      equity: 10000,
      unrealizedPnL: 0,
      realizedPnL: 0,
      dailyPnL: 0,
      dayStartBalance: 10000,
      dayStartTime: Date.now(),
      openPositions: [],
      closedTodayCount: 0,
      wins: 0,
      losses: 0,
      currentPrice: 0,
      lastCandle: {} as Candle,
      allCandles: [],
      currentRegime: MarketRegime.RANGING,
      currentSession: TradingSession.NY,
      indicators: {} as IndicatorValues,
      lastSignal: undefined,
      signalCount: 0,
      entriesCount: 0,
      exitsCount: 0,
      dailyLossUsed: 0,
      maxDrawdown: 0,
      tradesThisHour: 0,
      learningRecords: [],
      patterns: [],
      isConnected: false,
      lastConnectionCheck: Date.now(),
      activeConfig: this.botConfig,
      metrics: {
        avgWin: 0,
        avgLoss: 0,
        winRate: 0,
        profitFactor: 0,
        sharpeRatio: 0,
        drawdownRatio: 0,
      },
    };
  }

  /**
   * Setup event listeners for data pipeline
   */
  private setupEventListeners(): void {
    // Listen for price updates
    this.dataPipeline.on('price:update', (data: any) => {
      this.botState.currentPrice = data.price;
    });

    // Listen for candle closures
    this.dataPipeline.on('candle:close', (data: any) => {
      if (data.timeframe === '15m') {
        this.lastCandle15m = data;
      }
    });
  }

  /**
   * Initialize the engine - load data, verify connections
   */
  public async initialize(): Promise<void> {
    try {
      this.emit('state:updating', { status: 'INITIALIZING' });

      // Connect to data pipeline
      await this.dataPipeline.start();
      this.botState.isConnected = true;

      // Verify Polymarket client
      const balance = await this.polymarketClient.getBalance();
      this.botState.balance = balance.usdc;
      this.botState.equity = balance.usdc;
      this.dayStartBalance = balance.usdc;
      this.performanceMetrics.peakBalance = balance.usdc;

      // Warm up indicators with historical data
      const btcCandles15m = await this.dataPipeline.getCandles('BTC', '15m', 200);
      const solCandles15m = await this.dataPipeline.getCandles('SOL', '15m', 200);

      if (btcCandles15m.length > 0) {
        this.lastCandle15m = btcCandles15m[btcCandles15m.length - 1];
      }

      this.emit('initialized', {
        balance: this.botState.balance,
        timestamp: Date.now(),
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.botState.error = errorMsg;
      this.emit('error', { message: errorMsg, timestamp: Date.now() });
      throw error;
    }
  }

  /**
   * Start the trading engine
   */
  public async start(): Promise<void> {
    if (this.isRunning) {
      this.emit('warning', { message: 'Engine already running' });
      return;
    }

    try {
      this.isRunning = true;
      this.botState.status = 'RUNNING';
      this.botState.startTime = Date.now();
      this.dayStartTime = Date.now();

      this.emit('state:updated', { status: 'RUNNING', timestamp: Date.now() });

      // Start Polymarket heartbeat (critical: keeps orders alive)
      this.polymarketClient.startHeartbeat();

      // Start main trading loop (10 seconds)
      this.mainLoopInterval = setInterval(() => {
        this.runCycle().catch((err) => {
          this.emit('error', {
            message: `Cycle error: ${err.message}`,
            timestamp: Date.now(),
          });
        });
      }, 10000);

      // Start analytics loop (2 seconds for dashboard updates)
      this.analyticsInterval = setInterval(() => {
        this.updateMetrics();
      }, 2000);

      await this.runCycle(); // Run once immediately
    } catch (error) {
      this.isRunning = false;
      this.botState.status = 'ERROR';
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.botState.error = errorMsg;
      this.emit('error', { message: errorMsg, timestamp: Date.now() });
      throw error;
    }
  }

  /**
   * Stop the trading engine
   */
  public async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      this.isRunning = false;
      this.botState.status = 'STOPPED';

      if (this.mainLoopInterval) {
        clearInterval(this.mainLoopInterval as ReturnType<typeof setInterval>);
        this.mainLoopInterval = null;
      }

      if (this.analyticsInterval) {
        clearInterval(this.analyticsInterval as ReturnType<typeof setInterval>);
        this.analyticsInterval = null;
      }

      // Stop heartbeat (allows orders to expire naturally)
      this.polymarketClient.stopHeartbeat();

      // Close all positions
      await this.closeAllPositions('ENGINE_STOP');

      this.emit('state:updated', { status: 'STOPPED', timestamp: Date.now() });
      this.emit('stopped', { timestamp: Date.now() });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.botState.error = errorMsg;
      this.emit('error', { message: errorMsg, timestamp: Date.now() });
      throw error;
    }
  }

  /**
   * ================================================================
   * MAIN CYCLE - Runs every 10 seconds
   * ================================================================
   */
  public async runCycle(): Promise<void> {
    const cycleStartTime = Date.now();
    this.botState.lastUpdate = cycleStartTime;
    this.performanceMetrics.cyclesExecuted++;

    try {
      // STEP 1: Data Collection
      await this.collectData();

      // STEP 2: Technical Analysis (only on new 15m candle)
      const techSignal = await this.analyzeAsset('BTC');

      // STEP 3: Arbitrage Detection
      const arbSignal = await this.detectArbitrage('BTC');

      // STEP 4: Signal Combination
      if (techSignal) {
        const combined = await this.getCombinedSignal(techSignal, arbSignal ?? undefined);

        // STEP 5: Entry Decision
        if (combined.action !== 'SKIP') {
          const shouldEnter = await this.shouldEnter5m(combined);

          if (shouldEnter) {
            // STEP 6: Risk Check
            const polyWindow = combined.asset === TradingAsset.BTC
              ? await this.findBestWindow('BTC', combined.action)
              : await this.findBestWindow('SOL', combined.action);

            const riskCheck = this.riskManager.canOpenTrade(
              { confidence: combined.combinedConfidence } as any,
              { balance: this.botState.balance, openPositions: this.botState.openPositions }
            );

            if (polyWindow && riskCheck.canOpen) {
              // STEP 7: Execution
              await this.openPosition(combined, polyWindow);
            }
          }
        }
      }

      // STEP 8: Monitor Positions
      await this.monitorPositions();

      // Emit cycle complete
      this.emit('cycle:complete', {
        cycleTime: Date.now() - cycleStartTime,
        timestamp: cycleStartTime,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.addAlert({
        level: 'CRITICAL',
        title: 'Cycle Error',
        message: errorMsg,
      });
      this.emit('error', { message: errorMsg, timestamp: Date.now() });
    }
  }

  /**
   * STEP 1: Data Collection
   */
  private async collectData(): Promise<void> {
    try {
      // Fetch latest candles
      const btcCandles15m = await this.dataPipeline.getCandles('BTC', '15m', 100);
      const solCandles15m = await this.dataPipeline.getCandles('SOL', '15m', 100);
      const btcCandles5m = await this.dataPipeline.getCandles('BTC', '5m', 100);
      const solCandles5m = await this.dataPipeline.getCandles('SOL', '5m', 100);

      // Get current prices
      const btcPrice = await this.dataPipeline.getCurrentPrice('BTC');
      const solPrice = await this.dataPipeline.getCurrentPrice('SOL');

      // Store in state
      this.botState.allCandles = btcCandles15m;
      if (btcCandles15m.length > 0) {
        this.lastCandle15m = btcCandles15m[btcCandles15m.length - 1];
      }

      // Fetch active Polymarket windows
      const windows = await this.polymarketClient.findActiveWindows('BTC', '5m');
      this.emit('data:collected', {
        btcCandles15m: btcCandles15m.length,
        solCandles15m: solCandles15m.length,
        btcPrice,
        solPrice,
        windows: windows.length,
        timestamp: Date.now(),
      });
    } catch (error) {
      this.addAlert({
        level: 'WARNING',
        title: 'Data Collection Error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * STEP 2: Technical Analysis (every new 15m candle)
   */
  public async analyzeAsset(asset: 'BTC' | 'SOL'): Promise<Signal | null> {
    try {
      const candles = await this.dataPipeline.getCandles(asset, '15m', 100);

      if (candles.length < 50) {
        return null; // Not enough data
      }

      // Calculate indicators using the indicators library
      const indicators = await this.calculateIndicators(candles);

      // Detect market regime
      const regime = this.detectMarketRegime(indicators, candles);

      // Detect trading session
      const session = this.detectTradingSession();

      // Get order flow data
      const orderFlow: OrderFlowData = {
        bidAskRatio: 1.0,
        bidVolume: 0,
        askVolume: 0,
        volumeDelta: 0,
        orderImbalance: 0,
        largeOrdersDetected: false,
        spoofingDetected: false,
        timestamp: Date.now(),
      };

      // Convert TradingSession to SessionInfo
      const sessionInfo: SessionInfo = {
        currentSession: session,
        sessionMultiplier: session === TradingSession.LONDON_NY_OVERLAP ? 1.5 : 1.0,
        sessionStart: Date.now(),
        sessionEnd: Date.now() + 3600000,
        timeUntilSessionEnd: 3600000,
        isHighLiquidity: session === TradingSession.LONDON_NY_OVERLAP,
        isHighVolatility: false,
      };

      // Run ensemble strategy on 15m data
      const signal = await this.ensembleEngine.analyze(
        candles,
        indicators,
        regime,
        sessionInfo,
        orderFlow
      );

      if (signal && signal.confidence >= this.botConfig.risk.minConfidenceThreshold) {
        this.botState.lastSignal = signal;
        this.signalHistory.push(signal);
        this.performanceMetrics.signalsGenerated++;

        this.emit('signal', {
          asset,
          signal,
          timestamp: Date.now(),
        });

        return signal;
      }

      return null;
    } catch (error) {
      this.addAlert({
        level: 'WARNING',
        title: `Analysis Error (${asset})`,
        message: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * STEP 3: Arbitrage Detection
   */
  private async detectArbitrage(asset: 'BTC' | 'SOL'): Promise<any | null> {
    try {
      const windows = await this.polymarketClient.findActiveWindows(asset, '5m');

      for (const window of windows) {
        // Update exchange prices
        const price = await this.dataPipeline.getCurrentPrice(asset);
        await this.arbitrageDetector.updateExchangePrice(asset, price, 'BINANCE');

        // Detect arbitrage
        const signal = await this.arbitrageDetector.analyzeWindow(window);

        if (signal && signal.confidence > 0.85) {
          this.emit('arbitrage:detected', {
            asset,
            signal,
            timestamp: Date.now(),
          });
          return signal;
        }
      }

      return null;
    } catch (error) {
      // Silently handle arbitrage detection errors
      return null;
    }
  }

  /**
   * STEP 4: Signal Combination
   */
  public async getCombinedSignal(
    techSignal: Signal,
    arbSignal?: ArbitrageSignal
  ): Promise<CombinedSignal> {
    let combinedConfidence = techSignal.confidence;
    let action: 'ENTER_15M' | 'ENTER_5M' | 'SKIP' | 'EXIT' = 'SKIP';
    let qualifiesFor5m = false;

    if (arbSignal) {
      // Check for conflicts using actual properties from analyzeWindow
      const techDirection = techSignal.direction === SignalDirection.LONG ? 'UP' : 'DOWN';
      // The analyzeWindow returns an ArbitrageSignal with momentum property
      const arbMomentum = (arbSignal as any).momentum ?? 'UNKNOWN';
      const arbDirection = arbMomentum === 'UP' || arbMomentum === 'DOWN' ? arbMomentum : techDirection;
      const arbConfidence = (arbSignal as any).confidence ?? 0;

      if (techDirection === arbDirection) {
        // Strong agreement: increase confidence
        combinedConfidence = Math.min(100, Math.max(techSignal.confidence, arbConfidence * 100) * 1.1);
        action = 'ENTER_15M';
        qualifiesFor5m = true;
      } else if (techSignal.direction === SignalDirection.NEUTRAL && arbConfidence > 0.85) {
        // Arbitrage signal can override neutral technical signal
        combinedConfidence = arbConfidence * 100;
        action = 'ENTER_15M';
        qualifiesFor5m = true;
      } else if (techSignal.direction === SignalDirection.LONG && arbDirection === 'DOWN') {
        // Conflict: skip
        action = 'SKIP';
      } else if (techSignal.direction === SignalDirection.SHORT && arbDirection === 'UP') {
        // Conflict: skip
        action = 'SKIP';
      } else {
        // Weak arbitrage signal, follow technical
        action = 'ENTER_15M';
      }
    } else if (techSignal.confidence >= this.botConfig.risk.minConfidenceThreshold) {
      action = 'ENTER_15M';
    }

    return {
      technicalSignal: techSignal,
      arbitrageSignal: arbSignal,
      combinedConfidence,
      action,
      asset: TradingAsset.BTC, // Would be dynamic
      direction: techSignal.direction,
      qualifiesFor5m,
      timestamp: Date.now(),
    };
  }

  /**
   * STEP 5: Entry Decision - Validate 5m entry
   */
  public async shouldEnter5m(signal: CombinedSignal): Promise<boolean> {
    // 5m markets need:
    // 1. Combined confidence > 82%
    // 2. Arbitrage edge clearly present
    // 3. No current position in this asset

    if (signal.combinedConfidence < 82) {
      return false;
    }

    if (!signal.arbitrageSignal) {
      return false;
    }

    const hasPosition =
      signal.asset === TradingAsset.BTC ? this.btcPosition !== null : this.solPosition !== null;

    if (hasPosition) {
      return false;
    }

    // Verify arbitrage edge is real
    if (signal.arbitrageSignal.edge < 0.005) {
      // Less than 0.5% edge
      return false;
    }

    return signal.qualifiesFor5m;
  }

  /**
   * STEP 6 & 7: Risk Check + Execution
   */
  public async openPosition(signal: CombinedSignal, window: PolymarketWindow): Promise<void> {
    try {
      // Risk check
      const riskCheck = this.riskManager.canOpenTrade(
        { confidence: signal.combinedConfidence } as any,
        { balance: this.botState.balance, openPositions: this.botState.openPositions }
      );
      if (!riskCheck.canOpen) {
        this.addAlert({
          level: 'WARNING',
          title: 'Risk Limit',
          message: riskCheck.reasons.join('; '),
        });
        return;
      }

      // Calculate position size
      const session = this.detectTradingSession();
      const sessionStr = session === TradingSession.ASIAN ? 'ASIAN'
        : session === TradingSession.LONDON ? 'LONDON'
        : session === TradingSession.LONDON_NY_OVERLAP ? 'OVERLAP'
        : 'NY';

      const positionSize = this.riskManager.calculatePositionSize(
        signal.combinedConfidence,
        this.botState.balance,
        0.2, // volatility
        sessionStr
      );

      // Create position object
      const position: Position = {
        id: crypto.randomUUID(),
        entryPrice: window.priceUp, // YES price
        entryTime: Date.now(),
        quantity: positionSize,
        direction: signal.direction === SignalDirection.LONG ? 'LONG' : 'SHORT',
        currentPrice: window.priceUp,
        unrealizedPnL: 0,
        unrealizedPnLPercent: 0,
        initialStopLoss: window.priceUp * (1 - this.botConfig.risk.stopLossPercent),
        currentStopLoss: window.priceUp * (1 - this.botConfig.risk.stopLossPercent),
        stopLoss: window.priceUp * (1 - this.botConfig.risk.stopLossPercent),
        trailingStopActive: this.botConfig.trailingStop.enabled,
        trailingStop: {
          activated: false,
          distance: this.botConfig.trailingStop.trailingDistance,
        },
        takeProfitLevels: this.botConfig.takeProfitLevels.levels.map((level, idx) => ({
          level: idx + 1,
          price: window.priceUp * (1 + level.profitPercent),
          priceLevel: window.priceUp * (1 + level.profitPercent),
          profitPercent: level.profitPercent,
          positionReduction: level.positionReduction,
          percentOfPosition: level.positionReduction,
          active: true,
          triggered: false,
        })),
        marketRegime: signal.technicalSignal.indicators.atr
          ? MarketRegime.TRENDING_UP
          : MarketRegime.RANGING,
        tradingSession: this.detectTradingSession() as any,
        entrySignalStrength: signal.combinedConfidence,
        riskRewardRatio: 1.5,
        durationMinutes: 0,
        status: 'OPEN',
        asset: signal.asset,
      };

      // Place order on Polymarket
      const order = await this.polymarketClient.placeLimitOrder(
        signal.direction === SignalDirection.LONG ? window.tokenIdUp : window.tokenIdDown,
        'BUY',
        signal.direction === SignalDirection.LONG ? window.priceUp : window.priceDown,
        positionSize
      );

      // Store position
      if (signal.asset === TradingAsset.BTC) {
        this.btcPosition = position;
      } else {
        this.solPosition = position;
      }

      this.botState.openPositions.push(position);
      this.performanceMetrics.tradesOpened++;

      // Log to Convex
      await this.logTradeSignal(position, signal);

      this.emit('trade:opened', {
        position,
        signal,
        timestamp: Date.now(),
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.addAlert({
        level: 'CRITICAL',
        title: 'Trade Execution Error',
        message: errorMsg,
      });
      this.emit('error', { message: errorMsg, timestamp: Date.now() });
    }
  }

  /**
   * Calculate indicators from candles
   */
  private calculateIndicators(candles: Candle[]): IndicatorValues {
    // Basic placeholder for indicator calculation
    return {
      rsi: 50,
      macd: { line: 0, signal: 0, histogram: 0 },
      ema: { ema5: 0, ema9: 0, ema20: 0, ema50: 0, ema200: 0, values: [0, 0, 0, 0, 0] },
      bollingerBands: { upper: 0, middle: 0, lower: 0, width: 0, percentB: 0 },
      atr: { value: 0, percent: 0 },
      adx: { value: 0, diPlus: 0, diMinus: 0 },
      vwap: 0,
      volumeDelta: { value: 0, sma20: 0 },
      stochastic: { k: 0, d: 0, smoothK: 0 },
      obv: { value: 0, sma: 0 },
      timestamp: Date.now(),
    };
  }

  /**
   * STEP 8: Monitor Positions
   */
  public async monitorPositions(): Promise<void> {
    try {
      const updatedPositions: Position[] = [];

      for (const position of this.botState.openPositions) {
        const currentPrice = await this.dataPipeline.getCurrentPrice(position.asset || 'BTC');

        // Update unrealized P&L
        position.currentPrice = currentPrice;
        position.unrealizedPnL = (currentPrice - position.entryPrice) * position.quantity;
        position.unrealizedPnLPercent = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;

        // Check take profit levels
        let partiallyExited = false;
        for (const level of position.takeProfitLevels) {
          if (!level.triggered && currentPrice >= level.priceLevel) {
            level.triggered = true;
            level.triggeredTime = Date.now();
            level.closingPrice = currentPrice;

            const exitQuantity = position.quantity * (level.positionReduction || 0.33);
            position.quantity -= exitQuantity;
            partiallyExited = true;

            this.emit('take:profit:triggered', {
              position,
              level,
              timestamp: Date.now(),
            });
          }
        }

        // Check stop loss
        if (
          currentPrice <= position.currentStopLoss ||
          (currentPrice <= position.initialStopLoss && position.status === 'OPEN')
        ) {
          await this.closePosition(position, 'STOP_LOSS');
          continue;
        }

        // Trailing stop
        if (position.trailingStopActive && position.trailingStop) {
          if (
            position.trailingStop.highestPrice === undefined ||
            currentPrice > position.trailingStop.highestPrice
          ) {
            position.trailingStop.highestPrice = currentPrice;
          }

          const trailingStopLevel =
            (position.trailingStop.highestPrice || 0) *
            (1 - position.trailingStop.distance / 100);

          if (
            currentPrice <= trailingStopLevel &&
            position.trailingStop.activated
          ) {
            await this.closePosition(position, 'TRAILING_STOP');
            continue;
          }

          // Activate trailing stop after profit threshold
          if (
            !position.trailingStop.activated &&
            position.unrealizedPnLPercent >= this.botConfig.trailingStop.activationPercent
          ) {
            position.trailingStop.activated = true;
          }
        }

        // Check window resolution
        const window = this.findWindowByPosition(position);
        if (window && window.resolved) {
          await this.closePosition(position, 'WINDOW_RESOLVED');
          continue;
        }

        if (!partiallyExited) {
          updatedPositions.push(position);
        }
      }

      this.botState.openPositions = updatedPositions;

      // Update position references
      this.btcPosition = updatedPositions.find((p) => p.asset === TradingAsset.BTC) || null;
      this.solPosition = updatedPositions.find((p) => p.asset === TradingAsset.SOL) || null;

      this.emit('positions:monitored', {
        positions: updatedPositions,
        timestamp: Date.now(),
      });
    } catch (error) {
      this.addAlert({
        level: 'WARNING',
        title: 'Position Monitoring Error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Close a specific position
   */
  public async closePosition(position: Position, reason: string): Promise<void> {
    try {
      const exitPrice = await this.dataPipeline.getCurrentPrice(position.asset || 'BTC');
      const exitTime = Date.now();

      const trade: Trade = {
        id: position.id,
        entryPrice: position.entryPrice,
        exitPrice,
        entryTime: position.entryTime,
        exitTime,
        quantity: position.quantity,
        direction: position.direction,
        pnl: position.unrealizedPnL,
        pnlPercent: position.unrealizedPnLPercent,
        durationMinutes: Math.round((exitTime - position.entryTime) / 60000),
        durationSeconds: Math.round((exitTime - position.entryTime) / 1000),
        strategyUsed: 'ENSEMBLE_ARBITRAGE',
        marketRegime: position.marketRegime,
        tradingSession: position.tradingSession,
        entryReason: 'COMBINED_SIGNAL',
        exitReason: reason,
        maxWinDuringTrade: position.maxWinPercent || position.unrealizedPnLPercent,
        maxLossDuringTrade: position.maxLossPercent || 0,
        riskRewardRatioAchieved: position.riskRewardRatio,
        winTrade: position.unrealizedPnL > 0,
        fees: 0,
        signals: {
          entry: this.botState.lastSignal || ({} as Signal),
          exit: ({} as Signal),
        },
        indicators: {
          entry: ({
            rsi: 0,
            macdLine: 0,
            macdSignal: 0,
            macdHistogram: 0,
            emaValues: [0, 0, 0, 0, 0],
            bollingerBands: { upper: 0, middle: 0, lower: 0, width: 0 },
            atr: 0,
            atrPercent: 0,
            adx: 0,
            diPlus: 0,
            diMinus: 0,
            vwap: 0,
            volumeDelta: 0,
            stochastic: { k: 0, d: 0, smoothK: 0 },
            obv: 0,
            obvMA: 0,
            timestamp: Date.now(),
          }),
          exit: ({
            rsi: 0,
            macdLine: 0,
            macdSignal: 0,
            macdHistogram: 0,
            emaValues: [0, 0, 0, 0, 0],
            bollingerBands: { upper: 0, middle: 0, lower: 0, width: 0 },
            atr: 0,
            atrPercent: 0,
            adx: 0,
            diPlus: 0,
            diMinus: 0,
            vwap: 0,
            volumeDelta: 0,
            stochastic: { k: 0, d: 0, smoothK: 0 },
            obv: 0,
            obvMA: 0,
            timestamp: Date.now(),
          }),
        },
      };

      // Update metrics
      this.tradeHistory.push(trade);
      this.closedTrades.push(trade);
      this.performanceMetrics.tradesClosed++;
      this.performanceMetrics.totalPnL += trade.pnl;

      if (trade.winTrade) {
        this.performanceMetrics.wins++;
        this.botState.wins++;
      } else {
        this.performanceMetrics.losses++;
        this.botState.losses++;
      }

      // Update balance
      this.botState.balance += trade.pnl;
      this.botState.dailyPnL += trade.pnl;
      this.botState.realizedPnL += trade.pnl;

      // Remove from open positions
      const index = this.botState.openPositions.indexOf(position);
      if (index > -1) {
        this.botState.openPositions.splice(index, 1);
      }

      // Update position references
      if (position.asset === TradingAsset.BTC) {
        this.btcPosition = null;
      } else {
        this.solPosition = null;
      }

      this.botState.closedTodayCount++;

      this.emit('trade:closed', {
        trade,
        reason,
        timestamp: Date.now(),
      });
    } catch (error) {
      this.addAlert({
        level: 'CRITICAL',
        title: 'Trade Close Error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Close all positions (for shutdown or emergency)
   */
  private async closeAllPositions(reason: string): Promise<void> {
    const positions = [...this.botState.openPositions];
    for (const position of positions) {
      await this.closePosition(position, reason);
    }
  }

  /**
   * ================================================================
   * MARKET ANALYSIS UTILITIES
   * ================================================================
   */

  /**
   * Detect market regime from indicators
   */
  private detectMarketRegime(indicators: IndicatorValues, candles: Candle[]): RegimeAnalysis {
    const adx = indicators.adx.value;
    const rsi = indicators.rsi;
    const bbWidth = indicators.bollingerBands.width;
    const atrPercent = indicators.atr.percent;

    let regime = MarketRegime.RANGING;
    let confidence = 0;

    // Trending up
    if (
      adx > 25 &&
      indicators.adx.diPlus > indicators.adx.diMinus &&
      candles[candles.length - 1].close > indicators.ema.ema50
    ) {
      regime = MarketRegime.TRENDING_UP;
      confidence = Math.min(100, adx * 2);
    }
    // Trending down
    else if (
      adx > 25 &&
      indicators.adx.diMinus > indicators.adx.diPlus &&
      candles[candles.length - 1].close < indicators.ema.ema50
    ) {
      regime = MarketRegime.TRENDING_DOWN;
      confidence = Math.min(100, adx * 2);
    }
    // Volatile
    else if (atrPercent > 0.03) {
      regime = MarketRegime.VOLATILE;
      confidence = 75;
    }
    // Choppy
    else if (bbWidth > 0.02) {
      regime = MarketRegime.CHOPPY;
      confidence = 60;
    }
    // Ranging
    else {
      regime = MarketRegime.RANGING;
      confidence = 70;
    }

    return {
      currentRegime: regime,
      confidence,
      trendStrength: adx,
      volatility: atrPercent,
      rangeHigh: Math.max(...candles.map((c) => c.high)),
      rangeLow: Math.min(...candles.map((c) => c.low)),
      adxValue: adx,
      lastUpdated: Date.now(),
    };
  }

  /**
   * Detect current trading session
   */
  private detectTradingSession(): TradingSession {
    const now = new Date();
    const utcHour = now.getUTCHours();

    // Asia: 21:00 - 06:00 UTC
    if (utcHour >= 21 || utcHour < 6) {
      return TradingSession.ASIAN;
    }
    // London/NY Overlap: 12:00 - 17:00 UTC (takes priority)
    else if (utcHour >= 12 && utcHour < 17) {
      return TradingSession.LONDON_NY_OVERLAP;
    }
    // London: 06:00 - 12:00 UTC
    else if (utcHour >= 6 && utcHour < 12) {
      return TradingSession.LONDON;
    }
    // New York: 17:00 - 21:00 UTC
    else {
      return TradingSession.NY;
    }
  }

  /**
   * Find best Polymarket window for asset
   */
  private async findBestWindow(
    asset: 'BTC' | 'SOL',
    action: string
  ): Promise<PolymarketWindow | null> {
    try {
      const windows = (await this.polymarketClient.findActiveWindows(asset, '5m')) as unknown as PolymarketWindow[];

      if (windows.length === 0) {
        return null;
      }

      // Prefer 15m windows, then 5m
      const window15m = windows.find((w: PolymarketWindow) => w.timeframe === '15m') as PolymarketWindow | undefined;
      if (window15m) {
        return window15m;
      }

      return windows[0] as PolymarketWindow;
    } catch (error) {
      return null;
    }
  }

  /**
   * Find window associated with position
   */
  private findWindowByPosition(position: Position): PolymarketWindow | null {
    // Would query Polymarket API in production
    return null;
  }

  /**
   * Log trade signal to Convex
   */
  private async logTradeSignal(position: Position, signal: CombinedSignal): Promise<void> {
    try {
      // In production, would call Convex mutation
      // await convexClient.mutation('logTrade', { position, signal });
    } catch (error) {
      // Silent fail for logging
    }
  }

  /**
   * ================================================================
   * STATE AND DASHBOARD
   * ================================================================
   */

  /**
   * Get current bot state
   */
  public getStatus(): BotState {
    this.botState.lastUpdate = Date.now();
    return { ...this.botState };
  }

  /**
   * Get dashboard data for UI
   */
  public getDashboardData(): DashboardData {
    const stats = this.calculateStatistics();

    return {
      // Account
      accountBalance: this.botState.balance,
      availableBalance: this.botState.balance - this.botState.unrealizedPnL,
      totalPnL: this.performanceMetrics.totalPnL,
      totalPnLPercent: (this.performanceMetrics.totalPnL / this.dayStartBalance) * 100,
      dailyPnL: this.botState.dailyPnL,
      dailyPnLPercent: (this.botState.dailyPnL / this.dayStartBalance) * 100,
      dailyTradesCount: this.botState.closedTodayCount,
      dailyWinsCount: this.performanceMetrics.wins,
      dailyWinRate: this.performanceMetrics.wins / Math.max(1, this.performanceMetrics.tradesClosed),

      // Positions
      openPositions: this.botState.openPositions,
      totalOpenPositionCount: this.botState.openPositions.length,
      totalExposure: this.botState.openPositions.reduce((sum, p) => sum + p.quantity, 0),
      totalExposurePercent:
        (this.botState.openPositions.reduce((sum, p) => sum + p.quantity, 0) /
          this.botState.balance) *
        100,

      // Trades
      recentTrades: this.closedTrades.slice(-20),
      allTimeStats: {
        totalTrades: this.performanceMetrics.tradesOpened,
        totalWins: this.performanceMetrics.wins,
        totalLosses: this.performanceMetrics.losses,
        winRate: this.performanceMetrics.wins / Math.max(1, this.performanceMetrics.tradesOpened),
        averageWin:
          this.performanceMetrics.wins > 0
            ? this.performanceMetrics.totalPnL / this.performanceMetrics.wins
            : 0,
        averageLoss:
          this.performanceMetrics.losses > 0
            ? -this.performanceMetrics.totalPnL / this.performanceMetrics.losses
            : 0,
        profitFactor:
          this.performanceMetrics.losses > 0
            ? this.performanceMetrics.wins / this.performanceMetrics.losses
            : this.performanceMetrics.wins,
        largestWin: this.closedTrades.length > 0 ? Math.max(...this.closedTrades.map((t) => t.pnl)) : 0,
        largestLoss: this.closedTrades.length > 0 ? Math.min(...this.closedTrades.map((t) => t.pnl)) : 0,
        averageTradeDuration: this.calculateAverageTradeDuration(),
        sharpeRatio: 1.5, // Would calculate from returns
      },

      // Market
      currentPrice: this.botState.currentPrice,
      marketRegime: {
        currentRegime: this.botState.currentRegime,
        confidence: 75,
        trendStrength: 50,
        volatility: 0.02,
        rangeHigh: 0,
        rangeLow: 0,
        adxValue: 0,
        lastUpdated: Date.now(),
      },
      currentSession: {
        currentSession: this.detectTradingSession(),
        sessionMultiplier: 1.0,
        sessionStart: 0,
        sessionEnd: 0,
        timeUntilSessionEnd: 0,
        isHighLiquidity: true,
        isHighVolatility: false,
      },
      recentCandles: this.botState.allCandles.slice(-20),
      latestIndicators: this.botState.indicators,

      // Signals
      currentSignal: this.botState.lastSignal,
      lastSignal: this.botState.lastSignal,

      // Risk
      maxDailyDrawdown: this.performanceMetrics.maxDrawdown,
      currentDrawdown: this.calculateCurrentDrawdown(),
      currentDrawdownPercent:
        (this.calculateCurrentDrawdown() / this.performanceMetrics.peakBalance) * 100,
      dailyLossRemaining:
        (this.dayStartBalance * this.botConfig.risk.dailyLossLimitPercent) / 100 -
        Math.abs(Math.min(0, this.botState.dailyPnL)),
      maxPositionSizeAvailable: this.calculateMaxPositionSize(),

      // Bot
      botStatus: this.botState.status,
      lastUpdate: Date.now(),
      uptime: Date.now() - this.botState.startTime,
      connectionStatus: this.botState.isConnected ? 'CONNECTED' : 'DISCONNECTED',

      // Strategy
      strategyWeights: [],
      topPerformingStrategy: 'ENSEMBLE_ARBITRAGE',

      // Alerts
      alerts: this.alerts.slice(-10),
      warnings: this.warnings.slice(-10),
    };
  }

  /**
   * Update metrics periodically
   */
  private updateMetrics(): void {
    // Calculate drawdown
    const currentBalance = this.botState.balance;
    const drawdown = this.performanceMetrics.peakBalance - currentBalance;
    this.performanceMetrics.maxDrawdown = Math.max(this.performanceMetrics.maxDrawdown, drawdown);

    // Update peak balance
    if (currentBalance > this.performanceMetrics.peakBalance) {
      this.performanceMetrics.peakBalance = currentBalance;
    }

    // Emit dashboard update
    this.emit('dashboard:update', {
      data: this.getDashboardData(),
      timestamp: Date.now(),
    });
  }

  /**
   * Calculate statistics
   */
  private calculateStatistics() {
    return {
      totalTrades: this.performanceMetrics.tradesOpened,
      wins: this.performanceMetrics.wins,
      losses: this.performanceMetrics.losses,
      totalPnL: this.performanceMetrics.totalPnL,
    };
  }

  /**
   * Calculate average trade duration
   */
  private calculateAverageTradeDuration(): number {
    if (this.closedTrades.length === 0) {
      return 0;
    }
    const totalDuration = this.closedTrades.reduce((sum, t) => sum + t.durationMinutes, 0);
    return totalDuration / this.closedTrades.length;
  }

  /**
   * Calculate current drawdown
   */
  private calculateCurrentDrawdown(): number {
    return Math.max(0, this.performanceMetrics.peakBalance - this.botState.balance);
  }

  /**
   * Calculate max position size
   */
  private calculateMaxPositionSize(): number {
    const maxPercent = this.botConfig.risk.maxPositionSizePercent;
    return (this.botState.balance * maxPercent) / 100;
  }

  /**
   * Add alert
   */
  private addAlert(
    alert: Omit<Alert, 'id' | 'timestamp' | 'dismissible' | 'actionRequired'>
  ): void {
    const newAlert: Alert = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      level: alert.level,
      title: alert.title,
      message: alert.message,
      actionRequired: alert.level === 'CRITICAL',
      dismissible: true,
    };

    this.alerts.push(newAlert);
    if (this.alerts.length > this.maxAlertsKept) {
      this.alerts.shift();
    }

    this.emit('alert', newAlert);
  }

  /**
   * Pause/Resume engine
   */
  public async pause(): Promise<void> {
    if (this.isRunning) {
      this.botState.status = 'PAUSED';
      this.emit('state:updated', { status: 'PAUSED', timestamp: Date.now() });
    }
  }

  public async resume(): Promise<void> {
    if (!this.isRunning) {
      this.isRunning = true;
      this.botState.status = 'RUNNING';

      // Restart main trading loop if not already running
      if (!this.mainLoopInterval) {
        this.mainLoopInterval = setInterval(() => {
          this.runCycle().catch((err) => {
            this.emit('error', {
              message: `Cycle error: ${err.message}`,
              timestamp: Date.now(),
            });
          });
        }, 10000);
      }

      // Restart analytics loop if not already running
      if (!this.analyticsInterval) {
        this.analyticsInterval = setInterval(() => {
          this.updateMetrics();
        }, 2000);
      }

      this.emit('state:updated', { status: 'RUNNING', timestamp: Date.now() });
    }
  }

  /**
   * Get performance metrics
   */
  public getMetrics() {
    return { ...this.performanceMetrics };
  }
}

export default TradingEngine;

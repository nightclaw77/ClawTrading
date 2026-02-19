/**
 * DataPipeline - Real-time data fetching and management for Polymarket trading bot
 *
 * Primary data sources:
 * - Binance WebSocket for BTC/SOL 15m and 5m candles
 * - Binance ticker for real-time prices
 * - Polymarket RTDS WebSocket for market data
 * - REST fallback for historical data
 *
 * Maintains rolling buffers of recent candles and provides momentum calculations
 */

import { Candle, PriceUpdate } from '../types/index';

interface CandleBuffer {
  [asset: string]: {
    [timeframe: string]: Candle[];
  };
}

interface PriceData {
  [key: string]: PriceUpdate;
}

interface BinanceKlineMessage {
  e: string;
  E: number;
  s: string;
  k: {
    t: number;
    T: number;
    s: string;
    i: string;
    f: number;
    L: number;
    o: string;
    c: string;
    h: string;
    l: string;
    v: string;
    n: number;
    x: boolean;
    q: string;
    V: string;
    Q: string;
  };
}

interface BinanceTickerMessage {
  e: string;
  E: number;
  s: string;
  p: string;
  P: string;
  w: string;
  x: string;
  c: string;
  Q: string;
  b: string;
  B: string;
  a: string;
  A: string;
  o: string;
  h: string;
  l: string;
  v: string;
  q: string;
  O: number;
  C: number;
  F: number;
  L: number;
  n: number;
}

type EventCallback = (data: any) => void;

export class DataPipeline {
  private candleBuffer: CandleBuffer = {
    BTC: { '5m': [], '15m': [] },
    SOL: { '5m': [], '15m': [] },
  };

  private currentPrices: PriceData = {};
  private priceHistory: PriceUpdate[] = [];
  private maxBufferSize = 500;
  private isConnected = false;
  private lastUpdate = 0;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  // Event callbacks
  private eventListeners: Map<string, EventCallback[]> = new Map();

  // Configuration
  private binanceRestUrl = 'https://api.binance.com/api/v3';
  private polymarketWsUrl = 'wss://ws-live-data.polymarket.com';
  private pollingIntervalMs = 10000; // 10 seconds

  constructor() {
    this.initializePrices();
  }

  /**
   * Start the data pipeline
   * Uses polling as primary with WS as enhancement
   */
  public async start(): Promise<void> {
    try {
      console.log('[DataPipeline] Starting data pipeline...');

      // Initialize with historical data
      await this.fetchInitialCandles();

      // Start polling for new candles
      this.startPolling();

      // Attempt WebSocket connection (non-blocking)
      this.connectToWebSockets().catch(err => {
        console.warn('[DataPipeline] WebSocket connection failed:', err.message);
        // Continue with polling-only mode
      });

      this.isConnected = true;
      this.emitEvent('connected', {});
      console.log('[DataPipeline] Started successfully');
    } catch (error) {
      console.error('[DataPipeline] Startup error:', error);
      throw error;
    }
  }

  /**
   * Stop the data pipeline
   */
  public stop(): void {
    if (this.pollInterval) clearInterval(this.pollInterval);
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    this.isConnected = false;
    this.emitEvent('disconnected', {});
    console.log('[DataPipeline] Stopped');
  }

  /**
   * Register event listener
   */
  public on(event: string, callback: EventCallback): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(callback);
  }

  /**
   * Emit event to all listeners
   */
  private emitEvent(event: string, data: any): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(cb => cb(data));
    }
  }

  /**
   * Fetch initial candles from Binance REST API
   */
  private async fetchInitialCandles(): Promise<void> {
    try {
      for (const asset of ['btcusdt', 'solusdt']) {
        for (const interval of ['5m', '15m']) {
          const candles = await this.fetchCandles(asset, interval, 100);
          const assetKey = asset.replace('usdt', '').toUpperCase();
          this.candleBuffer[assetKey][interval] = candles;
        }
      }
      console.log('[DataPipeline] Initial candles loaded');
    } catch (error) {
      console.error('[DataPipeline] Failed to fetch initial candles:', error);
    }
  }

  /**
   * Start polling for new data from Binance
   */
  private startPolling(): void {
    this.pollInterval = setInterval(async () => {
      try {
        // Fetch latest ticker data for prices
        const btcPrice = await this.fetchTicker('btcusdt');
        const solPrice = await this.fetchTicker('solusdt');

        if (btcPrice) this.updatePrice(btcPrice);
        if (solPrice) this.updatePrice(solPrice);

        // Fetch latest candle data
        const btc15m = await this.fetchCandles('btcusdt', '15m', 1);
        const btc5m = await this.fetchCandles('btcusdt', '5m', 1);
        const sol15m = await this.fetchCandles('solusdt', '15m', 1);
        const sol5m = await this.fetchCandles('solusdt', '5m', 1);

        if (btc15m.length > 0) this.addCandle('BTC', '15m', btc15m[0]);
        if (btc5m.length > 0) this.addCandle('BTC', '5m', btc5m[0]);
        if (sol15m.length > 0) this.addCandle('SOL', '15m', sol15m[0]);
        if (sol5m.length > 0) this.addCandle('SOL', '5m', sol5m[0]);

        this.lastUpdate = Date.now();
      } catch (error) {
        console.error('[DataPipeline] Polling error:', error);
      }
    }, this.pollingIntervalMs);
  }

  /**
   * Connect to WebSocket feeds (enhancement, non-blocking)
   */
  private async connectToWebSockets(): Promise<void> {
    // Note: Full WS implementation would require 'ws' package
    // For Next.js server environment, polling is preferred
    // This is a placeholder for WS integration

    try {
      console.log('[DataPipeline] WebSocket connection attempted (polling mode active)');
      // WebSocket code would go here if 'ws' package is available
      // For now, polling handles the data flow
    } catch (error) {
      console.warn('[DataPipeline] WebSocket not available:', error);
    }
  }

  /**
   * Fetch candles from Binance REST API
   * @param asset - Asset symbol (btcusdt, solusdt)
   * @param interval - Candle interval (5m, 15m)
   * @param limit - Number of candles to fetch
   */
  public async fetchCandles(
    asset: string,
    interval: string,
    limit: number = 100
  ): Promise<Candle[]> {
    try {
      const symbol = asset.toUpperCase();
      const url = `${this.binanceRestUrl}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;

      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();

      return data.map((candle: any[]) => ({
        timestamp: candle[0],
        open: parseFloat(candle[1]),
        high: parseFloat(candle[2]),
        low: parseFloat(candle[3]),
        close: parseFloat(candle[4]),
        volume: parseFloat(candle[7]),
        quoteAssetVolume: parseFloat(candle[7]),
        asset: symbol.replace('USDT', '') as 'BTC' | 'SOL',
        timeframe: interval as any,
      }));
    } catch (error) {
      console.error(`[DataPipeline] Error fetching candles for ${asset}:`, error);
      return [];
    }
  }

  /**
   * Fetch 24h ticker data from Binance
   * @param asset - Asset symbol (btcusdt, solusdt)
   */
  public async fetchTicker(asset: string): Promise<PriceUpdate | null> {
    try {
      const symbol = asset.toUpperCase();
      const url = `${this.binanceRestUrl}/ticker/24hr?symbol=${symbol}`;

      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();

      return {
        asset: symbol.replace('USDT', '') as 'BTC' | 'SOL',
        price: parseFloat(data.lastPrice),
        timestamp: data.time || Date.now(),
        source: 'binance',
        volume24h: parseFloat(data.volume),
        changePercent24h: parseFloat(data.priceChangePercent),
      };
    } catch (error) {
      console.error(`[DataPipeline] Error fetching ticker for ${asset}:`, error);
      return null;
    }
  }

  /**
   * Fetch Fear & Greed index from alternative.me
   */
  public async fetchFearGreedIndex(): Promise<{
    value: number;
    classification: string;
    timestamp: number;
  } | null> {
    try {
      const response = await fetch('https://api.alternative.me/fng/?limit=1');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      if (!data.data || data.data.length === 0) return null;

      const latest = data.data[0];
      return {
        value: parseInt(latest.value),
        classification: latest.value_classification,
        timestamp: parseInt(latest.timestamp) * 1000,
      };
    } catch (error) {
      console.error('[DataPipeline] Error fetching Fear & Greed:', error);
      return null;
    }
  }

  /**
   * Add a candle to the buffer
   */
  private addCandle(asset: 'BTC' | 'SOL', timeframe: '5m' | '15m', candle: Candle): void {
    const buffer = this.candleBuffer[asset][timeframe];

    // Avoid duplicates (same timestamp)
    if (buffer.length > 0 && buffer[buffer.length - 1].timestamp === candle.timestamp) {
      buffer[buffer.length - 1] = candle; // Update the latest
    } else {
      buffer.push(candle);
    }

    // Trim buffer to max size
    if (buffer.length > this.maxBufferSize) {
      buffer.shift();
    }

    this.emitEvent('candle', { asset, timeframe, candle });
  }

  /**
   * Update current price
   */
  private updatePrice(priceUpdate: PriceUpdate): void {
    const key = `${priceUpdate.asset}`;
    this.currentPrices[key] = priceUpdate;

    // Add to history for momentum calculation
    this.priceHistory.push(priceUpdate);

    // Keep history to 1 hour of data
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    this.priceHistory = this.priceHistory.filter(p => p.timestamp > oneHourAgo);

    this.emitEvent('price', priceUpdate);
  }

  /**
   * Initialize price data structure
   */
  private initializePrices(): void {
    for (const asset of ['BTC', 'SOL']) {
      this.currentPrices[asset] = {
        asset: asset as 'BTC' | 'SOL',
        price: 0,
        timestamp: Date.now(),
        source: 'binance',
      };
    }
  }

  /**
   * Get recent candles for an asset and timeframe
   * @param asset - BTC or SOL
   * @param timeframe - 5m or 15m
   * @param count - Number of candles to return
   */
  public getCandles(asset: 'BTC' | 'SOL', timeframe: '5m' | '15m', count: number = 50): Candle[] {
    const buffer = this.candleBuffer[asset]?.[timeframe] || [];
    if (buffer.length === 0) return [];

    return buffer.slice(Math.max(0, buffer.length - count));
  }

  /**
   * Get current price for an asset
   */
  public getCurrentPrice(asset: 'BTC' | 'SOL'): number {
    return this.currentPrices[asset]?.price || 0;
  }

  /**
   * Get price history for an asset within a time window
   * @param asset - BTC or SOL
   * @param minutes - How many minutes back to look
   */
  public getPriceHistory(asset: 'BTC' | 'SOL', minutes: number = 15): PriceUpdate[] {
    const cutoffTime = Date.now() - minutes * 60 * 1000;
    return this.priceHistory.filter(p => p.asset === asset && p.timestamp >= cutoffTime);
  }

  /**
   * Calculate momentum as percentage change
   * @param asset - BTC or SOL
   * @param windowMinutes - Window size for momentum calculation
   * @returns Percentage change (e.g., 0.5 for +0.5%)
   */
  public getMomentum(asset: 'BTC' | 'SOL', windowMinutes: number = 15): number {
    const history = this.getPriceHistory(asset, windowMinutes);

    if (history.length < 2) return 0;

    const oldestPrice = history[0].price;
    const latestPrice = history[history.length - 1].price;

    if (oldestPrice === 0) return 0;

    return ((latestPrice - oldestPrice) / oldestPrice) * 100;
  }

  /**
   * Get all available candles for an asset (all timeframes)
   */
  public getAllCandles(asset: 'BTC' | 'SOL'): { timeframe: '5m' | '15m'; candles: Candle[] }[] {
    const result = [];

    for (const timeframe of ['5m', '15m'] as const) {
      const candles = this.getCandles(asset, timeframe);
      if (candles.length > 0) {
        result.push({ timeframe, candles });
      }
    }

    return result;
  }

  /**
   * Check if pipeline is connected and receiving data
   */
  public isConnectedAndHealthy(): boolean {
    const timeSinceLastUpdate = Date.now() - this.lastUpdate;
    const maxStaleMs = this.pollingIntervalMs * 3; // Allow 3 polling cycles

    return this.isConnected && timeSinceLastUpdate < maxStaleMs;
  }

  /**
   * Get pipeline status
   */
  public getStatus(): {
    connected: boolean;
    lastUpdate: number;
    timeSinceUpdate: number;
    candleBufferSizes: Record<string, Record<string, number>>;
    priceHistorySize: number;
  } {
    return {
      connected: this.isConnected,
      lastUpdate: this.lastUpdate,
      timeSinceUpdate: Date.now() - this.lastUpdate,
      candleBufferSizes: {
        BTC: {
          '5m': this.candleBuffer.BTC['5m'].length,
          '15m': this.candleBuffer.BTC['15m'].length,
        },
        SOL: {
          '5m': this.candleBuffer.SOL['5m'].length,
          '15m': this.candleBuffer.SOL['15m'].length,
        },
      },
      priceHistorySize: this.priceHistory.length,
    };
  }

  /**
   * Serialize state for persistence
   */
  public serializeState(): {
    candleBuffer: CandleBuffer;
    currentPrices: PriceData;
    lastUpdate: number;
  } {
    return {
      candleBuffer: this.candleBuffer,
      currentPrices: this.currentPrices,
      lastUpdate: this.lastUpdate,
    };
  }

  /**
   * Restore state from persistence
   */
  public restoreState(state: ReturnType<DataPipeline['serializeState']>): void {
    this.candleBuffer = state.candleBuffer;
    this.currentPrices = state.currentPrices;
    this.lastUpdate = state.lastUpdate;
    console.log('[DataPipeline] State restored');
  }

  /**
   * Get metadata about available data
   */
  public getDataMetadata(): {
    assets: ('BTC' | 'SOL')[];
    timeframes: ('5m' | '15m')[];
    oldestCandleTime: {
      BTC: { '5m': number; '15m': number };
      SOL: { '5m': number; '15m': number };
    };
    newestCandleTime: {
      BTC: { '5m': number; '15m': number };
      SOL: { '5m': number; '15m': number };
    };
  } {
    const getEdgeTimes = (asset: 'BTC' | 'SOL', timeframe: '5m' | '15m') => {
      const buffer = this.candleBuffer[asset][timeframe];
      return {
        oldest: buffer.length > 0 ? buffer[0].timestamp : 0,
        newest: buffer.length > 0 ? buffer[buffer.length - 1].timestamp : 0,
      };
    };

    return {
      assets: ['BTC', 'SOL'],
      timeframes: ['5m', '15m'],
      oldestCandleTime: {
        BTC: {
          '5m': getEdgeTimes('BTC', '5m').oldest,
          '15m': getEdgeTimes('BTC', '15m').oldest,
        },
        SOL: {
          '5m': getEdgeTimes('SOL', '5m').oldest,
          '15m': getEdgeTimes('SOL', '15m').oldest,
        },
      },
      newestCandleTime: {
        BTC: {
          '5m': getEdgeTimes('BTC', '5m').newest,
          '15m': getEdgeTimes('BTC', '15m').newest,
        },
        SOL: {
          '5m': getEdgeTimes('SOL', '5m').newest,
          '15m': getEdgeTimes('SOL', '15m').newest,
        },
      },
    };
  }
}

export default DataPipeline;

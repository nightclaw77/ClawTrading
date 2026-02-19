/**
 * Polymarket Client - Production-grade trading engine
 * Handles authentication, order execution, and position management
 */

import crypto from 'crypto';
import { Wallet } from 'ethers';
import {
  Asset,
  Timeframe,
  OrderSide,
  OrderType,
  PolymarketWindow,
  Orderbook,
  OrderbookLevel,
  PricePoint,
  Position,
  Order,
  AccountBalance,
  ClobOrderRequest,
  ClobOrderResponse,
  GammaMarket,
  GammaToken,
} from '../types';

const CLOB_BASE_URL = 'https://clob.polymarket.com';
const GAMMA_API_BASE = 'https://gamma-api.polymarket.com';

interface ApiConfig {
  apiKey: string;
  secret: string;
  passphrase: string;
  privateKey: string;
  funderAddress: string;
  signerAddress?: string;
}

interface OrderbookResponse {
  bids: Array<{ price: string; size: string }>;
  asks: Array<{ price: string; size: string }>;
}

interface PositionResponse {
  token_id: string;
  balance: string;
}

/**
 * Polymarket CLOB Client with HMAC-SHA256 authentication
 */
export class PolymarketClient {
  private config: ApiConfig;
  private requestCache: Map<string, { data: any; timestamp: number }> = new Map();
  private cacheExpiry = 5000; // 5 seconds

  constructor(config: ApiConfig) {
    this.config = config;
    this.validateConfig();
  }

  /**
   * Create client from environment variables
   */
  static fromEnv(): PolymarketClient {
    const privateKey = process.env.POLYMARKET_PRIVATE_KEY || '';
    let signerAddress = '';
    if (privateKey) {
      try {
        signerAddress = new Wallet(privateKey).address;
      } catch {
        signerAddress = '';
      }
    }

    const config = {
      apiKey: process.env.POLYMARKET_API_KEY || '',
      secret: process.env.POLYMARKET_SECRET || '',
      passphrase: process.env.POLYMARKET_PASSPHRASE || '',
      privateKey,
      funderAddress: process.env.POLYMARKET_FUNDER_ADDRESS || '',
      signerAddress,
    };

    return new PolymarketClient(config);
  }

  /**
   * Validate configuration
   */
  private validateConfig(): void {
    if (!this.config.privateKey) throw new Error('Private key required');
    if (!this.config.funderAddress) throw new Error('Funder address required');
    // L2 creds may be missing initially; we can derive them via L1 auth on startup.
  }

  private derivingPromise: Promise<void> | null = null;

  /**
   * Derive L2 API credentials from private key using L1 auth.
   */
  private async deriveApiCredentials(): Promise<void> {
    if (this.derivingPromise) {
      await this.derivingPromise;
      return;
    }

    this.derivingPromise = (async () => {
      const wallet = new Wallet(this.config.privateKey);
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const nonce = 0;

      const domain = {
        name: 'ClobAuthDomain',
        version: '1',
        chainId: 137,
      };

      const types = {
        ClobAuth: [
          { name: 'address', type: 'address' },
          { name: 'timestamp', type: 'string' },
          { name: 'nonce', type: 'uint256' },
          { name: 'message', type: 'string' },
        ],
      } as const;

      const value = {
        address: wallet.address,
        timestamp,
        nonce,
        message: 'This message attests that I control the given wallet',
      };

      const signature = await wallet.signTypedData(domain, types as any, value as any);

      const response = await fetch(`${CLOB_BASE_URL}/auth/derive-api-key`, {
        method: 'GET',
        headers: {
          'POLY_ADDRESS': wallet.address,
          'POLY_SIGNATURE': signature,
          'POLY_TIMESTAMP': timestamp,
          'POLY_NONCE': String(nonce),
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to derive API credentials: ${response.status} ${await response.text()}`);
      }

      const creds = await response.json() as { apiKey: string; secret: string; passphrase: string };
      this.config.apiKey = creds.apiKey;
      this.config.secret = creds.secret;
      this.config.passphrase = creds.passphrase;
      this.config.signerAddress = wallet.address;
      console.log('[POLYMARKET] L2 credentials derived from private key');
    })();

    try {
      await this.derivingPromise;
    } finally {
      this.derivingPromise = null;
    }
  }

  private async ensureApiCredentials(): Promise<void> {
    if (!this.config.apiKey || !this.config.secret || !this.config.passphrase) {
      await this.deriveApiCredentials();
    }
  }

  /**
   * Generate HMAC-SHA256 signature for L2 authentication
   * Per Polymarket docs: message = timestamp + method + requestPath [+ body]
   * Secret is base64-encoded and must be decoded before use
   * Signature output must be URL-safe base64 (+ → -, / → _)
   */
  private generateSignature(
    method: string,
    path: string,
    body: string = ''
  ): { timestamp: string; signature: string } {
    const timestamp = Math.floor(Date.now() / 1000).toString(); // UNIX seconds

    let message = timestamp + method.toUpperCase() + path;
    if (body) {
      message += body;
    }

    // Decode base64url secret (convert - to + and _ to /)
    const secretFixed = this.config.secret
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .replace(/[^A-Za-z0-9+/=]/g, '');
    const secretBuf = Buffer.from(secretFixed, 'base64');

    const hmac = crypto.createHmac('sha256', secretBuf);
    hmac.update(message);
    // URL-safe base64 output (+ → -, / → _)
    const signature = hmac.digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

    return { timestamp, signature };
  }

  /**
   * Make authenticated HTTP request to CLOB API
   */
  private async request<T>(
    method: string,
    path: string,
    body?: any,
    retries: number = 3
  ): Promise<T> {
    await this.ensureApiCredentials();

    const cacheKey = `${method}:${path}`;

    // Check cache for GET requests
    if (method === 'GET') {
      const cached = this.requestCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
        return cached.data;
      }
    }

    const url = `${CLOB_BASE_URL}${path}`;
    const bodyStr = body ? JSON.stringify(body) : '';
    // Sign only the base path (no query params) per Polymarket SDK behavior
    const signPath = path.split('?')[0];
    const { timestamp, signature } = this.generateSignature(method, signPath, bodyStr);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      // Per docs: signer address goes in POLY_ADDRESS (funder is set when creating orders)
      'POLY_ADDRESS': this.config.signerAddress || this.config.funderAddress,
      'POLY_SIGNATURE': signature,
      'POLY_TIMESTAMP': timestamp,
      'POLY_API_KEY': this.config.apiKey,
      'POLY_PASSPHRASE': this.config.passphrase,
    };

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: bodyStr || undefined,
      });

      if (!response.ok) {
        const errorText = await response.text();

        // If API key is invalid, re-derive once and retry.
        if (response.status === 401 && /Invalid api key|Unauthorized/i.test(errorText)) {
          this.config.apiKey = '';
          this.config.secret = '';
          this.config.passphrase = '';
          if (retries > 0) {
            await this.ensureApiCredentials();
            return this.request<T>(method, path, body, retries - 1);
          }
        }

        throw new Error(`API error ${response.status}: ${errorText}`);
      }

      const data = await response.json() as T;

      // Cache successful GET responses
      if (method === 'GET') {
        this.requestCache.set(cacheKey, { data, timestamp: Date.now() });
      }

      return data;
    } catch (error) {
      if (retries > 0) {
        const delay = Math.pow(2, 3 - retries) * 1000; // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.request<T>(method, path, body, retries - 1);
      }
      throw error;
    }
  }

  /**
   * Make unauthenticated request to Gamma API (market discovery)
   */
  private async gammaRequest<T>(path: string, retries: number = 3): Promise<T> {
    const url = `${GAMMA_API_BASE}${path}`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`Gamma API error ${response.status}`);
      }

      return await response.json() as T;
    } catch (error) {
      if (retries > 0) {
        const delay = Math.pow(2, 3 - retries) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.gammaRequest<T>(path, retries - 1);
      }
      throw error;
    }
  }

  /**
   * Find active prediction windows for an asset and timeframe
   * Returns windows that are currently active or starting soon
   */
  async findActiveWindows(asset: Asset, timeframe: Timeframe): Promise<PolymarketWindow[]> {
    try {
      // Query Gamma API for markets matching the asset
      const markets = await this.gammaRequest<GammaMarket[]>(
        `/markets?search=${asset}+${timeframe === '5m' ? '5-minute' : '15-minute'}`
      );

      const windows: PolymarketWindow[] = [];
      const now = Date.now();

      for (const market of markets) {
        // Filter for Up/Down prediction markets
        if (!this.isValidPredictionMarket(market.question, asset, timeframe)) {
          continue;
        }

        const upToken = market.tokens.find(t => t.outcome.toUpperCase().includes('UP'));
        const downToken = market.tokens.find(t => t.outcome.toUpperCase().includes('DOWN'));

        if (!upToken || !downToken) continue;

        const closeTime = new Date(market.closedAt).getTime();

        // Only include active windows (opened and not yet closed, or closing within next hour)
        if (closeTime > now - 60000 && closeTime < now + 3600000) {
          const windowId = `${asset}-${timeframe}-${closeTime}`;

          windows.push({
            windowId,
            asset,
            timeframe,
            direction: 'UP',
            tokenId: upToken.token_id,
            openTimestamp: new Date(market.createdAt).getTime(),
            closeTimestamp: closeTime,
            upTokenId: upToken.token_id,
            downTokenId: downToken.token_id,
          });

          windows.push({
            windowId,
            asset,
            timeframe,
            direction: 'DOWN',
            tokenId: downToken.token_id,
            openTimestamp: new Date(market.createdAt).getTime(),
            closeTimestamp: closeTime,
            upTokenId: upToken.token_id,
            downTokenId: downToken.token_id,
          });
        }
      }

      return windows;
    } catch (error) {
      console.error('Error finding active windows:', error);
      return [];
    }
  }

  /**
   * Validate if a market question matches our prediction criteria
   */
  private isValidPredictionMarket(question: string, asset: Asset, timeframe: Timeframe): boolean {
    const lowerQ = question.toLowerCase();
    const assetStr = asset.toLowerCase();
    const timeStr = timeframe === '5m' ? '5-minute' : '15-minute';

    return (
      lowerQ.includes(assetStr) &&
      lowerQ.includes(timeStr) &&
      lowerQ.includes('up') &&
      lowerQ.includes('down')
    );
  }

  /**
   * Get current best price for a token (mid-price)
   */
  async getPrice(tokenId: string): Promise<number> {
    try {
      const orderbook = await this.getOrderBook(tokenId);
      return orderbook.mid;
    } catch (error) {
      console.error(`Error getting price for token ${tokenId}:`, error);
      throw error;
    }
  }

  /**
   * Get full orderbook for a token
   */
  async getOrderBook(tokenId: string): Promise<Orderbook> {
    try {
      const response = await this.request<OrderbookResponse>(
        'GET',
        `/orderbook?token_id=${tokenId}`
      );

      const bids = this.parseOrderbookLevels(response.bids);
      const asks = this.parseOrderbookLevels(response.asks);

      if (!bids || bids.length === 0 || !asks || asks.length === 0) {
        return { bids: [], asks: [], mid: 0.5, spread: 0, timestamp: Date.now() };
      }

      const bestBid = bids[0]?.price || 0;
      const bestAsk = asks[0]?.price || 1;
      const mid = (bestBid + bestAsk) / 2;
      const spread = bestAsk - bestBid;

      return {
        bids,
        asks,
        mid,
        spread,
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error(`Error getting orderbook for ${tokenId}:`, error);
      throw error;
    }
  }

  /**
   * Parse orderbook levels from API response
   */
  private parseOrderbookLevels(levels: Array<{ price: string; size: string }>): OrderbookLevel[] {
    return levels
      .map(level => ({
        price: parseFloat(level.price),
        size: parseFloat(level.size),
      }))
      .sort((a, b) => b.price - a.price) // Descending for display
      .slice(0, 10); // Top 10 levels
  }

  /**
   * Get mid-point price
   */
  async getMidpoint(tokenId: string): Promise<number> {
    const orderbook = await this.getOrderBook(tokenId);
    return orderbook.mid;
  }

  /**
   * Get bid-ask spread
   */
  async getSpread(tokenId: string): Promise<number> {
    const orderbook = await this.getOrderBook(tokenId);
    return orderbook.spread;
  }

  /**
   * Place a limit order
   */
  async placeLimitOrder(
    tokenId: string,
    side: OrderSide,
    price: number,
    size: number,
    orderType: OrderType = 'GTC',
    asset: Asset = 'BTC',
    direction: 'UP' | 'DOWN' = 'UP'
  ): Promise<Order> {
    try {
      // Validate price is within valid range (0, 1]
      if (price <= 0 || price > 1) {
        throw new Error(`Invalid price ${price}, must be in (0, 1]`);
      }

      // Validate size
      if (size <= 0) {
        throw new Error('Size must be positive');
      }

      const orderRequest: ClobOrderRequest = {
        token_id: tokenId,
        price,
        size,
        side,
        funder: this.config.funderAddress,
        order_type: orderType,
      };

      const response = await this.request<ClobOrderResponse>(
        'POST',
        '/orders',
        orderRequest
      );

      return {
        orderId: response.order_id,
        tokenId,
        asset,
        direction,
        side,
        price,
        size,
        filledSize: 0,
        status: 'OPEN',
        type: orderType,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
    } catch (error) {
      console.error('Error placing limit order:', error);
      throw error;
    }
  }

  /**
   * Place a market order
   * Implemented as aggressive limit orders to best available price
   */
  async placeMarketOrder(tokenId: string, side: OrderSide, size: number): Promise<Order> {
    try {
      const orderbook = await this.getOrderBook(tokenId);

      // Validate orderbook has liquidity for market order
      if (side === 'BUY' && (!orderbook.asks || orderbook.asks.length === 0)) {
        throw new Error('No asks available for market order');
      }
      if (side === 'SELL' && (!orderbook.bids || orderbook.bids.length === 0)) {
        throw new Error('No bids available for market order');
      }

      // For market buy, take best ask; for market sell, take best bid
      const price = side === 'BUY'
        ? orderbook.asks[0].price
        : orderbook.bids[0].price;

      // Market orders use FOK (Fill Or Kill) for immediate execution
      return this.placeLimitOrder(tokenId, side, price, size, 'FOK');
    } catch (error) {
      console.error('Error placing market order:', error);
      throw error;
    }
  }

  /**
   * Cancel a specific order
   */
  async cancelOrder(orderId: string): Promise<void> {
    try {
      await this.request<void>('DELETE', `/orders/${orderId}`);
    } catch (error) {
      console.error(`Error cancelling order ${orderId}:`, error);
      throw error;
    }
  }

  /**
   * Cancel all open orders
   */
  async cancelAllOrders(): Promise<void> {
    try {
      await this.request<void>('DELETE', '/orders');
    } catch (error) {
      console.error('Error cancelling all orders:', error);
      throw error;
    }
  }

  /**
   * Get all open positions
   */
  async getPositions(): Promise<Position[]> {
    try {
      const responses = await this.request<PositionResponse[]>(
        'GET',
        `/user/${this.config.funderAddress}/positions`
      );

      const positions: Position[] = [];

      for (const response of responses) {
        const balance = parseFloat(response.balance);
        if (balance !== 0) {
          positions.push({
            tokenId: response.token_id,
            asset: 'BTC', // Would be determined from token metadata
            direction: 'UP',
            size: Math.abs(balance),
            entryPrice: 0.5, // Would track actual entry price
            pnl: 0,
            unrealizedPnl: 0,
            timestamp: Date.now(),
          });
        }
      }

      return positions;
    } catch (error) {
      console.error('Error getting positions:', error);
      throw error;
    }
  }

  /**
   * Get USDC balance and account information
   * Uses /balance-allowance endpoint with signature_type=1 (POLY_PROXY for Magic Key)
   */
  async getBalance(): Promise<AccountBalance> {
    try {
      const response = await this.request<{ balance: string; allowance: string }>(
        'GET',
        `/balance-allowance?asset_type=COLLATERAL&signature_type=1`
      );

      // Balance is in USDC.e (6 decimals)
      const usdc = parseFloat(response.balance) / 1e6;

      return {
        usdc,
        totalValue: usdc,
        availableMargin: usdc,
        usedMargin: 0,
      };
    } catch (error) {
      console.error('Error getting balance:', error);
      throw error;
    }
  }

  /**
   * Clear request cache
   */
  clearCache(): void {
    this.requestCache.clear();
  }

  // ========== HEARTBEAT (critical for keeping orders alive) ==========
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * Start heartbeat - Polymarket requires this every 10 seconds
   * Without heartbeat, ALL open orders get cancelled automatically
   */
  startHeartbeat(): void {
    if (this.heartbeatInterval) return;

    const sendHeartbeat = async () => {
      try {
        await this.request<void>('POST', '/auth/heartbeat');
      } catch (error) {
        console.warn('[HEARTBEAT] Failed:', error);
      }
    };

    // Send immediately, then every 8 seconds (within 10s window)
    sendHeartbeat();
    this.heartbeatInterval = setInterval(sendHeartbeat, 8000);
    console.log('[POLYMARKET] Heartbeat started (8s interval)');
  }

  /**
   * Stop heartbeat - call when pausing/stopping bot
   */
  stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
      console.log('[POLYMARKET] Heartbeat stopped');
    }
  }

  /**
   * Get current token price with bid/ask
   */
  async getPricePoint(tokenId: string, asset: Asset, direction: 'UP' | 'DOWN'): Promise<PricePoint> {
    const orderbook = await this.getOrderBook(tokenId);

    return {
      tokenId,
      asset,
      direction,
      price: orderbook.mid,
      bid: orderbook.bids[0]?.price,
      ask: orderbook.asks[0]?.price,
      mid: orderbook.mid,
      timestamp: Date.now(),
    };
  }

  /**
   * Get combined price (UP + DOWN should sum to ~1.0 for healthy market)
   */
  async getCombinedPrice(upTokenId: string, downTokenId: string): Promise<number> {
    try {
      const upPrice = await this.getPrice(upTokenId);
      const downPrice = await this.getPrice(downTokenId);
      return upPrice + downPrice;
    } catch (error) {
      console.error('Error getting combined price:', error);
      return 1.0; // Assume healthy market
    }
  }

  /**
   * Health check - verify API connectivity
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.request<any>('GET', '/markets');
      return true;
    } catch (error) {
      console.error('Health check failed:', error);
      return false;
    }
  }
}

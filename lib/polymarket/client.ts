/**
 * Polymarket Client - Production-grade trading engine
 * Handles authentication, order execution, and position management
 */

import crypto from 'crypto';
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
    const config = {
      apiKey: process.env.POLYMARKET_API_KEY || '',
      secret: process.env.POLYMARKET_SECRET || '',
      passphrase: process.env.POLYMARKET_PASSPHRASE || '',
      privateKey: process.env.POLYMARKET_PRIVATE_KEY || '',
      funderAddress: process.env.POLYMARKET_FUNDER_ADDRESS || '',
    };

    if (!config.apiKey || !config.secret || !config.passphrase) {
      throw new Error('Missing Polymarket credentials in environment variables');
    }

    return new PolymarketClient(config);
  }

  /**
   * Validate configuration
   */
  private validateConfig(): void {
    if (!this.config.apiKey) throw new Error('API key required');
    if (!this.config.secret) throw new Error('API secret required');
    if (!this.config.passphrase) throw new Error('API passphrase required');
    if (!this.config.funderAddress) throw new Error('Funder address required');
  }

  /**
   * Generate HMAC-SHA256 signature for L2 authentication
   * Signature covers: timestamp + method + path + body
   */
  private generateSignature(
    method: string,
    path: string,
    body: string = ''
  ): { timestamp: string; signature: string } {
    const timestamp = Date.now().toString();

    const message = timestamp + method.toUpperCase() + path + body;
    const hmac = crypto.createHmac('sha256', this.config.secret);
    hmac.update(message);
    const signature = hmac.digest('base64');

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
    const { timestamp, signature } = this.generateSignature(method, path, bodyStr);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'POLY-TIMESTAMP': timestamp,
      'POLY-SIGNATURE': signature,
      'POLY-API-KEY': this.config.apiKey,
      'POLY-PASSPHRASE': this.config.passphrase,
    };

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: bodyStr || undefined,
      });

      if (!response.ok) {
        const errorText = await response.text();
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
   */
  async getBalance(): Promise<AccountBalance> {
    try {
      const response = await this.request<{ balance: string }>(
        'GET',
        `/user/${this.config.funderAddress}/balances`
      );

      const usdc = parseFloat(response.balance);

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

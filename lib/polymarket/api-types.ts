/**
 * Polymarket CLOB API Response Types
 * Type definitions for all API responses from https://clob.polymarket.com
 */

/**
 * Orderbook response from GET /orderbook
 */
export interface OrderbookData {
  bids: Array<{
    price: string;
    size: string;
  }>;
  asks: Array<{
    price: string;
    size: string;
  }>;
  timestamp?: number;
}

/**
 * Market response from GET /markets
 */
export interface MarketData {
  id: string;
  question: string;
  slug: string;
  description?: string;
  createdAt: string;
  closedAt: string;
  resolution_source?: string;
  outcome_prices?: number[];
  liquidity?: number;
  volume?: number;
  volume_24h?: number;
  tokens: TokenData[];
}

export interface TokenData {
  id: string;
  token_id: string;
  outcome: string;
  price: number;
  outcome_type?: string;
}

/**
 * User positions response from GET /user/{address}/positions
 */
export interface UserPositionData {
  token_id: string;
  balance: string;
  updated_at?: string;
}

/**
 * User balances response from GET /user/{address}/balances
 */
export interface UserBalanceData {
  balance: string;
  chain?: string;
  updated_at?: string;
}

/**
 * Order response from POST /orders
 */
export interface OrderCreatedData {
  order_id: string;
  transaction_hash?: string;
  status: string;
}

/**
 * Order status response from GET /orders/{id}
 */
export interface OrderStatusData {
  id: string;
  token_id: string;
  price: string;
  size: string;
  side: string;
  status: 'OPEN' | 'FILLED' | 'PARTIALLY_FILLED' | 'CANCELLED';
  filled_size: string;
  created_at: string;
  updated_at: string;
  order_type: string;
  funder: string;
}

/**
 * Trades response from GET /trades
 */
export interface TradeData {
  id: string;
  order_id: string;
  token_id: string;
  size: string;
  price: string;
  side: string;
  timestamp: string;
  tx_hash?: string;
}

/**
 * Notifications response from GET /notifications
 */
export interface NotificationData {
  id: string;
  type: string;
  message: string;
  data?: any;
  read: boolean;
  created_at: string;
}

/**
 * User profile response from GET /user/{address}
 */
export interface UserProfileData {
  address: string;
  username?: string;
  email?: string;
  created_at: string;
  settings?: {
    notifications_enabled?: boolean;
    risk_level?: 'low' | 'medium' | 'high';
  };
}

/**
 * Health check response from GET /health
 */
export interface HealthCheckData {
  status: 'ok' | 'degraded' | 'down';
  timestamp: number;
  version?: string;
}

/**
 * Generic API error response
 */
export interface ApiErrorData {
  message: string;
  code?: string;
  timestamp?: number;
  details?: Record<string, any>;
}

/**
 * Generic success response wrapper
 */
export interface ApiSuccessData<T> {
  success: true;
  data: T;
  timestamp: number;
}

/**
 * Gamma API market response
 */
export interface GammaMarketData {
  id: string;
  question: string;
  slug: string;
  description?: string;
  category?: string[];
  created_at: string;
  closed_at: string;
  tokens: GammaTokenData[];
  volume?: number;
  liquidity?: number;
  active?: boolean;
}

export interface GammaTokenData {
  id: string;
  token_id: string;
  outcome: string;
  price?: number;
  probability?: number;
}

/**
 * Order book levels for depth chart
 */
export interface OrderbookDepth {
  bids: Array<{
    price: number;
    size: number;
    cumulative_size: number;
  }>;
  asks: Array<{
    price: number;
    size: number;
    cumulative_size: number;
  }>;
  mid: number;
  spread: number;
  spread_percent: number;
}

/**
 * Trade history for analysis
 */
export interface TradeHistory {
  trades: TradeData[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Market statistics
 */
export interface MarketStats {
  token_id: string;
  price: number;
  price_24h_ago?: number;
  price_24h_high?: number;
  price_24h_low?: number;
  volume_24h?: number;
  volume_7d?: number;
  number_of_trades_24h?: number;
}

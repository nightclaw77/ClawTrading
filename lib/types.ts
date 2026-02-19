/**
 * Core type definitions for Polymarket trading bot
 */

export type Asset = 'BTC' | 'SOL';
export type Timeframe = '5m' | '15m';
export type OrderSide = 'BUY' | 'SELL';
export type OrderType = 'GTC' | 'FOK' | 'FAK'; // Good Till Cancelled, Fill Or Kill, Fill And Kill
export type SignatureType = 0 | 1 | 2; // 0=EOA, 1=POLY_PROXY (Magic Key), 2=POLY_GNOSIS_SAFE

/**
 * Polymarket prediction window
 */
export interface PolymarketWindow {
  windowId: string;
  asset: Asset;
  timeframe: Timeframe;
  direction: 'UP' | 'DOWN';
  tokenId: string;
  openTimestamp: number; // Unix timestamp in milliseconds
  closeTimestamp: number; // Unix timestamp in milliseconds
  upTokenId?: string; // For tracking both up/down pairs
  downTokenId?: string;
}

/**
 * Orderbook snapshot
 */
export interface OrderbookLevel {
  price: number;
  size: number;
}

export interface Orderbook {
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  mid: number;
  spread: number;
  timestamp: number;
}

/**
 * Price data
 */
export interface PricePoint {
  tokenId: string;
  asset: Asset;
  direction: 'UP' | 'DOWN';
  price: number;
  bid?: number;
  ask?: number;
  mid?: number;
  timestamp: number;
}

/**
 * Position tracking
 */
export interface Position {
  tokenId: string;
  asset: Asset;
  direction: 'UP' | 'DOWN';
  size: number; // Notional position size
  entryPrice: number;
  pnl: number;
  unrealizedPnl: number;
  timestamp: number;
}

/**
 * Order data
 */
export interface Order {
  orderId: string;
  tokenId: string;
  asset: Asset;
  direction: 'UP' | 'DOWN';
  side: OrderSide;
  price: number;
  size: number;
  filledSize: number;
  status: 'OPEN' | 'FILLED' | 'PARTIALLY_FILLED' | 'CANCELLED';
  type: OrderType;
  createdAt: number;
  updatedAt: number;
}

/**
 * Arbitrage signal detected
 */
export interface ArbitrageSignal {
  signalId: string;
  asset: Asset;
  timeframe: Timeframe;
  window: PolymarketWindow;

  // Price momentum data
  exchangePrice: number; // Current price on exchange
  windowOpenPrice: number; // Price when window opened
  priceMovement: number; // Percentage moved (0.005 = 0.5%)
  momentum: 'UP' | 'DOWN';

  // Polymarket mispricing
  polymarketPrice: number; // Current Polymarket prediction price
  theoreticalPrice: number; // Where it should be based on exchange
  mispriceAmount: number; // Theoretical - actual (positive = underpriced)
  edgePercentage: number; // Mispricing as % of position

  // Window state
  timeElapsed: number; // Milliseconds since window open
  timeRemaining: number; // Milliseconds until window close
  windowProgress: number; // 0 to 1, how far through the window

  // Confidence metrics
  confidence: number; // 0 to 1
  confidenceFactors: {
    momentumStrength: number; // How strong is the momentum
    windowTiming: number; // Better confidence early in window
    exchangeAgreement: number; // How many exchanges agree
    combinedPriceHealth: number; // UP + DOWN token prices sum to ~1.0
  };

  // Recommended action
  action: 'BUY' | 'SELL' | 'WAIT' | 'SKIP';
  recommendedSize: number; // Recommended position size
  estimatedProfit: number; // USDC profit if executed at current prices
  riskScore: number; // 0 to 1, higher = riskier

  // Metadata
  detectedAt: number;
  expiresAt: number; // When signal is no longer valid
  historicalAccuracy?: number; // Based on past similar signals
}

/**
 * Account balance
 */
export interface AccountBalance {
  usdc: number;
  totalValue: number;
  availableMargin: number;
  usedMargin: number;
}

/**
 * API response wrapper
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: number;
}

/**
 * Market data from Gamma API
 */
export interface GammaMarket {
  id: string;
  question: string;
  slug: string;
  createdAt: string;
  closedAt: string;
  tokens: GammaToken[];
  volume?: number;
  liquidity?: number;
}

export interface GammaToken {
  id: string;
  token_id: string;
  outcome: string;
  price: number;
}

/**
 * CLOB order request
 */
export interface ClobOrderRequest {
  token_id: string;
  price: number;
  size: number;
  side: 'BUY' | 'SELL';
  funder: string;
  order_type: OrderType;
}

/**
 * CLOB order response
 */
export interface ClobOrderResponse {
  order_id: string;
  transaction_hash: string;
}

/**
 * Binance price data for momentum tracking
 */
export interface ExchangePricePoint {
  exchange: 'BINANCE' | 'COINBASE' | 'KRAKEN';
  asset: Asset;
  price: number;
  timestamp: number;
  volume24h?: number;
}

/**
 * Configuration
 */
export interface BotConfig {
  polymarketApiKey: string;
  polymarketSecret: string;
  polymarketPassphrase: string;
  polymarketPrivateKey: string;
  polymarketFunderAddress: string;

  // Trading parameters
  maxPositionSize: number; // USDC
  minArbitrageEdge: number; // Minimum % edge to trade (0.01 = 1%)
  minConfidence: number; // Minimum confidence threshold (0 to 1)
  minWindowTimeRemaining: {
    '5m': number; // Milliseconds
    '15m': number;
  };

  // Risk management
  maxOpenPositions: number;
  maxLeverage: number;
  stopLossPercentage: number;
  takeProfitPercentage: number;

  // API retry logic
  maxRetries: number;
  retryDelayMs: number;
  requestTimeoutMs: number;
}

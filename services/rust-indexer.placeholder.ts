/**
 * rust-indexer.placeholder.ts
 *
 * This file documents the contract for the Rust indexer service
 * that will be implemented in Phase 1 (The Observer).
 *
 * ─────────────────────────────────────────────────────────────
 * WHAT IT DOES
 * ─────────────────────────────────────────────────────────────
 * The Rust indexer is a long-running process that:
 *
 *   1. Connects to an Ethereum RPC endpoint (or runs alongside `reth`).
 *   2. Subscribes to Uniswap V3 pool contract events:
 *        - Swap(address indexed sender, address indexed recipient,
 *           int256 amount0, int256 amount1,
 *           uint160 sqrtPriceX96, uint128 liquidity, int24 tick)
 *        - LiquidityAdded / LiquidityRemoved (position changes)
 *   3. For each event, computes:
 *        - The instantaneous pool price (from sqrtPriceX96)
 *        - The bid-ask spread across a configurable set of watched pools
 *        - The gas price at that block (for later P&L simulation)
 *   4. Writes normalized rows to a time-series database
 *        (target: TimescaleDB or ClickHouse — TBD).
 *   5. Exposes a gRPC stream so the Python intelligence layer (and
 *        this Next.js frontend via an API route) can consume events
 *        in real time.
 *
 * ─────────────────────────────────────────────────────────────
 * OUTPUT SCHEMA (per event)
 * ─────────────────────────────────────────────────────────────
 */

/** A single indexed event row. */
export interface IndexerEvent {
  /** Block number on the source chain. */
  blockNumber: number;
  /** Unix timestamp of the block. */
  timestamp: number;
  /** Uniswap V3 pool contract address. */
  poolAddress: string;
  /** Token-pair label, e.g. "ETH/USDC". */
  pairLabel: string;
  /** Instantaneous pool price derived from sqrtPriceX96. */
  price: number;
  /** Bid-ask spread across the top N watched pools for this pair. */
  spread: number;
  /** Base gas price at this block (in Gwei). */
  gasPriceGwei: number;
  /** Raw event type: "Swap" | "LiquidityAdd" | "LiquidityRemove". */
  eventType: "Swap" | "LiquidityAdd" | "LiquidityRemove";
}

/**
 * ─────────────────────────────────────────────────────────────
 * WATCHED POOLS (Phase 1 seed set)
 * ─────────────────────────────────────────────────────────────
 * Start narrow. Expand once the pipeline is stable.
 */
export const SEED_POOLS: { label: string; address: string; fee: number }[] = [
  // ETH / USDC — 0.05% fee tier (high liquidity, tight spread baseline)
  {
    label: "ETH/USDC",
    address: "0x8ad8f082a5100a2356d9954d495c9c70725cfde0", // mainnet placeholder
    fee: 500,
  },
  // ETH / USDT — 0.05% fee tier
  {
    label: "ETH/USDT",
    address: "0xdac8a0e0f5fed0bc4bd83a46177a559fc9a606fd", // mainnet placeholder
    fee: 500,
  },
];

/**
 * ─────────────────────────────────────────────────────────────
 * INTEGRATION POINTS
 * ─────────────────────────────────────────────────────────────
 * 1. gRPC service definition lives in `rust-core/proto/indexer.proto`
 *    (to be created in the Rust repo).
 * 2. This frontend will consume via a Next.js API route:
 *        GET /api/observer/events   — recent N events (REST poll)
 *        GET /api/observer/stream   — Server-Sent Events (live feed)
 * 3. The Python intelligence layer subscribes to the same gRPC stream
 *    for strategy analysis.
 *
 * ─────────────────────────────────────────────────────────────
 * STATUS
 * ─────────────────────────────────────────────────────────────
 * [ ] Rust indexer binary — not yet implemented
 * [ ] Pool event subscription — not yet implemented
 * [ ] Time-series write path — not yet implemented
 * [ ] gRPC stream — not yet implemented
 * [ ] API routes (this repo) — not yet implemented
 *
 * Owner: Itachi (Execution layer)
 * Phase: 1 — The Observer
 */

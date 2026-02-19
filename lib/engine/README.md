# Trading Engine Orchestrator

## Overview

The Trading Engine is the BRAIN of the entire Polymarket BTC/SOL scalping bot system. It is a production-ready TypeScript singleton that orchestrates all components:

- **Data Collection**: Real-time candles, prices, and Polymarket windows
- **Technical Analysis**: Ensemble strategy running on 15m candles
- **Arbitrage Detection**: Identifying Polymarket price lags vs Binance
- **Signal Combination**: Merging technical + arbitrage signals
- **Risk Management**: Position sizing, stop loss, trailing stops, take profit
- **Position Lifecycle**: Entry, monitoring, and exit management
- **Learning & Optimization**: ML-driven parameter tuning

## Architecture

### Singleton Pattern

```typescript
const engine = TradingEngine.getInstance(dataPipeline, polymarketClient, config);
```

The engine runs as a singleton, ensuring a single instance persists across API calls. Initialize once on first request, reuse on subsequent calls.

### Main Loop (10-Second Cycle)

```
runCycle()
├── Step 1: Data Collection (candles, prices, windows)
├── Step 2: Technical Analysis (ensemble on 15m)
├── Step 3: Arbitrage Detection (price lag detection)
├── Step 4: Signal Combination (tech + arbitrage merge)
├── Step 5: Entry Decision (qualify for 5m if confidence > 82%)
├── Step 6: Risk Check (RiskManager approval)
├── Step 7: Execution (place order via Polymarket)
├── Step 8: Monitoring (manage existing positions)
└── Learning (analyze closed trades)
```

## Core Components

### 1. Data Collection
Fetches every cycle:
- 15m candles for BTC and SOL (last 100)
- 5m candles for quick entries
- Current prices from Binance
- Active Polymarket prediction windows

### 2. Technical Analysis
Run every new 15m candle:
- Calculate ALL indicators (RSI, MACD, Bollinger Bands, ATR, ADX, VWAP, etc.)
- Detect market regime (TRENDING_UP, TRENDING_DOWN, RANGING, VOLATILE, CHOPPY)
- Detect trading session (ASIAN, LONDON, NY, LONDON_NY_OVERLAP)
- Calculate order flow (buy/sell volume analysis)
- Run Ensemble strategy (5 strategies with adaptive weighting)

Primary signal: **15m Ensemble Decision**

### 3. Arbitrage Detection
Every 5 seconds, check for mispricings:
- Compare Binance momentum vs Polymarket prices
- Detect when exchange price movement makes outcome nearly certain
- But Polymarket hasn't priced it in yet
- Generate ArbitrageSignal with confidence and edge %

Edge Threshold: **> 0.5% profit margin required**

### 4. Signal Combination Logic

**Scenario 1: Tech LONG + Arbitrage UP**
```
→ Combined Confidence = tech_conf * 1.3 (boosted)
→ Action: ENTER_15M
→ Qualifies for 5m if edge > 0.5%
```

**Scenario 2: Tech NEUTRAL + Arbitrage UP (confidence > 85%)**
```
→ Combined Confidence = arbitrage_conf
→ Action: ENTER_15M (arbitrage overrides)
→ Qualifies for 5m
```

**Scenario 3: Tech LONG + Arbitrage DOWN (conflict)**
```
→ Action: SKIP
→ Technical signal must not oppose arbitrage
```

**Scenario 4: Tech signal only, no arbitrage**
```
→ Action: ENTER_15M if confidence >= threshold
→ Does NOT qualify for 5m (needs arbitrage edge)
```

### 5. 5m Entry Requirements
To qualify for 5m markets (riskier, faster):

1. **Combined confidence > 82%** (high bar)
2. **Arbitrage edge confirmed** (price lag detected)
3. **No existing position** in that asset
4. **RiskManager approval** for position size

5m trades are higher risk but can catch micro-movements.

### 6. Risk Management
Applied to every trade:

```typescript
// Position sizing:
baseSize = 2% of account
* confidence scaling (65% conf = 0.5x, 95% conf = 1.5x)
* volatility scaling (high vol = 0.7x, low vol = 1.2x)
* session scaling (ASIAN 0.5x, NY 1.0x, OVERLAP 1.5x)

// Daily limits:
- Max 2% per position
- Max 2 open positions (1 BTC + 1 SOL)
- Max 5% daily loss limit
- Max 8% drawdown
- Max 20 trades per hour

// Per-trade exits:
- Stop loss: ATR-based or fixed %
- Trailing stop: activated at profit threshold
- Take profit levels: 3 levels with partial exits
- Window resolution: auto-close when market resolves
```

### 7. Asset Priority

**BTC First**
- More liquidity
- Tighter spreads
- Higher confidence windows

**SOL Secondary**
- Only enter when:
  - BTC has no position, OR
  - SOL has exceptional signal (> 88% confidence)
- Max 1 position per asset
- Max 2 positions total

### 8. Learning Engine

After each trade closes:

```typescript
LearningEngine.analyzeTrade(trade, botState)
├── Extract lessons learned
├── Identify patterns that led to win/loss
├── Suggest parameter adjustments
├── Update ML model weights
└── Every 50 trades: tuneParameters()
```

## API Endpoints

### GET /api/engine
Retrieve engine status and dashboard data.

**Response:**
```json
{
  "success": true,
  "data": {
    "dashboard": { /* DashboardData */ },
    "state": { /* BotState */ },
    "metrics": { /* performance metrics */ },
    "timestamp": 1708352000000
  }
}
```

### POST /api/engine/control
Control engine operations.

**Request:**
```json
{
  "action": "start" | "stop" | "pause" | "resume"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Engine started successfully",
  "action": "start",
  "engineStatus": "RUNNING",
  "timestamp": 1708352000000
}
```

### GET /api/engine/ws
Server-Sent Events (SSE) stream for real-time updates.

Push events every 2 seconds:
- `signal` - new signal generated
- `trade:opened` - position opened
- `trade:closed` - position closed
- `alert` - important alert
- `error` - error occurred
- `state:updated` - status changed
- `dashboard:update` - full dashboard data
- `arbitrage:detected` - arbitrage signal found
- `positions:updated` - position metrics updated
- `cycle:complete` - main loop cycle completed

**Client Usage:**
```typescript
const eventSource = new EventSource('/api/engine/ws');

eventSource.addEventListener('signal', (e) => {
  const signal = JSON.parse(e.data);
  console.log('New signal:', signal);
});

eventSource.addEventListener('trade:opened', (e) => {
  const trade = JSON.parse(e.data);
  console.log('Trade opened:', trade);
});

eventSource.addEventListener('error', (e) => {
  console.error('Engine error:', JSON.parse(e.data));
});
```

## Events Emitted

The engine is an EventEmitter that broadcasts:

```typescript
// Lifecycle
engine.on('initialized', (data) => {});
engine.on('started', (data) => {});
engine.on('stopped', (data) => {});

// Analysis
engine.on('signal', (data) => {
  // { asset, signal, timestamp }
});
engine.on('arbitrage:detected', (data) => {
  // { asset, signal, timestamp }
});

// Trading
engine.on('trade:opened', (data) => {
  // { position, signal, timestamp }
});
engine.on('trade:closed', (data) => {
  // { trade, reason, timestamp }
});
engine.on('take:profit:triggered', (data) => {
  // { position, level, timestamp }
});

// State
engine.on('state:updated', (data) => {
  // { status, timestamp }
});
engine.on('positions:monitored', (data) => {
  // { positions, timestamp }
});
engine.on('dashboard:update', (data) => {
  // { data, timestamp }
});

// Errors
engine.on('error', (data) => {
  // { message, timestamp }
});
engine.on('alert', (data) => {
  // Alert object with level, title, message
});
```

## Configuration

Default configuration includes:

```typescript
{
  primaryTimeframe: '15m',      // Main analysis timeframe
  secondaryTimeframe: '5m',     // Quick entry timeframe
  assets: ['BTC', 'SOL'],       // Trading assets

  risk: {
    maxPositionSizePercent: 2,  // Max 2% per trade
    maxOpenPositions: 2,        // Max 2 open positions
    dailyLossLimitPercent: 5,   // Stop if lose 5% daily
    maxDrawdownPercent: 8,      // Stop if drawdown 8%
    maxTradesPerHour: 20,       // Limit trades/hour
    minConfidenceThreshold: 65, // Min signal confidence
    stopLossPercent: 0.002,     // 0.2% stop loss
    atrMultiplier: 1.5,         // ATR-based stops
  },

  takeProfitLevels: [
    { profitPercent: 0.01, positionReduction: 0.33 },
    { profitPercent: 0.02, positionReduction: 0.33 },
    { profitPercent: 0.03, positionReduction: 0.34 },
  ],

  trailingStop: {
    enabled: true,
    activationPercent: 0.3,      // Activate at 0.3% profit
    trailingDistance: 0.15,      // Trail 0.15% below high
  },
}
```

## Performance Metrics Tracked

```typescript
{
  cyclesExecuted: number,       // Main loop iterations
  signalsGenerated: number,     // Total signals produced
  tradesOpened: number,         // Positions entered
  tradesClosed: number,         // Positions exited
  wins: number,                 // Winning trades
  losses: number,               // Losing trades
  totalPnL: number,             // Total profit/loss
  maxDrawdown: number,          // Peak-to-trough loss
  peakBalance: number,          // Highest account balance
}
```

## Usage Example

```typescript
import { TradingEngine } from '@/lib/engine/main';
import { DataPipeline } from '@/lib/data/pipeline';
import { PolymarketClient } from '@/lib/polymarket/client';

// Initialize on first call
const dataPipeline = new DataPipeline();
const polymarketClient = PolymarketClient.fromEnv();
const engine = TradingEngine.getInstance(
  dataPipeline,
  polymarketClient,
  DEFAULT_BOT_CONFIG
);

// Initialize and start
await engine.initialize();
await engine.start();

// Listen to events
engine.on('signal', (data) => console.log('Signal:', data));
engine.on('trade:opened', (data) => console.log('Trade opened:', data));
engine.on('trade:closed', (data) => console.log('Trade closed:', data));

// Get status anytime
const status = engine.getStatus();
const dashboard = engine.getDashboardData();

// Control via API
// POST /api/engine/control with { action: 'pause' }
// POST /api/engine/control with { action: 'resume' }
// POST /api/engine/control with { action: 'stop' }

// Listen to real-time updates
const eventSource = new EventSource('/api/engine/ws');
eventSource.addEventListener('dashboard:update', (e) => {
  const data = JSON.parse(e.data);
  console.log('Dashboard updated:', data);
});
```

## State Management

### BotState
Tracks complete bot runtime state:
- Account balance and P&L
- Open and closed positions
- Market regime and session
- Indicators and signals
- Risk metrics
- Connection status

### DashboardData
Derived from BotState for UI consumption:
- Account metrics
- Position summary
- Trade statistics
- Market analysis
- Performance charts
- Alerts and warnings

## Error Handling

All errors are caught and:
1. Logged to alert system
2. Emitted as 'error' event
3. Never crash the engine
4. Engine continues running

Critical errors trigger:
- Automatic position closing
- Alert escalation
- Connection checks
- Graceful degradation

## Performance Considerations

- **Memory**: ~50MB for state, candles, trades history
- **CPU**: < 5% per cycle (10s interval)
- **Network**: Async/await for all I/O, non-blocking
- **Scalability**: Singleton ensures single instance, no race conditions

## Thread Safety

Engine is NOT thread-safe. Must be:
- Instantiated once per process
- Accessed from single async context
- Protected by request lock if multi-threaded

In production, consider:
- Running in single Node.js process
- Or using distributed lock (Redis) for multi-instance

## Future Enhancements

- WebSocket support for sub-1s updates
- Multi-timeframe ensemble (5m + 15m combined)
- Advanced ML parameter tuning
- Sentiment analysis integration
- Cross-asset correlation detection
- Risk parity position sizing
- Circuit breaker patterns

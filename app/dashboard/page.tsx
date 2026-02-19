'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ============================================================================
// TYPES
// ============================================================================

interface PriceData {
  btc: {
    price: number;
    change24h: number;
    rsi: number;
    macd: { value: number; signal: number; histogram: number };
    emaAlignment: number; // 0-100 bullish indicator
    regime: 'TRENDING_UP' | 'TRENDING_DOWN' | 'RANGING' | 'VOLATILE';
    lastSignalTime: string;
  };
  sol: {
    price: number;
    change24h: number;
    rsi: number;
    macd: { value: number; signal: number; histogram: number };
    emaAlignment: number;
    regime: 'TRENDING_UP' | 'TRENDING_DOWN' | 'RANGING' | 'VOLATILE';
    lastSignalTime: string;
  };
  timestamp: string;
}

interface SignalData {
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  confidence: number; // 0-100
  asset: 'BTC' | 'SOL' | 'BOTH';
  reason: string;
  timestamp: string;
}

interface Position {
  id: string;
  asset: 'BTC' | 'SOL';
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  currentPrice: number;
  quantity: number;
  pnlPercent: number;
  pnl: number;
  timeOpen: string;
  stopLoss: number;
}

interface BotStats {
  status: 'RUNNING' | 'PAUSED' | 'STOPPED';
  session: 'LONDON' | 'NY' | 'ASIAN' | 'OVERLAP' | 'CLOSED';
  todayPnL: number;
  winRate: number;
  totalTrades: number;
  maxDrawdown: number;
  profitFactor: number;
  arbitrageSignals: number;
  fearGreedIndex: number;
}

interface EngineData extends PriceData {
  signal: SignalData;
  positions: Position[];
  stats: BotStats;
}

// Normalize mixed backend payloads into dashboard UI shape
function toEngineData(raw: any): EngineData {
  // Already in expected shape
  if (raw?.btc?.price !== undefined && raw?.sol?.price !== undefined) {
    return raw as EngineData;
  }

  // New API shape: { dashboard, state, metrics } or just dashboard
  const d = raw?.dashboard ?? raw ?? {};

  const sessionMap = (d?.currentSession?.currentSession ?? d?.currentSession ?? 'CLOSED') as BotStats['session'];
  const statusMap = (d?.botStatus ?? d?.status ?? 'STOPPED') as BotStats['status'];

  const currentPrice = Number(d?.currentPrice ?? 0);
  const dailyPnL = Number(d?.dailyPnL ?? 0);

  return {
    btc: {
      price: currentPrice,
      change24h: 0,
      rsi: 50,
      macd: { value: 0, signal: 0, histogram: 0 },
      emaAlignment: 50,
      regime: 'RANGING',
      lastSignalTime: new Date().toISOString(),
    },
    sol: {
      price: currentPrice,
      change24h: 0,
      rsi: 50,
      macd: { value: 0, signal: 0, histogram: 0 },
      emaAlignment: 50,
      regime: 'RANGING',
      lastSignalTime: new Date().toISOString(),
    },
    timestamp: new Date().toISOString(),
    signal: {
      direction: 'NEUTRAL',
      confidence: Number(d?.marketRegime?.confidence ?? 50),
      asset: 'BOTH',
      reason: 'Waiting for market data',
      timestamp: new Date().toISOString(),
    },
    positions: Array.isArray(d?.openPositions) ? d.openPositions : [],
    stats: {
      status: statusMap,
      session: sessionMap,
      todayPnL: dailyPnL,
      winRate: Number(d?.dailyWinRate ?? 0),
      totalTrades: Number(d?.allTimeStats?.totalTrades ?? 0),
      maxDrawdown: Number(d?.currentDrawdownPercent ?? 0),
      profitFactor: Number(d?.allTimeStats?.profitFactor ?? 0),
      arbitrageSignals: Number(d?.alerts?.length ?? 0),
      fearGreedIndex: 50,
    },
  };
}

// ============================================================================
// ANIMATED NUMBER COMPONENT
// ============================================================================

const AnimatedNumber: React.FC<{
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}> = ({ value, decimals = 2, prefix = '', suffix = '', className = '' }) => {
  const [displayValue, setDisplayValue] = useState(value);

  useEffect(() => {
    const duration = 300;
    const startValue = displayValue;
    const difference = value - startValue;
    let startTime: number | null = null;

    const animate = (currentTime: number) => {
      if (startTime === null) startTime = currentTime;
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      const current = startValue + difference * progress;
      setDisplayValue(current);

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [value]);

  return (
    <span className={className}>
      {prefix}
      {displayValue.toFixed(decimals)}
      {suffix}
    </span>
  );
};

// ============================================================================
// GAUGE COMPONENT (for RSI)
// ============================================================================

const RSIGauge: React.FC<{ value: number }> = ({ value }) => {
  const getColor = (val: number) => {
    if (val > 70) return '#ff3366'; // Overbought - red
    if (val > 60) return '#ffd700'; // Approaching overbought - gold
    if (val > 40) return '#00ff88'; // Neutral - green
    if (val > 30) return '#ffd700'; // Approaching oversold - gold
    return '#ff3366'; // Oversold - red
  };

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-xs text-gray-400">RSI</span>
        <span className="text-sm font-bold" style={{ color: getColor(value) }}>
          <AnimatedNumber value={value} decimals={1} suffix=" " />
        </span>
      </div>
      <div className="relative h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: getColor(value) }}
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.5 }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-gray-500">
        <span>0</span>
        <span>30</span>
        <span>50</span>
        <span>70</span>
        <span>100</span>
      </div>
    </div>
  );
};

// ============================================================================
// MACD HISTOGRAM COMPONENT
// ============================================================================

const MACDHistogram: React.FC<{
  value: number;
  signal: number;
  histogram: number;
}> = ({ value, signal, histogram }) => {
  const maxValue = Math.max(Math.abs(value), Math.abs(signal), Math.abs(histogram), 0.5);

  return (
    <div className="space-y-2">
      <span className="text-xs text-gray-400">MACD</span>
      <div className="flex items-end justify-center gap-1 h-12">
        <motion.div
          className="w-1 rounded-sm"
          style={{
            backgroundColor: value > 0 ? '#00ff88' : '#ff3366',
            height: `${Math.abs(value) / maxValue * 100}%`,
          }}
          initial={{ height: 0 }}
          animate={{ height: `${Math.abs(value) / maxValue * 100}%` }}
          transition={{ duration: 0.5 }}
        />
        <motion.div
          className="w-1 rounded-sm"
          style={{
            backgroundColor: signal > 0 ? '#00d4ff' : '#ff8844',
            height: `${Math.abs(signal) / maxValue * 100}%`,
          }}
          initial={{ height: 0 }}
          animate={{ height: `${Math.abs(signal) / maxValue * 100}%` }}
          transition={{ duration: 0.5 }}
        />
        <motion.div
          className="w-2 rounded-sm"
          style={{
            backgroundColor: histogram > 0 ? '#00ff88' : '#ff3366',
            opacity: 0.6,
            height: `${Math.abs(histogram) / maxValue * 100}%`,
          }}
          initial={{ height: 0 }}
          animate={{ height: `${Math.abs(histogram) / maxValue * 100}%` }}
          transition={{ duration: 0.5 }}
        />
      </div>
    </div>
  );
};

// ============================================================================
// EMA ALIGNMENT COMPONENT
// ============================================================================

const EMAAlignment: React.FC<{ value: number }> = ({ value }) => {
  const getBullishColor = (val: number) => {
    if (val > 80) return '#00ff88';
    if (val > 60) return '#00d4ff';
    if (val > 40) return '#ffd700';
    return '#ff3366';
  };

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-xs text-gray-400">EMA Stack</span>
        <span className="text-xs font-bold" style={{ color: getBullishColor(value) }}>
          <AnimatedNumber value={value} decimals={0} suffix="%" />
        </span>
      </div>
      <div className="relative h-1 bg-gray-800 rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: getBullishColor(value) }}
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.5 }}
        />
      </div>
    </div>
  );
};

// ============================================================================
// MARKET REGIME BADGE
// ============================================================================

const MarketRegimeBadge: React.FC<{
  regime: 'TRENDING_UP' | 'TRENDING_DOWN' | 'RANGING' | 'VOLATILE';
}> = ({ regime }) => {
  const regimeConfig: Record<string, { label: string; bg: string; text: string; icon: string }> = {
    TRENDING_UP: { label: '📈 UP TREND', bg: 'bg-green-500/10', text: 'text-green-400', icon: '↗' },
    TRENDING_DOWN: {
      label: '📉 DOWN TREND',
      bg: 'bg-red-500/10',
      text: 'text-red-400',
      icon: '↘',
    },
    RANGING: { label: '➡️ RANGING', bg: 'bg-yellow-500/10', text: 'text-yellow-400', icon: '↔' },
    VOLATILE: {
      label: '⚡ VOLATILE',
      bg: 'bg-purple-500/10',
      text: 'text-purple-400',
      icon: '⚡',
    },
  };

  const config = regimeConfig[regime];

  return (
    <motion.div
      className={`${config.bg} ${config.text} px-3 py-1.5 rounded-lg text-xs font-bold inline-block border border-current border-opacity-20`}
      animate={{ scale: [1, 1.05, 1] }}
      transition={{ duration: 2, repeat: Infinity }}
    >
      {config.label}
    </motion.div>
  );
};

// ============================================================================
// ASSET ANALYSIS PANEL (Left/Right)
// ============================================================================

const AssetPanel: React.FC<{
  asset: 'BTC' | 'SOL';
  data: PriceData['btc'] | PriceData['sol'];
}> = ({ asset, data }) => {
  const isPositive = data.price > 0;
  const accentColor = asset === 'BTC' ? '#00d4ff' : '#9945ff';

  return (
    <motion.div
      className="relative h-full backdrop-blur-xl bg-gradient-to-br from-gray-900/40 to-gray-900/20 rounded-2xl border border-white/5 p-6 overflow-hidden"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
    >
      {/* Animated gradient background */}
      <div
        className="absolute inset-0 opacity-10"
        style={{
          background: `radial-gradient(circle at 20% 50%, ${accentColor}, transparent)`,
        }}
      />

      {/* Content */}
      <div className="relative space-y-6">
        {/* Header */}
        <div className="flex justify-between items-start">
          <h2 className="text-2xl font-black" style={{ color: accentColor }}>
            {asset}
          </h2>
          <motion.div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: accentColor }}
            animate={{ scale: [1, 1.5, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
        </div>

        {/* Price Display */}
        <motion.div
          className="space-y-1"
          layout
        >
          <div className="text-4xl font-black tracking-tighter">
            <AnimatedNumber
              value={data.price}
              decimals={2}
              prefix="$"
              className="text-white"
            />
          </div>
          <div
            className={`text-sm font-bold ${
              data.change24h > 0 ? 'text-green-400' : 'text-red-400'
            }`}
          >
            <AnimatedNumber
              value={data.change24h}
              decimals={2}
              prefix={data.change24h > 0 ? '+' : ''}
              suffix="%"
            />
          </div>
        </motion.div>

        {/* Divider */}
        <div className="h-px bg-gradient-to-r from-white/0 via-white/10 to-white/0" />

        {/* Indicators */}
        <div className="space-y-5">
          <RSIGauge value={data.rsi} />
          <MACDHistogram
            value={data.macd.value}
            signal={data.macd.signal}
            histogram={data.macd.histogram}
          />
          <EMAAlignment value={data.emaAlignment} />
        </div>

        {/* Divider */}
        <div className="h-px bg-gradient-to-r from-white/0 via-white/10 to-white/0" />

        {/* Market Regime */}
        <div className="space-y-2">
          <span className="text-xs text-gray-400">MARKET</span>
          <MarketRegimeBadge regime={data.regime} />
        </div>

        {/* Last Signal */}
        <div className="text-xs text-gray-500 pt-2 border-t border-white/5">
          Last signal: {new Date(data.lastSignalTime).toLocaleTimeString('en-US', { timeZone: 'UTC' })}
        </div>
      </div>
    </motion.div>
  );
};

// ============================================================================
// HEADER COMPONENT
// ============================================================================

const Header: React.FC<{
  btcPrice: number;
  btcChange: number;
  solPrice: number;
  solChange: number;
  botStatus: BotStats['status'];
  session: BotStats['session'];
  currentTime: string;
}> = ({ btcPrice, btcChange, solPrice, solChange, botStatus, session, currentTime }) => {
  const statusConfig: Record<BotStats['status'], { bg: string; text: string; dot: string }> = {
    RUNNING: { bg: 'bg-green-500/20', text: 'text-green-400', dot: '#00ff88' },
    PAUSED: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', dot: '#ffd700' },
    STOPPED: { bg: 'bg-red-500/20', text: 'text-red-400', dot: '#ff3366' },
  };

  const sessionConfig: Record<BotStats['session'], string> = {
    LONDON: '🇬🇧 LONDON',
    NY: '🇺🇸 NEW YORK',
    ASIAN: '🌏 ASIAN',
    OVERLAP: '🌍 OVERLAP',
    CLOSED: '🔴 CLOSED',
  };

  const config = statusConfig[botStatus];

  return (
    <motion.header
      className="relative backdrop-blur-xl bg-gradient-to-r from-gray-900/80 to-gray-900/60 border-b border-white/5"
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
    >
      <div className="px-8 py-4">
        <div className="flex items-center justify-between">
          {/* Left: Logo */}
          <div className="flex items-center gap-3">
            <motion.div
              className="relative w-10 h-10 bg-gradient-to-br from-cyan-400 to-blue-600 rounded-lg flex items-center justify-center"
              animate={{ boxShadow: ['0 0 20px rgba(0,212,255,0.5)', '0 0 40px rgba(0,212,255,0.8)', '0 0 20px rgba(0,212,255,0.5)'] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <span className="text-white font-black text-lg">⚡</span>
            </motion.div>
            <h1 className="text-2xl font-black tracking-tighter bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
              CLAWTRADE
            </h1>
          </div>

          {/* Center: Price Tickers */}
          <div className="flex items-center gap-12">
            <motion.div
              className="flex items-baseline gap-2"
              whileHover={{ scale: 1.05 }}
            >
              <span className="text-xs text-gray-400">BTC</span>
              <span className="text-lg font-bold text-cyan-400">
                <AnimatedNumber value={btcPrice} decimals={0} prefix="$" />
              </span>
              <span
                className={`text-xs font-bold ${btcChange > 0 ? 'text-green-400' : 'text-red-400'}`}
              >
                <AnimatedNumber
                  value={btcChange}
                  decimals={2}
                  prefix={btcChange > 0 ? '+' : ''}
                  suffix="%"
                />
              </span>
            </motion.div>

            <div className="h-6 w-px bg-gradient-to-b from-transparent via-white/10 to-transparent" />

            <motion.div
              className="flex items-baseline gap-2"
              whileHover={{ scale: 1.05 }}
            >
              <span className="text-xs text-gray-400">SOL</span>
              <span className="text-lg font-bold text-purple-400">
                <AnimatedNumber value={solPrice} decimals={2} prefix="$" />
              </span>
              <span
                className={`text-xs font-bold ${solChange > 0 ? 'text-green-400' : 'text-red-400'}`}
              >
                <AnimatedNumber
                  value={solChange}
                  decimals={2}
                  prefix={solChange > 0 ? '+' : ''}
                  suffix="%"
                />
              </span>
            </motion.div>
          </div>

          {/* Right: Status Badges */}
          <div className="flex items-center gap-3">
            <motion.div
              className={`${config.bg} ${config.text} px-4 py-2 rounded-lg text-xs font-bold inline-flex items-center gap-2 border border-current border-opacity-20`}
              animate={{ scale: [1, 1.02, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: config.dot }} />
              {botStatus}
            </motion.div>

            <div className="h-6 w-px bg-gradient-to-b from-transparent via-white/10 to-transparent" />

            <div className="px-4 py-2 rounded-lg text-xs font-bold text-blue-400 bg-blue-500/10 border border-blue-400/20">
              {sessionConfig[session]}
            </div>

            <div className="h-6 w-px bg-gradient-to-b from-transparent via-white/10 to-transparent" />

            <div className="text-xs text-gray-400">
              {currentTime} <span className="text-[10px]">UTC</span>
            </div>
          </div>
        </div>
      </div>
    </motion.header>
  );
};

// ============================================================================
// SIGNAL CARD COMPONENT
// ============================================================================

const SignalCard: React.FC<{ signal: SignalData }> = ({ signal }) => {
  const directionConfig: Record<SignalData['direction'], { color: string; icon: string; label: string }> = {
    LONG: { color: '#00ff88', icon: '↗', label: 'LONG' },
    SHORT: { color: '#ff3366', icon: '↘', label: 'SHORT' },
    NEUTRAL: { color: '#ffd700', icon: '→', label: 'NEUTRAL' },
  };

  const config = directionConfig[signal.direction];

  return (
    <motion.div
      className="relative backdrop-blur-xl bg-gradient-to-br from-gray-900/40 to-gray-900/20 rounded-2xl border border-white/5 p-6 overflow-hidden"
      animate={{
        borderColor: [
          'rgba(255,255,255,0.05)',
          `${config.color}20`,
          'rgba(255,255,255,0.05)',
        ],
      }}
      transition={{ duration: 2, repeat: Infinity }}
    >
      {/* Background glow */}
      <div
        className="absolute inset-0 opacity-20"
        style={{
          background: `radial-gradient(circle at center, ${config.color}, transparent)`,
        }}
      />

      <div className="relative space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-300">Active Signal</h3>
          <motion.div
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 1, repeat: Infinity }}
          >
            <span className="text-3xl" style={{ color: config.color }}>
              {config.icon}
            </span>
          </motion.div>
        </div>

        <div className="space-y-3">
          <div>
            <span className="text-xs text-gray-400">Direction</span>
            <p className="text-2xl font-black" style={{ color: config.color }}>
              {config.label}
            </p>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs text-gray-400">Confidence</span>
              <span className="text-sm font-bold text-cyan-400">
                <AnimatedNumber value={signal.confidence} decimals={1} suffix="%" />
              </span>
            </div>
            <div className="relative h-2 bg-gray-800 rounded-full overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{ backgroundColor: config.color }}
                initial={{ width: 0 }}
                animate={{ width: `${signal.confidence}%` }}
                transition={{ duration: 0.8 }}
              />
            </div>
          </div>

          <div>
            <span className="text-xs text-gray-400">Reason</span>
            <p className="text-sm font-semibold text-gray-300 mt-1">{signal.reason}</p>
          </div>

          <div className="text-xs text-gray-500 pt-2 border-t border-white/5">
            {new Date(signal.timestamp).toLocaleTimeString('en-US', { timeZone: 'UTC' })} UTC
          </div>
        </div>
      </div>
    </motion.div>
  );
};

// ============================================================================
// POSITIONS TABLE COMPONENT
// ============================================================================

const PositionsTable: React.FC<{ positions: Position[] }> = ({ positions }) => {
  return (
    <motion.div
      className="backdrop-blur-xl bg-gradient-to-br from-gray-900/40 to-gray-900/20 rounded-2xl border border-white/5 p-6 overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6, delay: 0.2 }}
    >
      <h3 className="text-lg font-bold text-gray-300 mb-4">Active Positions</h3>

      {positions.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          No active positions
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left py-3 px-4 text-xs font-bold text-gray-400">Asset</th>
                <th className="text-left py-3 px-4 text-xs font-bold text-gray-400">Direction</th>
                <th className="text-right py-3 px-4 text-xs font-bold text-gray-400">Entry</th>
                <th className="text-right py-3 px-4 text-xs font-bold text-gray-400">Current</th>
                <th className="text-right py-3 px-4 text-xs font-bold text-gray-400">P&L %</th>
                <th className="text-right py-3 px-4 text-xs font-bold text-gray-400">P&L $</th>
                <th className="text-right py-3 px-4 text-xs font-bold text-gray-400">Time</th>
                <th className="text-right py-3 px-4 text-xs font-bold text-gray-400">Stop</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {positions.map((pos) => (
                  <motion.tr
                    key={pos.id}
                    className="border-b border-white/5 hover:bg-white/5 transition-colors"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                  >
                    <td className="py-3 px-4 font-bold">
                      <span
                        style={{
                          color: pos.asset === 'BTC' ? '#00d4ff' : '#9945ff',
                        }}
                      >
                        {pos.asset}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className="font-bold"
                        style={{
                          color: pos.direction === 'LONG' ? '#00ff88' : '#ff3366',
                        }}
                      >
                        {pos.direction}
                      </span>
                    </td>
                    <td className="text-right py-3 px-4">
                      <AnimatedNumber value={pos.entryPrice} decimals={2} prefix="$" />
                    </td>
                    <td className="text-right py-3 px-4">
                      <AnimatedNumber value={pos.currentPrice} decimals={2} prefix="$" />
                    </td>
                    <td
                      className="text-right py-3 px-4 font-bold"
                      style={{
                        color: pos.pnlPercent > 0 ? '#00ff88' : '#ff3366',
                      }}
                    >
                      <AnimatedNumber
                        value={pos.pnlPercent}
                        decimals={2}
                        prefix={pos.pnlPercent > 0 ? '+' : ''}
                        suffix="%"
                      />
                    </td>
                    <td
                      className="text-right py-3 px-4 font-bold"
                      style={{
                        color: pos.pnl > 0 ? '#00ff88' : '#ff3366',
                      }}
                    >
                      <AnimatedNumber
                        value={Math.abs(pos.pnl)}
                        decimals={2}
                        prefix={`${pos.pnl >= 0 ? '+' : ''}$`}
                      />
                    </td>
                    <td className="text-right py-3 px-4 text-gray-400">
                      {new Date(pos.timeOpen).toLocaleTimeString('en-US', {
                        timeZone: 'UTC',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="text-right py-3 px-4">
                      <AnimatedNumber value={pos.stopLoss} decimals={2} prefix="$" />
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      )}
    </motion.div>
  );
};

// ============================================================================
// STATS ROW COMPONENT
// ============================================================================

const StatsRow: React.FC<{ stats: BotStats }> = ({ stats }) => {
  const StatCard: React.FC<{
    label: string;
    value: string | number;
    unit?: string;
    color?: string;
    showBar?: boolean;
    barValue?: number;
  }> = ({ label, value, unit = '', color = 'text-cyan-400', showBar = false, barValue = 0 }) => (
    <motion.div
      className="backdrop-blur-xl bg-gradient-to-br from-gray-900/40 to-gray-900/20 rounded-xl border border-white/5 p-4 flex-1"
      whileHover={{ scale: 1.02 }}
      transition={{ duration: 0.3 }}
    >
      <div className="text-xs text-gray-400 mb-2">{label}</div>
      <div className={`text-2xl font-black tracking-tighter ${color}`}>
        {typeof value === 'number' ? (
          <AnimatedNumber
            value={value}
            decimals={label.includes('$') || label.includes('Rate') ? 2 : 1}
            suffix={unit}
          />
        ) : (
          value
        )}
      </div>
      {showBar && (
        <div className="mt-3 relative h-1.5 bg-gray-800 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-cyan-400 to-blue-600 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${barValue}%` }}
            transition={{ duration: 0.6 }}
          />
        </div>
      )}
    </motion.div>
  );

  return (
    <motion.div
      className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.3 }}
    >
      <StatCard
        label="Today's P&L"
        value={stats.todayPnL}
        unit="$"
        color={stats.todayPnL > 0 ? 'text-green-400' : 'text-red-400'}
      />
      <StatCard
        label="Win Rate"
        value={stats.winRate}
        unit="%"
        showBar
        barValue={stats.winRate}
      />
      <StatCard
        label="Total Trades"
        value={stats.totalTrades}
        color="text-yellow-400"
      />
      <StatCard
        label="Max Drawdown"
        value={stats.maxDrawdown}
        unit="%"
        color="text-orange-400"
      />
      <StatCard
        label="Profit Factor"
        value={stats.profitFactor}
        color="text-purple-400"
      />
      <StatCard
        label="Arb Signals"
        value={stats.arbitrageSignals}
        color="text-pink-400"
      />
    </motion.div>
  );
};

// ============================================================================
// LOADING SKELETON COMPONENT
// ============================================================================

const LoadingSkeleton: React.FC = () => (
  <div className="space-y-6">
    <div className="h-20 bg-gradient-to-r from-gray-800 to-gray-900 rounded-xl animate-pulse" />
    <div className="grid grid-cols-12 gap-6">
      <div className="col-span-12 md:col-span-3 h-96 bg-gradient-to-r from-gray-800 to-gray-900 rounded-2xl animate-pulse" />
      <div className="col-span-12 md:col-span-6 h-96 bg-gradient-to-r from-gray-800 to-gray-900 rounded-2xl animate-pulse" />
      <div className="col-span-12 md:col-span-3 h-96 bg-gradient-to-r from-gray-800 to-gray-900 rounded-2xl animate-pulse" />
    </div>
    <div className="h-64 bg-gradient-to-r from-gray-800 to-gray-900 rounded-2xl animate-pulse" />
  </div>
);

// ============================================================================
// MAIN DASHBOARD COMPONENT
// ============================================================================

export default function Dashboard() {
  const [data, setData] = useState<EngineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState<string>('');
  const sseRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Update current time
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString('en-US', { timeZone: 'UTC', hour12: false })
      );
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Fallback polling
  const setupPolling = useCallback(() => {
    const poll = async () => {
      try {
        const response = await fetch('/api/engine');
        if (!response.ok) throw new Error(`API error: ${response.status}`);

        const raw = await response.json();
        const newData = toEngineData(raw?.data ?? raw);
        setData(newData);
        setLoading(false);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Connection failed');
        setLoading(false);
      }
    };

    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, []);

  // Connect to SSE with fallback polling
  const connectSSE = useCallback(() => {
    // Try SSE first
    try {
      const eventSource = new EventSource('/api/engine/ws');

      // Server emits custom events (dashboard:update), not default "message"
      eventSource.addEventListener('dashboard:update', (event: MessageEvent) => {
        try {
          const payload = JSON.parse(event.data) as { data: any; timestamp: number };
          setData(toEngineData(payload?.data));
          setLoading(false);
          setError(null);
        } catch (err) {
          console.error('Failed to parse dashboard:update SSE data:', err);
        }
      });

      // Keep this as fallback if server ever emits plain message events
      eventSource.onmessage = (event) => {
        try {
          const maybe = JSON.parse(event.data);
          setData(toEngineData(maybe));
          setLoading(false);
          setError(null);
        } catch {
          // ignore non-EngineData messages
        }
      };

      eventSource.onerror = () => {
        console.warn('SSE connection failed, falling back to polling');
        eventSource.close();
        sseRef.current = null;
        setupPolling();
      };

      sseRef.current = eventSource;
    } catch (err) {
      console.warn('SSE not supported, using polling');
      setupPolling();
    }
  }, [setupPolling]);

  // Initialize connection
  useEffect(() => {
    connectSSE();

    return () => {
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connectSSE]);

  // Auto-reconnect on SSE failure
  useEffect(() => {
    if (!sseRef.current && !loading && error) {
      reconnectTimeoutRef.current = setTimeout(() => {
        console.log('Attempting to reconnect...');
        connectSSE();
      }, 5000);
    }

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [sseRef.current, loading, error, connectSSE]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-[#030712] to-slate-950 text-white p-8">
        <LoadingSkeleton />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-[#030712] to-slate-950 text-white flex items-center justify-center p-8">
        <motion.div
          className="text-center space-y-4"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <h2 className="text-2xl font-bold text-red-400">Connection Error</h2>
          <p className="text-gray-400">{error || 'Failed to load dashboard data'}</p>
          <motion.button
            className="mt-6 px-6 py-3 bg-cyan-500 hover:bg-cyan-600 text-black font-bold rounded-lg transition-colors"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => window.location.reload()}
          >
            Reload Dashboard
          </motion.button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-[#030712] to-slate-950 text-white">
      {/* Background grid effect */}
      <div
        className="fixed inset-0 opacity-5"
        style={{
          backgroundImage: `
            linear-gradient(0deg, transparent 24%, rgba(0, 212, 255, .1) 25%, rgba(0, 212, 255, .1) 26%, transparent 27%, transparent 74%, rgba(0, 212, 255, .1) 75%, rgba(0, 212, 255, .1) 76%, transparent 77%, transparent),
            linear-gradient(90deg, transparent 24%, rgba(0, 212, 255, .1) 25%, rgba(0, 212, 255, .1) 26%, transparent 27%, transparent 74%, rgba(0, 212, 255, .1) 75%, rgba(0, 212, 255, .1) 76%, transparent 77%, transparent)
          `,
          backgroundSize: '50px 50px',
          pointerEvents: 'none',
        }}
      />

      {/* Header */}
      <Header
        btcPrice={data.btc.price}
        btcChange={data.btc.change24h}
        solPrice={data.sol.price}
        solChange={data.sol.change24h}
        botStatus={data.stats.status}
        session={data.stats.session}
        currentTime={currentTime}
      />

      {/* Main Content */}
      <main className="relative p-8 space-y-8">
        {/* Three Column Layout */}
        <motion.div
          className="grid grid-cols-12 gap-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6 }}
        >
          {/* Left Column - BTC */}
          <div className="col-span-12 md:col-span-3">
            <AssetPanel asset="BTC" data={data.btc} />
          </div>

          {/* Center Column - Chart Area */}
          <div className="col-span-12 md:col-span-6 space-y-6">
            {/* TradingView Chart Placeholder */}
            <motion.div
              className="relative aspect-video backdrop-blur-xl bg-gradient-to-br from-gray-900/40 to-gray-900/20 rounded-2xl border border-white/5 overflow-hidden group"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, delay: 0.1 }}
            >
              {/* Chart Background */}
              <div className="absolute inset-0 bg-gradient-to-b from-gray-900/60 via-[#030712] to-gray-900/40 flex items-center justify-center">
                <div className="text-center space-y-3">
                  <div className="text-6xl">📊</div>
                  <p className="text-gray-400 font-mono text-sm">TradingView Chart</p>
                  <p className="text-gray-500 text-xs">[15M / 5M timeframes]</p>
                </div>
              </div>

              {/* Mock Chart Lines */}
              <svg
                className="absolute inset-0 w-full h-full opacity-20"
                preserveAspectRatio="none"
              >
                <path d="M 0 180 Q 150 120 300 100 T 600 140" stroke="#00d4ff" strokeWidth="2" fill="none" />
                <path d="M 0 200 Q 150 140 300 120 T 600 160" stroke="#9945ff" strokeWidth="1" fill="none" strokeDasharray="5,5" />
              </svg>

              {/* Timeframe Selector */}
              <div className="absolute top-4 right-4 flex gap-2 z-10">
                {['15M', '5M'].map((tf) => (
                  <motion.button
                    key={tf}
                    className={`px-3 py-1 rounded text-xs font-bold transition-all ${
                      tf === '15M'
                        ? 'bg-cyan-500 text-black'
                        : 'bg-white/10 text-gray-300 hover:bg-white/20'
                    }`}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    // TODO: Implement onClick handler to switch timeframe
                  >
                    {tf}
                  </motion.button>
                ))}
              </div>

              {/* Asset Selector */}
              <div className="absolute top-4 left-4 flex gap-2 z-10">
                {['BTC', 'SOL'].map((asset) => (
                  <motion.button
                    key={asset}
                    className={`px-3 py-1 rounded text-xs font-bold transition-all ${
                      asset === 'BTC'
                        ? 'bg-cyan-500 text-black'
                        : 'bg-white/10 text-gray-300 hover:bg-white/20'
                    }`}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    // TODO: Implement onClick handler to switch asset
                  >
                    {asset}
                  </motion.button>
                ))}
              </div>
            </motion.div>

            {/* Signal Card */}
            <SignalCard signal={data.signal} />

            {/* Positions Table */}
            <PositionsTable positions={data.positions} />
          </div>

          {/* Right Column - SOL */}
          <div className="col-span-12 md:col-span-3">
            <AssetPanel asset="SOL" data={data.sol} />
          </div>
        </motion.div>

        {/* Bottom Stats Row */}
        <StatsRow stats={data.stats} />

        {/* Footer */}
        <motion.footer
          className="text-center text-xs text-gray-500 pt-6 border-t border-white/5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.4 }}
        >
          <p>
            CLAWTRADE Trading Bot Dashboard • Last update: {new Date(data.timestamp).toLocaleTimeString('en-US', { timeZone: 'UTC' })} UTC
          </p>
        </motion.footer>
      </main>
    </div>
  );
}

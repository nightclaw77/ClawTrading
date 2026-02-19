'use client';

import React, { useEffect, useRef, useState } from 'react';
import { NeuralNetwork3D, NeuralNetwork3DHandle } from './components/NeuralNetwork3D';

interface BotStats {
  status: 'RUNNING' | 'PAUSED';
  totalTrades: number;
  winRate: number;
  todaysPnL: number;
  patternCount: number;
  lastTrade?: {
    symbol: string;
    direction: 'UP' | 'DOWN';
    timeframe: string;
    result: 'WIN' | 'LOSS';
    pnl: number;
  };
  learningEvent?: string;
  activePatterns: number;
  strategyWeights?: Record<string, number>;
}

interface TradeLog {
  timestamp: string;
  symbol: string;
  direction: string;
  result: string;
  pnl: string;
}

export default function LearningVisualizationPage() {
  const neuralNetworkRef = useRef<NeuralNetwork3DHandle>(null);
  const [botStats, setBotStats] = useState<BotStats>({
    status: 'RUNNING',
    totalTrades: 142,
    winRate: 67.3,
    todaysPnL: 847.23,
    patternCount: 23,
    activePatterns: 5,
    lastTrade: {
      symbol: 'BTC',
      direction: 'UP',
      timeframe: '15m',
      result: 'WIN',
      pnl: 124,
    },
    learningEvent: 'RSI 73 + low vol = poor long',
    strategyWeights: {
      'EMA Crossover': 0.92,
      'RSI Reversal': 0.78,
      'Breakout': 0.65,
      'VWAP Reversion': 0.71,
      'Order Flow': 0.85,
    },
  });

  const [tradeLogs, setTradeLogs] = useState<TradeLog[]>([
    { timestamp: '14:32:15', symbol: 'BTC', direction: 'LONG', result: 'WIN', pnl: '+$124.50' },
    { timestamp: '14:28:42', symbol: 'SOL', direction: 'SHORT', result: 'WIN', pnl: '+$87.20' },
    { timestamp: '14:25:11', symbol: 'ETH', direction: 'LONG', result: 'LOSS', pnl: '-$45.30' },
    { timestamp: '14:21:08', symbol: 'BTC', direction: 'SHORT', result: 'WIN', pnl: '+$156.75' },
    { timestamp: '14:18:33', symbol: 'SOL', direction: 'LONG', result: 'WIN', pnl: '+$92.15' },
  ]);

  // Poll for live data
  useEffect(() => {
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch('/api/engine', {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });

        if (response.ok) {
          const data = await response.json();
          const prevWinRate = botStats.winRate;

          setBotStats(prev => ({
            ...prev,
            status: data.status || prev.status,
            totalTrades: data.totalTrades || prev.totalTrades,
            winRate: data.winRate || prev.winRate,
            todaysPnL: data.pnl || prev.todaysPnL,
            patternCount: data.patterns || prev.patternCount,
            activePatterns: data.activePatterns || prev.activePatterns,
            lastTrade: data.lastTrade || prev.lastTrade,
            learningEvent: data.learningEvent || prev.learningEvent,
            strategyWeights: data.strategyWeights || prev.strategyWeights,
          }));

          // Trigger visual effects based on trade results
          if (data.lastTrade) {
            if (data.lastTrade.result === 'WIN') {
              neuralNetworkRef.current?.triggerWin();
            } else {
              neuralNetworkRef.current?.triggerLoss();
            }
          }

          // Trigger learning event
          if (data.learningEvent) {
            neuralNetworkRef.current?.triggerLearning();
          }

          // Add to trade log
          if (data.lastTrade && data.lastTrade.timestamp) {
            setTradeLogs(prev => [
              {
                timestamp: new Date(data.lastTrade.timestamp).toLocaleTimeString(),
                symbol: data.lastTrade.symbol,
                direction: data.lastTrade.direction,
                result: data.lastTrade.result,
                pnl: `${data.lastTrade.pnl >= 0 ? '+' : ''}$${Math.abs(data.lastTrade.pnl).toFixed(2)}`,
              },
              ...prev.slice(0, 4),
            ]);
          }
        }
      } catch (error) {
        console.error('Failed to fetch bot stats:', error);
      }
    }, 3000);

    return () => clearInterval(pollInterval);
  }, []);

  const winLossColor = botStats.winRate >= 50 ? '#10b981' : '#ef4444';
  const pnlColor = botStats.todaysPnL >= 0 ? '#10b981' : '#ef4444';

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      background: 'linear-gradient(135deg, #0f172a 0%, #1a1f35 50%, #0f172a 100%)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      fontFamily: '"Geist", "system-ui", sans-serif',
    }}>
      {/* 3D Visualization */}
      <div style={{
        flex: 1,
        position: 'relative',
        overflow: 'hidden',
      }}>
        <NeuralNetwork3D ref={neuralNetworkRef} botStats={botStats} />

        {/* Left Panel - Bot Status */}
        <div style={{
          position: 'absolute',
          top: '20px',
          left: '20px',
          background: 'rgba(15, 23, 42, 0.85)',
          border: '1px solid rgba(0, 255, 255, 0.3)',
          borderRadius: '12px',
          padding: '20px',
          minWidth: '280px',
          backdropFilter: 'blur(10px)',
          boxShadow: '0 8px 32px rgba(0, 255, 255, 0.1)',
        }}>
          <h2 style={{
            margin: '0 0 16px 0',
            fontSize: '18px',
            fontWeight: 600,
            color: '#00ffff',
            textShadow: '0 0 10px rgba(0, 255, 255, 0.5)',
          }}>
            Bot Status
          </h2>

          <div style={{
            display: 'grid',
            gap: '12px',
          }}>
            {/* Status */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '8px 0',
              borderBottom: '1px solid rgba(100, 116, 139, 0.3)',
            }}>
              <span style={{ color: '#94a3b8', fontSize: '13px' }}>Status:</span>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}>
                <div style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: botStats.status === 'RUNNING' ? '#10b981' : '#ef4444',
                  boxShadow: `0 0 10px ${botStats.status === 'RUNNING' ? '#10b981' : '#ef4444'}`,
                }} />
                <span style={{ color: '#e2e8f0', fontSize: '13px', fontWeight: 500 }}>
                  {botStats.status}
                </span>
              </div>
            </div>

            {/* Total Trades */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '8px 0',
              borderBottom: '1px solid rgba(100, 116, 139, 0.3)',
            }}>
              <span style={{ color: '#94a3b8', fontSize: '13px' }}>Total Trades:</span>
              <span style={{ color: '#e2e8f0', fontSize: '13px', fontWeight: 600 }}>{botStats.totalTrades}</span>
            </div>

            {/* Win Rate */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '8px 0',
              borderBottom: '1px solid rgba(100, 116, 139, 0.3)',
            }}>
              <span style={{ color: '#94a3b8', fontSize: '13px' }}>Win Rate:</span>
              <span style={{ color: winLossColor, fontSize: '13px', fontWeight: 600 }}>
                {botStats.winRate.toFixed(1)}%
              </span>
            </div>

            {/* Today's P&L */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '8px 0',
              borderBottom: '1px solid rgba(100, 116, 139, 0.3)',
            }}>
              <span style={{ color: '#94a3b8', fontSize: '13px' }}>Today's P&L:</span>
              <span style={{ color: pnlColor, fontSize: '13px', fontWeight: 600 }}>
                {botStats.todaysPnL >= 0 ? '+' : ''}${botStats.todaysPnL.toFixed(2)}
              </span>
            </div>

            {/* Pattern Library */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '8px 0',
            }}>
              <span style={{ color: '#94a3b8', fontSize: '13px' }}>Pattern Library:</span>
              <span style={{ color: '#e2e8f0', fontSize: '13px', fontWeight: 600 }}>
                {botStats.patternCount} patterns
              </span>
            </div>
          </div>
        </div>

        {/* Right Panel - Last Trade & Learning */}
        <div style={{
          position: 'absolute',
          top: '20px',
          right: '20px',
          background: 'rgba(15, 23, 42, 0.85)',
          border: '1px solid rgba(255, 0, 255, 0.3)',
          borderRadius: '12px',
          padding: '20px',
          minWidth: '300px',
          backdropFilter: 'blur(10px)',
          boxShadow: '0 8px 32px rgba(255, 0, 255, 0.1)',
        }}>
          <h2 style={{
            margin: '0 0 16px 0',
            fontSize: '18px',
            fontWeight: 600,
            color: '#ff00ff',
            textShadow: '0 0 10px rgba(255, 0, 255, 0.5)',
          }}>
            Live Insights
          </h2>

          <div style={{ display: 'grid', gap: '12px' }}>
            {/* Last Trade */}
            {botStats.lastTrade && (
              <div style={{
                padding: '12px',
                background: 'rgba(100, 116, 139, 0.1)',
                border: '1px solid rgba(100, 116, 139, 0.2)',
                borderRadius: '8px',
              }}>
                <div style={{
                  fontSize: '11px',
                  color: '#64748b',
                  marginBottom: '6px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}>
                  Last Trade
                </div>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '6px',
                }}>
                  <span style={{ color: '#e2e8f0', fontSize: '13px', fontWeight: 600 }}>
                    {botStats.lastTrade.symbol} {botStats.lastTrade.direction} {botStats.lastTrade.timeframe}
                  </span>
                  <span style={{
                    background: botStats.lastTrade.result === 'WIN' ? '#10b981' : '#ef4444',
                    color: '#fff',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 600,
                  }}>
                    {botStats.lastTrade.result}
                  </span>
                </div>
                <div style={{
                  color: botStats.lastTrade.pnl >= 0 ? '#10b981' : '#ef4444',
                  fontSize: '14px',
                  fontWeight: 600,
                }}>
                  {botStats.lastTrade.pnl >= 0 ? '+' : ''}${botStats.lastTrade.pnl.toFixed(2)}
                </div>
              </div>
            )}

            {/* Learning Event */}
            {botStats.learningEvent && (
              <div style={{
                padding: '12px',
                background: 'rgba(255, 170, 0, 0.1)',
                border: '1px solid rgba(255, 170, 0, 0.3)',
                borderRadius: '8px',
              }}>
                <div style={{
                  fontSize: '11px',
                  color: '#64748b',
                  marginBottom: '6px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}>
                  Learning
                </div>
                <div style={{
                  color: '#ffd700',
                  fontSize: '12px',
                  fontStyle: 'italic',
                }}>
                  "{botStats.learningEvent}"
                </div>
              </div>
            )}

            {/* Active Patterns */}
            <div style={{
              padding: '12px',
              background: 'rgba(0, 255, 170, 0.1)',
              border: '1px solid rgba(0, 255, 170, 0.3)',
              borderRadius: '8px',
            }}>
              <div style={{
                fontSize: '11px',
                color: '#64748b',
                marginBottom: '6px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}>
                Active Patterns
              </div>
              <div style={{
                color: '#00ffaa',
                fontSize: '13px',
                fontWeight: 600,
              }}>
                {botStats.activePatterns} golden setups
              </div>
            </div>

            {/* Strategy Weights */}
            {botStats.strategyWeights && (
              <div style={{
                padding: '12px',
                background: 'rgba(139, 92, 246, 0.1)',
                border: '1px solid rgba(139, 92, 246, 0.3)',
                borderRadius: '8px',
              }}>
                <div style={{
                  fontSize: '11px',
                  color: '#64748b',
                  marginBottom: '8px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}>
                  Strategy Weights
                </div>
                <div style={{ display: 'grid', gap: '6px' }}>
                  {Object.entries(botStats.strategyWeights).slice(0, 3).map(([name, weight]) => (
                    <div key={name} style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '11px',
                    }}>
                      <span style={{ color: '#cbd5e1' }}>{name}</span>
                      <div style={{
                        background: 'rgba(139, 92, 246, 0.2)',
                        borderRadius: '4px',
                        overflow: 'hidden',
                        width: '60px',
                        height: '4px',
                      }}>
                        <div style={{
                          background: 'linear-gradient(90deg, #8b5cf6, #06b6d4)',
                          height: '100%',
                          width: `${(weight as number) * 100}%`,
                        }} />
                      </div>
                      <span style={{ color: '#a78bfa', fontWeight: 600, width: '30px', textAlign: 'right' }}>
                        {((weight as number) * 100).toFixed(0)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Bottom Trade Log */}
        <div style={{
          position: 'absolute',
          bottom: '20px',
          left: '20px',
          right: '20px',
          maxWidth: '600px',
          background: 'rgba(15, 23, 42, 0.85)',
          border: '1px solid rgba(0, 255, 170, 0.3)',
          borderRadius: '12px',
          padding: '16px',
          backdropFilter: 'blur(10px)',
          boxShadow: '0 8px 32px rgba(0, 255, 170, 0.1)',
          maxHeight: '280px',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}>
          <h3 style={{
            margin: '0 0 12px 0',
            fontSize: '14px',
            fontWeight: 600,
            color: '#00ffaa',
            textShadow: '0 0 8px rgba(0, 255, 170, 0.5)',
          }}>
            Trade Activity
          </h3>

          <div style={{
            display: 'grid',
            gap: '8px',
            overflowY: 'auto',
            flex: 1,
          }}>
            {tradeLogs.length === 0 ? (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '100px',
                color: '#64748b',
                fontSize: '13px',
                fontStyle: 'italic',
              }}>
                No trades yet — waiting for first signal...
              </div>
            ) : (
              tradeLogs.map((log, idx) => (
              <div key={idx} style={{
                display: 'grid',
                gridTemplateColumns: '70px 50px 60px 60px auto',
                gap: '12px',
                alignItems: 'center',
                padding: '8px',
                background: 'rgba(100, 116, 139, 0.05)',
                borderRadius: '6px',
                fontSize: '12px',
                borderLeft: `3px solid ${log.result === 'WIN' ? '#10b981' : '#ef4444'}`,
              }}>
                <span style={{ color: '#64748b' }}>{log.timestamp}</span>
                <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{log.symbol}</span>
                <span style={{
                  color: log.direction === 'LONG' ? '#00ffaa' : '#ff6b6b',
                  fontWeight: 600,
                }}>
                  {log.direction}
                </span>
                <span style={{
                  color: log.result === 'WIN' ? '#10b981' : '#ef4444',
                  fontWeight: 600,
                }}>
                  {log.result}
                </span>
                <span style={{
                  color: log.pnl.startsWith('+') ? '#10b981' : '#ef4444',
                  fontWeight: 600,
                  textAlign: 'right',
                }}>
                  {log.pnl}
                </span>
              </div>
            ))
            )}
          </div>
        </div>

        {/* Title */}
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center',
          pointerEvents: 'none',
        }}>
          <h1 style={{
            margin: 0,
            fontSize: '42px',
            fontWeight: 700,
            background: 'linear-gradient(135deg, #00ffff, #ff00ff)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            textShadow: '0 0 30px rgba(0, 255, 255, 0.2)',
            letterSpacing: '-1px',
          }}>
            Neural Network Intelligence
          </h1>
          <p style={{
            margin: '8px 0 0 0',
            fontSize: '16px',
            color: '#94a3b8',
            letterSpacing: '1px',
            textTransform: 'uppercase',
            fontWeight: 500,
          }}>
            Real-Time Bot Learning Visualization
          </p>
        </div>
      </div>
    </div>
  );
}

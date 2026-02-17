'use client';

import { useState, useEffect } from 'react';
import { Scan, CheckCircle, XCircle, Clock } from 'lucide-react';

interface ScanResult {
  timeframe: string;
  trend: string;
  rsi: number;
  macd: string;
  volume: string;
  signal: string;
  confidence: number;
}

export default function MarketScanner() {
  const [results, setResults] = useState<ScanResult[]>([]);
  const [lastScan, setLastScan] = useState<Date | null>(null);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    performScan();
    const interval = setInterval(performScan, 300000); // Scan every 5 minutes
    return () => clearInterval(interval);
  }, []);

  const performScan = async () => {
    setScanning(true);
    
    // Simulate scan results
    // In production, this would analyze multiple timeframes
    const mockResults: ScanResult[] = [
      {
        timeframe: '1m',
        trend: 'BULLISH',
        rsi: 52.3,
        macd: 'BULLISH',
        volume: 'NORMAL',
        signal: 'NEUTRAL',
        confidence: 45
      },
      {
        timeframe: '5m',
        trend: 'BULLISH',
        rsi: 48.7,
        macd: 'BULLISH',
        volume: 'ELEVATED',
        signal: 'WEAK_LONG',
        confidence: 55
      },
      {
        timeframe: '15m',
        trend: 'NEUTRAL',
        rsi: 51.2,
        macd: 'BEARISH',
        volume: 'NORMAL',
        signal: 'NEUTRAL',
        confidence: 40
      },
      {
        timeframe: '1h',
        trend: 'BEARISH',
        rsi: 44.5,
        macd: 'BEARISH',
        volume: 'LOW',
        signal: 'NEUTRAL',
        confidence: 35
      }
    ];

    setResults(mockResults);
    setLastScan(new Date());
    setScanning(false);
  };

  const getTrendColor = (trend: string) => {
    switch (trend) {
      case 'BULLISH': return 'text-green-400';
      case 'BEARISH': return 'text-red-400';
      default: return 'text-slate-400';
    }
  };

  const getSignalBadge = (signal: string, confidence: number) => {
    if (signal.includes('LONG')) {
      return (
        <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded">
          LONG {confidence}%
        </span>
      );
    }
    if (signal.includes('SHORT')) {
      return (
        <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs rounded">
          SHORT {confidence}%
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 bg-slate-700 text-slate-400 text-xs rounded">
        NEUTRAL
      </span>
    );
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Scan className={`w-5 h-5 text-blue-400 ${scanning ? 'animate-pulse' : ''}`} />
          <h2 className="font-semibold">Market Scanner</h2>
        </div>
        <div className="flex items-center gap-2">
          {lastScan && (
            <span className="text-xs text-slate-500">
              Last scan: {lastScan.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={performScan}
            disabled={scanning}
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50"
          >
            <Clock className={`w-4 h-4 ${scanning ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800">
              <th className="text-left py-2 text-slate-400 font-medium">Timeframe</th>
              <th className="text-left py-2 text-slate-400 font-medium">Trend</th>
              <th className="text-left py-2 text-slate-400 font-medium">RSI</th>
              <th className="text-left py-2 text-slate-400 font-medium">MACD</th>
              <th className="text-left py-2 text-slate-400 font-medium">Volume</th>
              <th className="text-left py-2 text-slate-400 font-medium">Signal</th>
            </tr>
          </thead>
          <tbody>
            {results.map((result) => (
              <tr key={result.timeframe} className="border-b border-slate-800/50">
                <td className="py-3 font-medium">{result.timeframe}</td>
                <td className={getTrendColor(result.trend)}>{result.trend}</td>
                <td className={result.rsi > 70 ? 'text-red-400' : result.rsi < 30 ? 'text-green-400' : ''}>
                  {result.rsi.toFixed(1)}
                </td>
                <td className={result.macd === 'BULLISH' ? 'text-green-400' : 'text-red-400'}>
                  {result.macd === 'BULLISH' ? <CheckCircle className="w-4 h-4 inline" /> : <XCircle className="w-4 h-4 inline" />}
                </td>
                <td className="text-slate-400">{result.volume}</td>
                <td>{getSignalBadge(result.signal, result.confidence)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

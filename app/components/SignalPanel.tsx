'use client';

import { useState, useEffect } from 'react';
import { ArrowUp, ArrowDown, Target, AlertCircle } from 'lucide-react';

interface Signal {
  type: string;
  side: string;
  confidence: number;
  price: number;
  timestamp: string;
  reason: string;
  market_regime: string;
}

export default function SignalPanel() {
  const [signal, setSignal] = useState<Signal | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSignal();
    const interval = setInterval(fetchSignal, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchSignal = async () => {
    try {
      const res = await fetch('/api/signals');
      if (res.ok) {
        const data = await res.json();
        setSignal(data.latest);
      }
    } catch (e) {
      console.error('Failed to fetch signals:', e);
    } finally {
      setLoading(false);
    }
  };

  const getConfidenceColor = (conf: number) => {
    if (conf >= 75) return 'text-green-400';
    if (conf >= 60) return 'text-yellow-400';
    return 'text-slate-400';
  };

  const getConfidenceBg = (conf: number) => {
    if (conf >= 75) return 'bg-green-500/20 border-green-500/50';
    if (conf >= 60) return 'bg-yellow-500/20 border-yellow-500/50';
    return 'bg-slate-800 border-slate-700';
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
      <div className="flex items-center gap-2 mb-4">
        <Target className="w-5 h-5 text-purple-400" />
        <h2 className="font-semibold">Signal</h2>
      </div>

      {loading ? (
        <div className="animate-pulse space-y-3">
          <div className="h-8 bg-slate-800 rounded"></div>
          <div className="h-4 bg-slate-800 rounded w-3/4"></div>
        </div>
      ) : signal?.type === 'ENTRY' ? (
        <div className={`border rounded-xl p-4 ${getConfidenceBg(signal.confidence)}`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              {signal.side === 'LONG' ? (
                <>
                  <div className="w-8 h-8 bg-green-500/20 rounded-lg flex items-center justify-center">
                    <ArrowUp className="w-4 h-4 text-green-400" />
                  </div>
                  <span className="font-semibold text-green-400">LONG</span>
                </>
              ) : (
                <>
                  <div className="w-8 h-8 bg-red-500/20 rounded-lg flex items-center justify-center">
                    <ArrowDown className="w-4 h-4 text-red-400" />
                  </div>
                  <span className="font-semibold text-red-400">SHORT</span>
                </>
              )}
            </div>
            <span className={`text-2xl font-bold ${getConfidenceColor(signal.confidence)}`}>
              {signal.confidence.toFixed(0)}%
            </span>
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">Price</span>
              <span className="font-medium">${signal.price.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Regime</span>
              <span className="font-medium">{signal.market_regime}</span>
            </div>
            <div className="pt-2 border-t border-slate-700">
              <p className="text-slate-400 text-xs">{signal.reason}</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="border border-slate-700 rounded-xl p-6 text-center">
          <AlertCircle className="w-8 h-8 text-slate-500 mx-auto mb-2" />
          <p className="text-slate-400">No active signal</p>
          <p className="text-slate-500 text-sm mt-1">Waiting for setup...</p>
        </div>
      )}
    </div>
  );
}

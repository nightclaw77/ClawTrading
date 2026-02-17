'use client';

import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, RefreshCw } from 'lucide-react';

interface PriceData {
  symbol: string;
  price: number;
  price_change_24h: number;
  price_change_pct_24h: number;
  high_24h: number;
  low_24h: number;
  volume_24h: number;
  timestamp: string;
}

export default function PriceTile() {
  const [data, setData] = useState<PriceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchPrice = async () => {
    try {
      const res = await fetch('/api/price');
      if (res.ok) {
        const priceData = await res.json();
        setData(priceData);
        setError('');
      }
    } catch (e) {
      setError('Failed to fetch price');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPrice();
    const interval = setInterval(fetchPrice, 10000);
    return () => clearInterval(interval);
  }, []);

  const isPositive = (data?.price_change_pct_24h || 0) >= 0;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center">
            <span className="text-white font-bold text-xs">₿</span>
          </div>
          <span className="font-semibold">BTC/USDT</span>
        </div>
        <button 
          onClick={fetchPrice}
          className="p-1.5 hover:bg-slate-800 rounded-lg transition-colors"
        >
          <RefreshCw className={`w-4 h-4 text-slate-400 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading && !data ? (
        <div className="animate-pulse">
          <div className="h-10 bg-slate-800 rounded w-32 mb-2"></div>
          <div className="h-4 bg-slate-800 rounded w-24"></div>
        </div>
      ) : error ? (
        <div className="text-red-400 text-sm">{error}</div>
      ) : (
        <>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold">
              ${data?.price?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '--'}
            </span>
            <span className={`flex items-center text-sm ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
              {isPositive ? <TrendingUp className="w-4 h-4 mr-1" /> : <TrendingDown className="w-4 h-4 mr-1" />}
              {isPositive ? '+' : ''}{data?.price_change_pct_24h?.toFixed(2) || '0.00'}%
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 mt-4 text-sm">
            <div>
              <p className="text-slate-500 text-xs">24h High</p>
              <p className="font-medium">${data?.high_24h?.toLocaleString() || '--'}</p>
            </div>
            <div>
              <p className="text-slate-500 text-xs">24h Low</p>
              <p className="font-medium">${data?.low_24h?.toLocaleString() || '--'}</p>
            </div>
            <div>
              <p className="text-slate-500 text-xs">24h Volume</p>
              <p className="font-medium">{(data?.volume_24h ? (data.volume_24h / 1e9).toFixed(2) : '--')}B</p>
            </div>
            <div>
              <p className="text-slate-500 text-xs">Change</p>
              <p className={`font-medium ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                {isPositive ? '+' : ''}${data?.price_change_24h?.toLocaleString(undefined, { maximumFractionDigits: 0 }) || '0'}
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

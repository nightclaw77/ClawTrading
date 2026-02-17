'use client';

import { useState, useEffect } from 'react';
import { Gauge, TrendingUp, TrendingDown } from 'lucide-react';

interface FearGreedData {
  value: number;
  classification: string;
  emoji: string;
  color: string;
}

export default function FearGreedPanel() {
  const [data, setData] = useState<FearGreedData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 300000); // Update every 5 minutes
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      const res = await fetch('/api/fear-greed');
      if (res.ok) {
        const fearGreedData = await res.json();
        setData(fearGreedData);
      }
    } catch (e) {
      console.error('Failed to fetch fear & greed:', e);
    } finally {
      setLoading(false);
    }
  };

  const getGaugeColor = (value: number) => {
    if (value <= 20) return '#dc2626'; // red
    if (value <= 40) return '#ea580c'; // orange
    if (value <= 60) return '#ca8a04'; // yellow
    if (value <= 80) return '#16a34a'; // green
    return '#15803d'; // dark green
  };

  const getGaugeRotation = (value: number) => {
    // Map 0-100 to -90 to 90 degrees
    return (value / 100) * 180 - 90;
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
      <div className="flex items-center gap-2 mb-4">
        <Gauge className="w-5 h-5 text-yellow-400" />
        <h2 className="font-semibold">Fear & Greed</h2>
      </div>

      {loading ? (
        <div className="animate-pulse space-y-4">
          <div className="h-24 bg-slate-800 rounded"></div>
          <div className="h-8 bg-slate-800 rounded"></div>
        </div>
      ) : data ? (
        <>
          <div className="relative h-24 mb-4">
            {/* Gauge background */}
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-40 h-20 bg-gradient-to-t from-slate-800 to-transparent rounded-t-full"></div>
            
            {/* Gauge arc */}
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-40 h-20 rounded-t-full border-8 border-slate-700 border-b-0"></div>
            
            {/* Colored arc */}
            <div 
              className="absolute bottom-0 left-1/2 -translate-x-1/2 w-40 h-20 rounded-t-full border-8 border-b-0"
              style={{
                borderColor: getGaugeColor(data.value),
                clipPath: `polygon(0 0, ${data.value}% 0, ${data.value}% 100%, 0 100%)`
              }}
            ></div>
            
            {/* Needle */}
            <div 
              className="absolute bottom-0 left-1/2 w-0.5 h-16 bg-white origin-bottom transition-transform duration-500"
              style={{ transform: `translateX(-50%) rotate(${getGaugeRotation(data.value)}deg)` }}
            ></div>
            
            {/* Center dot */}
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3 h-3 bg-white rounded-full"></div>
          </div>

          <div className="text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <span className="text-2xl">{data.emoji}</span>
              <span className={`text-2xl font-bold ${data.color}`}>{data.value}</span>
            </div>
            <p className={`font-medium ${data.color}`}>{data.classification}</p>
            <p className="text-xs text-slate-500 mt-2">
              {data.value <= 20 && 'Extreme fear - Potential buying opportunity'}
              {data.value > 20 && data.value <= 40 && 'Fear - Caution advised'}
              {data.value > 40 && data.value <= 60 && 'Neutral - Wait for signals'}
              {data.value > 60 && data.value <= 80 && 'Greed - Consider taking profits'}
              {data.value > 80 && 'Extreme greed - High risk'}
            </p>
          </div>
        </>
      ) : (
        <div className="text-center py-8 text-slate-500">
          <p>Unable to load</p>
        </div>
      )}
    </div>
  );
}

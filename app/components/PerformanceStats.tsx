'use client';

import { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, TrendingDown, Target, BrainCircuit } from 'lucide-react';

interface Stats {
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number;
  total_pnl: number;
  avg_profit: number;
  avg_loss: number;
  profit_factor: number;
}

export default function PerformanceStats() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // For now, show placeholder stats
    // In production, this would fetch from the bot's API
    setStats({
      total_trades: 0,
      winning_trades: 0,
      losing_trades: 0,
      win_rate: 0,
      total_pnl: 0,
      avg_profit: 0,
      avg_loss: 0,
      profit_factor: 0
    });
    setLoading(false);
  }, []);

  const totalPnl = stats?.total_pnl || 0;
  const winRate = stats?.win_rate || 0;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="w-5 h-5 text-green-400" />
        <h2 className="font-semibold">Performance</h2>
      </div>

      {loading ? (
        <div className="animate-pulse space-y-3">
          <div className="h-8 bg-slate-800 rounded"></div>
          <div className="h-8 bg-slate-800 rounded"></div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <StatBox 
              label="Win Rate" 
              value={`${winRate.toFixed(1)}%`}
              icon={Target}
              color="text-blue-400"
            />
            <StatBox 
              label="Total Trades" 
              value={(stats?.total_trades || 0).toString()}
              icon={BarChart3}
              color="text-purple-400"
            />
            <StatBox 
              label="Total PnL" 
              value={`${totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}%`}
              icon={totalPnl >= 0 ? TrendingUp : TrendingDown}
              color={totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}
            />
            <StatBox 
              label="Profit Factor" 
              value={(stats?.profit_factor || 0).toFixed(2)}
              icon={BrainCircuit}
              color="text-yellow-400"
            />
          </div>

          <div className="border-t border-slate-800 pt-4">
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Wins</span>
              <span className="text-green-400">{stats?.winning_trades || 0}</span>
            </div>
            <div className="flex justify-between text-sm mt-2">
              <span className="text-slate-400">Losses</span>
              <span className="text-red-400">{stats?.losing_trades || 0}</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-2 mt-3">
              <div 
                className="bg-gradient-to-r from-green-500 to-green-400 h-2 rounded-full transition-all"
                style={{ width: `${Math.min(winRate, 100)}%` }}
              ></div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatBox({ label, value, icon: Icon, color }: { 
  label: string; 
  value: string; 
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="bg-slate-800/50 rounded-xl p-3">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`w-4 h-4 ${color}`} />
        <span className="text-xs text-slate-500">{label}</span>
      </div>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
    </div>
  );
}

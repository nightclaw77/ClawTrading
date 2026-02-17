import Link from "next/link";
import { TrendingUp, Cloud, Wallet, Activity } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
                <Activity className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                  Night Army Trader
                </h1>
                <p className="text-slate-400 text-sm">Advanced Crypto Trading Suite</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-slate-400">Revolutionary Scalper v2.0</span>
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-8">
          <h2 className="text-3xl font-bold mb-2">Trading Bots</h2>
          <p className="text-slate-400">Select a trading module to view dashboard</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {/* Scalper Bot Card */}
          <Link href="/scalper">
            <div className="group bg-slate-900 border border-slate-800 rounded-2xl p-6 hover:border-blue-500/50 hover:bg-slate-800/50 transition-all cursor-pointer">
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center">
                  <TrendingUp className="w-6 h-6 text-blue-400" />
                </div>
                <span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded-full">Active</span>
              </div>
              <h3 className="text-xl font-semibold mb-2 group-hover:text-blue-400 transition-colors">
                Revolutionary Scalper
              </h3>
              <p className="text-slate-400 text-sm mb-4">
                AI-powered scalping bot with adaptive learning, pattern recognition, and multi-timeframe analysis.
              </p>
              <div className="flex items-center gap-4 text-sm text-slate-500">
                <span>BTC/USDT</span>
                <span>•</span>
                <span>5m/15m</span>
                <span>•</span>
                <span>RSI/MACD</span>
              </div>
            </div>
          </Link>

          {/* Weather Bot Card */}
          <Link href="/weather">
            <div className="group bg-slate-900 border border-slate-800 rounded-2xl p-6 hover:border-purple-500/50 hover:bg-slate-800/50 transition-all cursor-pointer">
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center">
                  <Cloud className="w-6 h-6 text-purple-400" />
                </div>
                <span className="px-2 py-1 bg-yellow-500/20 text-yellow-400 text-xs rounded-full">Beta</span>
              </div>
              <h3 className="text-xl font-semibold mb-2 group-hover:text-purple-400 transition-colors">
                Weather Trader
              </h3>
              <p className="text-slate-400 text-sm mb-4">
                Event-driven trading based on weather patterns affecting energy and agriculture markets.
              </p>
              <div className="flex items-center gap-4 text-sm text-slate-500">
                <span>Events</span>
                <span>•</span>
                <span>Coming Soon</span>
              </div>
            </div>
          </Link>

          {/* DeFi Bot Card */}
          <Link href="/defi">
            <div className="group bg-slate-900 border border-slate-800 rounded-2xl p-6 hover:border-green-500/50 hover:bg-slate-800/50 transition-all cursor-pointer">
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 bg-green-500/20 rounded-xl flex items-center justify-center">
                  <Wallet className="w-6 h-6 text-green-400" />
                </div>
                <span className="px-2 py-1 bg-slate-700 text-slate-400 text-xs rounded-full">Dev</span>
              </div>
              <h3 className="text-xl font-semibold mb-2 group-hover:text-green-400 transition-colors">
                DeFi Yield Hunter
              </h3>
              <p className="text-slate-400 text-sm mb-4">
                Automated yield farming across DeFi protocols with risk-adjusted returns.
              </p>
              <div className="flex items-center gap-4 text-sm text-slate-500">
                <span>Yield</span>
                <span>•</span>
                <span>Coming Soon</span>
              </div>
            </div>
          </Link>
        </div>

        {/* Stats Overview */}
        <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Active Bots" value="1" />
          <StatCard label="Total Trades" value="0" />
          <StatCard label="Win Rate" value="--" />
          <StatCard label="24h PnL" value="--" />
        </div>
      </main>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
      <p className="text-slate-500 text-xs uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-bold text-slate-100">{value}</p>
    </div>
  );
}

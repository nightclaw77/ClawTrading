'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Activity, TrendingUp, Zap, Github } from 'lucide-react';

interface PriceData {
  symbol: string;
  price: number;
  price_change_pct_24h: number;
}

interface EngineStatus {
  enabled: boolean;
  running: boolean;
  status: string;
}

export default function Home() {
  const [btcPrice, setBtcPrice] = useState<PriceData | null>(null);
  const [solPrice, setSolPrice] = useState<PriceData | null>(null);
  const [botStatus, setBotStatus] = useState<EngineStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [priceError, setPriceError] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        let hasError = false;

        // Fetch BTC price
        const btcRes = await fetch('/api/price?asset=BTC');
        if (btcRes.ok) {
          const btcData = await btcRes.json();
          setBtcPrice(btcData);
        } else {
          hasError = true;
        }

        // Fetch SOL price
        const solRes = await fetch('/api/price?asset=SOL');
        if (solRes.ok) {
          const solData = await solRes.json();
          setSolPrice(solData);
        } else {
          hasError = true;
        }

        // Fetch bot status
        const statusRes = await fetch('/api/engine');
        if (statusRes.ok) {
          const statusData = await statusRes.json();
          setBotStatus(statusData.data?.state || null);
        }

        setPriceError(hasError);
      } catch (error) {
        console.error('Failed to fetch data:', error);
        setPriceError(true);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 10000); // Refresh every 10s
    return () => clearInterval(interval);
  }, []);

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(price);
  };

  const formatChange = (change: number) => {
    const sign = change >= 0 ? '+' : '';
    return `${sign}${change.toFixed(2)}%`;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 overflow-hidden">
      {/* Animated background grid */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-950/20 via-slate-950 to-slate-950"></div>
        <div
          className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse"
          style={{ animation: 'pulse 8s ease-in-out infinite' }}
        ></div>
        <div
          className="absolute bottom-0 left-0 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl animate-pulse"
          style={{ animation: 'pulse 8s ease-in-out infinite 2s' }}
        ></div>
      </div>

      {/* Navigation */}
      <nav className="relative z-10 border-b border-slate-800/50 bg-slate-950/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center">
              <Activity className="w-5 h-5 text-white" strokeWidth={3} />
            </div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 via-cyan-400 to-blue-400 bg-clip-text text-transparent">
              ClawTrade
            </h1>
          </div>
          <div className="flex items-center gap-6 text-sm">
            <Link href="/dashboard" className="text-slate-400 hover:text-blue-400 transition-colors">
              Dashboard
            </Link>
            <Link href="/learning" className="text-slate-400 hover:text-blue-400 transition-colors">
              Learning
            </Link>
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-400 hover:text-blue-400 transition-colors"
            >
              <Github className="w-4 h-4" />
            </a>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="relative z-10 max-w-7xl mx-auto px-6 py-16">
        {/* Hero Section */}
        <div className="mb-16 text-center">
          <div className="mb-6 inline-block">
            <div className="px-3 py-1 bg-blue-500/10 border border-blue-500/30 rounded-full text-sm text-blue-300">
              Revolutionary AI-Powered Trading
            </div>
          </div>
          <h2 className="text-6xl md:text-7xl font-black mb-6 leading-tight glow-text">
            CLAWTRADE
          </h2>
          <p className="text-xl text-slate-400 mb-8 max-w-2xl mx-auto">
            Revolutionary AI-Powered Polymarket Trading Engine
          </p>

          {/* Live Indicator */}
          {botStatus?.running && (
            <div className="flex items-center justify-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full live-dot"></div>
              <span className="text-sm text-green-400">Live & Ready</span>
            </div>
          )}
        </div>

        {/* Price Error State */}
        {priceError && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
            Unable to load price data. Please try again later.
          </div>
        )}

        {/* Price Tiles */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
          {/* BTC Price */}
          <div className="bg-slate-900/40 border border-slate-800/50 rounded-2xl p-8 backdrop-blur-xl hover:border-blue-500/30 transition-all group">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                  <span className="text-blue-400 font-bold">₿</span>
                </div>
                <h3 className="text-lg font-semibold">Bitcoin</h3>
              </div>
              {btcPrice && (
                <span
                  className={`text-sm font-semibold ${btcPrice.price_change_pct_24h >= 0 ? 'text-green-400' : 'text-red-400'}`}
                >
                  {formatChange(btcPrice.price_change_pct_24h)}
                </span>
              )}
            </div>
            {btcPrice ? (
              <div className="text-4xl font-bold mb-2">${formatPrice(btcPrice.price)}</div>
            ) : (
              <div className="text-4xl font-bold mb-2 text-slate-600">--</div>
            )}
            <p className="text-slate-500 text-sm">24h Change</p>
          </div>

          {/* SOL Price */}
          <div className="bg-slate-900/40 border border-slate-800/50 rounded-2xl p-8 backdrop-blur-xl hover:border-cyan-500/30 transition-all group">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-cyan-500/20 rounded-lg flex items-center justify-center">
                  <span className="text-cyan-400 font-bold">S</span>
                </div>
                <h3 className="text-lg font-semibold">Solana</h3>
              </div>
              {solPrice && (
                <span
                  className={`text-sm font-semibold ${solPrice.price_change_pct_24h >= 0 ? 'text-green-400' : 'text-red-400'}`}
                >
                  {formatChange(solPrice.price_change_pct_24h)}
                </span>
              )}
            </div>
            {solPrice ? (
              <div className="text-4xl font-bold mb-2">${formatPrice(solPrice.price)}</div>
            ) : (
              <div className="text-4xl font-bold mb-2 text-slate-600">--</div>
            )}
            <p className="text-slate-500 text-sm">24h Change</p>
          </div>
        </div>

        {/* Main Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {/* Dashboard Card */}
          <Link href="/dashboard">
            <div className="group bg-slate-900/40 border border-slate-800/50 rounded-2xl p-8 backdrop-blur-xl hover:border-blue-500/50 hover:bg-slate-900/60 transition-all cursor-pointer h-full flex flex-col justify-between">
              <div>
                <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center mb-4 group-hover:bg-blue-500/30 transition-colors">
                  <TrendingUp className="w-6 h-6 text-blue-400" />
                </div>
                <h3 className="text-2xl font-semibold mb-2 group-hover:text-blue-400 transition-colors">
                  Dashboard
                </h3>
                <p className="text-slate-400">
                  Real-time trading metrics, position management, and performance analytics
                </p>
              </div>
              <div className="mt-6 text-blue-400 text-sm font-semibold">View Dashboard →</div>
            </div>
          </Link>

          {/* Learning Card */}
          <Link href="/learning">
            <div className="group bg-slate-900/40 border border-slate-800/50 rounded-2xl p-8 backdrop-blur-xl hover:border-cyan-500/50 hover:bg-slate-900/60 transition-all cursor-pointer h-full flex flex-col justify-between">
              <div>
                <div className="w-12 h-12 bg-cyan-500/20 rounded-xl flex items-center justify-center mb-4 group-hover:bg-cyan-500/30 transition-colors">
                  <Zap className="w-6 h-6 text-cyan-400" />
                </div>
                <h3 className="text-2xl font-semibold mb-2 group-hover:text-cyan-400 transition-colors">
                  Learning
                </h3>
                <p className="text-slate-400">
                  3D neural network visualization and AI model insights
                </p>
              </div>
              <div className="mt-6 text-cyan-400 text-sm font-semibold">Explore Neural Network →</div>
            </div>
          </Link>

          {/* Status Card */}
          <div className="bg-slate-900/40 border border-slate-800/50 rounded-2xl p-8 backdrop-blur-xl h-full flex flex-col justify-between">
            <div>
              <div className="w-12 h-12 bg-green-500/20 rounded-xl flex items-center justify-center mb-4">
                <Activity className="w-6 h-6 text-green-400" />
              </div>
              <h3 className="text-2xl font-semibold mb-2">Bot Status</h3>
              <div className="space-y-3">
                <div>
                  <p className="text-slate-500 text-sm">Engine Status</p>
                  <p className="text-lg font-semibold text-green-400">
                    {loading ? 'Loading...' : botStatus?.status || 'Ready'}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500 text-sm">State</p>
                  <p className="text-lg font-semibold text-cyan-400">
                    {botStatus?.enabled ? 'Enabled' : 'Disabled'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Assets Tracked" value="2" />
          <StatCard label="Market Status" value="Live" />
          <StatCard label="AI Model" value="Active" />
          <StatCard label="Update Rate" value="10s" />
        </div>
      </main>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-900/40 border border-slate-800/50 rounded-xl p-4 backdrop-blur-xl">
      <p className="text-slate-500 text-xs uppercase tracking-wider mb-2">{label}</p>
      <p className="text-2xl font-bold text-slate-100">{value}</p>
    </div>
  );
}

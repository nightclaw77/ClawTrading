import Link from "next/link";
import { ArrowLeft, Activity, TrendingUp, BarChart3, AlertCircle } from "lucide-react";

export default function ScalperPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-2 text-slate-400 hover:text-slate-200 transition-colors">
              <ArrowLeft className="w-5 h-5" />
              <span>Back</span>
            </Link>
            <div className="h-6 w-px bg-slate-700" />
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-100">Revolutionary Scalper</h1>
                <p className="text-slate-400 text-sm">BTC/USDT Adaptive Trading</p>
              </div>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-sm text-green-400">LIVE</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Price Banner */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <PriceCard label="BTC/USDT" value="$68,245.50" change="+2.34%" positive />
          <PriceCard label="RSI (14)" value="45.2" subtext="Neutral" />
          <PriceCard label="24h Volume" value="$28.5B" subtext="+12%" />
          <PriceCard label="Fear & Greed" value="52" subtext="Neutral" />
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Main Chart */}
          <div className="lg:col-span-2">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-slate-400" />
                  <span className="font-semibold">Chart Analysis</span>
                </div>
                <div className="flex gap-2">
                  {["1m", "5m", "15m", "1h", "4h", "1D"].map((tf) => (
                    <button
                      key={tf}
                      className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                        tf === "5m"
                          ? "bg-blue-600 text-white"
                          : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                      }`}
                    >
                      {tf}
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="h-[450px] bg-slate-950">
                <iframe
                  src="https://www.tradingview.com/widgetembed/?frameElementId=tradingview_chart&symbol=BINANCE%3ABTCUSDT&interval=5&hidesidetoolbar=0&symboledit=1&saveimage=1&toolbarbg=f1f3f6&studies=RSI%40tv-basicstudies%2CMACD%40tv-basicstudies%2CVolume%40tv-basicstudies%2CBB%40tv-basicstudies&theme=dark&style=1&timezone=Etc%2FUTC&studies_overrides={}&overrides={}&enabled_features=[]&disabled_features=[]&locale=en&referral_id=openclaw"
                  className="w-full h-full border-0"
                  title="TradingView Chart"
                />
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Signal Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <Activity className="w-5 h-5 text-slate-400" />
                <span className="font-semibold">Current Signal</span>
              </div>
              
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 text-center">
                <span className="text-yellow-400 font-semibold text-lg">NEUTRAL</span>
                <p className="text-slate-400 text-sm mt-2">Waiting for setup...</p>
              </div>
            </div>

            {/* Indicators */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 className="w-5 h-5 text-slate-400" />
                <span className="font-semibold">Indicators</span>
              </div>
              
              <div className="space-y-3">
                <IndicatorRow label="EMA 9" value="68,125.40" positive />
                <IndicatorRow label="EMA 21" value="67,850.20" positive />
                <IndicatorRow label="EMA 50" value="66,980.50" />
                <IndicatorRow label="EMA 200" value="64,250.80" />
                <hr className="border-slate-800" />
                <IndicatorRow label="MACD" value="245.30" positive />
                <IndicatorRow label="Volume" value="1.2x" />
              </div>
            </div>

            {/* Alerts */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <AlertCircle className="w-5 h-5 text-slate-400" />
                <span className="font-semibold">Alerts</span>
              </div>
              
              <div className="space-y-3">
                <AlertItem type="info" message="System initialized" />
                <AlertItem type="success" message="RSI crossed above 30" />
              </div>
            </div>

            {/* Bot Stats */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <Activity className="w-5 h-5 text-slate-400" />
                <span className="font-semibold">Bot Status</span>
              </div>
              
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Balance</span>
                  <span className="font-medium">$1,000.00</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Win Rate</span>
                  <span className="font-medium text-green-400">58%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Active Trades</span>
                  <span className="font-medium">0</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Session</span>
                  <span className="font-medium">London</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function PriceCard({
  label,
  value,
  change,
  subtext,
  positive,
}: {
  label: string;
  value: string;
  change?: string;
  subtext?: string;
  positive?: boolean;
}) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
      <p className="text-slate-500 text-xs uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-bold text-slate-100">{value}</p>
      {change && (
        <p className={`text-sm mt-1 ${positive ? "text-green-400" : "text-red-400"}`}>
          {change}
        </p>
      )}
      {subtext && <p className="text-slate-500 text-sm mt-1">{subtext}</p>}
    </div>
  );
}

function IndicatorRow({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-400 text-sm">{label}</span>
      <span className={`font-medium ${positive ? "text-green-400" : "text-slate-200"}`}>
        {value}
      </span>
    </div>
  );
}

function AlertItem({ type, message }: { type: "info" | "success" | "warning"; message: string }) {
  const colors = {
    info: "bg-blue-500/10 border-blue-500/20 text-blue-400",
    success: "bg-green-500/10 border-green-500/20 text-green-400",
    warning: "bg-yellow-500/10 border-yellow-500/20 text-yellow-400",
  };

  return (
    <div className={`p-3 rounded-lg border text-sm ${colors[type]}`}>
      {message}
    </div>
  );
}

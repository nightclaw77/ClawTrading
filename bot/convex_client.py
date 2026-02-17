"""
Convex Client for Python - Sync bot data to Convex backend
"""
import asyncio
import logging
from datetime import datetime
from typing import Dict, Optional, Any
import aiohttp
import json

from config import config

logger = logging.getLogger(__name__)


class ConvexClient:
    """Client for syncing data to Convex backend"""
    
    def __init__(self, convex_url: Optional[str] = None):
        self.convex_url = convex_url or config.CONVEX_URL
        self.session: Optional[aiohttp.ClientSession] = None
        self.bot_id = "revolutionary_scalper"
        
    async def initialize(self):
        """Initialize HTTP session"""
        self.session = aiohttp.ClientSession(
            timeout=aiohttp.ClientTimeout(total=10),
            headers={
                "Content-Type": "application/json"
            }
        )
        logger.info(f"📡 Convex client initialized: {self.convex_url}")
    
    async def close(self):
        """Close HTTP session"""
        if self.session:
            await self.session.close()
    
    async def _query(self, mutation_name: str, args: Dict[str, Any]) -> bool:
        """Execute a Convex mutation"""
        try:
            # Convex HTTP API endpoint
            url = f"{self.convex_url}/api/mutation"
            
            payload = {
                "path": mutation_name,
                "args": args
            }
            
            async with self.session.post(url, json=payload) as resp:
                if resp.status == 200:
                    return True
                else:
                    logger.warning(f"Convex query failed: {resp.status}")
                    return False
        except Exception as e:
            logger.error(f"Convex error: {e}")
            return False
    
    async def update_bot_status(self, status: Dict) -> bool:
        """Update bot status in Convex"""
        return await self._query("botStatus:update", {
            "botId": self.bot_id,
            "balance": status.get("balance", 1000.0),
            "peakBalance": status.get("peak_balance", 1000.0),
            "drawdown": status.get("drawdown", 0.0),
            "activeTrades": status.get("active_trades", 0),
            "winRate": status.get("win_rate", 0.0),
            "riskMultiplier": status.get("risk_multiplier", 1.0),
            "session": status.get("session", "unknown"),
            "running": status.get("running", False),
            "currentPrice": status.get("current_price"),
            "timestamp": int(datetime.now().timestamp() * 1000)
        })
    
    async def update_indicators(self, indicators: Dict) -> bool:
        """Update technical indicators in Convex"""
        return await self._query("indicators:update", {
            "botId": self.bot_id,
            "rsi": indicators.get("rsi", 50.0),
            "macd": indicators.get("macd", 0.0),
            "macdSignal": indicators.get("macd_signal", 0.0),
            "ema9": indicators.get("ema_9", 0.0),
            "ema21": indicators.get("ema_21", 0.0),
            "ema50": indicators.get("ema_50", 0.0),
            "ema200": indicators.get("ema_200", 0.0),
            "volumeRatio": indicators.get("volume_ratio", 1.0),
            "bbUpper": indicators.get("bb_upper"),
            "bbLower": indicators.get("bb_lower"),
            "regime": indicators.get("regime", "unknown"),
            "session": indicators.get("session", "unknown"),
            "timestamp": int(datetime.now().timestamp() * 1000)
        })
    
    async def add_signal(self, signal_type: str, message: str, 
                         confidence: Optional[float] = None,
                         price: Optional[float] = None,
                         severity: str = "info") -> bool:
        """Add a trading signal/alert to Convex"""
        return await self._query("signals:add", {
            "botId": self.bot_id,
            "type": signal_type,
            "message": message,
            "confidence": confidence,
            "price": price,
            "severity": severity,
            "timestamp": int(datetime.now().timestamp() * 1000)
        })
    
    async def add_trade(self, trade: Dict) -> bool:
        """Add or update a trade in Convex"""
        return await self._query("trades:add", {
            "botId": self.bot_id,
            "tradeId": trade.get("id"),
            "side": trade.get("side"),
            "entryPrice": trade.get("entry_price"),
            "exitPrice": trade.get("exit_price"),
            "size": trade.get("size"),
            "pnl": trade.get("pnl"),
            "status": trade.get("status"),
            "pattern": trade.get("pattern"),
            "regime": trade.get("regime"),
            "entryTime": int(trade.get("entry_time", datetime.now()).timestamp() * 1000),
            "exitTime": int(trade.get("exit_time", datetime.now()).timestamp() * 1000) if trade.get("exit_time") else None
        })
    
    async def update_pattern(self, pattern_name: str, stats: Dict) -> bool:
        """Update pattern performance in Convex"""
        return await self._query("patterns:update", {
            "botId": self.bot_id,
            "patternName": pattern_name,
            "wins": stats.get("wins", 0),
            "losses": stats.get("losses", 0),
            "totalPnl": stats.get("total_pnl", 0.0),
            "occurrences": stats.get("occurrences", 0),
            "weight": stats.get("weight", 1.0),
            "lastUpdated": int(datetime.now().timestamp() * 1000)
        })
    
    async def update_market_data(self, symbol: str, data: Dict) -> bool:
        """Update market data cache in Convex"""
        return await self._query("marketData:update", {
            "symbol": symbol,
            "price": data.get("price", 0.0),
            "change24h": data.get("change_24h", 0.0),
            "volume24h": data.get("volume_24h", 0.0),
            "high24h": data.get("high_24h", 0.0),
            "low24h": data.get("low_24h", 0.0),
            "timestamp": int(datetime.now().timestamp() * 1000)
        })
    
    async def update_fear_greed(self, value: int, classification: str) -> bool:
        """Update Fear & Greed Index in Convex"""
        return await self._query("fearGreed:update", {
            "value": value,
            "classification": classification,
            "timestamp": int(datetime.now().timestamp() * 1000)
        })


# Simple file-based fallback when Convex is not available
class FileBackend:
    """File-based backend for when Convex is unavailable"""
    
    def __init__(self, data_dir: str = "data"):
        self.data_dir = data_dir
        import os
        os.makedirs(data_dir, exist_ok=True)
    
    async def update_bot_status(self, status: Dict) -> bool:
        """Save status to file"""
        try:
            import json
            from datetime import datetime
            
            filepath = f"{self.data_dir}/bot_status.json"
            with open(filepath, 'w') as f:
                json.dump({
                    **status,
                    "timestamp": datetime.now().isoformat()
                }, f, default=str)
            return True
        except Exception as e:
            logger.error(f"File backend error: {e}")
            return False
    
    async def update_indicators(self, indicators: Dict) -> bool:
        """Save indicators to file"""
        try:
            import json
            from datetime import datetime
            
            filepath = f"{self.data_dir}/indicators.json"
            with open(filepath, 'w') as f:
                json.dump({
                    **indicators,
                    "timestamp": datetime.now().isoformat()
                }, f, default=str)
            return True
        except Exception as e:
            logger.error(f"File backend error: {e}")
            return False
    
    async def add_signal(self, **kwargs) -> bool:
        """Append signal to log file"""
        try:
            import json
            from datetime import datetime
            
            filepath = f"{self.data_dir}/signals.json"
            signals = []
            try:
                with open(filepath, 'r') as f:
                    signals = json.load(f)
            except FileNotFoundError:
                pass
            
            signals.append({
                **kwargs,
                "timestamp": datetime.now().isoformat()
            })
            
            # Keep only last 100 signals
            signals = signals[-100:]
            
            with open(filepath, 'w') as f:
                json.dump(signals, f, default=str)
            return True
        except Exception as e:
            logger.error(f"File backend error: {e}")
            return False


# Factory function
async def create_backend(use_convex: bool = True):
    """Create appropriate backend client"""
    if use_convex and config.CONVEX_URL:
        client = ConvexClient()
        await client.initialize()
        return client
    else:
        return FileBackend()


if __name__ == "__main__":
    async def test():
        # Test with file backend
        backend = FileBackend()
        
        await backend.update_bot_status({
            "balance": 1050.0,
            "win_rate": 0.6,
            "active_trades": 2
        })
        
        print("✅ Backend test complete")
    
    asyncio.run(test())

"""
Data Fetcher - Get real-time market data from Binance and CryptoCompare
"""
import asyncio
import aiohttp
import logging
import pandas as pd
from datetime import datetime, timedelta
from typing import Optional, Dict
import json

from config import config

logger = logging.getLogger(__name__)


class DataFetcher:
    """Fetch market data from exchanges"""
    
    def __init__(self):
        self.session: Optional[aiohttp.ClientSession] = None
        self.binance_base = config.BINANCE_API
        self.cryptocompare_base = config.CRYPTOCOMPARE_API
        self.last_price = None
        self.cache = {}
        
    async def initialize(self):
        """Initialize HTTP session"""
        self.session = aiohttp.ClientSession(
            timeout=aiohttp.ClientTimeout(total=10)
        )
        logger.info("📡 Data fetcher initialized")
    
    async def close(self):
        """Close HTTP session"""
        if self.session:
            await self.session.close()
    
    async def _fetch_binance(self, endpoint: str, params: Dict = None) -> Optional[Dict]:
        """Fetch data from Binance API"""
        try:
            url = f"{self.binance_base}{endpoint}"
            async with self.session.get(url, params=params) as resp:
                if resp.status == 200:
                    return await resp.json()
                else:
                    logger.warning(f"Binance error {resp.status}: {await resp.text()}")
                    return None
        except Exception as e:
            logger.error(f"Binance fetch error: {e}")
            return None
    
    async def _fetch_cryptocompare(self, endpoint: str, params: Dict = None) -> Optional[Dict]:
        """Fetch data from CryptoCompare API"""
        try:
            url = f"{self.cryptocompare_base}{endpoint}"
            async with self.session.get(url, params=params) as resp:
                if resp.status == 200:
                    return await resp.json()
                else:
                    logger.warning(f"CryptoCompare error {resp.status}")
                    return None
        except Exception as e:
            logger.error(f"CryptoCompare fetch error: {e}")
            return None
    
    async def get_current_price(self) -> Optional[float]:
        """Get current BTC price"""
        # Try Binance first
        data = await self._fetch_binance("/api/v3/ticker/price", {
            "symbol": config.SYMBOL
        })
        
        if data and "price" in data:
            price = float(data["price"])
            self.last_price = price
            return price
        
        # Fallback to CryptoCompare
        data = await self._fetch_cryptocompare("/data/price", {
            "fsym": "BTC",
            "tsyms": "USDT"
        })
        
        if data and "USDT" in data:
            price = float(data["USDT"])
            self.last_price = price
            return price
        
        return self.last_price  # Return last known price
    
    async def get_klines(self, interval: str = "1m", limit: int = 100) -> Optional[pd.DataFrame]:
        """Get candlestick data from Binance"""
        data = await self._fetch_binance("/api/v3/klines", {
            "symbol": config.SYMBOL,
            "interval": interval,
            "limit": limit
        })
        
        if not data:
            logger.warning("Failed to fetch klines from Binance, trying CryptoCompare...")
            return await self._get_cryptocompare_history(interval, limit)
        
        # Parse Binance kline format
        # [timestamp, open, high, low, close, volume, ...]
        df = pd.DataFrame(data, columns=[
            'timestamp', 'open', 'high', 'low', 'close', 'volume',
            'close_time', 'quote_volume', 'trades', 'taker_buy_base',
            'taker_buy_quote', 'ignore'
        ])
        
        # Convert types
        df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms')
        df.set_index('timestamp', inplace=True)
        
        for col in ['open', 'high', 'low', 'close', 'volume']:
            df[col] = pd.to_numeric(df[col])
        
        return df
    
    async def _get_cryptocompare_history(self, interval: str, limit: int) -> Optional[pd.DataFrame]:
        """Get historical data from CryptoCompare as fallback"""
        # Map interval to CryptoCompare format
        interval_map = {
            "1m": "histominute",
            "5m": "histominute",
            "15m": "histominute",
            "1h": "histohour",
            "4h": "histohour",
            "1d": "histoday"
        }
        
        endpoint = interval_map.get(interval, "histominute")
        aggregate = 1
        if interval == "5m":
            aggregate = 5
        elif interval == "15m":
            aggregate = 15
        elif interval == "4h":
            aggregate = 4
        
        data = await self._fetch_cryptocompare(f"/data/v2/{endpoint}", {
            "fsym": "BTC",
            "tsym": "USDT",
            "limit": limit,
            "aggregate": aggregate
        })
        
        if not data or "Data" not in data or "Data" not in data["Data"]:
            logger.error("Failed to fetch from CryptoCompare")
            return None
        
        # Parse CryptoCompare format
        candles = data["Data"]["Data"]
        df = pd.DataFrame(candles)
        
        df['timestamp'] = pd.to_datetime(df['time'], unit='s')
        df.set_index('timestamp', inplace=True)
        
        # Rename columns to match Binance
        df.rename(columns={
            'open': 'open',
            'high': 'high',
            'low': 'low',
            'close': 'close',
            'volumeto': 'volume'
        }, inplace=True)
        
        return df[['open', 'high', 'low', 'close', 'volume']]
    
    async def get_orderbook(self, limit: int = 20) -> Optional[Dict]:
        """Get orderbook data"""
        data = await self._fetch_binance("/api/v3/depth", {
            "symbol": config.SYMBOL,
            "limit": limit
        })
        
        if data:
            return {
                "bids": [[float(price), float(qty)] for price, qty in data.get("bids", [])],
                "asks": [[float(price), float(qty)] for price, qty in data.get("asks", [])],
                "timestamp": datetime.now()
            }
        
        return None
    
    async def get_24h_stats(self) -> Optional[Dict]:
        """Get 24h statistics"""
        data = await self._fetch_binance("/api/v3/ticker/24hr", {
            "symbol": config.SYMBOL
        })
        
        if data:
            return {
                "price_change": float(data.get("priceChange", 0)),
                "price_change_percent": float(data.get("priceChangePercent", 0)),
                "weighted_avg_price": float(data.get("weightedAvgPrice", 0)),
                "prev_close": float(data.get("prevClosePrice", 0)),
                "last_price": float(data.get("lastPrice", 0)),
                "high": float(data.get("highPrice", 0)),
                "low": float(data.get("lowPrice", 0)),
                "volume": float(data.get("volume", 0)),
                "quote_volume": float(data.get("quoteVolume", 0))
            }
        
        return None
    
    async def get_recent_trades(self, limit: int = 100) -> Optional[list]:
        """Get recent trades"""
        data = await self._fetch_binance("/api/v3/trades", {
            "symbol": config.SYMBOL,
            "limit": limit
        })
        
        if data:
            return [
                {
                    "price": float(trade["price"]),
                    "qty": float(trade["qty"]),
                    "time": datetime.fromtimestamp(trade["time"] / 1000),
                    "is_buyer_maker": trade["isBuyerMaker"]
                }
                for trade in data
            ]
        
        return None


if __name__ == "__main__":
    async def test():
        fetcher = DataFetcher()
        await fetcher.initialize()
        
        # Test current price
        price = await fetcher.get_current_price()
        print(f"Current BTC Price: ${price:,.2f}")
        
        # Test klines
        df = await fetcher.get_klines("1m", 10)
        if df is not None:
            print(f"\nLast 10 candles:")
            print(df.tail())
        
        # Test 24h stats
        stats = await fetcher.get_24h_stats()
        if stats:
            print(f"\n24h Change: {stats['price_change_percent']:.2f}%")
            print(f"24h Volume: {stats['volume']:,.2f} BTC")
        
        await fetcher.close()
    
    asyncio.run(test())

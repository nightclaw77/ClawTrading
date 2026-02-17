"""
Main loop - Connect all components and run the bot with Convex sync
"""
import asyncio
import logging
import json
from datetime import datetime
from typing import Dict

from config import config
from revolutionary_scalper import RevolutionaryScalper
from data_fetcher import DataFetcher
from news_engine import NewsEngine
from convex_client import create_backend

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(f'{config.LOG_DIR}/main.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)


class TradingBot:
    """Main trading bot controller with Convex sync"""
    
    def __init__(self):
        self.scalper = RevolutionaryScalper()
        self.fetcher = DataFetcher()
        self.news = NewsEngine()
        self.backend = None
        self.running = False
        
    async def initialize(self):
        """Initialize all components"""
        logger.info("🚀 Starting Revolutionary Scalper v2.0 with Convex...")
        
        # Initialize backend (Convex or file)
        self.backend = await create_backend(use_convex=True)
        
        await self.fetcher.initialize()
        await self.news.initialize()
        await self.scalper.initialize()
        
        logger.info("✅ All components initialized")
    
    async def run_scan_cycle(self):
        """Run one complete scan cycle and sync to Convex"""
        try:
            # Fetch market data
            df = await self.fetcher.get_klines("1m", limit=100)
            
            if df is None or len(df) < 50:
                logger.warning("⚠️  Insufficient data for analysis")
                return
            
            # Get news/sentiment
            fear_greed = await self.news.get_fear_greed_index()
            
            # Run scalper analysis
            await self.scalper.run_scan(df)
            
            # Get current price
            current_price = await self.fetcher.get_current_price()
            
            # Get current indicators from last signal
            status = self.scalper.get_status()
            status.update({
                "current_price": current_price,
                "timestamp": datetime.now().isoformat()
            })
            
            # Sync to Convex
            await self._sync_to_convex(status, fear_greed)
            
            # Also save to file for backup
            self._save_status(status)
            
            logger.info(f"✅ Scan complete - Price: ${current_price:,.2f} | Synced to Convex")
            
        except Exception as e:
            logger.error(f"❌ Scan cycle error: {e}")
    
    async def _sync_to_convex(self, status: Dict, fear_greed: Dict):
        """Sync all data to Convex backend"""
        try:
            # Update bot status
            await self.backend.update_bot_status(status)
            
            # Update indicators if available
            if "indicators" in status and status["indicators"]:
                await self.backend.update_indicators(status["indicators"])
            
            # Update Fear & Greed
            if fear_greed:
                await self.backend.update_fear_greed(
                    fear_greed.get("value", 50),
                    fear_greed.get("classification", "Neutral")
                )
            
            # Update market data
            if status.get("current_price"):
                await self.backend.update_market_data(
                    config.SYMBOL,
                    {
                        "price": status["current_price"],
                        "change_24h": 0.0,
                        "volume_24h": 0.0,
                        "high_24h": status["current_price"],
                        "low_24h": status["current_price"]
                    }
                )
            
            logger.debug("📡 Synced to Convex")
            
        except Exception as e:
            logger.error(f"Convex sync error: {e}")
    
    def _save_status(self, status: Dict):
        """Save status to JSON file for backup"""
        try:
            with open(f'{config.DATA_DIR}/bot_status.json', 'w') as f:
                json.dump(status, f, default=str)
        except Exception as e:
            logger.error(f"Error saving status: {e}")
    
    async def run(self):
        """Main loop"""
        await self.initialize()
        
        self.running = True
        logger.info(f"🤖 Bot running - Scanning every {config.SCAN_INTERVAL}s")
        
        try:
            while self.running:
                await self.run_scan_cycle()
                await asyncio.sleep(config.SCAN_INTERVAL)
                
        except KeyboardInterrupt:
            logger.info("🛑 Shutting down...")
        finally:
            self.running = False
            await self.fetcher.close()
            await self.news.close()
            logger.info("✅ Bot stopped")


if __name__ == "__main__":
    bot = TradingBot()
    asyncio.run(bot.run())

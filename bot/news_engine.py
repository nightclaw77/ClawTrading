"""
News Engine - Crypto news and sentiment analysis
"""
import asyncio
import aiohttp
import logging
from typing import List, Dict, Optional
from datetime import datetime

logger = logging.getLogger(__name__)


class NewsEngine:
    """Fetch and analyze crypto news"""
    
    def __init__(self):
        self.session: Optional[aiohttp.ClientSession] = None
        self.cache = {
            "news": [],
            "fear_greed": None,
            "last_update": None
        }
    
    async def initialize(self):
        """Initialize HTTP session"""
        self.session = aiohttp.ClientSession(
            timeout=aiohttp.ClientTimeout(total=10)
        )
        logger.info("📰 News engine initialized")
    
    async def close(self):
        """Close session"""
        if self.session:
            await self.session.close()
    
    async def get_fear_greed_index(self) -> Optional[Dict]:
        """Get Fear & Greed Index from CoinGecko"""
        try:
            # Alternative: Alternative.me API
            url = "https://api.alternative.me/fng/"
            async with self.session.get(url) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    if "data" in data and len(data["data"]) > 0:
                        latest = data["data"][0]
                        value = int(latest["value"])
                        
                        # Determine sentiment
                        if value <= 20:
                            classification = "Extreme Fear 😱"
                        elif value <= 40:
                            classification = "Fear 😰"
                        elif value <= 60:
                            classification = "Neutral 😐"
                        elif value <= 80:
                            classification = "Greed 😏"
                        else:
                            classification = "Extreme Greed 🤑"
                        
                        result = {
                            "value": value,
                            "classification": classification,
                            "timestamp": datetime.now()
                        }
                        self.cache["fear_greed"] = result
                        return result
        except Exception as e:
            logger.error(f"Error fetching Fear & Greed: {e}")
        
        return self.cache.get("fear_greed")
    
    async def get_crypto_news(self, limit: int = 10) -> List[Dict]:
        """Get crypto news from Cryptopanic (public endpoint)"""
        try:
            # Using Cryptopanic public endpoint (no API key needed for basic)
            url = "https://cryptopanic.com/api/news/"
            async with self.session.get(url) as resp:
                if resp.status == 200:
                    html = await resp.text()
                    # Parse news from HTML (basic scraping)
                    # In production, use proper API with key
                    return []
        except Exception as e:
            logger.error(f"Error fetching news: {e}")
        
        return self.cache.get("news", [])
    
    def analyze_sentiment(self, text: str) -> float:
        """Simple sentiment analysis (placeholder)"""
        # This would use a proper NLP model
        # For now, return neutral
        return 0.0


if __name__ == "__main__":
    async def test():
        engine = NewsEngine()
        await engine.initialize()
        
        fear_greed = await engine.get_fear_greed_index()
        if fear_greed:
            print(f"Fear & Greed Index: {fear_greed['value']} - {fear_greed['classification']}")
        
        await engine.close()
    
    asyncio.run(test())

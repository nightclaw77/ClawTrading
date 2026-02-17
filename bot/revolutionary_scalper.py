"""
Revolutionary Scalper v2.0 Ultimate - Main Trading Engine
"""
import asyncio
import json
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional
import aiohttp

from config import CONFIG
from data_fetcher import DataFetcher, data_fetcher
from news_engine import NewsEngine, news_engine
from learning_engine import LearningEngine, learning_engine, Trade
from signal_generator import SignalGenerator, signal_generator, Signal
from risk_manager import RiskManager, risk_manager, Position

# Configure logging
os.makedirs(CONFIG.LOGS_DIR, exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(os.path.join(CONFIG.LOGS_DIR, "scalper.log")),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)


class RevolutionaryScalper:
    """Main trading bot orchestrating all components"""
    
    def __init__(self):
        self.data_fetcher = data_fetcher
        self.news_engine = news_engine
        self.learning_engine = learning_engine
        self.signal_generator = signal_generator
        self.risk_manager = risk_manager
        
        self.is_running = False
        self.current_price = 0.0
        self.current_analysis: Dict = {}
        self.latest_signal: Optional[Signal] = None
        self.session = self._get_current_session()
        
        # Link risk manager to learning engine
        self.risk_manager.learning_engine = self.learning_engine
        
        # Market data cache
        self.price_data: Optional[Dict] = None
        self.chart_data: Dict[str, List[Dict]] = {}
        self.news_data: List[Dict] = []
        self.fear_greed_data: Optional[Dict] = None
        self.overall_sentiment: Optional[Dict] = None
        
    def _get_current_session(self) -> str:
        """Determine current trading session based on UTC time"""
        hour = datetime.now(timezone.utc).hour
        
        if 0 <= hour < 8:
            return "ASIAN"
        elif 8 <= hour < 16:
            return "LONDON"
        else:
            return "NY"
    
    async def initialize(self):
        """Initialize the bot"""
        logger.info("=" * 60)
        logger.info("Revolutionary Scalper v2.0 Ultimate - Initializing")
        logger.info("=" * 60)
        
        # Load initial data
        await self._update_market_data()
        
        # Log system status
        stats = self.learning_engine.get_performance_stats()
        logger.info(f"Loaded {stats['total_trades']} historical trades")
        logger.info(f"Loaded {len(self.learning_engine.patterns)} patterns")
        
        logger.info("Initialization complete")
        return True
    
    async def _update_market_data(self):
        """Update all market data"""
        try:
            async with self.data_fetcher:
                # Get current price
                self.price_data = await self.data_fetcher.get_current_price()
                if self.price_data:
                    self.current_price = self.price_data.get("price", 0)
                
                # Get chart data for all timeframes
                self.chart_data = await self.data_fetcher.get_multi_timeframe_data()
                
                # Get fear & greed index
                self.fear_greed_data = await self.data_fetcher.get_fear_greed_index()
        except Exception as e:
            logger.error(f"Error updating market data: {e}")
    
    async def _update_news(self):
        """Update news and sentiment"""
        try:
            async with self.news_engine:
                self.news_data = await self.news_engine.get_news(limit=20)
                self.overall_sentiment = await self.news_engine.get_overall_sentiment()
        except Exception as e:
            logger.error(f"Error updating news: {e}")
    
    async def analyze_market(self) -> Dict:
        """Perform complete market analysis"""
        # Update session
        self.session = self._get_current_session()
        
        # Get primary timeframe data
        klines = self.chart_data.get(CONFIG.PRIMARY_TIMEFRAME, [])
        if not klines:
            logger.warning("No chart data available")
            return {}
        
        # Analyze market
        analysis = self.signal_generator.analyze_market(klines, CONFIG.PRIMARY_TIMEFRAME)
        self.current_analysis = analysis
        
        return analysis
    
    async def generate_signals(self) -> Optional[Signal]:
        """Generate trading signals"""
        if not self.current_analysis:
            return None
        
        # Generate entry signal
        signal = self.signal_generator.generate_entry_signal(
            self.current_analysis, 
            self.session
        )
        
        self.latest_signal = signal
        
        # Log signal if it's an entry
        if signal.type == "ENTRY":
            logger.info(f"🎯 ENTRY SIGNAL: {signal.side} @ {signal.price:.2f} | "
                       f"Confidence: {signal.confidence:.1f}% | Reason: {signal.reason}")
            
            # Send notification if Telegram is configured
            await self._send_signal_notification(signal)
        
        return signal
    
    async def _send_signal_notification(self, signal: Signal):
        """Send signal notification via Telegram"""
        if not CONFIG.TELEGRAM_BOT_TOKEN or not CONFIG.TELEGRAM_CHAT_ID:
            return
        
        emoji = "🟢" if signal.side == "LONG" else "🔴"
        trend_emoji = "📈" if signal.side == "LONG" else "📉"
        
        message = f"""
{emoji} ENTRY SIGNAL
Market: BTCUSDT {signal.timeframe}
Side: {signal.side} {trend_emoji}
Price: ${signal.price:,.2f}
Confidence: {signal.confidence:.1f}%

Regime: {signal.market_regime}
Session: {signal.session}

Indicators:
• RSI: {signal.indicators.get('rsi', 0):.1f}
• MACD: {'↑' if signal.indicators.get('macd_hist', 0) > 0 else '↓'}
• Trend: {signal.indicators.get('trend', 'NEUTRAL')}
• Volume: {signal.indicators.get('volume_ratio', 1):.1f}x

Reason: {signal.reason}
        """.strip()
        
        try:
            url = f"https://api.telegram.org/bot{CONFIG.TELEGRAM_BOT_TOKEN}/sendMessage"
            payload = {
                "chat_id": CONFIG.TELEGRAM_CHAT_ID,
                "text": message,
                "parse_mode": "HTML"
            }
            
            async with aiohttp.ClientSession() as session:
                async with session.post(url, json=payload) as resp:
                    if resp.status != 200:
                        logger.warning(f"Failed to send Telegram notification: {await resp.text()}")
        except Exception as e:
            logger.error(f"Error sending Telegram notification: {e}")
    
    async def manage_positions(self):
        """Manage open positions"""
        if self.current_price <= 0:
            return
        
        # Update positions with current price
        closed_positions = self.risk_manager.update_positions(self.current_price)
        
        # Record closed trades
        for closed in closed_positions:
            # Find pattern ID if available
            pattern_id = None
            
            trade = Trade(
                id=str(uuid.uuid4()),
                entry_time=closed["open_time"],
                exit_time=closed["close_time"],
                entry_price=closed["entry_price"],
                exit_price=closed["exit_price"],
                side=closed["side"],
                pnl=closed["pnl_usdt"],
                pnl_pct=closed["pnl_pct"],
                outcome="win" if closed["pnl_pct"] > 0 else "loss",
                exit_reason=closed["exit_reason"]
            )
            
            self.learning_engine.record_trade(trade)
            
            # Send notification
            await self._send_exit_notification(closed)
    
    async def _send_exit_notification(self, closed: Dict):
        """Send exit notification via Telegram"""
        if not CONFIG.TELEGRAM_BOT_TOKEN or not CONFIG.TELEGRAM_CHAT_ID:
            return
        
        pnl_emoji = "✅" if closed["pnl_pct"] > 0 else "❌"
        
        message = f"""
{pnl_emoji} EXIT SIGNAL
Side: {closed['side']}
Entry: ${closed['entry_price']:,.2f}
Exit: ${closed['exit_price']:,.2f}
PnL: {closed['pnl_pct']:+.2f}% (${closed['pnl_usdt']:+.2f})
Reason: {closed['exit_reason']}
        """.strip()
        
        try:
            url = f"https://api.telegram.org/bot{CONFIG.TELEGRAM_BOT_TOKEN}/sendMessage"
            payload = {
                "chat_id": CONFIG.TELEGRAM_CHAT_ID,
                "text": message,
                "parse_mode": "HTML"
            }
            
            async with aiohttp.ClientSession() as session:
                async with session.post(url, json=payload) as resp:
                    pass
        except Exception as e:
            logger.error(f"Error sending exit notification: {e}")
    
    async def execute_signal(self, signal: Signal):
        """Execute an entry signal"""
        if signal.type != "ENTRY":
            return
        
        # Get or create pattern
        indicators = {
            "rsi": signal.indicators.get("rsi"),
            "macd": signal.indicators.get("macd"),
            "ema_21": signal.indicators.get("ema_21"),
            "volume_ratio": signal.indicators.get("volume_ratio"),
            "price": signal.price
        }
        
        pattern = self.learning_engine.get_or_create_pattern(
            indicators,
            signal.market_regime,
            signal.session,
            signal.timeframe
        )
        
        # Open position
        position = self.risk_manager.open_position(
            position_id=str(uuid.uuid4()),
            symbol=CONFIG.SYMBOL,
            side=signal.side,
            entry_price=signal.price,
            atr=signal.indicators.get("atr", signal.price * 0.02),
            confidence=signal.confidence,
            market_regime=signal.market_regime,
            session=signal.session,
            pattern_id=pattern.id
        )
        
        if position:
            logger.info(f"✅ Position opened: {position.id}")
    
    async def run_cycle(self):
        """Run one complete trading cycle"""
        try:
            # Update market data
            await self._update_market_data()
            
            # Update positions
            await self.manage_positions()
            
            # Analyze market
            await self.analyze_market()
            
            # Generate signals
            signal = await self.generate_signals()
            
            # Execute if entry signal
            if signal and signal.type == "ENTRY":
                await self.execute_signal(signal)
            
            logger.debug(f"Cycle complete - Price: ${self.current_price:,.2f}")
            
        except Exception as e:
            logger.error(f"Error in trading cycle: {e}", exc_info=True)
    
    async def run(self):
        """Main bot loop"""
        self.is_running = True
        
        # Initialize
        await self.initialize()
        
        logger.info("🚀 Bot started - Entering main loop")
        
        cycle_count = 0
        
        while self.is_running:
            try:
                await self.run_cycle()
                cycle_count += 1
                
                # Update news every 10 cycles (~100 seconds)
                if cycle_count % 10 == 0:
                    await self._update_news()
                
                # Wait before next cycle
                await asyncio.sleep(CONFIG.PRICE_UPDATE_INTERVAL_SEC)
                
            except KeyboardInterrupt:
                logger.info("Shutting down...")
                self.is_running = False
                break
            except Exception as e:
                logger.error(f"Error in main loop: {e}")
                await asyncio.sleep(5)
    
    def stop(self):
        """Stop the bot"""
        self.is_running = False
        logger.info("Bot stopped")
    
    # API methods for dashboard
    def get_status(self) -> Dict:
        """Get bot status for API"""
        return {
            "running": self.is_running,
            "symbol": CONFIG.SYMBOL,
            "session": self.session,
            "current_price": self.current_price,
            "timestamp": datetime.now().isoformat()
        }
    
    def get_price_data(self) -> Dict:
        """Get current price data"""
        return self.price_data or {
            "symbol": CONFIG.SYMBOL,
            "price": self.current_price,
            "timestamp": datetime.now().isoformat()
        }
    
    def get_chart_data(self, timeframe: str = None) -> List[Dict]:
        """Get chart data"""
        tf = timeframe or CONFIG.PRIMARY_TIMEFRAME
        return self.chart_data.get(tf, [])
    
    def get_analysis(self) -> Dict:
        """Get current analysis"""
        return self.current_analysis
    
    def get_signals(self) -> Dict:
        """Get latest signals"""
        signal_dict = {}
        if self.latest_signal:
            signal_dict = self.latest_signal.to_dict()
        
        return {
            "latest": signal_dict,
            "timestamp": datetime.now().isoformat()
        }
    
    def get_news(self) -> List[Dict]:
        """Get news data"""
        return self.news_data
    
    def get_fear_greed(self) -> Optional[Dict]:
        """Get Fear & Greed index"""
        return self.fear_greed_data
    
    def get_sentiment(self) -> Optional[Dict]:
        """Get overall sentiment"""
        return self.overall_sentiment
    
    def get_positions(self) -> Dict:
        """Get position summary"""
        return self.risk_manager.get_position_summary()
    
    def get_performance(self) -> Dict:
        """Get performance stats"""
        stats = self.learning_engine.get_performance_stats()
        adaptive = self.learning_engine.get_adaptive_params()
        
        return {
            **stats,
            "adaptive_params": adaptive,
            "patterns_count": len(self.learning_engine.patterns),
            "best_patterns": [
                p.to_dict() for p in self.learning_engine.get_best_patterns(5)
            ]
        }


# Singleton instance
scalper = RevolutionaryScalper()


async def main():
    """Main entry point"""
    bot = RevolutionaryScalper()
    await bot.run()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nBot stopped by user")

# Revolutionary Scalper v2.0 - Configuration
import os
from dataclasses import dataclass, field
from typing import Dict, List

@dataclass
class Config:
    """Bot configuration"""
    
    # Trading pair
    SYMBOL: str = "BTCUSDT"
    TIMEFRAMES: List[str] = field(default_factory=lambda: ["1m", "5m", "15m", "1h"])
    
    # Risk Management
    INITIAL_BALANCE: float = 1000.0  # Starting balance in USDT
    MAX_POSITION_SIZE: float = 0.04  # 4% max per trade (reduced from 6%)
    STOP_LOSS_PERCENT: float = 0.30  # 30% hard stop
    TRAILING_STOP_PERCENT: float = 0.15  # 15% trailing stop activation
    MIN_RISK_REWARD: float = 2.0  # 1:2 minimum
    
    # Technical Analysis
    EMA_PERIODS: List[int] = field(default_factory=lambda: [9, 21, 50, 200])
    RSI_PERIOD: int = 14
    RSI_OVERBOUGHT: float = 70.0
    RSI_OVERSOLD: float = 30.0
    MACD_FAST: int = 12
    MACD_SLOW: int = 26
    MACD_SIGNAL: int = 9
    BB_PERIOD: int = 20
    BB_STD: float = 2.0
    VOLUME_THRESHOLD: float = 2.0  # 2x average for spike
    
    # Signal Thresholds
    MIN_CONFIDENCE: float = 60.0  # Minimum confidence to trade
    
    # Adaptive Parameters (self-tuning)
    ADAPTIVE_RISK: bool = True
    WIN_RATE_WINDOW: int = 20  # Last 20 trades for calculation
    RISK_ADJUSTMENT_FACTOR: float = 0.1  # 10% adjustment
    
    # Session weights (UTC)
    SESSION_WEIGHTS: Dict[str, float] = field(default_factory=lambda: {
        "asian": 0.8,    # 00:00-08:00 UTC
        "london": 1.0,   # 08:00-16:00 UTC  
        "ny": 1.2        # 16:00-00:00 UTC
    })
    
    # Scan interval (seconds)
    SCAN_INTERVAL: int = 10  # 10 seconds for dashboard updates
    
    # API Endpoints (free tier)
    BINANCE_API: str = "https://api.binance.com"
    CRYPTOCOMPARE_API: str = "https://min-api.cryptocompare.com"
    
    # Convex
    CONVEX_URL: str = "https://dusty-llama-478.convex.cloud"
    
    # Paths
    DATA_DIR: str = "data"
    LOG_DIR: str = "logs"
    CONFIG_DIR: str = "config"
    
    # Pattern library file
    PATTERN_LIBRARY_FILE: str = "config/pattern_library.json"
    TRADE_HISTORY_FILE: str = "data/trade_history.csv"
    ADAPTIVE_PARAMS_FILE: str = "config/adaptive_params.json"

# Global config instance
config = Config()

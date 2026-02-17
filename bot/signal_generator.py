"""
Signal Generator - Generates entry and exit signals based on technical analysis
"""
import numpy as np
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
from datetime import datetime
import logging

from config import CONFIG

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@dataclass
class Signal:
    """Trading signal"""
    type: str  # ENTRY, EXIT, NONE
    side: str  # LONG, SHORT
    confidence: float  # 0-100
    price: float
    timestamp: str
    timeframe: str
    indicators: Dict
    reason: str
    pattern_id: Optional[str] = None
    market_regime: str = ""
    session: str = ""
    
    def to_dict(self) -> Dict:
        return {
            "type": self.type,
            "side": self.side,
            "confidence": self.confidence,
            "price": self.price,
            "timestamp": self.timestamp,
            "timeframe": self.timeframe,
            "indicators": self.indicators,
            "reason": self.reason,
            "pattern_id": self.pattern_id,
            "market_regime": self.market_regime,
            "session": self.session
        }


class TechnicalAnalyzer:
    """Calculates technical indicators"""
    
    @staticmethod
    def calculate_ema(prices: List[float], period: int) -> List[float]:
        """Calculate Exponential Moving Average"""
        if len(prices) < period:
            return [prices[-1]] * len(prices) if prices else []
        
        multiplier = 2 / (period + 1)
        ema = [sum(prices[:period]) / period]
        
        for price in prices[period:]:
            ema.append((price - ema[-1]) * multiplier + ema[-1])
        
        # Pad beginning
        return [ema[0]] * (period - 1) + ema
    
    @staticmethod
    def calculate_rsi(prices: List[float], period: int = 14) -> List[float]:
        """Calculate Relative Strength Index"""
        if len(prices) < period + 1:
            return [50.0] * len(prices)
        
        deltas = [prices[i] - prices[i-1] for i in range(1, len(prices))]
        gains = [d if d > 0 else 0 for d in deltas]
        losses = [abs(d) if d < 0 else 0 for d in deltas]
        
        # Initial averages
        avg_gain = sum(gains[:period]) / period
        avg_loss = sum(losses[:period]) / period
        
        rsi_values = []
        for i in range(period, len(deltas)):
            if avg_loss == 0:
                rsi_values.append(100.0)
            else:
                rs = avg_gain / avg_loss
                rsi_values.append(100 - (100 / (1 + rs)))
            
            # Update averages
            avg_gain = (avg_gain * (period - 1) + gains[i]) / period
            avg_loss = (avg_loss * (period - 1) + losses[i]) / period
        
        # Pad beginning
        return [50.0] * (period + 1) + rsi_values
    
    @staticmethod
    def calculate_macd(prices: List[float], fast: int = 12, slow: int = 26, 
                       signal: int = 9) -> Tuple[List[float], List[float], List[float]]:
        """Calculate MACD, Signal line, and Histogram"""
        ema_fast = TechnicalAnalyzer.calculate_ema(prices, fast)
        ema_slow = TechnicalAnalyzer.calculate_ema(prices, slow)
        
        macd = [f - s for f, s in zip(ema_fast, ema_slow)]
        macd_signal = TechnicalAnalyzer.calculate_ema(macd, signal)
        macd_hist = [m - s for m, s in zip(macd, macd_signal)]
        
        return macd, macd_signal, macd_hist
    
    @staticmethod
    def calculate_bollinger_bands(prices: List[float], period: int = 20, 
                                   std_dev: float = 2.0) -> Tuple[List[float], List[float], List[float]]:
        """Calculate Bollinger Bands (upper, middle, lower)"""
        if len(prices) < period:
            return [p * 1.02 for p in prices], prices, [p * 0.98 for p in prices]
        
        upper = []
        middle = []
        lower = []
        
        for i in range(len(prices)):
            if i < period - 1:
                upper.append(prices[i] * 1.02)
                middle.append(prices[i])
                lower.append(prices[i] * 0.98)
            else:
                window = prices[i-period+1:i+1]
                sma = sum(window) / period
                std = np.std(window) if len(window) > 1 else 0
                
                upper.append(sma + std_dev * std)
                middle.append(sma)
                lower.append(sma - std_dev * std)
        
        return upper, middle, lower
    
    @staticmethod
    def calculate_atr(highs: List[float], lows: List[float], closes: List[float], 
                      period: int = 14) -> List[float]:
        """Calculate Average True Range"""
        if len(closes) < 2:
            return [0.0] * len(closes)
        
        tr_values = []
        for i in range(1, len(closes)):
            tr1 = highs[i] - lows[i]
            tr2 = abs(highs[i] - closes[i-1])
            tr3 = abs(lows[i] - closes[i-1])
            tr_values.append(max(tr1, tr2, tr3))
        
        if len(tr_values) < period:
            return [sum(tr_values) / len(tr_values)] * len(closes) if tr_values else [0.0] * len(closes)
        
        atr = [sum(tr_values[:period]) / period]
        for tr in tr_values[period:]:
            atr.append((atr[-1] * (period - 1) + tr) / period)
        
        return [atr[0]] * (period) + atr
    
    @staticmethod
    def calculate_adx(highs: List[float], lows: List[float], closes: List[float], 
                      period: int = 14) -> Tuple[List[float], List[float], List[float]]:
        """Calculate ADX, +DI, -DI"""
        if len(closes) < period + 1:
            return [25.0] * len(closes), [20.0] * len(closes), [20.0] * len(closes)
        
        # Calculate +DM and -DM
        plus_dm = []
        minus_dm = []
        tr_list = []
        
        for i in range(1, len(highs)):
            up_move = highs[i] - highs[i-1]
            down_move = lows[i-1] - lows[i]
            
            if up_move > down_move and up_move > 0:
                plus_dm.append(up_move)
            else:
                plus_dm.append(0)
            
            if down_move > up_move and down_move > 0:
                minus_dm.append(down_move)
            else:
                minus_dm.append(0)
            
            # True Range
            tr1 = highs[i] - lows[i]
            tr2 = abs(highs[i] - closes[i-1])
            tr3 = abs(lows[i] - closes[i-1])
            tr_list.append(max(tr1, tr2, tr3))
        
        # Calculate smoothed values
        atr = [sum(tr_list[:period]) / period]
        plus_di = [sum(plus_dm[:period]) / period]
        minus_di = [sum(minus_dm[:period]) / period]
        
        for i in range(period, len(tr_list)):
            atr.append((atr[-1] * (period - 1) + tr_list[i]) / period)
            plus_di.append((plus_di[-1] * (period - 1) + plus_dm[i]) / period)
            minus_di.append((minus_di[-1] * (period - 1) + minus_dm[i]) / period)
        
        # Calculate DX and ADX
        dx = []
        for pdi, mdi, a in zip(plus_di, minus_di, atr):
            if pdi + mdi == 0:
                dx.append(0)
            else:
                dx.append(abs(pdi - mdi) / (pdi + mdi) * 100)
        
        adx = [sum(dx[:period]) / period]
        for d in dx[period:]:
            adx.append((adx[-1] * (period - 1) + d) / period)
        
        # Pad beginning
        pad = len(closes) - len(adx)
        adx = [25.0] * pad + adx
        plus_di = [20.0] * pad + plus_di
        minus_di = [20.0] * pad + minus_di
        
        return adx, plus_di, minus_di
    
    @staticmethod
    def calculate_volume_ma(volumes: List[float], period: int = 20) -> List[float]:
        """Calculate Volume Moving Average"""
        if len(volumes) < period:
            return volumes
        
        vma = []
        for i in range(len(volumes)):
            if i < period - 1:
                vma.append(sum(volumes[:i+1]) / (i+1))
            else:
                vma.append(sum(volumes[i-period+1:i+1]) / period)
        
        return vma


class SignalGenerator:
    """Generates trading signals based on technical analysis"""
    
    def __init__(self):
        self.analyzer = TechnicalAnalyzer()
        
    def analyze_market(self, klines: List[Dict], timeframe: str = "5m") -> Dict:
        """Perform complete market analysis"""
        if not klines or len(klines) < 50:
            return {}
        
        # Extract price data
        closes = [k["close"] for k in klines]
        highs = [k["high"] for k in klines]
        lows = [k["low"] for k in klines]
        volumes = [k["volume"] for k in klines]
        
        current_price = closes[-1]
        
        # Calculate indicators
        ema_9 = self.analyzer.calculate_ema(closes, CONFIG.EMA_FAST)
        ema_21 = self.analyzer.calculate_ema(closes, CONFIG.EMA_MEDIUM)
        ema_50 = self.analyzer.calculate_ema(closes, CONFIG.EMA_SLOW)
        ema_200 = self.analyzer.calculate_ema(closes, CONFIG.EMA_TREND)
        
        rsi = self.analyzer.calculate_rsi(closes, CONFIG.RSI_PERIOD)
        macd, macd_signal, macd_hist = self.analyzer.calculate_macd(
            closes, CONFIG.MACD_FAST, CONFIG.MACD_SLOW, CONFIG.MACD_SIGNAL
        )
        
        bb_upper, bb_middle, bb_lower = self.analyzer.calculate_bollinger_bands(
            closes, CONFIG.BB_PERIOD, CONFIG.BB_STD_DEV
        )
        
        atr = self.analyzer.calculate_atr(highs, lows, closes, CONFIG.ATR_PERIOD)
        adx, plus_di, minus_di = self.analyzer.calculate_adx(highs, lows, closes, CONFIG.ADX_PERIOD)
        
        volume_ma = self.analyzer.calculate_volume_ma(volumes, CONFIG.VOLUME_MA_PERIOD)
        volume_ratio = volumes[-1] / volume_ma[-1] if volume_ma[-1] > 0 else 1.0
        
        # Market regime detection
        adx_value = adx[-1]
        atr_value = atr[-1]
        atr_pct = (atr_value / current_price) * 100
        
        if adx_value > CONFIG.ADX_TRENDING_THRESHOLD:
            regime = "TRENDING"
        elif adx_value < CONFIG.ADX_RANGING_THRESHOLD:
            regime = "RANGING"
        elif atr_pct > 3:  # High volatility
            regime = "VOLATILE"
        else:
            regime = "NEUTRAL"
        
        # Trend direction
        trend = "BULLISH" if ema_9[-1] > ema_21[-1] > ema_50[-1] else "BEARISH" if ema_9[-1] < ema_21[-1] < ema_50[-1] else "NEUTRAL"
        
        return {
            "timeframe": timeframe,
            "price": current_price,
            "ema_9": ema_9[-1],
            "ema_21": ema_21[-1],
            "ema_50": ema_50[-1],
            "ema_200": ema_200[-1],
            "rsi": rsi[-1],
            "macd": macd[-1],
            "macd_signal": macd_signal[-1],
            "macd_hist": macd_hist[-1],
            "bb_upper": bb_upper[-1],
            "bb_middle": bb_middle[-1],
            "bb_lower": bb_lower[-1],
            "atr": atr[-1],
            "atr_pct": atr_pct,
            "adx": adx[-1],
            "plus_di": plus_di[-1],
            "minus_di": minus_di[-1],
            "volume": volumes[-1],
            "volume_ma": volume_ma[-1],
            "volume_ratio": volume_ratio,
            "regime": regime,
            "trend": trend,
            "ema_9_series": ema_9,
            "ema_21_series": ema_21,
            "ema_50_series": ema_50,
            "rsi_series": rsi,
            "macd_series": macd,
            "macd_signal_series": macd_signal,
            "macd_hist_series": macd_hist,
            "bb_upper_series": bb_upper,
            "bb_lower_series": bb_lower,
            "volume_series": volumes,
            "timestamps": [k.get("timestamp") or k.get("close_time") for k in klines]
        }
    
    def generate_entry_signal(self, analysis: Dict, session: str = "LONDON") -> Signal:
        """Generate entry signal based on analysis"""
        if not analysis:
            return Signal("NONE", "LONG", 0, 0, datetime.now().isoformat(), "", {}, "No data")
        
        price = analysis["price"]
        rsi = analysis["rsi"]
        macd = analysis["macd"]
        macd_signal = analysis["macd_signal"]
        macd_hist = analysis["macd_hist"]
        ema_9 = analysis["ema_9"]
        ema_21 = analysis["ema_21"]
        ema_50 = analysis["ema_50"]
        bb_upper = analysis["bb_upper"]
        bb_lower = analysis["bb_lower"]
        volume_ratio = analysis["volume_ratio"]
        regime = analysis["regime"]
        trend = analysis["trend"]
        timeframe = analysis["timeframe"]
        
        score = 0.0
        reasons = []
        side = "LONG"
        
        # RSI conditions
        if rsi < 30:
            score += 20
            reasons.append("RSI oversold")
        elif rsi > 70:
            score -= 20
            reasons.append("RSI overbought")
        elif 40 <= rsi <= 60:
            score += 5
            reasons.append("RSI neutral")
        
        # MACD conditions
        if macd > macd_signal and macd_hist > 0:
            score += 20
            reasons.append("MACD bullish crossover")
        elif macd < macd_signal and macd_hist < 0:
            score -= 20
            reasons.append("MACD bearish crossover")
        
        # EMA conditions
        if ema_9 > ema_21 > ema_50:
            score += 15
            reasons.append("Bullish EMA alignment")
        elif ema_9 < ema_21 < ema_50:
            score -= 15
            reasons.append("Bearish EMA alignment")
        
        # Bollinger Bands
        if price < bb_lower:
            score += 15
            reasons.append("Price below lower BB")
        elif price > bb_upper:
            score -= 15
            reasons.append("Price above upper BB")
        
        # Volume confirmation
        if volume_ratio > 2:
            if score > 0:
                score += 10
                reasons.append(f"High volume ({volume_ratio:.1f}x)")
            elif score < 0:
                score -= 10
                reasons.append(f"High volume ({volume_ratio:.1f}x)")
        
        # Market regime adjustments
        if regime == "TRENDING" and trend == "BULLISH":
            score += 10
            reasons.append("Bullish trending regime")
        elif regime == "TRENDING" and trend == "BEARISH":
            score -= 10
            reasons.append("Bearish trending regime")
        elif regime == "RANGING":
            score *= 0.8  # Reduce confidence in ranging markets
            reasons.append("Ranging market")
        
        # Session weight
        session_weights = {
            "ASIAN": CONFIG.ASIAN_SESSION_WEIGHT,
            "LONDON": CONFIG.LONDON_SESSION_WEIGHT,
            "NY": CONFIG.NY_SESSION_WEIGHT
        }
        score *= session_weights.get(session, 1.0)
        
        # Determine signal
        confidence = abs(score)
        
        if confidence >= CONFIG.MIN_CONFIDENCE_SCORE:
            if score > 0:
                signal_type = "ENTRY"
                side = "LONG"
            else:
                signal_type = "ENTRY"
                side = "SHORT"
        else:
            signal_type = "NONE"
            side = "LONG"
        
        return Signal(
            type=signal_type,
            side=side,
            confidence=min(confidence, 100),
            price=price,
            timestamp=datetime.now().isoformat(),
            timeframe=timeframe,
            indicators=analysis,
            reason="; ".join(reasons),
            market_regime=regime,
            session=session
        )
    
    def generate_exit_signal(self, position: Dict, current_price: float, 
                             analysis: Dict) -> Optional[Signal]:
        """Generate exit signal for an open position"""
        entry_price = position.get("entry_price", 0)
        side = position.get("side", "LONG")
        highest_price = position.get("highest_price", entry_price)
        lowest_price = position.get("lowest_price", entry_price)
        
        if side == "LONG":
            pnl_pct = (current_price - entry_price) / entry_price * 100
            
            # Hard stop loss
            if pnl_pct <= -CONFIG.HARD_STOP_LOSS_PCT * 100:
                return Signal(
                    type="EXIT",
                    side="LONG",
                    confidence=100,
                    price=current_price,
                    timestamp=datetime.now().isoformat(),
                    timeframe=analysis.get("timeframe", "5m"),
                    indicators=analysis,
                    reason="Hard stop loss triggered"
                )
            
            # Trailing stop
            if pnl_pct >= CONFIG.TRAILING_STOP_ACTIVATION_PCT * 100:
                trail_price = highest_price * (1 - CONFIG.TRAILING_STOP_DISTANCE_PCT)
                if current_price <= trail_price:
                    return Signal(
                        type="EXIT",
                        side="LONG",
                        confidence=100,
                        price=current_price,
                        timestamp=datetime.now().isoformat(),
                        timeframe=analysis.get("timeframe", "5m"),
                        indicators=analysis,
                        reason="Trailing stop triggered"
                    )
            
            # Take profit levels
            if pnl_pct >= CONFIG.TP3_PCT * 100:
                return Signal(
                    type="EXIT",
                    side="LONG",
                    confidence=90,
                    price=current_price,
                    timestamp=datetime.now().isoformat(),
                    timeframe=analysis.get("timeframe", "5m"),
                    indicators=analysis,
                    reason="Take Profit 3 reached (20%)"
                )
            elif pnl_pct >= CONFIG.TP2_PCT * 100:
                return Signal(
                    type="EXIT",
                    side="LONG",
                    confidence=70,
                    price=current_price,
                    timestamp=datetime.now().isoformat(),
                    timeframe=analysis.get("timeframe", "5m"),
                    indicators=analysis,
                    reason="Take Profit 2 reached (10%)"
                )
            elif pnl_pct >= CONFIG.TP1_PCT * 100:
                return Signal(
                    type="EXIT",
                    side="LONG",
                    confidence=50,
                    price=current_price,
                    timestamp=datetime.now().isoformat(),
                    timeframe=analysis.get("timeframe", "5m"),
                    indicators=analysis,
                    reason="Take Profit 1 reached (5%)"
                )
        
        else:  # SHORT position
            pnl_pct = (entry_price - current_price) / entry_price * 100
            
            # Hard stop loss
            if pnl_pct <= -CONFIG.HARD_STOP_LOSS_PCT * 100:
                return Signal(
                    type="EXIT",
                    side="SHORT",
                    confidence=100,
                    price=current_price,
                    timestamp=datetime.now().isoformat(),
                    timeframe=analysis.get("timeframe", "5m"),
                    indicators=analysis,
                    reason="Hard stop loss triggered"
                )
            
            # Trailing stop
            if pnl_pct >= CONFIG.TRAILING_STOP_ACTIVATION_PCT * 100:
                trail_price = lowest_price * (1 + CONFIG.TRAILING_STOP_DISTANCE_PCT)
                if current_price >= trail_price:
                    return Signal(
                        type="EXIT",
                        side="SHORT",
                        confidence=100,
                        price=current_price,
                        timestamp=datetime.now().isoformat(),
                        timeframe=analysis.get("timeframe", "5m"),
                        indicators=analysis,
                        reason="Trailing stop triggered"
                    )
        
        return None


# Singleton instance
signal_generator = SignalGenerator()

"""
Risk Manager - Handles position sizing, stop losses, and risk management
"""
from typing import Dict, Optional, List
from dataclasses import dataclass
from datetime import datetime
import logging

from config import CONFIG

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@dataclass
class Position:
    """Represents an open position"""
    id: str
    symbol: str
    side: str  # LONG or SHORT
    entry_price: float
    size: float  # In base asset
    value_usdt: float
    leverage: float = 1.0
    open_time: str = ""
    stop_loss: float = 0.0
    take_profit_1: float = 0.0
    take_profit_2: float = 0.0
    take_profit_3: float = 0.0
    trailing_stop_active: bool = False
    trailing_stop_price: float = 0.0
    highest_price: float = 0.0
    lowest_price: float = 0.0
    pattern_id: Optional[str] = None
    market_regime: str = ""
    session: str = ""
    
    def __post_init__(self):
        if not self.open_time:
            self.open_time = datetime.now().isoformat()
        if self.highest_price == 0:
            self.highest_price = self.entry_price
        if self.lowest_price == 0:
            self.lowest_price = self.entry_price
    
    def update_price(self, current_price: float):
        """Update position with current price"""
        if self.side == "LONG":
            self.highest_price = max(self.highest_price, current_price)
            self.lowest_price = min(self.lowest_price, current_price)
            
            # Activate trailing stop
            pnl_pct = (current_price - self.entry_price) / self.entry_price
            if not self.trailing_stop_active and pnl_pct >= CONFIG.TRAILING_STOP_ACTIVATION_PCT:
                self.trailing_stop_active = True
                self.trailing_stop_price = self.highest_price * (1 - CONFIG.TRAILING_STOP_DISTANCE_PCT)
                logger.info(f"Trailing stop activated at {self.trailing_stop_price:.2f}")
            
            # Update trailing stop
            if self.trailing_stop_active:
                new_trail = self.highest_price * (1 - CONFIG.TRAILING_STOP_DISTANCE_PCT)
                if new_trail > self.trailing_stop_price:
                    self.trailing_stop_price = new_trail
                    
        else:  # SHORT
            self.lowest_price = min(self.lowest_price, current_price)
            self.highest_price = max(self.highest_price, current_price)
            
            pnl_pct = (self.entry_price - current_price) / self.entry_price
            if not self.trailing_stop_active and pnl_pct >= CONFIG.TRAILING_STOP_ACTIVATION_PCT:
                self.trailing_stop_active = True
                self.trailing_stop_price = self.lowest_price * (1 + CONFIG.TRAILING_STOP_DISTANCE_PCT)
                logger.info(f"Trailing stop activated at {self.trailing_stop_price:.2f}")
            
            if self.trailing_stop_active:
                new_trail = self.lowest_price * (1 + CONFIG.TRAILING_STOP_DISTANCE_PCT)
                if new_trail < self.trailing_stop_price:
                    self.trailing_stop_price = new_trail
    
    def calculate_pnl(self, current_price: float) -> Dict:
        """Calculate current PnL"""
        if self.side == "LONG":
            pnl_pct = (current_price - self.entry_price) / self.entry_price * 100
        else:
            pnl_pct = (self.entry_price - current_price) / self.entry_price * 100
        
        pnl_usdt = self.value_usdt * pnl_pct / 100
        
        return {
            "pnl_pct": pnl_pct,
            "pnl_usdt": pnl_usdt,
            "entry_price": self.entry_price,
            "current_price": current_price,
            "size": self.size,
            "value_usdt": self.value_usdt
        }
    
    def check_exit_conditions(self, current_price: float) -> Optional[str]:
        """Check if any exit condition is met"""
        pnl = self.calculate_pnl(current_price)
        pnl_pct = pnl["pnl_pct"]
        
        # Hard stop loss
        if pnl_pct <= -CONFIG.HARD_STOP_LOSS_PCT * 100:
            return "HARD_STOP"
        
        # Trailing stop
        if self.trailing_stop_active:
            if self.side == "LONG" and current_price <= self.trailing_stop_price:
                return "TRAILING_STOP"
            if self.side == "SHORT" and current_price >= self.trailing_stop_price:
                return "TRAILING_STOP"
        
        # Take profits
        if pnl_pct >= CONFIG.TP3_PCT * 100:
            return "TP3"
        elif pnl_pct >= CONFIG.TP2_PCT * 100:
            return "TP2"
        elif pnl_pct >= CONFIG.TP1_PCT * 100:
            return "TP1"
        
        return None
    
    def to_dict(self) -> Dict:
        return {
            "id": self.id,
            "symbol": self.symbol,
            "side": self.side,
            "entry_price": self.entry_price,
            "size": self.size,
            "value_usdt": self.value_usdt,
            "leverage": self.leverage,
            "open_time": self.open_time,
            "stop_loss": self.stop_loss,
            "take_profit_1": self.take_profit_1,
            "take_profit_2": self.take_profit_2,
            "take_profit_3": self.take_profit_3,
            "trailing_stop_active": self.trailing_stop_active,
            "trailing_stop_price": self.trailing_stop_price,
            "highest_price": self.highest_price,
            "lowest_price": self.lowest_price,
            "pattern_id": self.pattern_id,
            "market_regime": self.market_regime,
            "session": self.session
        }


class RiskManager:
    """Manages risk and position sizing"""
    
    def __init__(self, learning_engine=None):
        self.positions: Dict[str, Position] = {}
        self.daily_pnl: float = 0.0
        self.daily_trades: int = 0
        self.learning_engine = learning_engine
        self.account_balance: float = 10000.0  # Default starting balance
        
    def set_account_balance(self, balance: float):
        """Update account balance"""
        self.account_balance = balance
        
    def calculate_position_size(self, entry_price: float, atr: float, 
                                confidence: float, pattern_weight: float = 1.0) -> float:
        """Calculate position size based on risk parameters"""
        # Base position size (max position * confidence)
        base_size = CONFIG.MAX_POSITION_SIZE_USDT * (confidence / 100)
        
        # Apply pattern weight
        base_size *= pattern_weight
        
        # Volatility adjustment (smaller size in high volatility)
        atr_pct = atr / entry_price
        vol_adjustment = 1 / (1 + atr_pct * 10)  # Reduce size as ATR increases
        base_size *= vol_adjustment
        
        # Apply adaptive multiplier if available
        if self.learning_engine:
            params = self.learning_engine.get_adaptive_params()
            base_size *= params.get("position_size_multiplier", 1.0)
            base_size *= params.get("risk_multiplier", 1.0)
        
        # Cap at max position
        base_size = min(base_size, CONFIG.MAX_POSITION_SIZE_USDT)
        
        # Ensure minimum position
        base_size = max(base_size, 10.0)  # Minimum $10 position
        
        return base_size
    
    def calculate_stop_loss(self, entry_price: float, atr: float, 
                           side: str, market_regime: str = "NEUTRAL") -> float:
        """Calculate stop loss price"""
        # Base stop distance (ATR-based)
        stop_distance = atr * 2  # 2x ATR
        
        # Adjust based on market regime
        regime_multipliers = {
            "TRENDING": 1.0,
            "RANGING": 0.8,  # Tighter stops in ranging
            "VOLATILE": 1.5,  # Wider stops in volatile
            "NEUTRAL": 1.0
        }
        
        stop_distance *= regime_multipliers.get(market_regime, 1.0)
        
        # Ensure minimum stop (hard stop)
        min_stop_pct = CONFIG.HARD_STOP_LOSS_PCT
        min_stop_distance = entry_price * min_stop_pct
        stop_distance = max(stop_distance, min_stop_distance)
        
        if side == "LONG":
            return entry_price - stop_distance
        else:
            return entry_price + stop_distance
    
    def calculate_take_profits(self, entry_price: float, side: str) -> Dict[str, float]:
        """Calculate take profit levels"""
        if side == "LONG":
            return {
                "tp1": entry_price * (1 + CONFIG.TP1_PCT),
                "tp2": entry_price * (1 + CONFIG.TP2_PCT),
                "tp3": entry_price * (1 + CONFIG.TP3_PCT)
            }
        else:
            return {
                "tp1": entry_price * (1 - CONFIG.TP1_PCT),
                "tp2": entry_price * (1 - CONFIG.TP2_PCT),
                "tp3": entry_price * (1 - CONFIG.TP3_PCT)
            }
    
    def can_open_position(self) -> bool:
        """Check if we can open a new position"""
        # Check max concurrent positions
        if len(self.positions) >= CONFIG.MAX_CONCURRENT_POSITIONS:
            return False
        
        # Check daily loss limit
        if self.daily_pnl <= -self.account_balance * CONFIG.MAX_DAILY_LOSS_PCT:
            logger.warning("Daily loss limit reached")
            return False
        
        return True
    
    def open_position(self, position_id: str, symbol: str, side: str,
                      entry_price: float, atr: float, confidence: float,
                      market_regime: str = "", session: str = "",
                      pattern_id: Optional[str] = None) -> Optional[Position]:
        """Open a new position"""
        if not self.can_open_position():
            logger.warning("Cannot open position: limits reached")
            return None
        
        # Get pattern weight
        pattern_weight = 1.0
        if self.learning_engine and pattern_id:
            pattern_weight = self.learning_engine.get_pattern_weight(pattern_id)
        
        # Calculate position size
        position_value = self.calculate_position_size(entry_price, atr, confidence, pattern_weight)
        size = position_value / entry_price
        
        # Calculate stops
        stop_loss = self.calculate_stop_loss(entry_price, atr, side, market_regime)
        take_profits = self.calculate_take_profits(entry_price, side)
        
        position = Position(
            id=position_id,
            symbol=symbol,
            side=side,
            entry_price=entry_price,
            size=size,
            value_usdt=position_value,
            stop_loss=stop_loss,
            take_profit_1=take_profits["tp1"],
            take_profit_2=take_profits["tp2"],
            take_profit_3=take_profits["tp3"],
            market_regime=market_regime,
            session=session,
            pattern_id=pattern_id
        )
        
        self.positions[position_id] = position
        self.daily_trades += 1
        
        logger.info(f"Opened {side} position: {position_id} @ {entry_price:.2f}, size={size:.6f}")
        return position
    
    def close_position(self, position_id: str, exit_price: float, 
                       reason: str) -> Optional[Dict]:
        """Close a position"""
        if position_id not in self.positions:
            return None
        
        position = self.positions[position_id]
        pnl = position.calculate_pnl(exit_price)
        
        # Update daily PnL
        self.daily_pnl += pnl["pnl_usdt"]
        
        # Remove position
        del self.positions[position_id]
        
        result = {
            "position_id": position_id,
            "symbol": position.symbol,
            "side": position.side,
            "entry_price": position.entry_price,
            "exit_price": exit_price,
            "pnl_usdt": pnl["pnl_usdt"],
            "pnl_pct": pnl["pnl_pct"],
            "exit_reason": reason,
            "open_time": position.open_time,
            "close_time": datetime.now().isoformat()
        }
        
        logger.info(f"Closed position: {position_id} | PnL: {pnl['pnl_pct']:.2f}% | Reason: {reason}")
        return result
    
    def update_positions(self, current_price: float) -> List[Dict]:
        """Update all positions with current price and check for exits"""
        closed_positions = []
        
        for position_id, position in list(self.positions.items()):
            position.update_price(current_price)
            
            exit_reason = position.check_exit_conditions(current_price)
            if exit_reason:
                result = self.close_position(position_id, current_price, exit_reason)
                if result:
                    closed_positions.append(result)
        
        return closed_positions
    
    def get_position_summary(self) -> Dict:
        """Get summary of all positions"""
        total_value = sum(p.value_usdt for p in self.positions.values())
        
        return {
            "active_positions": len(self.positions),
            "total_exposure": total_value,
            "daily_pnl": self.daily_pnl,
            "daily_trades": self.daily_trades,
            "positions": {k: v.to_dict() for k, v in self.positions.items()}
        }
    
    def reset_daily_stats(self):
        """Reset daily statistics (call at start of new day)"""
        self.daily_pnl = 0.0
        self.daily_trades = 0
        logger.info("Daily stats reset")


# Singleton instance
risk_manager = RiskManager()

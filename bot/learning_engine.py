"""
Learning Engine - Pattern recognition and adaptive learning system
"""
import json
import os
import logging
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta
from dataclasses import dataclass, asdict
from collections import defaultdict
import statistics

from config import CONFIG

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@dataclass
class Pattern:
    """Represents a trading pattern"""
    id: str
    name: str
    indicators: Dict[str, Any]  # RSI, MACD, EMA state, etc.
    market_regime: str  # TRENDING, RANGING, VOLATILE
    session: str  # ASIAN, LONDON, NY
    timeframe: str
    created_at: str
    occurrences: int = 0
    wins: int = 0
    losses: int = 0
    win_rate: float = 0.0
    avg_profit_pct: float = 0.0
    avg_loss_pct: float = 0.0
    weight: float = 1.0
    last_used: Optional[str] = None
    
    def update_performance(self, outcome: str, profit_pct: float):
        """Update pattern performance after trade"""
        self.occurrences += 1
        self.last_used = datetime.now().isoformat()
        
        if outcome == "win":
            self.wins += 1
            # Update running average profit
            self.avg_profit_pct = ((self.avg_profit_pct * (self.wins - 1)) + profit_pct) / self.wins
        else:
            self.losses += 1
            # Update running average loss
            self.avg_loss_pct = ((self.avg_loss_pct * (self.losses - 1)) + abs(profit_pct)) / self.losses
        
        # Calculate win rate
        if self.occurrences > 0:
            self.win_rate = self.wins / self.occurrences
            
        # Update weight based on performance
        self._update_weight()
    
    def _update_weight(self):
        """Update pattern weight based on performance"""
        if self.occurrences < CONFIG.MIN_PATTERN_OCCURRENCES:
            self.weight = 1.0  # Neutral weight for new patterns
        else:
            # Weight based on win rate and consistency
            base_weight = self.win_rate
            
            # Bonus for consistent performance
            consistency_bonus = min(self.occurrences / 100, 0.2)  # Max 0.2 bonus
            
            # Risk-adjusted weight (reward/loss ratio)
            if self.avg_loss_pct > 0:
                rr_ratio = self.avg_profit_pct / self.avg_loss_pct
                rr_factor = min(rr_ratio / 2, 1.0)  # Normalize to max 1.0
            else:
                rr_factor = 1.0
            
            self.weight = base_weight * (1 + consistency_bonus) * rr_factor
            self.weight = max(0.1, min(2.0, self.weight))  # Cap between 0.1 and 2.0
    
    def to_dict(self) -> Dict:
        return asdict(self)
    
    @classmethod
    def from_dict(cls, data: Dict) -> 'Pattern':
        return cls(**data)


@dataclass
class Trade:
    """Represents a completed trade"""
    id: str
    entry_time: str
    exit_time: Optional[str] = None
    entry_price: float = 0.0
    exit_price: float = 0.0
    side: str = "LONG"  # LONG or SHORT
    size: float = 0.0
    pnl: float = 0.0
    pnl_pct: float = 0.0
    outcome: str = "open"  # win, loss, open
    pattern_id: Optional[str] = None
    market_regime: str = ""
    session: str = ""
    exit_reason: str = ""  # tp1, tp2, tp3, stop_loss, trailing_stop, manual
    
    def close(self, exit_price: float, exit_time: str, exit_reason: str):
        """Close the trade"""
        self.exit_price = exit_price
        self.exit_time = exit_time
        self.exit_reason = exit_reason
        
        # Calculate PnL
        if self.side == "LONG":
            self.pnl_pct = (exit_price - self.entry_price) / self.entry_price * 100
        else:
            self.pnl_pct = (self.entry_price - exit_price) / self.entry_price * 100
            
        self.pnl = self.size * self.pnl_pct / 100
        self.outcome = "win" if self.pnl_pct > 0 else "loss"
    
    def to_dict(self) -> Dict:
        return asdict(self)


class LearningEngine:
    """Manages pattern learning and adaptive parameters"""
    
    def __init__(self):
        self.patterns: Dict[str, Pattern] = {}
        self.trades: List[Trade] = []
        self.adaptive_params: Dict[str, Any] = {}
        
        # Load existing data
        self._load_patterns()
        self._load_trades()
        self._load_adaptive_params()
        
    def _get_file_path(self, filename: str) -> str:
        """Get full path for a data file"""
        return os.path.join(CONFIG.DATA_DIR, filename)
    
    def _load_patterns(self):
        """Load patterns from disk"""
        filepath = self._get_file_path(CONFIG.PATTERN_LIBRARY_FILE)
        if os.path.exists(filepath):
            try:
                with open(filepath, 'r') as f:
                    data = json.load(f)
                    self.patterns = {
                        k: Pattern.from_dict(v) for k, v in data.items()
                    }
                logger.info(f"Loaded {len(self.patterns)} patterns")
            except Exception as e:
                logger.error(f"Error loading patterns: {e}")
                self.patterns = {}
    
    def _save_patterns(self):
        """Save patterns to disk"""
        filepath = self._get_file_path(CONFIG.PATTERN_LIBRARY_FILE)
        try:
            with open(filepath, 'w') as f:
                json.dump(
                    {k: v.to_dict() for k, v in self.patterns.items()},
                    f,
                    indent=2
                )
        except Exception as e:
            logger.error(f"Error saving patterns: {e}")
    
    def _load_trades(self):
        """Load trade history from disk"""
        filepath = self._get_file_path(CONFIG.TRADE_HISTORY_FILE)
        if os.path.exists(filepath):
            try:
                with open(filepath, 'r') as f:
                    data = json.load(f)
                    self.trades = [Trade(**t) for t in data]
                logger.info(f"Loaded {len(self.trades)} trades")
            except Exception as e:
                logger.error(f"Error loading trades: {e}")
                self.trades = []
    
    def _save_trades(self):
        """Save trade history to disk"""
        filepath = self._get_file_path(CONFIG.TRADE_HISTORY_FILE)
        try:
            with open(filepath, 'w') as f:
                json.dump([t.to_dict() for t in self.trades], f, indent=2)
        except Exception as e:
            logger.error(f"Error saving trades: {e}")
    
    def _load_adaptive_params(self):
        """Load adaptive parameters from disk"""
        filepath = self._get_file_path(CONFIG.ADAPTIVE_PARAMS_FILE)
        if os.path.exists(filepath):
            try:
                with open(filepath, 'r') as f:
                    self.adaptive_params = json.load(f)
            except Exception as e:
                logger.error(f"Error loading adaptive params: {e}")
                self.adaptive_params = self._default_adaptive_params()
        else:
            self.adaptive_params = self._default_adaptive_params()
    
    def _save_adaptive_params(self):
        """Save adaptive parameters to disk"""
        filepath = self._get_file_path(CONFIG.ADAPTIVE_PARAMS_FILE)
        try:
            with open(filepath, 'w') as f:
                json.dump(self.adaptive_params, f, indent=2)
        except Exception as e:
            logger.error(f"Error saving adaptive params: {e}")
    
    def _default_adaptive_params(self) -> Dict:
        """Get default adaptive parameters"""
        return {
            "risk_multiplier": 1.0,
            "position_size_multiplier": 1.0,
            "confidence_threshold_adjustment": 0.0,
            "win_rate_20": 0.5,
            "total_trades": 0,
            "winning_trades": 0,
            "losing_trades": 0,
            "current_drawdown_pct": 0.0,
            "max_drawdown_pct": 0.0,
            "last_updated": datetime.now().isoformat()
        }
    
    def create_pattern_signature(self, indicators: Dict, market_regime: str, 
                                  session: str, timeframe: str) -> str:
        """Create a unique signature for a pattern"""
        # Simplify indicators to key states
        rsi_state = "high" if indicators.get("rsi", 50) > 70 else "low" if indicators.get("rsi", 50) < 30 else "mid"
        macd_state = "bullish" if indicators.get("macd", 0) > indicators.get("macd_signal", 0) else "bearish"
        ema_state = "above" if indicators.get("price", 0) > indicators.get("ema_21", 0) else "below"
        volume_state = "high" if indicators.get("volume_ratio", 1) > 2 else "normal"
        
        signature = f"{rsi_state}_{macd_state}_{ema_state}_{volume_state}_{market_regime}_{session}_{timeframe}"
        return signature
    
    def get_or_create_pattern(self, indicators: Dict, market_regime: str,
                              session: str, timeframe: str) -> Pattern:
        """Get existing pattern or create new one"""
        pattern_id = self.create_pattern_signature(indicators, market_regime, session, timeframe)
        
        if pattern_id in self.patterns:
            return self.patterns[pattern_id]
        
        # Create new pattern
        pattern = Pattern(
            id=pattern_id,
            name=f"Pattern_{pattern_id}",
            indicators=indicators,
            market_regime=market_regime,
            session=session,
            timeframe=timeframe,
            created_at=datetime.now().isoformat()
        )
        self.patterns[pattern_id] = pattern
        self._save_patterns()
        
        logger.info(f"Created new pattern: {pattern_id}")
        return pattern
    
    def record_trade(self, trade: Trade):
        """Record a completed trade"""
        self.trades.append(trade)
        
        # Update pattern if trade used one
        if trade.pattern_id and trade.pattern_id in self.patterns:
            self.patterns[trade.pattern_id].update_performance(
                trade.outcome, 
                trade.pnl_pct
            )
            self._save_patterns()
        
        # Update adaptive parameters
        self._update_adaptive_params()
        
        # Save trades
        self._save_trades()
        
        logger.info(f"Recorded trade: {trade.id} - {trade.outcome} {trade.pnl_pct:.2f}%")
    
    def _update_adaptive_params(self):
        """Update adaptive parameters based on recent performance"""
        if len(self.trades) < 5:
            return
        
        # Get recent trades
        recent_trades = self.trades[-CONFIG.ADAPTIVE_WINDOW_TRADES:]
        wins = sum(1 for t in recent_trades if t.outcome == "win")
        total = len([t for t in recent_trades if t.outcome in ("win", "loss")])
        
        if total == 0:
            return
        
        win_rate = wins / total
        
        # Calculate drawdown
        equity = 100  # Start with 100
        peak = equity
        max_dd = 0
        
        for trade in self.trades:
            if trade.outcome in ("win", "loss"):
                equity *= (1 + trade.pnl_pct / 100)
                if equity > peak:
                    peak = equity
                dd = (peak - equity) / peak * 100
                max_dd = max(max_dd, dd)
        
        # Adjust parameters based on performance
        params = self.adaptive_params
        params["win_rate_20"] = win_rate
        params["total_trades"] = len([t for t in self.trades if t.outcome in ("win", "loss")])
        params["winning_trades"] = len([t for t in self.trades if t.outcome == "win"])
        params["losing_trades"] = len([t for t in self.trades if t.outcome == "loss"])
        params["max_drawdown_pct"] = max_dd
        params["last_updated"] = datetime.now().isoformat()
        
        # Adjust risk multiplier
        if win_rate >= CONFIG.WIN_RATE_HIGH_THRESHOLD:
            params["risk_multiplier"] = min(1.5, params.get("risk_multiplier", 1.0) * 1.05)
            params["position_size_multiplier"] = min(1.3, params.get("position_size_multiplier", 1.0) * 1.02)
        elif win_rate <= CONFIG.WIN_RATE_LOW_THRESHOLD or max_dd > 10:
            params["risk_multiplier"] = max(0.5, params.get("risk_multiplier", 1.0) * 0.9)
            params["position_size_multiplier"] = max(0.5, params.get("position_size_multiplier", 1.0) * 0.95)
        
        self._save_adaptive_params()
        logger.info(f"Updated adaptive params: Win rate={win_rate:.2%}, Risk mult={params['risk_multiplier']:.2f}")
    
    def get_pattern_weight(self, pattern_id: str) -> float:
        """Get the weight for a pattern"""
        if pattern_id in self.patterns:
            return self.patterns[pattern_id].weight
        return 1.0
    
    def get_best_patterns(self, limit: int = 10) -> List[Pattern]:
        """Get the best performing patterns"""
        # Filter patterns with enough occurrences
        valid_patterns = [
            p for p in self.patterns.values() 
            if p.occurrences >= CONFIG.MIN_PATTERN_OCCURRENCES
        ]
        
        # Sort by weight (win rate * consistency)
        sorted_patterns = sorted(valid_patterns, key=lambda p: p.weight, reverse=True)
        return sorted_patterns[:limit]
    
    def get_performance_stats(self) -> Dict:
        """Get overall performance statistics"""
        closed_trades = [t for t in self.trades if t.outcome in ("win", "loss")]
        
        if not closed_trades:
            return {
                "total_trades": 0,
                "win_rate": 0.0,
                "total_pnl": 0.0,
                "avg_profit": 0.0,
                "avg_loss": 0.0,
                "profit_factor": 0.0,
                "max_drawdown": 0.0
            }
        
        wins = [t for t in closed_trades if t.outcome == "win"]
        losses = [t for t in closed_trades if t.outcome == "loss"]
        
        total_pnl = sum(t.pnl_pct for t in closed_trades)
        avg_profit = sum(t.pnl_pct for t in wins) / len(wins) if wins else 0
        avg_loss = sum(abs(t.pnl_pct) for t in losses) / len(losses) if losses else 0
        
        gross_profit = sum(t.pnl_pct for t in wins)
        gross_loss = sum(abs(t.pnl_pct) for t in losses)
        profit_factor = gross_profit / gross_loss if gross_loss > 0 else float('inf')
        
        return {
            "total_trades": len(closed_trades),
            "winning_trades": len(wins),
            "losing_trades": len(losses),
            "win_rate": len(wins) / len(closed_trades) * 100,
            "total_pnl": total_pnl,
            "avg_profit": avg_profit,
            "avg_loss": avg_loss,
            "profit_factor": profit_factor,
            "max_drawdown": self.adaptive_params.get("max_drawdown_pct", 0)
        }
    
    def get_adaptive_params(self) -> Dict:
        """Get current adaptive parameters"""
        return self.adaptive_params.copy()


# Singleton instance
learning_engine = LearningEngine()

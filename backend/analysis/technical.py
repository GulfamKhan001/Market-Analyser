"""
Technical analysis engine.

Computes indicators via pandas_ta, scores each dimension (trend, momentum,
volatility, volume), and produces a composite score for a given ticker.
"""

from __future__ import annotations

import logging
from datetime import date, timedelta
from typing import Optional

import numpy as np
import pandas as pd
from ta import momentum, trend, volatility, volume as ta_volume
from sqlalchemy import select
from sqlalchemy.orm import Session

from db.models import StockPrice, TechnicalSignal

logger = logging.getLogger(__name__)

# ── Weight configuration ─────────────────────────────────────────────────────
WEIGHTS = {
    "trend": 0.30,
    "momentum": 0.25,
    "volatility": 0.20,
    "volume": 0.15,
    "pattern": 0.10,
}


# ── Indicator computation ────────────────────────────────────────────────────

def compute_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """Compute all technical indicators on an OHLCV DataFrame.

    Expected columns: open, high, low, close, volume.
    Returns the DataFrame with indicator columns appended.
    Uses the ``ta`` library (technical-analysis) which supports Python 3.10+.
    """
    df = df.copy()
    close = df["close"]
    high = df["high"]
    low = df["low"]
    vol = df["volume"].astype(float)

    # --- Trend ---
    df["sma_20"] = trend.SMAIndicator(close, window=20).sma_indicator()
    df["sma_50"] = trend.SMAIndicator(close, window=50).sma_indicator()
    df["sma_200"] = trend.SMAIndicator(close, window=200).sma_indicator()
    df["ema_12"] = trend.EMAIndicator(close, window=12).ema_indicator()
    df["ema_26"] = trend.EMAIndicator(close, window=26).ema_indicator()

    try:
        adx_ind = trend.ADXIndicator(high, low, close, window=14)
        df["adx"] = adx_ind.adx()
    except Exception:
        df["adx"] = np.nan

    try:
        macd_ind = trend.MACD(close, window_slow=26, window_fast=12, window_sign=9)
        df["macd"] = macd_ind.macd()
        df["macd_signal"] = macd_ind.macd_signal()
        df["macd_hist"] = macd_ind.macd_diff()
    except Exception:
        df["macd"] = df["macd_signal"] = df["macd_hist"] = np.nan

    # --- Momentum ---
    try:
        df["rsi"] = momentum.RSIIndicator(close, window=14).rsi()
    except Exception:
        df["rsi"] = np.nan

    try:
        stoch_ind = momentum.StochasticOscillator(high, low, close, window=14, smooth_window=3)
        df["stochastic_k"] = stoch_ind.stoch()
        df["stochastic_d"] = stoch_ind.stoch_signal()
    except Exception:
        df["stochastic_k"] = df["stochastic_d"] = np.nan

    try:
        df["williams_r"] = momentum.WilliamsRIndicator(high, low, close, lbp=14).williams_r()
    except Exception:
        df["williams_r"] = np.nan

    try:
        df["roc"] = momentum.ROCIndicator(close, window=10).roc()
    except Exception:
        df["roc"] = np.nan

    # --- Volatility ---
    try:
        bb = volatility.BollingerBands(close, window=20, window_dev=2)
        df["bb_lower"] = bb.bollinger_lband()
        df["bb_middle"] = bb.bollinger_mavg()
        df["bb_upper"] = bb.bollinger_hband()
    except Exception:
        df["bb_lower"] = df["bb_middle"] = df["bb_upper"] = np.nan

    try:
        df["atr"] = volatility.AverageTrueRange(high, low, close, window=14).average_true_range()
    except Exception:
        df["atr"] = np.nan

    # --- Volume ---
    try:
        df["obv"] = ta_volume.OnBalanceVolumeIndicator(close, vol).on_balance_volume()
    except Exception:
        df["obv"] = np.nan

    vol_sma = df["volume"].rolling(window=20).mean()
    if vol_sma is not None and vol_sma.notna().any():
        df["volume_sma_ratio"] = df["volume"] / vol_sma.replace(0, np.nan)
    else:
        df["volume_sma_ratio"] = 1.0

    return df


# ── Sub-score helpers (each returns 0-100) ───────────────────────────────────

def _trend_score(row: pd.Series) -> float:
    """Score trend strength on a 0-100 scale."""
    score = 50.0  # neutral baseline

    close = row.get("close", np.nan)

    # Price vs. moving averages
    for ma, weight in [("sma_20", 5), ("sma_50", 7), ("sma_200", 10)]:
        ma_val = row.get(ma, np.nan)
        if pd.notna(close) and pd.notna(ma_val) and ma_val != 0:
            score += weight if close > ma_val else -weight

    # MA alignment (golden/death cross proxy)
    sma20 = row.get("sma_20", np.nan)
    sma50 = row.get("sma_50", np.nan)
    sma200 = row.get("sma_200", np.nan)
    if pd.notna(sma20) and pd.notna(sma50) and pd.notna(sma200):
        if sma20 > sma50 > sma200:
            score += 10  # bullish alignment
        elif sma20 < sma50 < sma200:
            score -= 10  # bearish alignment

    # ADX
    adx = row.get("adx", np.nan)
    if pd.notna(adx):
        if adx > 25:
            score += 5  # strong trend
        elif adx < 15:
            score -= 3  # weak/no trend

    # MACD histogram
    macd_hist = row.get("macd_hist", np.nan)
    if pd.notna(macd_hist):
        score += np.clip(macd_hist * 2, -8, 8)

    return float(np.clip(score, 0, 100))


def _momentum_score(row: pd.Series) -> float:
    """Score momentum on a 0-100 scale."""
    score = 50.0

    # RSI
    rsi = row.get("rsi", np.nan)
    if pd.notna(rsi):
        if rsi > 70:
            score -= (rsi - 70) * 0.5  # overbought penalty
        elif rsi < 30:
            score += (30 - rsi) * 0.5  # oversold bounce potential
        else:
            score += (rsi - 50) * 0.3

    # Stochastic
    stoch_k = row.get("stochastic_k", np.nan)
    stoch_d = row.get("stochastic_d", np.nan)
    if pd.notna(stoch_k) and pd.notna(stoch_d):
        if stoch_k > stoch_d:
            score += 5
        else:
            score -= 5

    # Williams %R
    willr = row.get("williams_r", np.nan)
    if pd.notna(willr):
        # Williams %R ranges from -100 to 0
        if willr > -20:
            score -= 5  # overbought
        elif willr < -80:
            score += 5  # oversold

    # ROC
    roc = row.get("roc", np.nan)
    if pd.notna(roc):
        score += np.clip(roc * 1.5, -10, 10)

    return float(np.clip(score, 0, 100))


def _volatility_score(row: pd.Series) -> float:
    """Score volatility favourability on a 0-100 scale.

    Higher score means volatility conditions are more favourable (low stress).
    """
    score = 50.0

    close = row.get("close", np.nan)
    bb_upper = row.get("bb_upper", np.nan)
    bb_lower = row.get("bb_lower", np.nan)
    bb_middle = row.get("bb_middle", np.nan)

    # Bollinger Band position
    if pd.notna(close) and pd.notna(bb_upper) and pd.notna(bb_lower):
        bb_range = bb_upper - bb_lower
        if bb_range > 0:
            position = (close - bb_lower) / bb_range  # 0-1
            # Near middle is neutral; extremes are signals
            if position > 0.8:
                score -= 10  # near upper band
            elif position < 0.2:
                score += 10  # near lower band (mean-reversion opportunity)
            else:
                score += 5  # comfortable middle zone

    # BB width (narrowing = squeeze, potential breakout)
    if pd.notna(bb_middle) and bb_middle != 0 and pd.notna(bb_upper) and pd.notna(bb_lower):
        bb_width = (bb_upper - bb_lower) / bb_middle
        if bb_width < 0.04:
            score += 8  # tight squeeze
        elif bb_width > 0.15:
            score -= 8  # high volatility

    # ATR normalised
    atr = row.get("atr", np.nan)
    if pd.notna(atr) and pd.notna(close) and close != 0:
        atr_pct = atr / close
        if atr_pct < 0.01:
            score += 5
        elif atr_pct > 0.04:
            score -= 10

    return float(np.clip(score, 0, 100))


def _volume_score(row: pd.Series) -> float:
    """Score volume conditions on a 0-100 scale."""
    score = 50.0

    vol_ratio = row.get("volume_sma_ratio", np.nan)
    if pd.notna(vol_ratio):
        if vol_ratio > 2.0:
            score += 15  # unusually high volume (conviction)
        elif vol_ratio > 1.3:
            score += 8
        elif vol_ratio < 0.5:
            score -= 10  # low participation
        elif vol_ratio < 0.7:
            score -= 5

    # OBV trend (simple: positive OBV means accumulation)
    obv = row.get("obv", np.nan)
    if pd.notna(obv):
        if obv > 0:
            score += 5
        else:
            score -= 5

    return float(np.clip(score, 0, 100))


# ── Composite score ──────────────────────────────────────────────────────────

def compute_composite_score(row: pd.Series) -> dict:
    """Return a dict of sub-scores and a weighted composite score (0-100)."""
    trend = _trend_score(row)
    momentum = _momentum_score(row)
    volatility = _volatility_score(row)
    volume = _volume_score(row)

    # Pattern score is a placeholder (requires candlestick pattern recognition)
    pattern = 50.0

    composite = (
        trend * WEIGHTS["trend"]
        + momentum * WEIGHTS["momentum"]
        + volatility * WEIGHTS["volatility"]
        + volume * WEIGHTS["volume"]
        + pattern * WEIGHTS["pattern"]
    )

    return {
        "trend_score": round(trend, 2),
        "momentum_score": round(momentum, 2),
        "volatility_score": round(volatility, 2),
        "volume_score": round(volume, 2),
        "pattern_score": round(pattern, 2),
        "composite_score": round(composite, 2),
    }


# ── Full ticker analysis ─────────────────────────────────────────────────────

def analyze_ticker(
    ticker: str,
    session: Session,
    lookback_days: int = 400,
    timeframe: str = "daily",
) -> dict:
    """Fetch prices from the DB, compute indicators, persist a TechnicalSignal,
    and return a summary dict.
    """
    cutoff = date.today() - timedelta(days=lookback_days)

    rows = (
        session.execute(
            select(StockPrice)
            .where(StockPrice.ticker == ticker, StockPrice.date >= cutoff)
            .order_by(StockPrice.date)
        )
        .scalars()
        .all()
    )

    if len(rows) < 30:
        logger.warning("Not enough price data for %s (%d rows)", ticker, len(rows))
        return {"ticker": ticker, "error": "insufficient_data", "rows": len(rows)}

    df = pd.DataFrame(
        [
            {
                "date": r.date,
                "open": r.open,
                "high": r.high,
                "low": r.low,
                "close": r.close,
                "volume": r.volume,
            }
            for r in rows
        ]
    )
    df.sort_values("date", inplace=True)
    df.reset_index(drop=True, inplace=True)

    df = compute_indicators(df)

    latest = df.iloc[-1]
    scores = compute_composite_score(latest)

    # Persist to DB (upsert-like: delete existing then insert)
    existing = (
        session.execute(
            select(TechnicalSignal).where(
                TechnicalSignal.ticker == ticker,
                TechnicalSignal.date == latest["date"],
                TechnicalSignal.timeframe == timeframe,
            )
        )
        .scalars()
        .first()
    )
    if existing:
        session.delete(existing)
        session.flush()

    signal = TechnicalSignal(
        ticker=ticker,
        date=latest["date"],
        timeframe=timeframe,
        # Momentum
        rsi=_safe_float(latest.get("rsi")),
        stochastic_k=_safe_float(latest.get("stochastic_k")),
        stochastic_d=_safe_float(latest.get("stochastic_d")),
        williams_r=_safe_float(latest.get("williams_r")),
        roc=_safe_float(latest.get("roc")),
        # Trend
        macd=_safe_float(latest.get("macd")),
        macd_signal=_safe_float(latest.get("macd_signal")),
        macd_hist=_safe_float(latest.get("macd_hist")),
        adx=_safe_float(latest.get("adx")),
        sma_20=_safe_float(latest.get("sma_20")),
        sma_50=_safe_float(latest.get("sma_50")),
        sma_200=_safe_float(latest.get("sma_200")),
        ema_12=_safe_float(latest.get("ema_12")),
        ema_26=_safe_float(latest.get("ema_26")),
        # Volatility
        bb_upper=_safe_float(latest.get("bb_upper")),
        bb_middle=_safe_float(latest.get("bb_middle")),
        bb_lower=_safe_float(latest.get("bb_lower")),
        atr=_safe_float(latest.get("atr")),
        # Volume
        obv=_safe_float(latest.get("obv")),
        volume_sma_ratio=_safe_float(latest.get("volume_sma_ratio")),
        # Composite
        composite_score=scores["composite_score"],
        trend_score=scores["trend_score"],
        momentum_score=scores["momentum_score"],
        volatility_score=scores["volatility_score"],
        volume_score=scores["volume_score"],
    )
    session.add(signal)
    session.commit()

    logger.info("Saved TechnicalSignal for %s on %s", ticker, latest["date"])

    return {
        "ticker": ticker,
        "date": str(latest["date"]),
        "timeframe": timeframe,
        "close": float(latest["close"]),
        "scores": scores,
        "indicators": {
            "rsi": _safe_float(latest.get("rsi")),
            "macd_hist": _safe_float(latest.get("macd_hist")),
            "adx": _safe_float(latest.get("adx")),
            "atr": _safe_float(latest.get("atr")),
            "volume_sma_ratio": _safe_float(latest.get("volume_sma_ratio")),
        },
    }


# ── Multi-timeframe ──────────────────────────────────────────────────────────

def _resample_ohlcv(df: pd.DataFrame, rule: str) -> pd.DataFrame:
    """Resample daily OHLCV to weekly ('W') or monthly ('ME') timeframe."""
    df = df.copy()
    if "date" in df.columns:
        df["date"] = pd.to_datetime(df["date"])
        df.set_index("date", inplace=True)

    resampled = df.resample(rule).agg({
        "open": "first",
        "high": "max",
        "low": "min",
        "close": "last",
        "volume": "sum",
    }).dropna()

    resampled.reset_index(inplace=True)
    resampled.rename(columns={"date": "date"}, inplace=True)
    return resampled


def analyze_ticker_multitimeframe(
    ticker: str,
    session: Session,
    lookback_days: int = 500,
) -> dict:
    """Run analysis on daily, weekly, and monthly timeframes."""
    results = {}

    # Daily (always)
    results["daily"] = analyze_ticker(ticker, session, lookback_days, "daily")

    # Need raw prices for resampling
    cutoff = date.today() - timedelta(days=lookback_days)
    rows = (
        session.execute(
            select(StockPrice)
            .where(StockPrice.ticker == ticker, StockPrice.date >= cutoff)
            .order_by(StockPrice.date)
        )
        .scalars()
        .all()
    )

    if len(rows) < 60:
        return results

    df = pd.DataFrame([{
        "date": r.date, "open": r.open, "high": r.high,
        "low": r.low, "close": r.close, "volume": r.volume,
    } for r in rows])
    df.sort_values("date", inplace=True)
    df.reset_index(drop=True, inplace=True)

    # Weekly
    weekly = _resample_ohlcv(df, "W")
    if len(weekly) >= 20:
        weekly_ind = compute_indicators(weekly)
        latest_w = weekly_ind.iloc[-1]
        scores_w = compute_composite_score(latest_w)
        _persist_signal(ticker, latest_w, scores_w, "weekly", session)
        results["weekly"] = {"scores": scores_w, "date": str(latest_w.get("date", ""))}

    # Monthly
    monthly = _resample_ohlcv(df, "ME")
    if len(monthly) >= 10:
        monthly_ind = compute_indicators(monthly)
        latest_m = monthly_ind.iloc[-1]
        scores_m = compute_composite_score(latest_m)
        _persist_signal(ticker, latest_m, scores_m, "monthly", session)
        results["monthly"] = {"scores": scores_m, "date": str(latest_m.get("date", ""))}

    return results


def _persist_signal(
    ticker: str, row: pd.Series, scores: dict, timeframe: str, session: Session
) -> None:
    """Save a TechnicalSignal for the given timeframe."""
    sig_date = row.get("date")
    if hasattr(sig_date, "date"):
        sig_date = sig_date.date()

    existing = (
        session.execute(
            select(TechnicalSignal).where(
                TechnicalSignal.ticker == ticker,
                TechnicalSignal.date == sig_date,
                TechnicalSignal.timeframe == timeframe,
            )
        )
        .scalars()
        .first()
    )
    if existing:
        session.delete(existing)
        session.flush()

    signal = TechnicalSignal(
        ticker=ticker,
        date=sig_date,
        timeframe=timeframe,
        rsi=_safe_float(row.get("rsi")),
        stochastic_k=_safe_float(row.get("stochastic_k")),
        stochastic_d=_safe_float(row.get("stochastic_d")),
        williams_r=_safe_float(row.get("williams_r")),
        roc=_safe_float(row.get("roc")),
        macd=_safe_float(row.get("macd")),
        macd_signal=_safe_float(row.get("macd_signal")),
        macd_hist=_safe_float(row.get("macd_hist")),
        adx=_safe_float(row.get("adx")),
        sma_20=_safe_float(row.get("sma_20")),
        sma_50=_safe_float(row.get("sma_50")),
        sma_200=_safe_float(row.get("sma_200")),
        ema_12=_safe_float(row.get("ema_12")),
        ema_26=_safe_float(row.get("ema_26")),
        bb_upper=_safe_float(row.get("bb_upper")),
        bb_middle=_safe_float(row.get("bb_middle")),
        bb_lower=_safe_float(row.get("bb_lower")),
        atr=_safe_float(row.get("atr")),
        obv=_safe_float(row.get("obv")),
        volume_sma_ratio=_safe_float(row.get("volume_sma_ratio")),
        composite_score=scores["composite_score"],
        trend_score=scores["trend_score"],
        momentum_score=scores["momentum_score"],
        volatility_score=scores["volatility_score"],
        volume_score=scores["volume_score"],
    )
    session.add(signal)
    session.commit()


# ── Utilities ────────────────────────────────────────────────────────────────

def _safe_float(val) -> Optional[float]:
    """Convert a value to float, returning None for NaN / None."""
    if val is None:
        return None
    try:
        f = float(val)
        return None if np.isnan(f) else round(f, 6)
    except (ValueError, TypeError):
        return None

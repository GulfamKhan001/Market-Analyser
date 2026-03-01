from pydantic import BaseModel, field_validator, model_validator
from typing import Literal


class ScenarioCase(BaseModel):
    probability: float
    target: str
    thesis: str

    @field_validator("probability")
    @classmethod
    def probability_in_range(cls, v: float) -> float:
        if not 0.0 <= v <= 1.0:
            raise ValueError("probability must be between 0 and 1")
        return v


class AIAnalysisResult(BaseModel):
    bull_case: ScenarioCase
    base_case: ScenarioCase
    bear_case: ScenarioCase
    risk_factors: list[str]
    max_drawdown_estimate: str
    position_size_pct: float
    confidence: float
    timeframe: str

    @field_validator("confidence")
    @classmethod
    def confidence_in_range(cls, v: float) -> float:
        if not 0.0 <= v <= 1.0:
            raise ValueError("confidence must be between 0 and 1")
        return v

    @model_validator(mode="after")
    def probabilities_sum_to_one(self) -> "AIAnalysisResult":
        total = (
            self.bull_case.probability
            + self.base_case.probability
            + self.bear_case.probability
        )
        if abs(total - 1.0) > 0.05:
            raise ValueError(
                f"bull + base + bear probabilities must sum to ~1.0 "
                f"(within 0.05 tolerance), got {total:.4f}"
            )
        return self


class ScreeningResult(BaseModel):
    ticker: str
    action: Literal["BUY", "HOLD", "SELL", "WATCH"]
    conviction: float
    one_liner: str

    @field_validator("conviction")
    @classmethod
    def conviction_in_range(cls, v: float) -> float:
        if not 0.0 <= v <= 1.0:
            raise ValueError("conviction must be between 0 and 1")
        return v


class MarketOutlook(BaseModel):
    regime_assessment: str
    sector_rotation: list[str]
    risk_level: str
    key_themes: list[str]
    outlook_text: str

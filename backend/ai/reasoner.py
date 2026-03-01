import json
import logging
from datetime import datetime, timedelta, date

import anthropic

from config import get_settings
from db.models import AIAnalysis
from db.database import SessionLocal
from ai.schemas import AIAnalysisResult, ScreeningResult, MarketOutlook
from ai.prompts import (
    build_analysis_prompt,
    build_screening_prompt,
    build_market_outlook_prompt,
)

logger = logging.getLogger(__name__)


def _strip_code_fences(text: str) -> str:
    """Remove markdown code fences (```json ... ```) from AI responses."""
    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        lines = [l for l in lines if not l.strip().startswith("```")]
        text = "\n".join(lines).strip()
    return text


class AIReasoner:
    """Thin orchestration layer between deterministic analytics and the Claude API."""

    def __init__(self) -> None:
        self.settings = get_settings()
        self.client = anthropic.Anthropic(api_key=self.settings.anthropic_api_key)

    # ------------------------------------------------------------------
    # Public methods
    # ------------------------------------------------------------------

    async def analyze_ticker(
        self,
        ticker: str,
        technical_data: dict,
        fundamental_data: dict,
        regime_data: dict,
        portfolio_exposure: dict,
        deep: bool = False,
    ) -> AIAnalysisResult:
        """Run scenario analysis for a single ticker.

        Uses claude-haiku-4-5-20251001 for standard speed and
        claude-sonnet-4-6 for deep analysis.
        """
        analysis_type = "deep" if deep else "standard"
        model = (
            self.settings.ai_model_deep if deep else self.settings.ai_model_screening
        )

        # --- Check cache ---
        session = SessionLocal()
        try:
            cached = self._check_cache(ticker, analysis_type, session)
            if cached is not None:
                logger.info("Cache hit for %s (%s)", ticker, analysis_type)
                return self._db_row_to_result(cached)

            # --- Build prompt & call Claude ---
            system_prompt, user_prompt = build_analysis_prompt(
                ticker, technical_data, fundamental_data, regime_data, portfolio_exposure,
            )

            message = self.client.messages.create(
                model=model,
                max_tokens=2000,
                system=system_prompt,
                messages=[{"role": "user", "content": user_prompt}],
            )
            response_text = _strip_code_fences(message.content[0].text)

            # --- Parse & validate ---
            result = AIAnalysisResult.model_validate_json(response_text)

            # --- Persist ---
            self._save_to_db(ticker, result, analysis_type, model, session)

            return result

        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    async def screen_tickers(
        self,
        tickers_data: list[dict],
    ) -> list[ScreeningResult]:
        """Batch-screen a list of tickers and return action recommendations."""
        model = self.settings.ai_model_screening

        system_prompt, user_prompt = build_screening_prompt(tickers_data)

        message = self.client.messages.create(
            model=model,
            max_tokens=2000,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}],
        )
        response_text = _strip_code_fences(message.content[0].text)

        raw_list = json.loads(response_text)
        return [ScreeningResult.model_validate(item) for item in raw_list]

    async def market_outlook(
        self,
        regime_data: dict,
        macro_data: dict,
        sector_data: dict,
    ) -> MarketOutlook:
        """Generate a market-level outlook."""
        model = self.settings.ai_model_screening

        system_prompt, user_prompt = build_market_outlook_prompt(
            regime_data, macro_data, sector_data,
        )

        message = self.client.messages.create(
            model=model,
            max_tokens=2000,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}],
        )
        response_text = _strip_code_fences(message.content[0].text)

        return MarketOutlook.model_validate_json(response_text)

    # ------------------------------------------------------------------
    # Cache helpers
    # ------------------------------------------------------------------

    def _check_cache(self, ticker: str, analysis_type: str, session) -> AIAnalysis | None:
        """Return the most recent cached row if it is within ai_cache_hours."""
        cutoff = datetime.utcnow() - timedelta(hours=self.settings.ai_cache_hours)
        row = (
            session.query(AIAnalysis)
            .filter(
                AIAnalysis.ticker == ticker,
                AIAnalysis.analysis_type == analysis_type,
                AIAnalysis.created_at >= cutoff,
            )
            .order_by(AIAnalysis.created_at.desc())
            .first()
        )
        return row

    def _save_to_db(
        self,
        ticker: str,
        result: AIAnalysisResult,
        analysis_type: str,
        model_used: str,
        session,
    ) -> None:
        """Persist an AIAnalysisResult to the AIAnalysis table."""
        row = AIAnalysis(
            ticker=ticker,
            date=date.today(),
            analysis_type=analysis_type,
            model_used=model_used,
            bull_probability=result.bull_case.probability,
            bull_target=result.bull_case.target,
            bull_thesis=result.bull_case.thesis,
            base_probability=result.base_case.probability,
            base_target=result.base_case.target,
            base_thesis=result.base_case.thesis,
            bear_probability=result.bear_case.probability,
            bear_target=result.bear_case.target,
            bear_thesis=result.bear_case.thesis,
            risk_factors_json=result.risk_factors,
            drawdown_estimate=result.max_drawdown_estimate,
            position_size_suggestion=result.position_size_pct,
            confidence_score=result.confidence,
            timeframe=result.timeframe,
            created_at=datetime.utcnow(),
        )
        session.add(row)
        session.commit()
        logger.info("Saved %s analysis for %s to DB", analysis_type, ticker)

    # ------------------------------------------------------------------
    # Conversion helper
    # ------------------------------------------------------------------

    @staticmethod
    def _db_row_to_result(row: AIAnalysis) -> AIAnalysisResult:
        """Reconstruct an AIAnalysisResult from a cached DB row."""
        from ai.schemas import ScenarioCase

        return AIAnalysisResult(
            bull_case=ScenarioCase(
                probability=row.bull_probability,
                target=row.bull_target,
                thesis=row.bull_thesis,
            ),
            base_case=ScenarioCase(
                probability=row.base_probability,
                target=row.base_target,
                thesis=row.base_thesis,
            ),
            bear_case=ScenarioCase(
                probability=row.bear_probability,
                target=row.bear_target,
                thesis=row.bear_thesis,
            ),
            risk_factors=row.risk_factors_json or [],
            max_drawdown_estimate=row.drawdown_estimate or "",
            position_size_pct=row.position_size_suggestion or 0.0,
            confidence=row.confidence_score or 0.0,
            timeframe=row.timeframe or "",
        )

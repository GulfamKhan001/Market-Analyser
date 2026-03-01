import json

from ai.schemas import AIAnalysisResult, ScreeningResult, MarketOutlook


# ---------------------------------------------------------------------------
# Helper: compact JSON schema description for the AI
# ---------------------------------------------------------------------------

_ANALYSIS_SCHEMA = json.dumps(AIAnalysisResult.model_json_schema(), indent=2)
_SCREENING_SCHEMA = json.dumps(ScreeningResult.model_json_schema(), indent=2)
_OUTLOOK_SCHEMA = json.dumps(MarketOutlook.model_json_schema(), indent=2)


# ---------------------------------------------------------------------------
# 1. Single-ticker deep / standard analysis
# ---------------------------------------------------------------------------

def build_analysis_prompt(
    ticker: str,
    technical_data: dict,
    fundamental_data: dict,
    regime_data: dict,
    portfolio_exposure: dict,
) -> tuple[str, str]:
    """Return (system_prompt, user_prompt) for single-ticker analysis."""

    system_prompt = (
        f"You are a quantitative analyst. Given the following deterministic "
        f"analytics for {ticker}, provide probability-weighted scenario "
        f"analysis. Never guarantee returns. Base reasoning ONLY on provided "
        f"data. Output valid JSON matching the schema."
    )

    user_prompt = (
        f"## Ticker: {ticker}\n\n"
        f"### Technical Indicators\n"
        f"```json\n{json.dumps(technical_data, indent=2, default=str)}\n```\n\n"
        f"### Fundamental Data\n"
        f"```json\n{json.dumps(fundamental_data, indent=2, default=str)}\n```\n\n"
        f"### Market Regime\n"
        f"```json\n{json.dumps(regime_data, indent=2, default=str)}\n```\n\n"
        f"### Current Portfolio Exposure\n"
        f"```json\n{json.dumps(portfolio_exposure, indent=2, default=str)}\n```\n\n"
        f"---\n\n"
        f"Produce a JSON object that matches this schema exactly "
        f"(no additional keys, no markdown fences):\n\n"
        f"```\n{_ANALYSIS_SCHEMA}\n```\n\n"
        f"Return ONLY the raw JSON object."
    )

    return system_prompt, user_prompt


# ---------------------------------------------------------------------------
# 2. Batch screening
# ---------------------------------------------------------------------------

def build_screening_prompt(
    tickers_data: list[dict],
) -> tuple[str, str]:
    """Return (system_prompt, user_prompt) for batch ticker screening."""

    system_prompt = (
        "You are a quantitative screening engine. For each ticker provided, "
        "assign an action (BUY / HOLD / SELL / WATCH), a conviction score "
        "(0-1), and a one-line rationale. Base reasoning ONLY on provided "
        "data. Output valid JSON matching the schema."
    )

    user_prompt = (
        "## Tickers for Screening\n\n"
        f"```json\n{json.dumps(tickers_data, indent=2, default=str)}\n```\n\n"
        "---\n\n"
        "Produce a JSON **array** where each element matches this schema "
        "(no additional keys, no markdown fences):\n\n"
        f"```\n{_SCREENING_SCHEMA}\n```\n\n"
        "Return ONLY the raw JSON array."
    )

    return system_prompt, user_prompt


# ---------------------------------------------------------------------------
# 3. Market-level outlook
# ---------------------------------------------------------------------------

def build_market_outlook_prompt(
    regime_data: dict,
    macro_data: dict,
    sector_data: dict,
) -> tuple[str, str]:
    """Return (system_prompt, user_prompt) for market-level outlook."""

    system_prompt = (
        "You are a macro strategist. Given the following regime, "
        "macroeconomic, and sector-level data, provide a concise market "
        "outlook. Never guarantee returns. Base reasoning ONLY on provided "
        "data. Output valid JSON matching the schema."
    )

    user_prompt = (
        "## Market Regime\n"
        f"```json\n{json.dumps(regime_data, indent=2, default=str)}\n```\n\n"
        "## Macroeconomic Indicators\n"
        f"```json\n{json.dumps(macro_data, indent=2, default=str)}\n```\n\n"
        "## Sector Performance\n"
        f"```json\n{json.dumps(sector_data, indent=2, default=str)}\n```\n\n"
        "---\n\n"
        "Produce a JSON object that matches this schema exactly "
        "(no additional keys, no markdown fences):\n\n"
        f"```\n{_OUTLOOK_SCHEMA}\n```\n\n"
        "Return ONLY the raw JSON object."
    )

    return system_prompt, user_prompt

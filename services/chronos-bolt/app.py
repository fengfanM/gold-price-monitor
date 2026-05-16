from __future__ import annotations

import math
import os
from datetime import datetime
from functools import lru_cache
from typing import Any, Dict, List, Literal, Optional, Tuple

import numpy as np
from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field


APP_NAME = "gold-chronos-bolt-service"
DEFAULT_MODEL_ID = "amazon/chronos-bolt-base"


class ContextPoint(BaseModel):
    timestamp: str
    price: float


class ForecastFeatures(BaseModel):
    ruleProbability: Optional[float] = None
    ruleConfidence: Optional[float] = None
    drawdownPercent24h: Optional[float] = None
    percentChange24h: Optional[float] = None
    high24h: Optional[float] = None
    low24h: Optional[float] = None
    anchorPremiumPercent: Optional[float] = None
    consensusDeviationPercent: Optional[float] = None

    model_config = {"extra": "allow"}


class ForecastRequest(BaseModel):
    model: Optional[str] = None
    provider: Optional[str] = None
    task: str = "gold-price-direction-forecast"
    horizonMinutes: int = Field(default=60, ge=1, le=60 * 24 * 14)
    symbol: Optional[str] = None
    unit: Optional[str] = None
    latestPrice: float = Field(gt=0)
    context: List[ContextPoint] = Field(default_factory=list)
    features: ForecastFeatures = Field(default_factory=ForecastFeatures)
    outputSchema: Optional[Dict[str, Any]] = None


class ForecastResponse(BaseModel):
    upProbability: float
    confidence: int
    forecastPrice: float
    intervalLow: float
    intervalHigh: float
    summary: str
    rationale: List[str]
    risks: List[str]


class HealthResponse(BaseModel):
    ok: bool
    provider: Literal["chronos"]
    model: str
    chronosLoaded: bool
    fallbackEnabled: bool


app = FastAPI(title=APP_NAME, version="0.1.0")


def _env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.lower() in {"1", "true", "yes", "on"}


def require_token(authorization: Optional[str] = Header(default=None)) -> None:
    token = os.getenv("CHRONOS_SERVICE_TOKEN")
    if not token:
        return
    expected = f"Bearer {token}"
    if authorization != expected:
        raise HTTPException(status_code=401, detail="invalid bearer token")


@lru_cache(maxsize=1)
def load_chronos_pipeline() -> Optional[Any]:
    if _env_bool("CHRONOS_DISABLE_MODEL", False):
        return None

    try:
        import torch
        from chronos import BaseChronosPipeline

        device_map = os.getenv("CHRONOS_DEVICE", "cpu")
        dtype_name = os.getenv("CHRONOS_TORCH_DTYPE", "float32")
        torch_dtype = getattr(torch, dtype_name, torch.float32)
        model_id = os.getenv("CHRONOS_MODEL_ID", DEFAULT_MODEL_ID)
        return BaseChronosPipeline.from_pretrained(
            model_id,
            device_map=device_map,
            torch_dtype=torch_dtype,
        )
    except Exception:
        if _env_bool("CHRONOS_REQUIRE_MODEL", False):
            raise
        return None


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    pipeline = load_chronos_pipeline()
    return HealthResponse(
        ok=True,
        provider="chronos",
        model=os.getenv("CHRONOS_MODEL_ID", DEFAULT_MODEL_ID),
        chronosLoaded=pipeline is not None,
        fallbackEnabled=_env_bool("CHRONOS_ENABLE_FALLBACK", True),
    )


@app.post("/forecast", response_model=ForecastResponse, dependencies=[Depends(require_token)])
def forecast(payload: ForecastRequest) -> ForecastResponse:
    prices = _clean_prices(payload.context, payload.latestPrice)
    if len(prices) < 8:
        raise HTTPException(status_code=422, detail="at least 8 valid context prices are required")

    pipeline = load_chronos_pipeline()
    if pipeline is not None:
        try:
            return _forecast_with_chronos(payload, prices, pipeline)
        except Exception as error:
            if not _env_bool("CHRONOS_ENABLE_FALLBACK", True):
                raise HTTPException(status_code=503, detail=f"chronos inference failed: {error}") from error

    if not _env_bool("CHRONOS_ENABLE_FALLBACK", True):
        raise HTTPException(status_code=503, detail="chronos model is unavailable and fallback is disabled")
    return _forecast_with_volatility_fallback(payload, prices)


def _clean_prices(context: List[ContextPoint], latest_price: float) -> np.ndarray:
    values = [point.price for point in context if math.isfinite(point.price) and point.price > 0]
    if not values or abs(values[-1] - latest_price) / latest_price > 0.01:
        values.append(latest_price)
    return np.asarray(values[-512:], dtype=np.float32)


def _prediction_length(payload: ForecastRequest) -> int:
    base_minutes = _context_interval_minutes(payload.context)
    if base_minutes is None:
        base_minutes = int(os.getenv("CHRONOS_CONTEXT_INTERVAL_MINUTES", "1"))
    base_minutes = max(1, base_minutes)
    return max(1, min(256, math.ceil(payload.horizonMinutes / base_minutes)))


def _context_interval_minutes(context: List[ContextPoint]) -> Optional[int]:
    timestamps = [_parse_timestamp(point.timestamp) for point in context[-64:]]
    valid = [item for item in timestamps if item is not None]
    if len(valid) < 3:
        return None
    intervals = [
        (valid[index].timestamp() - valid[index - 1].timestamp()) / 60
        for index in range(1, len(valid))
        if valid[index].timestamp() > valid[index - 1].timestamp()
    ]
    if not intervals:
        return None
    return max(1, int(np.median(np.asarray(intervals))))


def _parse_timestamp(value: str) -> Optional[datetime]:
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _forecast_with_chronos(payload: ForecastRequest, prices: np.ndarray, pipeline: Any) -> ForecastResponse:
    import torch

    prediction_length = _prediction_length(payload)
    quantile_levels = [0.1, 0.5, 0.9]
    context = torch.tensor(prices, dtype=torch.float32).unsqueeze(0)
    quantiles, mean = pipeline.predict_quantiles(
        context=context,
        prediction_length=prediction_length,
        quantile_levels=quantile_levels,
    )

    quantile_array = _to_numpy(quantiles)
    mean_array = _to_numpy(mean)
    low, median, high = _last_quantiles(quantile_array)
    forecast_price = _last_mean(mean_array, median)
    expected_return = (forecast_price - payload.latestPrice) / payload.latestPrice
    volatility = _recent_volatility(prices)
    up_probability = _probability_from_return(expected_return, volatility, payload.features.ruleProbability)
    confidence = _confidence_from_interval(payload.latestPrice, low, high, len(prices), model_loaded=True)

    return ForecastResponse(
        upProbability=up_probability,
        confidence=confidence,
        forecastPrice=round(forecast_price, 4),
        intervalLow=round(min(low, high), 4),
        intervalHigh=round(max(low, high), 4),
        summary=f"Chronos-Bolt 给出 {payload.horizonMinutes} 分钟方向概率 {up_probability:.0%}。",
        rationale=[
            f"模型：{os.getenv('CHRONOS_MODEL_ID', DEFAULT_MODEL_ID)}，预测步长 {prediction_length}。",
            f"预测中位/均值价格约 {median:.2f}/{forecast_price:.2f}，相对现价 {expected_return:.2%}。",
            "输出已转换为方向概率，后续仍由本地分桶回测决定是否加权。",
        ],
        risks=[
            "Chronos-Bolt 是通用时序基础模型，未必完全匹配工银积存金交易口径。",
            "模型输出只作为低权重军师，必须经过 live 分桶样本校准。",
        ],
    )


def _forecast_with_volatility_fallback(payload: ForecastRequest, prices: np.ndarray) -> ForecastResponse:
    returns = np.diff(np.log(prices))
    recent = returns[-min(len(returns), 64):]
    drift = float(np.mean(recent)) if recent.size else 0.0
    volatility = _recent_volatility(prices)
    steps = _prediction_length(payload)
    expected_return = drift * steps
    latest = payload.latestPrice
    forecast_price = latest * math.exp(expected_return)
    interval_width = max(volatility * math.sqrt(steps), 0.0015)
    interval_low = latest * math.exp(expected_return - 1.28 * interval_width)
    interval_high = latest * math.exp(expected_return + 1.28 * interval_width)
    up_probability = _probability_from_return(expected_return, interval_width, payload.features.ruleProbability)
    confidence = _confidence_from_interval(latest, interval_low, interval_high, len(prices), model_loaded=False)

    return ForecastResponse(
        upProbability=up_probability,
        confidence=confidence,
        forecastPrice=round(forecast_price, 4),
        intervalLow=round(interval_low, 4),
        intervalHigh=round(interval_high, 4),
        summary=f"Chronos 模型未加载，临时用波动率 fallback 给出方向概率 {up_probability:.0%}。",
        rationale=[
            "fallback 只用于本地联调和服务可用性验证，不代表真实 Chronos-Bolt 能力。",
            f"近端漂移 {expected_return:.2%}，区间宽度由最近波动率估计。",
        ],
        risks=[
            "当前结果不是 Chronos-Bolt 推理结果，生产环境建议确认 /health 的 chronosLoaded=true。",
            "fallback 输出不得用于放大交易信号，只能帮助主服务从 unconfigured 切换到接口联调状态。",
        ],
    )


def _to_numpy(value: Any) -> np.ndarray:
    if hasattr(value, "detach"):
        value = value.detach()
    if hasattr(value, "cpu"):
        value = value.cpu()
    if hasattr(value, "numpy"):
        return value.numpy()
    return np.asarray(value)


def _last_quantiles(value: np.ndarray) -> Tuple[float, float, float]:
    if value.ndim == 3:
        return float(value[0, -1, 0]), float(value[0, -1, 1]), float(value[0, -1, 2])
    if value.ndim == 2:
        return float(value[-1, 0]), float(value[-1, 1]), float(value[-1, 2])
    raise ValueError(f"unexpected quantile shape: {value.shape}")


def _last_mean(value: np.ndarray, fallback: float) -> float:
    if not value.size:
        return fallback
    if value.ndim >= 2:
        return float(value[0, -1])
    return float(value[-1])


def _recent_volatility(prices: np.ndarray) -> float:
    returns = np.diff(np.log(prices))
    if returns.size < 2:
        return 0.002
    return max(float(np.std(returns[-min(returns.size, 128):])), 0.0008)


def _probability_from_return(
    expected_return: float,
    volatility: float,
    rule_probability: Optional[float],
) -> float:
    scale = max(volatility * 1.5, 0.001)
    model_probability = 1 / (1 + math.exp(-expected_return / scale))
    if rule_probability is not None and math.isfinite(rule_probability):
        rule_probability = min(max(rule_probability, 0.01), 0.99)
        model_probability = model_probability * 0.8 + rule_probability * 0.2
    return round(min(max(model_probability, 0.01), 0.99), 4)


def _confidence_from_interval(
    latest_price: float,
    interval_low: float,
    interval_high: float,
    context_size: int,
    model_loaded: bool,
) -> int:
    width = abs(interval_high - interval_low) / latest_price
    width_penalty = min(35, int(width * 2000))
    context_bonus = min(12, context_size // 32)
    base = 62 if model_loaded else 42
    return int(min(max(base + context_bonus - width_penalty, 15), 82 if model_loaded else 55))

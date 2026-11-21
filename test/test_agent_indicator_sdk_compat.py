"""The upgraded Python SDK must remain usable through the Agent dispatcher."""

import numpy as np
import pandas as pd
import pytest
from openalgo import ta

from services.agent.indicators.compute import compute
from services.agent.indicators.registry import get_spec, validate_registry


@pytest.mark.parametrize("stdev_period,rsi_period", [(10, 14), (5, 8)])
def test_relative_volatility_dispatch_matches_the_sdk(stdev_period, rsi_period):
    assert validate_registry() == []
    index = np.arange(100)
    close = 100 + np.sin(index / 3) * 4 + index * 0.05
    frame = pd.DataFrame(
        {"close": close}, index=pd.date_range("2026-11-02 09:15", periods=100, freq="min")
    )
    result = compute(
        "rvi_volatility", frame, params={"stdev_period": stdev_period, "rsi_period": rsi_period}
    )
    expected = ta.rvi_volatility(frame["close"], stdev_period, rsi_period)

    assert result["outputs"] == ["rvi_volatility"]
    np.testing.assert_allclose(result["values"]["rvi_volatility"], expected.iloc[-10:])
    assert get_spec("rvi_volatility").inputs == ("close",)
    assert get_spec("rvi_volatility").warmup == 22
    assert get_spec("rvi").inputs == ("open", "high", "low", "close")
    assert get_spec("rvi").outputs == ("rvi", "signal")

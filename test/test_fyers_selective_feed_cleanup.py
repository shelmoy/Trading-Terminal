"""Selective feed ownership survives whole-frame FYERS updates; no network."""
from types import SimpleNamespace

import pytest

from broker.fyers.streaming.fyers_adapter import FyersAdapter


@pytest.mark.parametrize("removed,remaining,has_ltp", [
    ("DepthUpdate", "sf|fixture", True),
    ("SymbolUpdate", "dp|fixture", False),
    (None, None, False),
])
def test_unsubscribe_keeps_only_the_remaining_feed_owner(removed, remaining, has_ltp):
    adapter = object.__new__(FyersAdapter)
    key = "MCX:FIXTURE"
    adapter.hsm_to_symbol = {"sf|fixture": key, "dp|fixture": key}
    adapter.symbol_to_hsm = {key: "sf|fixture"}
    adapter.last_ltp = {key: 123.0}
    adapter.active_subscriptions = {key: {}}
    sent = []
    adapter.ws_client = SimpleNamespace(unsubscribe_symbols=sent.extend)
    adapter.unsubscribe_symbols([{"exchange": "MCX", "symbol": "FIXTURE"}], removed)
    assert set(adapter.hsm_to_symbol) == ({remaining} if remaining else set())
    assert (key in adapter.last_ltp) is has_ltp
    assert len(sent) == (1 if remaining else 2)

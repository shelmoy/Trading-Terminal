"""Actual history-cache function regressions without starting app/prewarmer."""
import ast
from datetime import datetime, timedelta
from pathlib import Path
import threading
from types import SimpleNamespace
from typing import Any
from unittest.mock import Mock
import math

import pytz
import pytest

ZONE = pytz.timezone("Asia/Kolkata")


def row(day, close=22550):
    return {"timestamp": int(ZONE.localize(datetime.fromisoformat(day + "T09:15:00")).timestamp()),
            "open": close, "high": close, "low": close, "close": close, "volume": 0}


def response(rows):
    return True, {"status": "success", "data": rows}, 200


@pytest.fixture
def cache():
    source = Path(__file__).resolve().parents[1] / "services/history_service.py"
    nodes = [node for node in ast.parse(source.read_text(encoding="utf-8")).body
             if isinstance(node, ast.FunctionDef) and node.name in {"get_history", "_history_result_in_range"}]
    now = 1792987200
    provider = Mock(return_value=response([row("2026-10-23")]))
    namespace = dict(
        Any=Any, datetime=datetime, timedelta=timedelta, pytz=pytz, math=math,
        time=SimpleNamespace(time=lambda: now), _history_cache={},
        _history_latest_by_sym_iv={}, _history_latest_lock=threading.Lock(),
        _inflight_locks={}, _inflight_guard=threading.Lock(),
        real_threading=SimpleNamespace(Event=threading.Event),
        _enforce_rate_limit=lambda **kw: None, get_history_with_auth=provider,
        _save_disk_history_cache=lambda: None,
        BrokerBusyError=type("BrokerBusyError", (Exception,), {}),
        logger=SimpleNamespace(info=lambda *args: None),
    )
    exec(compile(ast.Module(body=nodes, type_ignores=[]), str(source), "exec"), namespace)
    return namespace, provider, now


def request(namespace, start="2026-10-23", end="2026-10-26"):
    return namespace["get_history"]("NIFTY", "NSE_INDEX", "1m", start, end,
                                   auth_token="offline", broker="fyers")


def test_july_cache_cannot_satisfy_an_october_request(cache):
    ns, provider, now = cache
    ns["_history_latest_by_sym_iv"][("NIFTY", "NSE_INDEX", "1m")] = (
        "2026-07-28", "2026-07-29", now, response([row("2026-07-29", 24270)]))
    result = request(ns)
    provider.assert_called_once()
    assert result[1]["data"] == [row("2026-10-23")]
    assert ns["_inflight_locks"] == {}


def test_cached_window_must_cover_the_requested_end(cache):
    ns, provider, now = cache
    ns["_history_latest_by_sym_iv"][("NIFTY", "NSE_INDEX", "1m")] = (
        "2026-10-19", "2026-10-23", now, response([row("2026-10-23")]))
    request(ns)
    provider.assert_called_once()


def test_contained_request_is_sliced_instead_of_returning_the_whole_cache(cache):
    ns, provider, now = cache
    ns["_history_latest_by_sym_iv"][("NIFTY", "NSE_INDEX", "1m")] = (
        "2026-10-19", "2026-10-26", now,
        response([row("2026-10-19"), row("2026-10-23"), row("2026-10-26")]))
    result = request(ns, "2026-10-23", "2026-10-24")
    provider.assert_not_called()
    assert result[1]["data"] == [row("2026-10-23")]


def test_polluted_exact_cache_does_not_leak_older_candles(cache):
    ns, provider, _ = cache
    ns["_history_cache"][("NIFTY", "NSE_INDEX", "1m", "2026-10-23", "2026-10-26")] = response(
        [row("2026-07-29"), row("2026-10-23")])
    assert request(ns)[1]["data"] == [row("2026-10-23")]
    provider.assert_not_called()


def test_wholly_stale_exact_cache_is_a_miss_not_a_false_empty_book(cache):
    ns, provider, _ = cache
    ns["_history_cache"][("NIFTY", "NSE_INDEX", "1m", "2026-10-23", "2026-10-26")] = response(
        [row("2026-07-29")])
    assert request(ns)[1]["data"] == [row("2026-10-23")]
    provider.assert_called_once()


def test_broker_response_is_bounded_before_it_enters_cache(cache):
    ns, provider, _ = cache
    provider.return_value = response([row("2026-07-29"), row("2026-10-23"), row("2026-10-27")])
    assert request(ns)[1]["data"] == [row("2026-10-23")]
    assert ns["_history_cache"][("NIFTY", "NSE_INDEX", "1m", "2026-10-23", "2026-10-26")][1]["data"] == [row("2026-10-23")]


def test_single_day_tail_refresh_is_also_sliced(cache):
    ns, provider, now = cache
    ns["_history_latest_by_sym_iv"][("NIFTY", "NSE_INDEX", "1m")] = (
        "2026-10-19", "2026-10-26", now, response([row("2026-10-19")]))
    ns["_history_cache"][("NIFTY", "NSE_INDEX", "1m", "2026-10-23", "2026-10-23")] = response(
        [row("2026-07-29"), row("2026-10-23")])
    assert request(ns, "2026-10-23", "2026-10-23")[1]["data"] == [row("2026-10-23")]
    provider.assert_not_called()


def test_ist_day_boundaries_are_inclusive_dates_with_exclusive_next_midnight(cache):
    ns, _, _ = cache
    start = int(ZONE.localize(datetime(2026, 10, 23)).timestamp())
    rows = [{"timestamp": start-1}, {"timestamp": start},
            {"timestamp": start+86399}, {"timestamp": start+86400}, {"timestamp": "invalid"}]
    result = ns["_history_result_in_range"](response(rows), "2026-10-23", "2026-10-23")
    assert result[1]["data"] == rows[1:3]

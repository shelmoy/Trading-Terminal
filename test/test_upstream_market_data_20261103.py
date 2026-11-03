"""Offline regressions for new upstream topics and instrument mappings."""

import logging

import pytest

from broker.groww.streaming import nats_websocket as nats
from broker.groww.streaming.groww_adapter import GrowwWebSocketAdapter
from broker.groww.streaming.groww_nats import NATSProtocol
from broker.tradejini.database.master_contract_db import process_scrip_data


@pytest.mark.parametrize("exchange", ["NSE_INDEX", "BSE_INDEX"])
@pytest.mark.parametrize("batch", [False, True])
def test_index_topic_preserves_openalgo_exchange(monkeypatch, exchange, batch):
    ticks = []
    feed = nats.GrowwNATSWebSocket("fake-token", on_data=ticks.append)
    # Never connect: capture subscriptions and dispatch a fake decoded frame.
    if batch:
        keys = feed.subscribe_batch(
            [
                {
                    "exchange": exchange.removesuffix("_INDEX"),
                    "openalgo_exchange": exchange,
                    "segment": "CASH",
                    "token": "123",
                    "symbol": "TEST",
                    "type": "depth",
                    "instrumenttype": "EQ",
                }
            ]
        )
        key = keys[0]
    else:
        feed.subscribe_ltp(exchange, "CASH", "123", symbol="TEST", instrumenttype="EQ")
        key = next(iter(feed.subscriptions))
    sub = feed.subscriptions[key]
    topic = NATSProtocol().format_topic_for_groww(
        sub.get("groww_exchange", exchange), "CASH", "123", sub["mode"]
    )
    assert topic == f"/ld/indices/{exchange.removesuffix('_INDEX').lower()}/price.123"
    feed.nats_sids[key] = "7"
    monkeypatch.setattr(nats.groww_protobuf, "parse_groww_market_data", lambda _: {"ltp": 100.0})
    feed._process_market_data_msg({"subject": topic, "sid": "7", "payload": b"fake"})
    assert len(ticks) == 1 and ticks[0]["exchange"] == exchange
    assert ticks[0]["mode"] == 1 and ticks[0]["ltp"] == 100.0


@pytest.mark.parametrize("exchange", ["MCX", "NCO", "CDS", "UNKNOWN"])
def test_groww_unsupported_exchange_never_opens_transport(exchange):
    adapter = GrowwWebSocketAdapter.__new__(GrowwWebSocketAdapter)
    adapter.logger = logging.getLogger(__name__)
    result = adapter.subscribe("TEST", exchange)
    assert result["status"] == "error" and result["code"] == "EXCHANGE_NOT_SUPPORTED"


def test_tradejini_etf_uses_cash_instrument_mapping():
    rows = process_scrip_data(
        [
            {
                "id": "EQ_TESTETF_EQ_NSE",
                "dispName": "TESTETF",
                "excToken": "123",
                "lot": "1",
                "tick": "0.05",
            }
        ],
        {"name": "ETF", "idFormat": "instrument_symbol_series_exchange"},
    )
    assert len(rows) == 1
    assert rows.iloc[0]["exchange"] == "NSE" and rows.iloc[0]["instrumenttype"] == "EQ"
    assert rows.iloc[0]["symbol"] == "TESTETF" and rows.iloc[0]["token"] == "123"


def test_tradejini_index_keeps_quote_only_exchange():
    rows = process_scrip_data(
        [{"id": "EQ_TEST_NSE", "symbol": "TEST", "dispName": "Test Index", "excToken": "123"}],
        {"name": "Index"},
    )
    assert len(rows) == 1
    assert rows.iloc[0]["exchange"] == "NSE_INDEX" and rows.iloc[0]["instrumenttype"] == "EQ"

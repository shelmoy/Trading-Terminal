"""Commodity optional fields must not erase the prices in an otherwise valid batch."""

from unittest.mock import patch

import pytest

import broker.kotak.api.data as module

AUTH = "session:::sid:::https://broker.invalid:::test-token"
SYMBOL = "CRUDEOILM19NOV26FUT"


def quote(token="1", oi=""):
    return {
        "exchange": "mcx_fo",
        "exchange_token": token,
        "ltp": "9883.0000",
        "open_int": oi,
        "last_volume": "692590.0000",
        "ohlc": {"open": "9800", "high": "9900", "low": "9700", "close": "9708"},
        "depth": {
            "buy": [{"price": "9882", "quantity": "10.0000"}],
            "sell": [{"price": "9884", "quantity": "20.0000"}],
        },
    }


@pytest.fixture
def data():
    with (
        patch.object(module, "get_token", side_effect=lambda s, e: "1" if s == SYMBOL else "2"),
        patch.object(module, "get_brexchange", return_value="mcx_fo"),
    ):
        yield module.BrokerData(AUTH)


@pytest.mark.parametrize("oi,expected", [("", 0), (None, 0), ("0", 0), ("506980.0000", 506980)])
def test_blank_oi_preserves_single_and_batch_prices(data, oi, expected):
    with patch.object(data, "_make_quotes_request", return_value=[quote(oi=oi)]):
        single = data.get_quotes(SYMBOL, "MCX")
        batch = data._process_quotes_batch([{"symbol": SYMBOL, "exchange": "MCX"}])[0]["data"]
    for result in (single, batch):
        assert result["ltp"] == 9883
        assert result["prev_close"] == 9708
        assert result["oi"] == expected
        assert result["volume"] == 692590
        assert (result["bid"], result["ask"]) == (9882, 9884)


def test_one_missing_oi_does_not_drop_sibling_quotes(data):
    with patch.object(data, "_make_quotes_request", return_value=[quote(), quote("2", "1570100")]):
        result = data._process_quotes_batch(
            [
                {"symbol": SYMBOL, "exchange": "MCX"},
                {"symbol": "CRUDEOIL19NOV26FUT", "exchange": "MCX"},
            ]
        )
    assert len(result) == 2
    assert [r["data"]["ltp"] for r in result] == [9883, 9883]
    assert [r["data"]["oi"] for r in result] == [0, 1570100]


@pytest.mark.parametrize("depth", [None, {}, {"buy": [], "sell": []}])
def test_missing_depth_is_unavailable_and_never_filled_with_ltp(data, depth):
    payload = {**quote(), "depth": depth, "ohlc": None, "last_volume": ""}
    with patch.object(data, "_make_quotes_request", return_value=[payload]):
        single = data.get_quotes(SYMBOL, "MCX")
        batch = data._process_quotes_batch([{"symbol": SYMBOL, "exchange": "MCX"}])[0]["data"]
    for result in (single, batch):
        assert result["ltp"] == 9883
        assert result["bid"] == result["ask"] == 0
        assert result["oi"] == result["volume"] == result["prev_close"] == 0


def test_blank_depth_quantity_does_not_erase_commodity_price(data):
    payload = quote()
    payload["depth"]["buy"][0]["quantity"] = ""
    payload["depth"]["sell"][0]["quantity"] = None
    with patch.object(data, "_make_quotes_request", return_value=[payload]):
        result = data.get_depth(SYMBOL, "MCX")
    assert result["ltp"] == 9883
    assert result["bids"][0] == {"price": 9882, "quantity": 0}
    assert result["asks"][0] == {"price": 9884, "quantity": 0}
    assert len(result["bids"]) == len(result["asks"]) == 5


def test_unsupported_history_is_not_confused_with_trading_permission(data):
    with patch.object(
        module, "get_httpx_client", side_effect=AssertionError("No history request expected")
    ):
        with pytest.raises(
            Exception, match="Kotak does not provide historical candles for MCX"
        ) as exc:
            data.get_history(SYMBOL, "MCX", "1m", "2026-10-29", "2026-10-30")
    assert "Live quotes and supported trading remain available" in str(exc.value)

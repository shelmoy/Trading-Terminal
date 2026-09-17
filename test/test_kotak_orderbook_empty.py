import pytest

from broker.kotak.mapping.order_data import (
    calculate_order_statistics,
    map_order_data,
    map_trade_data,
    transform_order_data,
    transform_tradebook_data,
)


def test_kotak_orderbook_empty_when_data_is_none():
    raw = {"stat": "Ok", "data": None}
    mapped = map_order_data(raw)
    assert mapped == []
    assert transform_order_data(mapped) == []
    stats = calculate_order_statistics(mapped)
    assert stats == {
        "total_buy_orders": 0,
        "total_sell_orders": 0,
        "total_completed_orders": 0,
        "total_open_orders": 0,
        "total_rejected_orders": 0,
    }


def test_kotak_orderbook_empty_when_stat_not_ok():
    raw = {"stat": "Not_Ok", "emsg": "No orders found"}
    mapped = map_order_data(raw)
    assert mapped == []
    assert transform_order_data(mapped) == []


def test_transform_order_data_rejects_empty_dict():
    assert transform_order_data({}) == []
    assert transform_order_data([{}]) == []
    assert transform_order_data({"foo": "bar"}) == []


def test_transform_order_data_accepts_valid_order():
    valid = {
        "nOrdNo": "123456",
        "trdSym": "NIFTY26SEP23200CE",
        "exSeg": "NFO",
        "trnsTp": "B",
        "qty": 65,
        "prc": 177.5,
        "prcTp": "L",
        "prod": "MIS",
        "ordSt": "open",
        "ordEntTm": "09:15:30",
    }
    transformed = transform_order_data([valid])
    assert len(transformed) == 1
    assert transformed[0]["orderid"] == "123456"
    assert transformed[0]["symbol"] == "NIFTY26SEP23200CE"
    assert transformed[0]["quantity"] == 65
    assert transformed[0]["pricetype"] == "LIMIT"


def test_kotak_tradebook_empty_when_data_is_none():
    raw = {"stat": "Ok", "data": None}
    mapped = map_trade_data(raw)
    assert mapped == []
    assert transform_tradebook_data(mapped) == []

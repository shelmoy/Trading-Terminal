"""Official FYERS GTT book fixtures, isolated from credentials and transports."""

import importlib.util
import sys
from pathlib import Path
from types import ModuleType, SimpleNamespace

import pytest


@pytest.fixture
def mapper(monkeypatch):
    def stub(name, **members):
        module = ModuleType(name)
        module.__dict__.update(members)
        monkeypatch.setitem(sys.modules, name, module)

    stub("broker.fyers.mapping.order_data", get_exchange=lambda *_: "NFO")
    stub(
        "broker.fyers.mapping.transform_data",
        map_action=lambda action: 1 if action == "BUY" else -1,
        map_product_type=lambda product: product,
        reverse_map_product_type=lambda product: "NRML",
    )
    stub(
        "database.token_db",
        get_br_symbol=lambda *_: "NSE:TEST",
        get_oa_symbol=lambda **_: "TESTFUT",
    )
    stub("utils.logging", get_logger=lambda _: SimpleNamespace(warning=lambda *_: None))
    spec = importlib.util.spec_from_file_location(
        "isolated_fyers_gtt_mapping", Path(__file__).parents[1] / "broker/fyers/mapping/gtt_data.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def broker_row(**patch):
    return {
        "id": "GTT1",
        "ord_status": 6,
        "gtt_oco_ind": 2,
        "exchange": 10,
        "segment": 11,
        "symbol": "TESTFUT",
        "tran_side": -1,
        "product_type": "MARGIN",
        "price_trigger": 120,
        "price_limit": 119.5,
        "qty": 75,
        "price2_trigger": 80,
        "price2_limit": 79.5,
        "qty2": 150,
        "ltp": 100,
        **patch,
    }


def test_oco_sort_keeps_limits_and_quantities_with_their_trigger(mapper):
    row = mapper.map_gtt_book({"orderBook": [broker_row()]})[0]
    assert row["trigger_prices"] == [80, 120]
    assert [(leg["price"], leg["quantity"]) for leg in row["legs"]] == [(79.5, 150), (119.5, 75)]
    assert row["trigger_type"] == "two-leg" and row["status"] == "active"


def test_active_default_and_explicit_history_are_distinct(mapper):
    raw = {
        "orderBook": [
            broker_row(id=str(status), ord_status=status) for status in (1, 2, 3, 4, 5, 6)
        ]
    }
    assert [row["status"] for row in mapper.map_gtt_book(raw)] == ["transit", "active"]
    assert [row["status"] for row in mapper.map_gtt_book(raw, include_history=True)] == [
        "cancelled",
        "triggered",
        "unknown",
        "transit",
        "rejected",
        "active",
    ]


def test_single_leg_keeps_its_exact_trigger_limit_and_quantity(mapper):
    row = mapper.map_gtt_book({"orderBook": [broker_row(gtt_oco_ind=1, price_trigger=80)]})[0]
    assert row["trigger_prices"] == [80] and len(row["legs"]) == 1
    assert row["legs"][0]["price"] == 119.5 and row["legs"][0]["quantity"] == 75


def test_native_oco_request_keeps_high_and_low_roles_for_short_exit(mapper):
    # For a short position, the high leg is the stop and the low leg the target.
    data = {
        "quantity": 75,
        "trigger_type": "OCO",
        "triggerprice_sl": 80,
        "stoploss": 80.5,
        "triggerprice_tg": 120,
        "target": 120.5,
    }
    assert mapper.build_order_info(data) == {
        "leg1": {"price": 120.5, "triggerPrice": 120.0, "qty": 75},
        "leg2": {"price": 80.5, "triggerPrice": 80.0, "qty": 75},
    }


@pytest.fixture
def margins(monkeypatch):
    def stub(name, **members):
        module = ModuleType(name)
        module.__dict__.update(members)
        monkeypatch.setitem(sys.modules, name, module)

    stub(
        "broker.fyers.mapping.transform_data",
        map_action=lambda _: 1,
        map_order_type=lambda _: 1,
        map_product_type=lambda _: "CNC",
    )
    stub(
        "broker.kotak.mapping.transform_data",
        map_product_type=lambda _: "CNC",
        map_order_type=lambda _: "L",
        map_action=lambda _: "B",
        reverse_map_exchange=lambda _: "NSE",
    )
    stub("database.token_db", get_br_symbol=lambda *_: "NSE:TEST", get_token=lambda *_: "1")
    log = SimpleNamespace(
        **{method: lambda *_: None for method in ("info", "warning", "error", "debug")}
    )
    stub("utils.logging", get_logger=lambda _: log)

    def load(broker):
        spec = importlib.util.spec_from_file_location(
            "isolated_" + broker + "_margin",
            Path(__file__).parents[1] / f"broker/{broker}/mapping/margin_data.py",
        )
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    return load("fyers"), load("kotak")


def test_fyers_margin_does_not_compare_portfolio_total_to_order_cash(margins):
    fyers, _ = margins
    data = fyers.parse_margin_response(
        {"s": "ok", "data": {"margin_new_order": 9000, "margin_total": 100, "margin_avail": 1000}}
    )["data"]
    assert data["total_margin_required"] == 9000
    assert data["order_margin_required"] == 100 and data["available_margin"] == 1000


def test_missing_margin_is_unavailable_instead_of_zero(margins):
    fyers, kotak = margins
    assert (
        fyers.parse_margin_response({"s": "ok", "data": {}})["data"]["order_margin_required"]
        is None
    )
    assert (
        kotak.parse_margin_response({"stat": "Ok", "reqdMrgn": "100"})["data"]["available_margin"]
        is None
    )
    data = kotak.parse_margin_response({"stat": "Ok", "reqdMrgn": "100", "avlMrgn": "1000"})["data"]
    assert data["order_margin_required"] == 100 and data["available_margin"] == 1000


@pytest.fixture
def order_mappers(monkeypatch):
    def stub(name, **members):
        module = ModuleType(name)
        module.__dict__.update(members)
        monkeypatch.setitem(sys.modules, name, module)

    stub("database.token_db", get_symbol=lambda *_: "FIXTURE", get_oa_symbol=lambda *_: "FIXTURE")
    stub("broker.kotak.mapping.transform_data", map_exchange=lambda value: value)
    log = SimpleNamespace(
        **{method: lambda *_: None for method in ("info", "warning", "error", "debug")}
    )
    stub("utils.logging", get_logger=lambda _: log)

    def load(broker):
        spec = importlib.util.spec_from_file_location(
            "isolated_" + broker + "_orders",
            Path(__file__).parents[1] / f"broker/{broker}/mapping/order_data.py",
        )
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    return load("fyers"), load("kotak")


def test_real_broker_fill_fields_reach_executable_version_guards(order_mappers):
    from utils.chart_commands import normalize_books

    fyers, kotak = order_mappers
    fyers_row = {
        "symbol": "FIXTURE",
        "exchange": "NFO",
        "side": 1,
        "qty": 75,
        "filledQty": 0,
        "type": 1,
        "limitPrice": 100,
        "productType": "MARGIN",
        "status": 6,
        "id": "B1",
    }
    kotak_row = {
        "trdSym": "FIXTURE",
        "exSeg": "NFO",
        "trnsTp": "BUY",
        "qty": "75",
        "fldQty": "0",
        "prcTp": "L",
        "prc": "100",
        "prod": "NRML",
        "ordSt": "open",
        "nOrdNo": "B2",
    }
    for mapper, row, fill_key in ((fyers, fyers_row, "filledQty"), (kotak, kotak_row, "fldQty")):
        before = normalize_books(mapper.transform_order_data([dict(row)]), [])["orders"][0]
        after = normalize_books(mapper.transform_order_data([{**row, fill_key: 25}]), [])["orders"][
            0
        ]
        assert after["filled_quantity"] == 25 and after["order_status"] == "partially filled"
        assert before["version"] != after["version"]

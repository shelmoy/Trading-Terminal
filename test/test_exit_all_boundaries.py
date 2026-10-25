"""Exit-all broker and UI boundaries; no app imports, broker writes or databases."""
import ast
import copy
import sys
from pathlib import Path
from types import ModuleType, SimpleNamespace
from typing import Any
from unittest.mock import Mock

import pytest

ROOT = Path(__file__).resolve().parents[1]
LOG = SimpleNamespace(**{key: lambda *args: None for key in ("debug", "error", "warning", "exception")})


def functions(path, names, **namespace):
    tree = ast.parse((ROOT / path).read_text(encoding="utf-8"))
    selected = [node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name in names]
    assert len(selected) == len(names)
    for node in selected:
        node.decorator_list = []
    namespace.update(logger=LOG)
    exec(compile(ast.Module(body=selected, type_ignores=[]), str(path), "exec"), namespace)
    return SimpleNamespace(**namespace)


@pytest.mark.parametrize("body", [
    {"status": "error", "message": "RMS rejected exit"},
    {"s": "error", "message": "FYERS rejected exit"},
    {"stat": "Not_Ok", "message": "Kotak rejected exit"},
    {"status": "success", "failed_positions": [{"symbol": "SAMPLE"}], "message": "Partial exit"},
    {"status": "success", "failed_closures": 1, "message": "Partial exit"},
])
def test_service_rejects_http_200_failure_and_retains_details(body):
    events = []
    module = functions("services/close_position_service.py", {"close_position_with_auth"},
        copy=copy, Any=Any, API_TYPE="closeposition", get_analyze_mode=lambda: False,
        BrokerBusyError=type("BrokerBusyError", (Exception,), {}),
        import_broker_module=lambda _: SimpleNamespace(close_all_positions=lambda *_: (body, 200)),
        bus=SimpleNamespace(publish=events.append), PositionClosedEvent=lambda **kw: kw)
    ok, result, status = module.close_position_with_auth({}, "offline", "fyers", {})
    assert not ok and status == 400 and result["message"] == body["message"]
    for key in ("failed_positions", "failed_closures"):
        if key in body:
            assert result[key] == body[key]
    assert events[0]["response_data"]["status"] == "error"


def test_service_says_accepted_not_filled():
    module = functions("services/close_position_service.py", {"close_position_with_auth"},
        copy=copy, Any=Any, API_TYPE="closeposition", get_analyze_mode=lambda: False,
        BrokerBusyError=type("BrokerBusyError", (Exception,), {}),
        import_broker_module=lambda _: SimpleNamespace(close_all_positions=lambda *_: ({"accepted_orders": ["1"]}, 200)),
        bus=SimpleNamespace(publish=lambda *_: None), PositionClosedEvent=lambda **kw: kw)
    ok, result, status = module.close_position_with_auth({}, "offline", "kotak", {})
    assert ok and status == 200 and result["accepted_orders"] == ["1"]
    assert "accepted" in result["message"] and "Squared Off" not in result["message"]


@pytest.mark.parametrize("broker,raw,order_id", [
    ("fyers", {"s": "ok", "orderBook": [{"id": "1", "status": 6}]}, "1"),
    ("kotak", {"stat": "Ok", "data": [{"nOrdNo": "1", "ordSt": "open"}]}, "1"),
])
def test_bulk_cancellation_detects_body_rejection_in_http_200(broker, raw, order_id):
    cancel = Mock(return_value=({"status": "error", "message": "Cannot cancel"}, 200))
    module = functions(f"broker/{broker}/api/order_api.py", {"cancel_all_orders_api"},
                       get_order_book=lambda _: raw, cancel_order=cancel)
    assert module.cancel_all_orders_api({}, "offline") == ([], [order_id])
    cancel.assert_called_once()


@pytest.mark.parametrize("broker,raw", [
    ("fyers", {"s": "error", "message": "Expired token"}),
    ("fyers", {"s": "ok"}),
    ("kotak", {"stat": "Not_Ok", "data": None, "emsg": "Expired token"}),
    ("kotak", {"stat": "Ok", "data": None}),
])
def test_failed_orderbook_never_becomes_no_orders(broker, raw):
    cancel = Mock()
    module = functions(f"broker/{broker}/api/order_api.py", {"cancel_all_orders_api"},
                       get_order_book=lambda _: raw, cancel_order=cancel)
    with pytest.raises(RuntimeError):
        module.cancel_all_orders_api({}, "offline")
    cancel.assert_not_called()


def test_kotak_documented_no_data_is_still_an_empty_book():
    raw = {"stat": "Not_Ok", "stCode": 5203, "errMsg": "No Data"}
    module = functions("broker/kotak/api/order_api.py", {"cancel_all_orders_api"},
                       get_order_book=lambda _: raw)
    assert module.cancel_all_orders_api({}, "offline") == ([], [])


def kotak_close(reply):
    positions = [
        {"flBuyQty": 10, "flSellQty": 0, "tok": "1", "exSeg": "nse_fo", "prod": "MIS"},
        {"flBuyQty": 0, "flSellQty": 20, "tok": "2", "exSeg": "nse_fo", "prod": "MIS"},
    ]
    place = Mock(side_effect=reply)
    invalidate = Mock()
    module = functions("broker/kotak/api/order_api.py", {"close_all_positions"},
        get_positions=lambda _: {"stat": "Ok", "data": positions},
        read_position_book=lambda _broker, fetch, _ok: fetch(), _position_book_ok=lambda _: True,
        map_exchange=lambda _: "NFO", get_symbol=lambda token, _: f"SYM{token}",
        reverse_map_product_type=lambda product: product, place_order_api=place,
        _invalidate_position_cache=invalidate)
    return module, place, invalidate, positions


def test_kotak_close_reports_partial_exit_and_keeps_other_leg_sizing():
    module, place, invalidate, source = kotak_close([
        (SimpleNamespace(status=200), {"stat": "Ok"}, "EXIT1"),
        (SimpleNamespace(status=200), {"stat": "Not_Ok", "emsg": "RMS rejected"}, None),
    ])
    result, status = module.close_all_positions("offline", "token")
    assert status == 400 and result["accepted_orders"] == ["EXIT1"]
    assert result["failed_positions"][0]["message"] == "RMS rejected"
    assert [(call.args[0]["action"], call.args[0]["quantity"]) for call in place.call_args_list] == [
        ("SELL", "10"), ("BUY", "20")]
    assert all(call.args[0]["exchange"] == "NFO" for call in place.call_args_list)
    assert source[0]["exSeg"] == "nse_fo"
    assert invalidate.call_count == 2


def test_kotak_does_not_retry_an_uncertain_exit():
    module, place, _, _ = kotak_close([
        TimeoutError("Timeout"), (SimpleNamespace(status=200), {"stat": "Ok"}, "EXIT2"),
    ])
    result, status = module.close_all_positions("offline", "token")
    assert status == 400 and len(result["failed_positions"]) == 1
    assert place.call_count == 2  # Exactly once per different position, never resend.


@pytest.mark.parametrize("order_id", [None, "", False, 0])
def test_kotak_missing_exit_id_is_not_acceptance(order_id):
    module, _, _, _ = kotak_close([
        (SimpleNamespace(status=200), {"stat": "Ok"}, order_id),
        (SimpleNamespace(status=200), {"stat": "Ok"}, "EXIT2"),
    ])
    result, status = module.close_all_positions("offline", "token")
    assert status == 400 and len(result["failed_positions"]) == 1


def route(monkeypatch, name, service_name, service_function, service_result):
    auth = ModuleType("database.auth_db")
    auth.get_api_key_for_tradingview = lambda _: "offline"
    settings = ModuleType("database.settings_db")
    settings.get_analyze_mode = lambda: True
    service = ModuleType(service_name)
    setattr(service, service_function, lambda **_: service_result)
    for module in (auth, settings, service):
        monkeypatch.setitem(sys.modules, module.__name__, module)
    return functions("blueprints/orders.py", {name},
        session={"user": "offline", "broker": "fyers"}, get_auth_token=lambda _: "token",
        jsonify=lambda body: body)


@pytest.mark.parametrize("canceled", [[], ["GOOD"]])
def test_route_preserves_total_and_partial_cancellation_failure(monkeypatch, canceled):
    body = {"status": "success", "canceled_orders": canceled, "failed_cancellations": ["BAD"]}
    module = route(monkeypatch, "cancel_all_orders_ui", "services.cancel_all_order_service",
                   "cancel_all_orders", (True, body, 200))
    response, status = module.cancel_all_orders_ui()
    assert response["status"] == "error" and status == 400
    assert response["failed_cancellations"] == ["BAD"]


def test_route_retains_sandbox_failed_closures(monkeypatch):
    body = {"status": "success", "failed_closures": 1, "mode": "analyze"}
    module = route(monkeypatch, "close_all_positions", "services.close_position_service",
                   "close_position", (True, body, 200))
    assert module.close_all_positions() == (body, 200)


@pytest.mark.parametrize("canceled", [[], ["GOOD"]])
def test_route_keeps_analyze_mode_for_cancellation_confirmation(monkeypatch, canceled):
    body = {"status": "success", "mode": "analyze",
            "canceled_orders": canceled, "failed_cancellations": []}
    module = route(monkeypatch, "cancel_all_orders_ui", "services.cancel_all_order_service",
                   "cancel_all_orders", (True, body, 200))
    response, status = module.cancel_all_orders_ui()
    assert status == 200 and response["mode"] == "analyze"

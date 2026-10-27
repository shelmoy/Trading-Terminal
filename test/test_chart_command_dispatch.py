"""Isolated broker-transport fixtures. No application DB, credentials or orders."""

import sys
from types import ModuleType, SimpleNamespace
from unittest.mock import Mock

import pytest

from services import chart_command_service as service
from utils.chart_commands import CommandRefused, version


@pytest.fixture
def transport(monkeypatch):
    order = {
        "symbol": "S",
        "exchange": "NFO",
        "product": "NRML",
        "orderid": "B1",
        "action": "BUY",
        "quantity": 75,
        "filled_quantity": 0,
        "price": 100,
        "trigger_price": 0,
        "pricetype": "LIMIT",
        "order_status": "open",
    }
    order["version"] = version(order)
    position = {
        "symbol": "S",
        "exchange": "NFO",
        "product": "NRML",
        "quantity": 75,
        "average_price": 100,
    }
    position["version"] = version(position)
    books = {"orders": [order], "positions": [position]}
    monkeypatch.setattr(service, "read_books", lambda _: books)
    placed = Mock(return_value=(True, {"status": "success", "orderid": "B2"}, 200))
    modified = Mock(return_value=(True, {"status": "success", "orderid": "B1"}, 200))
    cancelled = Mock(return_value=(True, {"status": "success", "orderid": "B1"}, 200))
    quote = Mock(return_value=(True, {"status": "success", "data": {"ltp": 101}}, 200))
    margin = Mock(
        return_value=(
            True,
            {"status": "success", "data": {"order_margin_required": 100, "available_margin": 1000}},
            200,
        )
    )
    gtts = Mock(return_value=(True, {"status": "success", "data": []}, 200))

    def module(name, **values):
        value = ModuleType(name)
        value.__dict__.update(values)
        monkeypatch.setitem(sys.modules, name, value)

    module(
        "database.token_db_enhanced",
        get_symbol_info=lambda *_: SimpleNamespace(lotsize=75, tick_size=0.05),
    )
    module("database.qty_freeze_db", get_freeze_qty_for_option=lambda *_: 150)
    module("services.place_order_service", place_order=placed)
    module("services.modify_order_service", modify_order=modified)
    module("services.cancel_order_service", cancel_order=cancelled)
    module("services.quotes_service", get_quotes=quote)
    module("services.margin_service", calculate_margin=margin)
    module("services.gtt_orderbook_service", get_gtt_orderbook=gtts)

    def send(operation="place", payload=None, expected=None, broker="fyers"):
        return service.dispatch(
            {
                "operation": operation,
                "payload": payload or order,
                "expectedVersion": expected or order["version"],
            },
            api_key="mock-api-key-never-transmitted",
            broker=broker,
        )

    return SimpleNamespace(
        order=order,
        position=position,
        books=books,
        placed=placed,
        modified=modified,
        cancelled=cancelled,
        quote=quote,
        margin=margin,
        gtts=gtts,
        send=send,
    )


def test_modify_uses_confirmed_book_identity_and_quantity(transport):
    transport.send("modify", {**transport.order, "price": 102, "action": "SELL", "quantity": 150})
    sent = transport.modified.call_args.kwargs["order_data"]
    assert sent["action"] == "BUY" and sent["quantity"] == 75 and sent["price"] == 102
    assert "version" not in sent


@pytest.mark.parametrize(
    "patch",
    [{"order_status": "complete"}, {"filled_quantity": 1}, {"product": "MIS"}, {"exchange": "BFO"}],
)
def test_fill_or_identity_change_refuses_modify(transport, patch):
    payload = dict(transport.order)
    transport.order.update(patch)
    transport.order["version"] = version(transport.order)
    with pytest.raises(CommandRefused):
        transport.send("modify", payload, expected=payload["version"])
    transport.modified.assert_not_called()


def test_cancel_is_scoped_and_does_not_require_a_price_quote(transport):
    transport.send("cancel")
    transport.cancelled.assert_called_once_with(
        orderid="B1", api_key="mock-api-key-never-transmitted"
    )
    transport.quote.assert_not_called()
    transport.placed.assert_not_called()


def test_quote_failure_prevents_mutation(transport):
    transport.quote.return_value = (False, {"status": "error"}, 503)
    with pytest.raises(CommandRefused, match="Fresh broker quote"):
        transport.send()
    transport.placed.assert_not_called()


def test_slow_quote_is_not_treated_as_fresh(transport, monkeypatch):
    times = iter([10, 15.01])
    monkeypatch.setattr(service.time, "monotonic", lambda: next(times))
    with pytest.raises(CommandRefused, match="Fresh broker quote"):
        transport.send()
    transport.placed.assert_not_called()


def test_freeze_limit_prevents_transport_call(transport):
    with pytest.raises(CommandRefused, match="freeze"):
        transport.send(payload={**transport.order, "quantity": 225})
    transport.placed.assert_not_called()


def test_stop_on_wrong_side_of_quote_is_refused(transport):
    with pytest.raises(CommandRefused, match="wrong side"):
        transport.send(payload={**transport.order, "pricetype": "SL-M", "trigger_price": 100})
    transport.placed.assert_not_called()


def test_close_never_cancels_unassociated_orders(transport):
    with pytest.raises(CommandRefused, match="Review working orders"):
        transport.send("close", transport.position, transport.position["version"])
    transport.cancelled.assert_not_called()
    transport.placed.assert_not_called()


def test_close_uses_actual_position_and_cannot_increase_quantity(transport):
    transport.books["orders"] = []
    transport.send(
        "close",
        {**transport.position, "quantity": 150, "action": "BUY"},
        transport.position["version"],
    )
    sent = transport.placed.call_args.kwargs["order_data"]
    assert sent["quantity"] == 75 and sent["action"] == "SELL" and sent["pricetype"] == "MARKET"


def test_partial_exit_uses_confirmed_position_side_and_never_exceeds_it(transport):
    transport.books["orders"] = []
    transport.position["quantity"] = -150
    transport.position["version"] = version(transport.position)
    transport.send(
        "reduce",
        {**transport.position, "quantity": 75, "action": "SELL"},
        transport.position["version"],
    )
    sent = transport.placed.call_args.kwargs["order_data"]
    assert sent["quantity"] == 75 and sent["action"] == "BUY" and sent["pricetype"] == "MARKET"
    assert sent["price"] == 0 and sent["trigger_price"] == 0
    with pytest.raises(CommandRefused, match="exceeds"):
        transport.send(
            "reduce", {**transport.position, "quantity": 225}, transport.position["version"]
        )
    assert transport.placed.call_count == 1


@pytest.mark.parametrize("broker,product", [("kotak", "NRML"), ("fyers", "MIS"), ("fyers", "NRML")])
def test_unverified_protection_is_refused_not_emulated(transport, broker, product):
    transport.position["product"] = product
    transport.position["version"] = version(transport.position)
    with pytest.raises(CommandRefused):
        transport.send("protect", transport.position, transport.position["version"], broker)
    transport.placed.assert_not_called()
    transport.cancelled.assert_not_called()


@pytest.mark.parametrize(
    "data",
    [
        {},
        {"order_margin_required": None, "available_margin": 1000},
        {"order_margin_required": 2000, "available_margin": 1000},
        {"order_margin_required": float("nan"), "available_margin": 1000},
        {"total_margin_required": 0},
    ],
)
def test_missing_or_insufficient_margin_cannot_reach_order_transport(transport, data):
    transport.margin.return_value = (True, {"status": "success", "data": data}, 200)
    with pytest.raises(CommandRefused):
        transport.send()
    transport.placed.assert_not_called()


def test_sandbox_margin_is_validated_by_its_own_execution_service(transport):
    from utils.chart_execution_context import chart_execution_mode

    with chart_execution_mode(True):
        transport.send()
    transport.margin.assert_not_called()
    transport.placed.assert_called_once()


def test_fill_during_quote_preflight_refuses_modify(transport):
    def quote(**_):
        transport.order["filled_quantity"] = 1
        transport.order["version"] = version(transport.order)
        return True, {"status": "success", "data": {"ltp": 101}}, 200

    original = transport.order["version"]
    transport.quote.side_effect = quote
    with pytest.raises(CommandRefused, match="during preflight"):
        transport.send("modify", {**transport.order, "price": 102}, expected=original)
    transport.modified.assert_not_called()


def test_close_does_not_require_extra_margin_but_checks_actual_size_again(transport):
    transport.books["orders"] = []

    def quote(**_):
        transport.position["quantity"] = 150
        transport.position["version"] = version(transport.position)
        return True, {"status": "success", "data": {"ltp": 101}}, 200

    original = transport.position["version"]
    transport.quote.side_effect = quote
    with pytest.raises(CommandRefused, match="during preflight"):
        transport.send("close", dict(transport.position), expected=original)
    transport.margin.assert_not_called()
    transport.placed.assert_not_called()


def test_close_preserves_unknown_native_gtt_exits(transport):
    transport.books["orders"] = []
    transport.gtts.return_value = (
        True,
        {
            "status": "success",
            "data": [
                {
                    "symbol": "S",
                    "exchange": "NFO",
                    "status": "active",
                    "trigger_id": "EXTERNAL-GTT",
                    "legs": [{"product": "NRML"}],
                }
            ],
        },
        200,
    )
    with pytest.raises(CommandRefused, match="GTT exits"):
        transport.send("close", transport.position, transport.position["version"])
    transport.cancelled.assert_not_called()
    transport.placed.assert_not_called()


def test_unknown_regular_order_status_cannot_be_ignored_by_close(transport):
    transport.order["order_status"] = "unknown"
    with pytest.raises(CommandRefused, match="Review working orders"):
        transport.send("close", transport.position, transport.position["version"])
    transport.placed.assert_not_called()


def test_missing_fill_count_or_zero_remaining_cannot_be_modified(transport):
    for filled in (None, 75):
        transport.order["filled_quantity"] = filled
        transport.order["version"] = version(transport.order)
        with pytest.raises(CommandRefused):
            transport.send("modify")
    transport.modified.assert_not_called()

"""Disposable SQLite and mocked transports only; never sends broker orders."""

import copy
import json
import sys
import time
import uuid
from types import ModuleType, SimpleNamespace
from unittest.mock import Mock

import pytest

from services.chart_command_service import execute
from services.chart_protection_service import (
    dispatch_protection,
    guard_exit,
    resolve_protection_delivery,
    resolve_trigger_child,
    states,
)
from test import test_chart_command_dispatch as dispatch_fixtures
from test import test_chart_commands as command_fixtures
from utils.chart_commands import CommandRefused, version
from utils.chart_protection import exit_contract, native_book, protection_state

INFO = SimpleNamespace(lotsize=75, tick_size=0.05)
transport = dispatch_fixtures.transport
ledger = command_fixtures.ledger


@pytest.mark.parametrize("quantity", [75, -75])
@pytest.mark.parametrize("roles", ["stop", "target", "both"])
def test_oco_pairs_short_and_long_limits_without_swapping_semantics(quantity, roles):
    pos = {"symbol": "S", "exchange": "NFO", "product": "NRML", "quantity": quantity}
    stop, target = (90, 110) if quantity > 0 else (110, 90)
    values = {
        "stopTrigger": stop,
        "stopLimit": stop - 0.05 if quantity > 0 else stop + 0.05,
        "targetTrigger": target,
        "targetLimit": target - 0.05 if quantity > 0 else target + 0.05,
    }
    if roles != "both":
        values = {k: v for k, v in values.items() if k.startswith(roles)}
    contract, semantic = exit_contract(pos, values, 100, INFO)
    assert contract["action"] == ("SELL" if quantity > 0 else "BUY")
    if roles == "both":
        assert contract["triggerprice_sl"] == 90 and contract["triggerprice_tg"] == 110
        assert semantic["stop"]["trigger"] == stop
    else:
        assert contract["trigger_type"] == "SINGLE"


@pytest.mark.parametrize(
    "values",
    [
        {},
        {"stopTrigger": 90},
        {"stopTrigger": 110, "stopLimit": 109},
        {"targetTrigger": 95, "targetLimit": 95},
        {"stopTrigger": 90.01, "stopLimit": 90},
        {"stopTrigger": float("nan"), "stopLimit": 90},
        {"stopTrigger": 90, "stopLimit": 91},
    ],
)
def test_invalid_side_tick_or_incomplete_leg_is_refused(values):
    with pytest.raises(CommandRefused):
        exit_contract(
            {"symbol": "S", "exchange": "NFO", "product": "NRML", "quantity": 75}, values, 100, INFO
        )


@pytest.fixture
def native(transport, ledger, monkeypatch):
    transport.books["orders"] = []
    placed = Mock(return_value=(True, {"status": "success", "trigger_id": "G1"}, 200))
    modified = Mock(return_value=(True, {"status": "success", "trigger_id": "G1"}, 200))
    cancelled = Mock(return_value=(True, {"status": "success", "trigger_id": "G1"}, 200))
    for name, func, value in (
        ("place", "place_gtt_order", placed),
        ("modify", "modify_gtt_order", modified),
        ("cancel", "cancel_gtt_order", cancelled),
    ):
        module = ModuleType(f"services.{name}_gtt_order_service")
        setattr(module, func, value)
        monkeypatch.setitem(sys.modules, module.__name__, module)

    def command(op="protect", **patch):
        return {
            "commandId": str(uuid.uuid4()),
            "issuedAt": time.time(),
            "mode": "live",
            "scope": "session",
            "operation": op,
            "expectedVersion": transport.position["version"],
            "payload": {
                "symbol": "S",
                "exchange": "NFO",
                "product": "NRML",
                "stopTrigger": 90,
                "stopLimit": 90,
                **patch,
            },
        }

    def send(cmd=None, broker="fyers"):
        return execute(
            cmd or command(),
            scope="account",
            mode="live",
            ledger=ledger,
            dispatch=lambda cmd: dispatch_protection(
                cmd, api_key="mock", broker=broker, ledger=ledger, scope="account"
            ),
        )

    def confirm(status="active", quantity=75):
        row = {
            "trigger_id": "G1",
            "symbol": "S",
            "exchange": "NFO",
            "trigger_type": "single",
            "status": status,
            "trigger_prices": [90],
            "legs": [
                {
                    "product": "NRML",
                    "action": "SELL",
                    "quantity": quantity,
                    "price": 90,
                    "pricetype": "LIMIT",
                }
            ],
        }
        transport.gtts.return_value = True, {"status": "success", "data": [row]}, 200
        return states(ledger, "account", transport.books, native_book([row]))[0]

    return SimpleNamespace(
        send=send,
        command=command,
        confirm=confirm,
        placed=placed,
        modified=modified,
        cancelled=cancelled,
        t=transport,
        ledger=ledger,
    )


def test_successful_receipt_and_exact_id_binding_are_atomic_and_persist(native):
    cmd = native.command()
    body, code = native.send(cmd)
    assert code == 200 and body["state"] == "accepted" and "_binding" not in body
    assert native.ledger.bindings("account")[0]["brokerId"] == "G1"
    assert native.ledger.bindings("other-account") == []
    assert native.send(cmd)[0] == body
    native.placed.assert_called_once()
    state = native.confirm()
    assert state["state"] == "active" and not state["review"]
    assert native.ledger.pending("account") == []


def test_unknown_delivery_keeps_claim_and_does_not_invent_association(native):
    native.placed.side_effect = TimeoutError()
    cmd = native.command()
    assert native.send(cmd)[0]["state"] == "uncertain"
    assert native.send(cmd)[0]["state"] == "uncertain"
    native.placed.assert_called_once()
    assert native.ledger.bindings("account") == []
    assert native.send()[1] == 409


def test_cancel_flat_position_uses_only_bound_exit_and_waits_for_book(native):
    native.send()
    state = native.confirm()
    native.t.position["quantity"] = 0
    native.t.position["version"] = version(native.t.position)
    cmd = native.command(
        "cancelProtection", protectionId="G1", protectionVersion=state["nativeVersion"]
    )
    assert native.send(cmd)[0]["state"] == "accepted"
    native.cancelled.assert_called_once_with(trigger_id="G1", api_key="mock")
    assert native.ledger.pending("account")
    native.confirm("cancelled")
    assert not native.ledger.bindings("account") and not native.ledger.pending("account")


def test_triggered_is_never_mistaken_for_filled_or_auto_cancelled(native):
    native.send()
    state = native.confirm("triggered")
    assert "child order" in state["review"] and native.ledger.bindings("account")
    cmd = native.command(
        "cancelProtection", protectionId="G1", protectionVersion=state["nativeVersion"]
    )
    assert native.send(cmd)[0]["state"] == "rejected"
    native.cancelled.assert_not_called()
    native.t.placed.assert_not_called()


def test_position_resize_requires_explicit_fresh_version(native):
    native.send()
    state = native.confirm()
    cmd = native.command(
        "modifyProtection",
        protectionId="G1",
        protectionVersion=state["nativeVersion"],
        stopTrigger=91,
        stopLimit=91,
    )
    native.t.position["quantity"] = 150
    native.t.position["version"] = version(native.t.position)
    assert native.send(cmd)[1] == 409
    assert "quantity" in native.confirm()["review"]
    cmd["commandId"] = str(uuid.uuid4())
    cmd["expectedVersion"] = native.t.position["version"]
    assert native.send(cmd)[1] == 200
    assert native.modified.call_args.kwargs["order_data"]["quantity"] == 150


def test_position_flip_blocks_modify_but_allows_cancellation(native):
    native.send()
    state = native.confirm()
    native.t.position["quantity"] = -75
    native.t.position["version"] = version(native.t.position)
    cmd = native.command(
        "modifyProtection", protectionId="G1", protectionVersion=state["nativeVersion"]
    )
    assert native.send(cmd)[1] == 409
    native.modified.assert_not_called()
    cmd = native.command(
        "cancelProtection", protectionId="G1", protectionVersion=state["nativeVersion"]
    )
    assert native.send(cmd)[1] == 200


@pytest.mark.parametrize(
    "patch",
    [
        {"mode": "analyze"},
        {
            "payload": {
                "symbol": "S",
                "exchange": "NFO",
                "product": "MIS",
                "stopTrigger": 90,
                "stopLimit": 90,
            }
        },
    ],
)
def test_native_fyers_never_uses_local_analyze_or_mis_trigger_engine(native, patch):
    cmd = native.command()
    cmd.update(patch)
    assert native.send(cmd)[0]["state"] == "rejected"
    native.placed.assert_not_called()


def test_kotak_individual_exit_and_no_fake_oco(native):
    assert native.send(broker="kotak")[1] == 200
    native.t.placed.assert_called_once()
    data = native.t.placed.call_args.kwargs["order_data"]
    assert data["pricetype"] == "SL" and data["action"] == "SELL"
    binding = native.ledger.bindings("account")[0]
    assert binding["kind"] == "regular" and binding["brokerId"] == "B2"


def test_kotak_oco_never_dispatches_two_independent_exits(native):
    cmd = native.command(targetTrigger=110, targetLimit=110)
    assert native.send(cmd, broker="kotak")[1] == 409
    native.t.placed.assert_not_called()
    native.placed.assert_not_called()


def test_rejection_restores_confirmed_binding(native):
    native.send()
    state = native.confirm()
    original = copy.deepcopy(native.ledger.bindings("account"))
    native.modified.return_value = False, {"status": "error", "message": "Rejected"}, 400
    cmd = native.command(
        "modifyProtection",
        protectionId="G1",
        protectionVersion=state["nativeVersion"],
        stopTrigger=91,
        stopLimit=91,
    )
    assert native.send(cmd)[0]["state"] == "rejected"
    assert native.ledger.bindings("account") == original


def test_wrong_cancel_id_is_uncertain_and_cannot_rebind_another_exit(native):
    native.send()
    state = native.confirm()
    native.cancelled.return_value = True, {"status": "success", "trigger_id": "UNRELATED"}, 200
    cmd = native.command(
        "cancelProtection", protectionId="G1", protectionVersion=state["nativeVersion"]
    )
    assert native.send(cmd)[0]["state"] == "uncertain"
    assert native.ledger.bindings("account")[0]["brokerId"] == "G1"
    assert (
        json.loads(native.ledger.read("account", cmd["commandId"])["intent"])["payload"][
            "protectionId"
        ]
        == "G1"
    )


def test_foreign_binding_identity_and_malformed_book_refused(native):
    native.send()
    state = native.confirm()
    row = copy.deepcopy(state["native"])
    row["symbol"] = "OTHER"
    with pytest.raises(CommandRefused, match="unexpected"):
        protection_state(
            native.ledger.bindings("account")[0], native.t.books["positions"], [], [row]
        )
    row["legs"][0]["quantity"] = None
    with pytest.raises(CommandRefused):
        native_book([row])


def test_uncertain_protection_resolves_only_explicit_native_id_and_fresh_version(native):
    native.placed.side_effect = TimeoutError()
    cmd = native.command()
    native.send(cmd)
    assert (
        json.loads(native.ledger.read("account", cmd["commandId"])["intent"])[
            "_preparedProtection"
        ]["positionQuantity"]
        == 75
    )
    row = {
        "trigger_id": "SELECTED-GTT",
        "symbol": "S",
        "exchange": "NFO",
        "trigger_type": "single",
        "status": "active",
        "trigger_prices": [90],
        "legs": [{"action": "SELL", "product": "NRML", "quantity": 75, "price": 90}],
    }
    triggers = native_book([row])
    args = {
        "ledger": native.ledger,
        "scope": "account",
        "command_id": cmd["commandId"],
        "broker_id": "SELECTED-GTT",
        "expected_version": triggers[0]["version"],
        "books": native.t.books,
        "triggers": triggers,
    }
    with pytest.raises(CommandRefused):
        resolve_protection_delivery(**{**args, "expected_version": "old"})
    result = resolve_protection_delivery(**args)
    assert result["state"] == "resolved"
    assert native.ledger.bindings("account")[0]["brokerId"] == "SELECTED-GTT"
    assert not native.ledger.pending("account")
    assert native.send(cmd)[0] == result
    native.placed.assert_called_once()


def test_uncertain_resolution_does_not_match_a_nearby_exit_price(native):
    native.placed.side_effect = TimeoutError()
    cmd = native.command()
    native.send(cmd)
    row = {
        "trigger_id": "WRONG-GTT",
        "symbol": "S",
        "exchange": "NFO",
        "trigger_type": "single",
        "status": "active",
        "trigger_prices": [90.05],
        "legs": [{"action": "SELL", "product": "NRML", "quantity": 75, "price": 90.05}],
    }
    triggers = native_book([row])
    with pytest.raises(CommandRefused, match="not confirmed"):
        resolve_protection_delivery(
            ledger=native.ledger,
            scope="account",
            command_id=cmd["commandId"],
            broker_id="WRONG-GTT",
            expected_version=triggers[0]["version"],
            books=native.t.books,
            triggers=triggers,
        )
    assert not native.ledger.bindings("account") and native.ledger.pending("account")


def test_explicit_child_link_keeps_trigger_tombstone_after_child_fill(native):
    native.send()
    state = native.confirm("triggered")
    child = {
        **native.t.order,
        "orderid": "CHILD",
        "action": "SELL",
        "price": 90,
        "order_status": "open",
    }
    child["version"] = version(child)
    native.t.books["orders"] = [child]
    triggers = native_book(native.t.gtts.return_value[1]["data"])
    args = {
        "ledger": native.ledger,
        "scope": "account",
        "trigger_id": "G1",
        "child_id": "CHILD",
        "trigger_version": state["nativeVersion"],
        "child_version": child["version"],
        "books": native.t.books,
        "triggers": triggers,
    }
    with pytest.raises(CommandRefused):
        resolve_trigger_child(**{**args, "child_version": "old"})
    assert resolve_trigger_child(**args)["status"] == "success"
    bound = native.ledger.bindings("account")[0]
    assert (
        bound["parentTriggerId"] == "G1"
        and bound["brokerId"] == "CHILD"
        and set(bound["roles"]) == {"exit"}
    )
    child["order_status"] = "complete"
    child["filled_quantity"] = 75
    child["version"] = version(child)
    assert states(native.ledger, "account", native.t.books, triggers)[0]["state"] == "complete"
    assert native.ledger.bindings(
        "account"
    )  # preserve explicit child association while parent remains in native history
    native.t.books["orders"] = []  # daily broker order book rolled over
    assert states(native.ledger, "account", native.t.books, triggers)[0]["state"] == "complete"
    assert native.ledger.bindings("account")[0]["confirmedTerminal"] == "complete"
    states(native.ledger, "account", native.t.books, [])
    assert not native.ledger.bindings("account")
    native.cancelled.assert_not_called()
    native.t.placed.assert_not_called()


@pytest.mark.parametrize(
    "patch", [{"exchange": "BFO"}, {"product": "MIS"}, {"action": "BUY"}, {"quantity": 150}]
)
def test_child_link_never_crosses_identity_direction_or_quantity(native, patch):
    native.send()
    state = native.confirm("triggered")
    child = {**native.t.order, "orderid": "CHILD", "action": "SELL", **patch}
    child["version"] = version(child)
    native.t.books["orders"] = [child]
    with pytest.raises(CommandRefused):
        resolve_trigger_child(
            ledger=native.ledger,
            scope="account",
            trigger_id="G1",
            child_id="CHILD",
            trigger_version=state["nativeVersion"],
            child_version=child["version"],
            books=native.t.books,
            triggers=native_book(native.t.gtts.return_value[1]["data"]),
        )
    assert native.ledger.bindings("account")[0]["brokerId"] == "G1"


def test_exit_all_refuses_unknown_external_trigger_before_any_close(native, monkeypatch):
    import database.chart_commands_db as database
    import utils.config as config
    from utils.chart_commands import execution_scopes

    auth = ModuleType("database.auth_db")
    auth.get_auth_token_broker = lambda _: ("token", "fyers")
    auth.get_username_by_apikey = lambda _: "user"
    monkeypatch.setitem(sys.modules, "database.auth_db", auth)
    monkeypatch.setattr(database, "ledger", lambda: native.ledger)
    monkeypatch.setattr(config, "get_broker_api_key", lambda: "app")
    native.send()
    native.confirm("triggered")
    with pytest.raises(CommandRefused, match="GTT exits"):
        guard_exit("mock", "fyers")
    native.cancelled.assert_not_called()
    native.t.placed.assert_not_called()
    account, _ = execution_scopes("user", "fyers", "app", "token", "live")
    assert not native.ledger.bindings(account)


def test_bound_command_not_pruned_while_native_exit_can_still_trigger(native):
    from sqlalchemy import update

    from database.chart_commands_db import commands

    cmd = native.command()
    native.send(cmd)
    native.confirm()
    with native.ledger.engine.begin() as conn:
        conn.execute(update(commands).values(created_at=time.time() - 40 * 86400))
    # Another resource causes pruning, but the active native binding retains its receipt.
    fresh = native.command(symbol="OTHER")
    native.send(fresh)
    assert native.ledger.read("account", cmd["commandId"]) is not None


def test_display_uses_confirmed_native_levels_while_modification_pending(native):
    native.send()
    state = native.confirm()
    cmd = native.command(
        "modifyProtection",
        protectionId="G1",
        protectionVersion=state["nativeVersion"],
        stopTrigger=91,
        stopLimit=91,
    )
    native.send(cmd)
    state = native.confirm()
    assert state["roles"]["stop"]["trigger"] == 91
    assert state["confirmedRoles"]["stop"]["trigger"] == 90
    assert native.ledger.pending("account")


@pytest.mark.parametrize(
    "broker,mode,exchange,product,eligible",
    [
        ("fyers", "live", "NSE", "CNC", True),
        ("fyers", "live", "BFO", "NRML", True),
        ("fyers", "live", "MCX", "NRML", False),
        ("fyers", "live", "CDS", "NRML", False),
        ("fyers", "live", "NFO", "MIS", False),
        ("fyers", "analyze", "NFO", "NRML", False),
        ("kotak", "live", "NFO", "NRML", False),
    ],
)
def test_native_eligibility_does_not_infer_support_from_regular_order_matrix(
    broker, mode, exchange, product, eligible
):
    from utils.chart_commands import native_protection_eligible

    assert native_protection_eligible(broker, mode, exchange, product) is eligible


def test_kotak_analyze_does_not_create_a_local_protection_engine(native):
    cmd = native.command()
    cmd["mode"] = "analyze"
    result = dispatch_protection
    with pytest.raises(CommandRefused, match="Live mode"):
        result(cmd, api_key="mock", broker="kotak", ledger=native.ledger, scope="account")
    native.t.placed.assert_not_called()


def test_repeated_protection_lifecycle_releases_connections_bindings_and_claims(native):
    from sqlalchemy import event

    active = 0

    def checkout(*_):
        nonlocal active
        active += 1

    def checkin(*_):
        nonlocal active
        active -= 1

    event.listen(native.ledger.engine, "checkout", checkout)
    event.listen(native.ledger.engine, "checkin", checkin)
    try:
        for _ in range(40):
            assert native.send()[1] == 200
            state = native.confirm()
            cancel = native.command(
                "cancelProtection", protectionId="G1", protectionVersion=state["nativeVersion"]
            )
            assert native.send(cancel)[1] == 200
            native.confirm("cancelled")
            assert not native.ledger.bindings("account") and not native.ledger.pending("account")
            assert active == 0
    finally:
        event.remove(native.ledger.engine, "checkout", checkout)
        event.remove(native.ledger.engine, "checkin", checkin)


def test_colliding_broker_id_never_overwrites_another_instruments_binding(native):
    native.send()
    native.confirm()
    original = copy.deepcopy(native.ledger.bindings("account"))
    native.t.position["symbol"] = "OTHER"
    native.t.position["version"] = version(native.t.position)
    cmd = native.command(symbol="OTHER")
    body, status = native.send(cmd)
    assert status == 202 and body["state"] == "uncertain"
    assert native.ledger.bindings("account") == original
    assert native.ledger.read("account", cmd["commandId"])["state"] == "uncertain"


def test_cancelling_selected_child_keeps_its_parent_trigger_resolution(native):
    native.send()
    state = native.confirm("triggered")
    child = {**native.t.order, "orderid": "CHILD", "action": "SELL", "price": 90}
    child["version"] = version(child)
    native.t.books["orders"] = [child]
    triggers = native_book(native.t.gtts.return_value[1]["data"])
    resolve_trigger_child(
        ledger=native.ledger,
        scope="account",
        trigger_id="G1",
        child_id="CHILD",
        trigger_version=state["nativeVersion"],
        child_version=child["version"],
        books=native.t.books,
        triggers=triggers,
    )
    selected = states(native.ledger, "account", native.t.books, triggers)[0]
    native.t.cancelled.return_value = True, {"status": "success", "orderid": "CHILD"}, 200
    cmd = native.command(
        "cancelProtection", protectionId="CHILD", protectionVersion=selected["nativeVersion"]
    )
    assert native.send(cmd)[1] == 200
    assert native.ledger.bindings("account")[0]["parentTriggerId"] == "G1"
    child["order_status"] = "cancelled"
    child["version"] = version(child)
    states(native.ledger, "account", native.t.books, triggers)
    assert native.ledger.bindings("account")[0]["parentTriggerId"] == "G1"
    assert not native.ledger.pending("account")

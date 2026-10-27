"""Explicit broker-held position exits. Every mutation uses existing services.

Only IDs returned for a chart command are bound. Triggered FYERS exits are
intentionally unresolved: the native trigger book has no reliable child-order
link. There is no price watcher, local OCO, retry loop, or automatic cancellation.
"""

import json
import time

from utils.chart_commands import (
    WORKING,
    CommandRefused,
    broker_identifier,
    native_protection_eligible,
    validate_broker_capability,
)
from utils.chart_protection import TERMINAL, exit_contract, native_book, protection_state


def read_triggers(api_key):
    from services.gtt_orderbook_service import get_gtt_orderbook

    ok, body, _ = get_gtt_orderbook(api_key=api_key, status="all")
    if not ok or not isinstance(body, dict) or body.get("status") != "success":
        raise CommandRefused("Native broker exits unavailable; action was not sent")
    return native_book(body.get("data"))


def states(ledger, scope, books, triggers):
    result = [
        protection_state(binding, books["positions"], books["orders"], triggers)
        for binding in ledger.bindings(scope)
    ]
    ledger.reconcile_protections(scope, result, [row["trigger_id"] for row in triggers])
    return result


def relevant(row, identity):
    return all(row.get(k) == identity[k] for k in identity)


def guard_exit(api_key, broker, identity=None, *, check_orders=True):
    """Shared close/Exit All guard; read-only, never cancels unrelated exits."""
    from database.auth_db import get_auth_token_broker, get_username_by_apikey
    from database.chart_commands_db import ledger
    from services.chart_command_service import read_books
    from utils.chart_commands import execution_scopes
    from utils.chart_execution_context import chart_execution_mode
    from utils.config import get_broker_api_key

    if not api_key:
        raise CommandRefused("Account key is required to verify broker-held exits")
    token, actual_broker = get_auth_token_broker(api_key)
    if actual_broker != broker or not token:
        raise CommandRefused("Broker account changed; exit was not sent")
    scope, _ = execution_scopes(
        get_username_by_apikey(api_key), broker, get_broker_api_key(), token, "live"
    )
    if not ledger().ready():
        raise CommandRefused("Protection journal unavailable; exit was not sent")
    with chart_execution_mode(False):
        books = read_books(api_key)
        triggers = read_triggers(api_key) if broker == "fyers" else []
    ledger().reconcile(scope, books["orders"], books["positions"])
    bound = states(ledger(), scope, books, triggers)
    resolved_parents = {
        row["parentTriggerId"]
        for row in bound
        if row.get("parentTriggerId") and (row["state"] in TERMINAL or row["state"] == "complete")
    }
    if any(
        (not identity or relevant(row["identity"], identity))
        and row["state"] not in TERMINAL
        and row["state"] != "complete"
        for row in bound
    ):
        raise CommandRefused(
            "Cancel and confirm associated broker exits before closing; triggered exits need child-order reconciliation"
        )
    if any(not identity or relevant(row, identity) for row in ledger().pending(scope)):
        raise CommandRefused("Resolve pending chart requests before exiting positions")
    if any(
        (
            not identity
            or (
                row["symbol"] == identity["symbol"]
                and row["exchange"] == identity["exchange"]
                and any(leg["product"] == identity["product"] for leg in row["legs"])
            )
        )
        and row["status"] not in TERMINAL
        and row["trigger_id"] not in resolved_parents
        for row in triggers
    ):
        raise CommandRefused(
            "Review broker-held GTT exits before exiting positions; no trigger was cancelled"
        )
    if check_orders and any(
        (not identity or relevant(row, identity))
        and row["order_status"] not in ("complete", "cancelled", "rejected", "expired")
        for row in books["orders"]
    ):
        raise CommandRefused("Confirm working-order cancellations before exiting positions")


def dispatch_protection(command, *, api_key, broker, ledger, scope):
    from database.qty_freeze_db import get_freeze_qty_for_option
    from database.token_db_enhanced import get_symbol_info
    from services.chart_command_service import margin_preflight, read_books
    from services.quotes_service import get_quotes

    op, data = command["operation"], command["payload"]
    identity = {k: data.get(k) for k in ("symbol", "exchange", "product")}
    validate_broker_capability(broker, identity)
    if not ledger or not scope:
        raise CommandRefused("Durable protection ledger is required")
    # Analyze protection would use a local price engine. Never represent it as
    # broker-held protection, for either broker.
    if command.get("mode") != "live":
        raise CommandRefused(
            "Broker-held position protection requires Live mode; no local trigger is used"
        )
    if broker == "fyers" and not native_protection_eligible(
        broker, command["mode"], identity["exchange"], identity["product"]
    ):
        raise CommandRefused(
            "FYERS native protection is verified for equity/F&O CNC/NRML only; other products/exchanges remain disabled"
        )
    books = read_books(api_key)
    triggers = read_triggers(api_key) if broker == "fyers" else []
    all_states = states(ledger, scope, books, triggers)
    resolved_parents = {
        r["parentTriggerId"]
        for r in all_states
        if r.get("parentTriggerId") and (r["state"] in TERMINAL or r["state"] == "complete")
    }
    bound = [
        r
        for r in all_states
        if r["identity"] == identity and r["state"] not in TERMINAL and r["state"] != "complete"
    ]
    binding = next((r for r in bound if r["brokerId"] == data.get("protectionId")), None)
    if op != "protect":
        if not binding or binding["nativeVersion"] != data.get("protectionVersion"):
            raise CommandRefused("Bound exit changed; refresh before managing protection")
        native = binding["native"]
        working = {"active"} if binding["kind"] == "gtt" else WORKING
        if binding["state"] not in working:
            raise CommandRefused(
                "Exit is triggered, terminal, or unconfirmed; reconcile it in broker books"
            )
        if op == "cancelProtection":
            ledger.prepare_protection(
                scope,
                command["commandId"],
                {
                    k: binding[k]
                    for k in (
                        "identity",
                        "kind",
                        "roles",
                        "positionQuantity",
                        "positionVersion",
                        "brokerId",
                        "parentTriggerId",
                    )
                    if k in binding
                },
            )
            if binding["kind"] == "gtt":
                from services.cancel_gtt_order_service import cancel_gtt_order

                result = cancel_gtt_order(trigger_id=binding["brokerId"], api_key=api_key)
            else:
                from services.cancel_order_service import cancel_order

                result = cancel_order(orderid=binding["brokerId"], api_key=api_key)
            return _with_binding(result, binding, binding["brokerId"])
        if binding["kind"] == "regular" and native.get("filled_quantity") is None:
            raise CommandRefused("Exit filled quantity is unavailable; modification was not sent")
        if binding["kind"] == "regular" and native.get("filled_quantity", 0):
            raise CommandRefused(
                "Exit partially filled; cancel and reconcile the remainder before resizing"
            )
    elif bound:
        raise CommandRefused(
            "This product position already has an associated exit; edit or cancel that exit"
        )
    if len(ledger.bindings(scope)) >= 128 and op == "protect":
        raise CommandRefused("Protection binding limit reached; review existing broker exits")
    position = next(
        (r for r in books["positions"] if relevant(r, identity) and r["quantity"]), None
    )
    if not position or position["version"] != command.get("expectedVersion"):
        raise CommandRefused("Position changed; refresh before attaching or resizing exits")
    if binding and position["quantity"] * binding["positionQuantity"] <= 0:
        raise CommandRefused(
            "Position direction changed; cancel the old exit before attaching new protection"
        )
    # Never silently associate a broker-website order/trigger or stack another
    # independent exit beside it. Preserve unrelated instruments/products.
    if any(
        relevant(r, identity)
        and r["order_status"] not in ("complete", "cancelled", "rejected", "expired")
        and (not binding or binding["kind"] != "regular" or r["orderid"] != binding["brokerId"])
        for r in books["orders"]
    ):
        raise CommandRefused("Review existing working orders before attaching protection")
    if any(
        r["symbol"] == identity["symbol"]
        and r["exchange"] == identity["exchange"]
        and any(leg["product"] == identity["product"] for leg in r["legs"])
        and r["status"] not in TERMINAL
        and r["trigger_id"] not in resolved_parents
        and (not binding or r["trigger_id"] != binding["brokerId"])
        for r in triggers
    ):
        raise CommandRefused(
            "Review existing broker GTTs; they are not automatically linked or cancelled"
        )
    started = time.monotonic()
    ok, quote, _ = get_quotes(
        symbol=identity["symbol"], exchange=identity["exchange"], api_key=api_key
    )
    mark = float((quote.get("data") or {}).get("ltp") or 0)
    if not ok or not 0 < mark < float("inf") or time.monotonic() - started > 5:
        raise CommandRefused("Fresh real-instrument quote unavailable; exit was not sent")
    contract, roles = exit_contract(
        position,
        data,
        mark,
        get_symbol_info(identity["symbol"], identity["exchange"]),
        get_freeze_qty_for_option(identity["symbol"], identity["exchange"]),
    )
    if broker == "kotak" and len(roles) != 1:
        raise CommandRefused(
            "Kotak supports one individual exit here; linked brackets/OCO are unavailable"
        )
    if binding and set(roles) != set(binding["roles"]):
        raise CommandRefused(
            "Native exit type cannot change; cancel before choosing different legs"
        )
    for role, leg in roles.items():
        margin_preflight(
            {
                **identity,
                "strategy": "Chart Trading",
                "action": contract["action"],
                "quantity": contract["quantity"],
                "pricetype": "SL" if role == "stop" else "LIMIT",
                "price": leg["limit"],
                "trigger_price": leg["trigger"] if role == "stop" else 0,
            },
            api_key,
        )
    final = read_books(api_key)
    current = next((r for r in final["positions"] if relevant(r, identity)), None)
    if (
        not current
        or current["version"] != position["version"]
        or {r["orderid"]: r["version"] for r in final["orders"] if relevant(r, identity)}
        != {r["orderid"]: r["version"] for r in books["orders"] if relevant(r, identity)}
    ):
        raise CommandRefused("Broker position/orders changed during exit preflight")
    if broker == "fyers" and {r["trigger_id"]: r["version"] for r in read_triggers(api_key)} != {
        r["trigger_id"]: r["version"] for r in triggers
    }:
        raise CommandRefused(
            "Native exits changed during preflight; refresh before managing protection"
        )
    if time.monotonic() - started > 5:
        raise CommandRefused("Quote expired during protection preflight; action was not sent")
    prepared = {
        "identity": identity,
        "kind": "gtt" if broker == "fyers" else "regular",
        "roles": roles,
        "positionQuantity": position["quantity"],
        "positionVersion": position["version"],
    }
    if binding:
        prepared["brokerId"] = binding["brokerId"]
    ledger.prepare_protection(scope, command["commandId"], prepared)
    if broker == "fyers":
        if binding:
            from services.modify_gtt_order_service import modify_gtt_order

            contract["trigger_id"] = binding["brokerId"]
            result = modify_gtt_order(order_data=contract, api_key=api_key)
        else:
            from services.place_gtt_order_service import place_gtt_order

            result = place_gtt_order(order_data=contract, api_key=api_key)
    else:
        role, leg = next(iter(roles.items()))
        regular = {
            **identity,
            "strategy": "Chart Trading",
            "quantity": contract["quantity"],
            "action": contract["action"],
            "pricetype": "SL" if role == "stop" else "LIMIT",
            "price": leg["limit"],
            "trigger_price": leg["trigger"] if role == "stop" else 0,
        }
        if binding:
            from services.modify_order_service import modify_order

            regular["orderid"] = binding["brokerId"]
            result = modify_order(order_data=regular, api_key=api_key)
        else:
            from services.place_order_service import place_order

            result = place_order(order_data=regular, api_key=api_key)
    return _with_binding(result, prepared, binding["brokerId"] if binding else None)


def _with_binding(result, binding, expected_id=None):
    ok, body, status = result
    body = dict(body)
    identifier = broker_identifier(body.get("trigger_id") or body.get("orderid"))
    if ok and expected_id and identifier != expected_id:
        raise RuntimeError("Broker returned a different exit ID; delivery requires reconciliation")
    if ok and body.get("status") == "success" and 200 <= status < 300 and identifier:
        # Only this returned ID is associated. No match-by-price fallback.
        body["_binding"] = {
            k: binding[k]
            for k in ("identity", "kind", "roles", "positionQuantity", "positionVersion")
        }
        body["_binding"]["brokerId"] = identifier
        if binding.get("parentTriggerId"):
            body["_binding"]["parentTriggerId"] = binding["parentTriggerId"]
    return ok, body, status


def resolve_protection_delivery(
    *, ledger, scope, command_id, broker_id, expected_version, books, triggers
):
    old = ledger.read(scope, command_id)
    if not old or old["state"] != "uncertain":
        raise CommandRefused("Only a completed uncertain protection request can be reconciled")
    intent = json.loads(old["intent"])
    prepared = intent.get("_preparedProtection")
    if not prepared:
        raise CommandRefused(
            "Authoritative protection preflight is unavailable; no association was guessed"
        )
    identifier = broker_identifier(broker_id)
    if not identifier or (prepared.get("brokerId") and identifier != prepared["brokerId"]):
        raise CommandRefused("Select the exact original broker exit ID")
    binding = {**prepared, "brokerId": identifier}
    state = protection_state(binding, books["positions"], books["orders"], triggers)
    if not state["native"] or state["nativeVersion"] != expected_version:
        raise CommandRefused("Selected broker exit changed; refresh before reconciling")
    native = state["native"]
    side = "SELL" if prepared["positionQuantity"] > 0 else "BUY"
    if prepared["kind"] == "gtt":
        legs = native["legs"]
    else:
        legs = [native]
    if any(
        leg["action"] != side or int(leg["quantity"]) != abs(prepared["positionQuantity"])
        for leg in legs
    ):
        raise CommandRefused("Selected broker exit has a different side or quantity")
    if intent["operation"] == "cancelProtection":
        if state["state"] not in TERMINAL:
            raise CommandRefused("Exit cancellation is not confirmed by the broker")
    elif state["confirmedRoles"] != prepared["roles"]:
        raise CommandRefused("Requested exit levels are not confirmed in the selected broker row")
    result = {
        "status": "info",
        "state": "resolved",
        "commandId": command_id,
        "orderId": identifier,
        "brokerState": state["state"],
        "resolvedAt": time.time(),
        "resolutionSource": "user_selected_broker_id",
        "message": "Linked to the explicitly selected broker exit; no request was resent.",
    }
    if not ledger.resolve(scope, command_id, old["fingerprint"], result, binding=binding):
        raise CommandRefused("Request state changed; refresh before reconciling")
    return result


def resolve_trigger_child(
    *, ledger, scope, trigger_id, child_id, trigger_version, child_version, books, triggers
):
    binding = next(
        (r for r in ledger.bindings(scope) if r["brokerId"] == trigger_id and r["kind"] == "gtt"),
        None,
    )
    if not binding:
        raise CommandRefused("Native trigger binding unavailable")
    state = protection_state(binding, books["positions"], books["orders"], triggers)
    if state["state"] != "triggered" or state["nativeVersion"] != trigger_version:
        raise CommandRefused("Trigger changed or has not fired; refresh broker books")
    child = next((r for r in books["orders"] if r["orderid"] == broker_identifier(child_id)), None)
    if not child or child["version"] != child_version or not relevant(child, binding["identity"]):
        raise CommandRefused(
            "Selected child order changed or belongs to another instrument/product"
        )
    if child["action"] != ("SELL" if binding["positionQuantity"] > 0 else "BUY") or child[
        "quantity"
    ] != abs(binding["positionQuantity"]):
        raise CommandRefused("Selected child has a different exit side or quantity")
    # Human explicitly supplies the broker child ID. Do not choose a role by
    # matching its price; once triggered it is a regular exit, not an OCO pair.
    replacement = {
        **binding,
        "kind": "regular",
        "brokerId": child["orderid"],
        "parentTriggerId": trigger_id,
        "roles": {
            "exit": {
                "trigger": float(child.get("trigger_price") or child["price"]),
                "limit": float(child["price"]),
            }
        },
    }
    if not ledger.rebind_protection(scope, binding, replacement):
        raise CommandRefused(
            "Exit changed or has a pending request; refresh before linking its child"
        )
    return {
        "status": "success",
        "message": "Selected child ID linked locally; no broker order was sent.",
    }

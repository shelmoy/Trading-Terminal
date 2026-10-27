"""Internal chart execution adapter. Existing services remain the only broker pipe."""

import json
import time
from decimal import Decimal, InvalidOperation

from utils.chart_commands import (
    WORKING,
    CommandRefused,
    broker_identifier,
    command_fingerprint,
    normalize_books,
    validate_broker_capability,
    validate_envelope,
    validate_order,
    worker_owner,
)


def margin_preflight(data, api_key):
    from utils.chart_execution_context import chart_analyze_mode

    # Sandbox's own RMS validates its funds; never compare it with live funds.
    if chart_analyze_mode() is True:
        return
    from services.margin_service import calculate_margin

    ok, response, _ = calculate_margin({"positions": [data]}, api_key=api_key)
    if not ok or response.get("status") != "success":
        raise CommandRefused("Broker margin estimate unavailable; action was not sent")
    try:
        values = response.get("data") or {}
        required = Decimal(str(values["order_margin_required"]))
        available = Decimal(str(values["available_margin"]))
        if not required.is_finite() or not available.is_finite() or min(required, available) < 0:
            raise ValueError()
    except (KeyError, InvalidOperation, ValueError, TypeError):
        raise CommandRefused("Broker did not return a usable order margin estimate") from None
    if required > available:
        raise CommandRefused("Broker estimates insufficient available margin for this order")


def recorded(row):
    if row.get("result"):
        return json.loads(row["result"]), row["http_status"]
    return {
        "status": "info",
        "state": "uncertain",
        "commandId": row["command_id"],
        "message": "Delivery is being reconciled; do not submit this action again.",
    }, 202


def resolve_delivery(*, ledger, scope, command_id, broker_order_id, expected_version, books):
    """Link a human-selected broker ID after a fresh read; do not infer by price.

    A still-submitting request cannot be resolved: its original handler could
    still complete. An absent ID is not proof of non-delivery and never unlocks
    a retry. This path changes local journal state only.
    """
    old = ledger.read(scope, command_id)
    if not old or old["state"] != "uncertain":
        raise CommandRefused("Only a completed uncertain request can be reconciled")
    identifier = broker_identifier(broker_order_id)
    row = next((row for row in books["orders"] if str(row.get("orderid")) == identifier), None)
    intent = json.loads(old["intent"])
    data = intent.get("_preparedOrder") or intent.get("payload", {})
    operation = intent.get("operation")
    if operation not in ("place", "modify", "cancel", "close", "reduce"):
        raise CommandRefused("This request needs its native broker protection book")
    if (
        not row
        or row.get("version") != expected_version
        or not all(row.get(key) == data.get(key) for key in ("symbol", "exchange", "product"))
    ):
        raise CommandRefused(
            "Selected broker order changed or belongs to another instrument/product"
        )
    if operation in ("modify", "cancel") and str(data.get("orderid")) != identifier:
        raise CommandRefused("Select the exact original broker order ID")
    if operation in ("place", "close", "reduce"):
        action = (
            data.get("action")
            if operation in ("place", "reduce") or intent.get("_preparedOrder")
            else ("SELL" if float(data.get("quantity", 0)) > 0 else "BUY")
        )
        if row.get("action") != action or float(row.get("quantity", 0)) != abs(
            float(data.get("quantity", 0))
        ):
            raise CommandRefused("Selected broker order has a different side or quantity")
    if (
        operation == "modify"
        and row.get("order_status") in WORKING
        and any(
            float(row.get(key) or 0) != float(data[key] or 0)
            for key in ("price", "trigger_price")
            if key in data
        )
    ):
        raise CommandRefused("The requested modification is not confirmed in the broker book")
    if operation == "cancel" and row.get("order_status") in WORKING:
        raise CommandRefused("Cancellation is not confirmed in the broker book")
    result = {
        "status": "info",
        "state": "resolved",
        "commandId": command_id,
        "orderId": identifier,
        "brokerState": row.get("order_status", "unknown"),
        "resolvedAt": time.time(),
        "resolutionSource": "user_selected_broker_id",
        "message": "Linked to the selected broker order for reconciliation; no order was resent.",
    }
    if not ledger.resolve(scope, command_id, old["fingerprint"], result):
        raise CommandRefused("Request state changed; refresh before reconciling")
    return result


def execute(command, *, scope, mode, ledger, dispatch, now=None):
    """Claim before dispatch and keep uncertain claims across crashes/restarts."""
    now = time.time() if now is None else now
    try:
        fingerprint = command_fingerprint(command)
        old = ledger.read(scope, command.get("commandId", ""))
        if old:
            if old["fingerprint"] != fingerprint:
                raise CommandRefused("Command ID was reused with different order details")
            return recorded(old)
        validate_envelope(command, now)
        if command["mode"] != mode:
            raise CommandRefused("Execution mode changed; refresh before trading")
        if not ledger.claim(
            scope,
            command["commandId"],
            fingerprint,
            now,
            intent={**command, "_worker": worker_owner()},
        ):
            duplicate = ledger.read(scope, command["commandId"])
            if duplicate:
                return recorded(duplicate)
            raise CommandRefused(
                "Previous broker request is pending confirmation or the unresolved-request limit is reached"
            )
    except (CommandRefused, ValueError, TypeError, AttributeError) as error:
        return {"status": "error", "state": "rejected", "message": str(error)}, 409
    try:
        success, result, status = dispatch(command)
        uncertain = status >= 500
        identifier = broker_identifier(result.get("orderid") or result.get("trigger_id"))
        accepted = (
            success
            and 200 <= status < 300
            and result.get("status") == "success"
            and bool(identifier)
        )
        if success and not accepted:
            uncertain = True
        body = {
            "status": "success" if accepted else "info" if uncertain else "error",
            "state": "accepted" if accepted else "uncertain" if uncertain else "rejected",
            "commandId": command["commandId"],
            "mode": mode,
            "message": (
                "Broker accepted the request; awaiting book confirmation."
                if accepted
                else "Broker result is uncertain; check books before another action."
                if uncertain
                else str(result.get("message") or "Broker refused the request")[:300]
            ),
        }
        if identifier:
            body["orderId"] = str(identifier)
        if accepted and result.get("_binding"):
            body["_binding"] = result["_binding"]
        status = 200 if accepted else 202 if uncertain else status
    except CommandRefused as error:
        body = {
            "status": "error",
            "state": "rejected",
            "message": str(error),
            "commandId": command["commandId"],
            "mode": mode,
        }
        status = 409
    except Exception:
        # A timeout/exception is never proof that the broker did not receive it.
        body = {
            "status": "info",
            "state": "uncertain",
            "commandId": command["commandId"],
            "mode": mode,
            "message": "Delivery uncertain; reconcile broker books before another action.",
        }
        status = 202
    try:
        ledger.finish(scope, command["commandId"], body, status)
    except Exception:
        # The broker write already happened. An association/receipt failure is
        # never a broker rejection and never permission to resend. This second
        # attempt writes only local uncertain status, without a new binding.
        body = {
            "status": "info",
            "state": "uncertain",
            "commandId": command["commandId"],
            "mode": mode,
            "message": "Broker delivery needs review: the local receipt/association could not be confirmed. No request will be resent.",
        }
        status = 202
        ledger.finish(scope, command["commandId"], body, status)
    return body, status


def read_books(api_key, scope=None):
    from services.orderbook_service import get_orderbook
    from services.positionbook_service import get_positionbook

    ok, book, _ = get_orderbook(api_key=api_key)
    if not ok or not isinstance(book, dict) or book.get("status") != "success":
        raise CommandRefused("Broker orders unavailable; action was not sent")
    ok, positions, _ = get_positionbook(api_key=api_key)
    if not ok or not isinstance(positions, dict) or positions.get("status") != "success":
        raise CommandRefused("Broker positions unavailable; action was not sent")
    data = normalize_books(book.get("data"), positions.get("data"))
    if scope:
        from database.chart_commands_db import ledger

        ledger().reconcile(scope, data["orders"], data["positions"])
    return data


def dispatch(command, *, api_key, broker, ledger=None, scope=None):
    from database.qty_freeze_db import get_freeze_qty_for_option
    from database.token_db_enhanced import get_symbol_info
    from services.cancel_order_service import cancel_order
    from services.modify_order_service import modify_order
    from services.place_order_service import place_order
    from services.quotes_service import get_quotes

    data = dict(command["payload"])
    operation = command["operation"]
    if operation in ("protect", "modifyProtection", "cancelProtection"):
        from services.chart_protection_service import dispatch_protection

        return dispatch_protection(
            command, api_key=api_key, broker=broker, ledger=ledger, scope=scope
        )
    symbol, exchange, product = (data.get(k) for k in ("symbol", "exchange", "product"))
    if not all(isinstance(x, str) and x for x in (symbol, exchange, product)):
        raise CommandRefused("Instrument and product are required")
    books = read_books(api_key)
    resolved_parents = set()
    if ledger and scope:
        from services.chart_protection_service import read_triggers, states

        bindings = ledger.bindings(scope)
        triggers = read_triggers(api_key) if broker == "fyers" and bindings else []
        projected = states(ledger, scope, books, triggers)
        resolved_parents = {
            r["parentTriggerId"]
            for r in projected
            if r.get("parentTriggerId")
            and r["state"] in ("complete", "cancelled", "rejected", "expired")
        }
        bound = [
            r
            for r in projected
            if r["state"] not in ("complete", "cancelled", "rejected", "expired")
            if all(r["identity"].get(k) == data.get(k) for k in ("symbol", "exchange", "product"))
        ]
        if operation in ("close", "reduce") and bound:
            raise CommandRefused(
                "Cancel and confirm the associated broker-held exits before closing this position"
            )
        if operation == "place" and any(
            data.get("action") == ("SELL" if r["positionQuantity"] > 0 else "BUY") for r in bound
        ):
            raise CommandRefused(
                "Cancel and confirm associated exits before reducing or reversing this product position"
            )
        if operation in ("modify", "cancel") and any(
            r["kind"] == "regular" and r["brokerId"] == data.get("orderid") for r in bound
        ):
            raise CommandRefused("Use the associated SL/TP control to manage this position exit")
    if operation in ("modify", "cancel"):
        row = next(
            (
                r
                for r in books["orders"]
                if r.get("orderid") == data.get("orderid")
                and all(r.get(k) == data.get(k) for k in ("symbol", "exchange", "product"))
            ),
            None,
        )
        if (
            not row
            or row.get("order_status") not in WORKING
            or row["version"] != command.get("expectedVersion")
        ):
            raise CommandRefused("Order changed or filled; refresh its confirmed state")
        if operation == "cancel":
            if ledger and scope:
                ledger.prepare_order(
                    scope,
                    command["commandId"],
                    {
                        k: row[k]
                        for k in (
                            "symbol",
                            "exchange",
                            "product",
                            "orderid",
                            "action",
                            "quantity",
                            "pricetype",
                            "price",
                            "trigger_price",
                        )
                        if k in row
                    },
                )
            return cancel_order(orderid=data["orderid"], api_key=api_key)
        if row.get("filled_quantity") is None:
            raise CommandRefused("Broker filled quantity is unavailable; modify was not sent")
        if float(row["filled_quantity"]) >= float(row.get("quantity", 0)):
            raise CommandRefused("Order has no remaining quantity; wait for broker confirmation")
        # Immutable executable identity always comes from the broker book.
        data = {**row, **{k: data[k] for k in ("price", "trigger_price") if k in data}}
        data.pop("version", None)
    position = None
    if operation in ("close", "reduce", "protect", "modifyProtection", "cancelProtection"):
        position = next(
            (
                r
                for r in books["positions"]
                if all(r.get(k) == data.get(k) for k in ("symbol", "exchange", "product"))
                and float(r.get("quantity", 0)) != 0
            ),
            None,
        )
        if not position or position["version"] != command.get("expectedVersion"):
            raise CommandRefused("Position changed; refresh before managing its exits")
        if operation in ("close", "reduce"):
            if broker == "fyers":
                from services.gtt_orderbook_service import get_gtt_orderbook

                ok, gtt_book, _ = get_gtt_orderbook(api_key=api_key, status="all")
                if (
                    not ok
                    or gtt_book.get("status") != "success"
                    or not isinstance(gtt_book.get("data"), list)
                ):
                    raise CommandRefused("Broker-held exits unavailable; close was not sent")
                if any(
                    row.get("symbol") == symbol
                    and row.get("exchange") == exchange
                    and row.get("status") not in ("cancelled", "rejected", "expired")
                    and row.get("trigger_id") not in resolved_parents
                    and (
                        not row.get("legs")
                        or any(leg.get("product") in (None, product) for leg in row["legs"])
                    )
                    for row in gtt_book["data"]
                ):
                    raise CommandRefused(
                        "Review broker-held GTT exits before closing this position"
                    )
            # Without an authoritative association, never guess and cancel an
            # opposite working order. Refuse rather than risk a second exit.
            if any(
                all(r.get(k) == data.get(k) for k in ("symbol", "exchange", "product"))
                and r.get("order_status") not in ("complete", "cancelled", "rejected", "expired")
                for r in books["orders"]
            ):
                raise CommandRefused("Review working orders for this position before closing it")
            if operation == "reduce":
                try:
                    amount = Decimal(str(data.get("quantity", 0)))
                    if (
                        not amount.is_finite()
                        or amount <= 0
                        or amount % 1
                        or amount > abs(position["quantity"])
                    ):
                        raise ValueError()
                except (ArithmeticError, ValueError, TypeError):
                    raise CommandRefused(
                        "Reduction quantity exceeds the confirmed position or is invalid"
                    ) from None
            else:
                amount = abs(int(position["quantity"]))
            data.update(
                action="SELL" if float(position["quantity"]) > 0 else "BUY",
                quantity=int(amount),
                pricetype="MARKET",
                price=0,
                trigger_price=0,
            )
        else:
            # GTT eligibility is narrower than regular order eligibility. The
            # broker adapters reject MIS; do not present native intraday OCO.
            if broker != "fyers" or product not in ("CNC", "NRML"):
                raise CommandRefused("Broker-held linked exits are unavailable for this product")
            raise CommandRefused(
                "Protection binding is not enabled until native lifecycle verification passes"
            )
    if operation not in ("place", "modify", "close", "reduce"):
        raise CommandRefused("Unsupported command")
    data = {
        k: v
        for k, v in data.items()
        if k
        in (
            "symbol",
            "exchange",
            "product",
            "action",
            "quantity",
            "pricetype",
            "price",
            "trigger_price",
            "orderid",
            "disclosed_quantity",
        )
    }
    data["strategy"] = "Chart Trading"
    validate_broker_capability(broker, data)
    validate_order(
        data, get_symbol_info(symbol, exchange), get_freeze_qty_for_option(symbol, exchange)
    )
    if operation not in ("close", "reduce"):
        margin_preflight(data, api_key)
    started = time.monotonic()
    ok, quote, _ = get_quotes(symbol=symbol, exchange=exchange, api_key=api_key)
    mark = float((quote.get("data") or {}).get("ltp") or 0)
    if not ok or not 0 < mark < float("inf") or time.monotonic() - started > 5:
        raise CommandRefused("Fresh broker quote unavailable; action was not sent")
    if data["pricetype"] in ("SL", "SL-M"):
        trigger = float(data["trigger_price"])
        if (data["action"] == "BUY" and trigger <= mark) or (
            data["action"] == "SELL" and trigger >= mark
        ):
            raise CommandRefused("Stop trigger is on the wrong side of current market price")
    if operation in ("modify", "close", "reduce"):
        # Quotes and margin checks can take time. Refuse a fill/position change
        # which happened during preflight rather than use the earlier size.
        final = read_books(api_key)
        rows = final["orders"] if operation == "modify" else final["positions"]
        matching = next(
            (
                row
                for row in rows
                if all(row.get(key) == data.get(key) for key in ("symbol", "exchange", "product"))
                and (operation != "modify" or row.get("orderid") == data.get("orderid"))
            ),
            None,
        )
        if not matching or matching["version"] != command.get("expectedVersion"):
            raise CommandRefused("Broker state changed during preflight; action was not sent")
        if operation in ("close", "reduce") and any(
            all(row.get(key) == data.get(key) for key in ("symbol", "exchange", "product"))
            and row.get("order_status") not in ("complete", "cancelled", "rejected", "expired")
            for row in final["orders"]
        ):
            raise CommandRefused("A working order appeared during preflight; review broker books")
    if time.monotonic() - started > 5:
        raise CommandRefused("Quote expired during preflight; action was not sent")
    if ledger and scope:
        ledger.prepare_order(scope, command["commandId"], data)
    return (
        modify_order(order_data=data, api_key=api_key)
        if operation == "modify"
        else place_order(order_data=data, api_key=api_key)
    )

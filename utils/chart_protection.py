"""Position-exit contracts. Native broker triggers only; no local price engine."""

import hashlib
import json
from decimal import Decimal, InvalidOperation

from utils.chart_commands import CommandRefused, broker_identifier, validate_order

TERMINAL = {"cancelled", "rejected", "expired"}


def native_version(row):
    # Exclude changing market marks, include both paired legs and native status.
    return hashlib.sha256(
        json.dumps(
            {
                k: row.get(k)
                for k in (
                    "trigger_id",
                    "symbol",
                    "exchange",
                    "trigger_type",
                    "status",
                    "trigger_prices",
                    "legs",
                )
            },
            sort_keys=True,
        ).encode()
    ).hexdigest()


def native_book(rows):
    if not isinstance(rows, list):
        raise CommandRefused("Native protection book is unavailable")
    result = []
    seen = set()
    for raw in rows:
        identifier = broker_identifier(raw.get("trigger_id")) if isinstance(raw, dict) else None
        if not identifier or identifier in seen:
            raise CommandRefused("Native protection book has invalid or duplicate IDs")
        seen.add(identifier)
        row = {**raw, "trigger_id": identifier}
        if not all(
            isinstance(row.get(k), str) and row[k] for k in ("symbol", "exchange", "status")
        ):
            raise CommandRefused("Native protection instrument/status is unavailable")
        legs, prices = row.get("legs"), row.get("trigger_prices")
        count = (
            2
            if row.get("trigger_type") == "two-leg"
            else 1
            if row.get("trigger_type") == "single"
            else 0
        )
        if (
            not count
            or not isinstance(legs, list)
            or not isinstance(prices, list)
            or len(legs) != count
            or len(prices) != count
        ):
            raise CommandRefused("Native protection legs are unavailable")
        for leg, trigger in zip(legs, prices, strict=True):
            if (
                not isinstance(leg, dict)
                or leg.get("action") not in ("BUY", "SELL")
                or not leg.get("product")
            ):
                raise CommandRefused("Native protection identity is unavailable")
            for key, value in (
                ("quantity", leg.get("quantity")),
                ("price", leg.get("price")),
                ("trigger", trigger),
            ):
                try:
                    number = Decimal(str(value))
                    if (
                        isinstance(value, bool)
                        or not number.is_finite()
                        or number <= 0
                        or (key == "quantity" and number % 1)
                    ):
                        raise ValueError()
                except (InvalidOperation, ValueError, TypeError):
                    raise CommandRefused("Native protection quantity/price is invalid") from None
        row["version"] = native_version(row)
        result.append(row)
    return result


def exit_contract(position, values, mark, info, freeze_qty=0):
    """Semantic SL/TP -> paired native high/low legs (including short exits).

    A GTT child is LIMIT, not a guaranteed fill. Explicit limit prices are kept
    distinct from trigger prices; never derive a synthetic execution price.
    """
    side = "SELL" if position["quantity"] > 0 else "BUY"
    quantity = abs(position["quantity"])
    roles = {}
    for role in ("stop", "target"):
        trigger, limit = values.get(f"{role}Trigger"), values.get(f"{role}Limit")
        if trigger is None and limit is None:
            continue
        if trigger is None or limit is None:
            raise CommandRefused("Each exit needs an explicit trigger and limit price")
        data = {
            **{k: position[k] for k in ("symbol", "exchange", "product")},
            "action": side,
            "quantity": quantity,
            "pricetype": "SL",
            "price": limit,
            "trigger_price": trigger,
        }
        # LIMIT children of targets have the same sell <= trigger / buy >=
        # trigger constraints as stop-limit children. Side vs LTP is checked below.
        validate_order(data, info, freeze_qty)
        trigger, limit = float(trigger), float(limit)
        below = (position["quantity"] > 0) == (role == "stop")
        if (below and trigger >= mark) or (not below and trigger <= mark):
            raise CommandRefused(
                f"{role.title()} trigger is on the wrong side of the fresh market price"
            )
        roles[role] = {"trigger": trigger, "limit": limit}
    if not roles:
        raise CommandRefused("Choose a stop, target, or native OCO pair")
    base = {
        **{k: position[k] for k in ("symbol", "exchange", "product")},
        "action": side,
        "quantity": quantity,
        "strategy": "Chart Trading",
    }
    paired = sorted(roles.values(), key=lambda leg: leg["trigger"])
    if len(paired) == 2:
        base.update(
            trigger_type="OCO",
            triggerprice_sl=paired[0]["trigger"],
            stoploss=paired[0]["limit"],
            triggerprice_tg=paired[1]["trigger"],
            target=paired[1]["limit"],
        )
    else:
        base.update(
            trigger_type="SINGLE", trigger_price=paired[0]["trigger"], price=paired[0]["limit"]
        )
    return base, roles


def protection_state(binding, positions, orders, triggers):
    """Read-only lifecycle reconciliation; never guesses a triggered child ID."""
    identity = binding["identity"]
    position = next((r for r in positions if all(r.get(k) == identity[k] for k in identity)), None)
    native = next(
        (
            r
            for r in (triggers if binding["kind"] == "gtt" else orders)
            if str(r.get("trigger_id") if binding["kind"] == "gtt" else r.get("orderid"))
            == binding["brokerId"]
        ),
        None,
    )
    cached_terminal = binding.get("confirmedTerminal")
    state = (
        cached_terminal
        if cached_terminal in TERMINAL or cached_terminal == "complete"
        else "unconfirmed"
    )
    if native:
        same = all(native.get(k) == identity[k] for k in ("symbol", "exchange"))
        if binding["kind"] == "gtt":
            same = same and all(leg.get("product") == identity["product"] for leg in native["legs"])
        else:
            same = same and native.get("product") == identity["product"]
        if not same:
            raise CommandRefused("Bound exit ID has an unexpected broker identity")
        state = native.get("status") if binding["kind"] == "gtt" else native.get("order_status")
        if cached_terminal and state not in TERMINAL and state != "complete":
            state = "unknown"
    if state == "triggered":
        review = "Trigger fired; child order must be reconciled in broker books before closing."
    elif state in TERMINAL or state == "complete":
        review = ""
    elif not position or position["quantity"] == 0:
        review = "Position is flat; cancel the remaining broker-held exit."
    elif position["quantity"] != binding["positionQuantity"]:
        review = "Position quantity/direction changed; review and resize or cancel its exit."
    elif state in ("unknown", "unconfirmed", "transit"):
        review = "Awaiting authoritative broker confirmation; do not resend."
    else:
        review = ""
    confirmed = {}
    quantities = {}
    if native:
        if binding["kind"] == "gtt":
            paired = sorted(
                zip(native["trigger_prices"], native["legs"], strict=True), key=lambda pair: pair[0]
            )
            names = (
                (["stop", "target"] if binding["positionQuantity"] > 0 else ["target", "stop"])
                if len(paired) == 2
                else list(binding["roles"])
            )
            confirmed = {
                role: {"trigger": float(trigger), "limit": float(leg["price"])}
                for role, (trigger, leg) in zip(names, paired, strict=True)
            }
            quantities = {
                role: int(leg["quantity"]) for role, (_, leg) in zip(names, paired, strict=True)
            }
        else:
            role = next(iter(binding["roles"]))
            confirmed = {
                role: {
                    "trigger": float(native.get("trigger_price") or native["price"]),
                    "limit": float(native["price"]),
                }
            }
            quantities = {
                role: max(0, int(native["quantity"]) - int(native.get("filled_quantity") or 0))
            }
        if position and state not in TERMINAL and state not in ("complete", "triggered"):
            if any(q != abs(position["quantity"]) for q in quantities.values()):
                review = "Broker exit quantity differs from the position; review and resize or cancel it."
    return {
        **binding,
        "state": state,
        "review": review,
        "confirmedRoles": confirmed,
        "confirmedQuantities": quantities,
        "nativeVersion": native.get("version") if native else None,
        "native": native,
    }

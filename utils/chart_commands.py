"""Chart command contracts. Pure validation, no broker or application imports."""

import hashlib
import json
import math
import re
import uuid
from datetime import datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

WORKING = {"open", "pending", "trigger pending", "partially filled"}
ORDER_EXCHANGES = {
    "kotak": {"NSE", "BSE", "NFO", "BFO", "MCX"},
    "fyers": {"NSE", "BSE", "NFO", "BFO", "MCX", "CDS"},
}


class CommandRefused(ValueError):
    pass


def worker_owner():
    """Process birth time distinguishes a restarted worker from a reused PID."""
    import psutil

    process = psutil.Process()
    return {"pid": process.pid, "startedAt": process.create_time()}


def worker_alive(owner):
    """None means unverified, never permission to unlock an in-flight handler."""
    import psutil

    try:
        if (
            not isinstance(owner, dict)
            or not isinstance(owner.get("pid"), int)
            or not isinstance(owner.get("startedAt"), (float, int))
        ):
            return None
        process = psutil.Process(owner["pid"])
        return process.is_running() and process.create_time() == owner["startedAt"]
    except psutil.NoSuchProcess:
        return False
    except (psutil.Error, ValueError, OSError):
        return None


def broker_identifier(value):
    if isinstance(value, bool) or not isinstance(value, (str, int)):
        return None
    identifier = str(value).strip()
    if identifier.lower() in ("0", "none", "null", "undefined"):
        return None
    return identifier if re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9:_.-]{0,127}", identifier) else None


def execution_scopes(user, broker, configured_identity, token, mode):
    """Separate a daily login generation from durable configured-account claims.

    These two local instances use their own FYERS app / Kotak UCC. Their
    configured identity survives token renewal. Never persist the raw identity
    or token; the session scope also invalidates drafts after broker re-login.
    """
    if broker not in ("kotak", "fyers") or not configured_identity:
        raise CommandRefused("Verified local broker identity is required for chart trading")
    account = hashlib.sha256(
        json.dumps([user, broker, configured_identity, mode]).encode()
    ).hexdigest()
    session = hashlib.sha256(json.dumps([account, token]).encode()).hexdigest()
    return account, session


def version(row):
    """Exclude changing marks/P&L; include every executable order/position field."""
    fields = (
        "symbol",
        "exchange",
        "product",
        "orderid",
        "action",
        "quantity",
        "price",
        "trigger_price",
        "pricetype",
        "order_status",
        "filled_quantity",
        "average_price",
    )
    return hashlib.sha256(
        json.dumps({k: str(row.get(k, "")) for k in fields}, sort_keys=True).encode()
    ).hexdigest()


def normalize_books(order_data, position_data):
    """An unavailable/malformed book is never an authoritative empty book."""
    if isinstance(order_data, dict):
        order_data = order_data.get("orders")
    if not isinstance(order_data, list) or not isinstance(position_data, list):
        raise CommandRefused("Broker book shape is unavailable; action was not sent")
    aliases = {
        "trigger_pending": "trigger pending",
        "partially_filled": "partially filled",
        "filled": "complete",
        "canceled": "cancelled",
    }

    def normalize(raw, is_order):
        if not isinstance(raw, dict) or not all(
            isinstance(raw.get(key), str) and raw[key] for key in ("symbol", "exchange", "product")
        ):
            raise CommandRefused("Broker returned an invalid instrument in its book")
        row = dict(raw)
        if is_order:
            identifier = broker_identifier(row.get("orderid"))
            if not identifier:
                raise CommandRefused("Broker order ID is unavailable")
            row["orderid"] = identifier
            status = str(row.get("order_status") or "unknown").lower()
            row["order_status"] = aliases.get(status, status)
        for key in ("quantity", "filled_quantity", "price", "trigger_price", "average_price"):
            if key not in row:
                continue
            try:
                if isinstance(row[key], bool):
                    raise ValueError()
                value = float(row[key])
                if not math.isfinite(value):
                    raise ValueError()
                if key in ("quantity", "filled_quantity") and value % 1:
                    raise ValueError()
                row[key] = int(value) if key in ("quantity", "filled_quantity") else value
            except (ValueError, TypeError, OverflowError):
                raise CommandRefused(
                    "Broker returned an invalid quantity or price in its book"
                ) from None
        if "quantity" not in row:
            raise CommandRefused("Broker book quantity is unavailable")
        if (
            is_order
            and row["order_status"] in WORKING
            and 0 < row.get("filled_quantity", 0) < row["quantity"]
        ):
            row["order_status"] = "partially filled"
        row["version"] = version(row)
        return row

    return {
        "orders": [normalize(row, True) for row in order_data],
        "positions": [normalize(row, False) for row in position_data],
    }


def native_protection_eligible(broker, mode, exchange, product):
    # Do not infer commodity/currency GTT support from regular-order support.
    return (
        broker == "fyers"
        and mode == "live"
        and (
            (exchange in ("NSE", "BSE") and product == "CNC")
            or (exchange in ("NFO", "BFO") and product == "NRML")
        )
    )


def capabilities(broker, mode="analyze", exchange=None, product=None):
    native = (
        broker == "fyers"
        and mode == "live"
        and (exchange is None or native_protection_eligible(broker, mode, exchange, product))
    )
    return {
        "orderTypes": ["MARKET", "LIMIT", "SL", "SL-M"],
        "orderExchanges": sorted(ORDER_EXCHANGES.get(broker, set())),
        "brokerHeldOco": native,
        "individualExits": mode == "live" and (broker == "kotak" or native),
        "entryBrackets": False,
        "protectionReason": (
            "Broker-held protection requires Live mode; Analyze does not run a local protection engine."
            if mode != "live"
            else "FYERS native Single/OCO is enabled for verified equity/F&O CNC/NRML only. Triggers create limit orders; fills are not guaranteed."
            if broker == "fyers"
            else "Kotak supports an individual SL or target exit. Linked brackets/OCO are unavailable through this broker API."
        ),
        "syntheticOco": False,
    }


def validate_broker_capability(broker, data):
    if data.get("exchange") not in ORDER_EXCHANGES.get(broker, set()):
        raise CommandRefused(
            "This exchange is not supported for orders by the configured broker API"
        )


def validate_envelope(command, now):
    if not isinstance(command, dict):
        raise CommandRefused("Command must be an object")
    if command.keys() - {
        "commandId",
        "issuedAt",
        "mode",
        "scope",
        "operation",
        "payload",
        "expectedVersion",
    }:
        raise CommandRefused("Unsupported command fields")
    try:
        identifier = uuid.UUID(command.get("commandId", ""))
        if str(identifier) != command.get("commandId"):
            raise ValueError()
    except (ValueError, AttributeError, TypeError):
        raise CommandRefused("Invalid command ID") from None
    if command.get("mode") not in ("live", "analyze"):
        raise CommandRefused("Execution mode is required")
    if command.get("operation") not in (
        "place",
        "modify",
        "cancel",
        "close",
        "reduce",
        "protect",
        "modifyProtection",
        "cancelProtection",
    ):
        raise CommandRefused("Unsupported chart command")
    stamp = command.get("issuedAt")
    if (
        isinstance(stamp, bool)
        or not isinstance(stamp, (int, float))
        or not math.isfinite(stamp)
        or abs(now - stamp) > 120
    ):
        raise CommandRefused("Draft expired; start a fresh chart action")
    if not isinstance(command.get("payload"), dict):
        raise CommandRefused("Missing command payload")
    allowed = {
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
    }
    if command["operation"] in ("protect", "modifyProtection", "cancelProtection"):
        allowed |= {
            "protectionId",
            "protectionVersion",
            "stopTrigger",
            "stopLimit",
            "targetTrigger",
            "targetLimit",
        }
    if command["payload"].keys() - allowed:
        raise CommandRefused(
            "Unsupported command fields; no credentials or book metadata are accepted"
        )
    text_fields = {
        "symbol",
        "exchange",
        "product",
        "action",
        "pricetype",
        "orderid",
        "protectionId",
        "protectionVersion",
    }
    for key, value in command["payload"].items():
        if key in text_fields:
            if not isinstance(value, str) or not value or len(value) > 200:
                raise CommandRefused("Invalid instrument/order identity")
        else:
            try:
                if (
                    isinstance(value, bool)
                    or not isinstance(value, (str, int, float))
                    or len(str(value)) > 40
                ):
                    raise ValueError()
                if not Decimal(str(value)).is_finite():
                    raise ValueError()
            except (ValueError, ArithmeticError):
                raise CommandRefused("Invalid numeric command field") from None
    if len(json.dumps(command)) > 8192:
        raise CommandRefused("Command is too large")


def validate_order(data, info, freeze_qty=0):
    if not info:
        raise CommandRefused("Instrument unavailable in the broker master")
    expiry = getattr(info, "expiry", None)
    if expiry:
        try:
            expires = datetime.strptime(str(expiry).upper(), "%d-%b-%y").date()
            if expires < datetime.now(ZoneInfo("Asia/Kolkata")).date():
                raise CommandRefused("Contract has expired; select a current broker instrument")
        except ValueError as error:
            if isinstance(error, CommandRefused):
                raise
            raise CommandRefused("Contract expiry is unavailable in the broker master") from None
    if str(data.get("exchange", "")).endswith("_INDEX"):
        raise CommandRefused("Index is quote-only; select a tradable contract")
    if data.get("action") not in ("BUY", "SELL"):
        raise CommandRefused("Choose Buy or Sell")
    if data.get("pricetype") not in ("MARKET", "LIMIT", "SL", "SL-M"):
        raise CommandRefused("Unsupported order type")
    if data.get("product") not in ("MIS", "NRML", "CNC"):
        raise CommandRefused("Unsupported product")
    derivatives = data.get("exchange") in ("NFO", "BFO", "MCX", "CDS", "BCD", "NCO", "NCDEX")
    if derivatives and data.get("product") == "CNC":
        raise CommandRefused("CNC is unavailable for derivatives")
    if not derivatives and data.get("product") == "NRML":
        raise CommandRefused("Choose CNC or MIS for cash instruments")
    try:
        qty = Decimal(str(data.get("quantity", 0)))
        lot = Decimal(str(getattr(info, "lotsize", 1) or 1)) if derivatives else Decimal(1)
        if (
            not lot.is_finite()
            or lot <= 0
            or not qty.is_finite()
            or qty <= 0
            or qty % lot
            or qty % 1
        ):
            raise CommandRefused("Quantity must be a positive whole number of lots/units")
        freeze = freeze_qty or getattr(info, "freezeqty", None)
        if freeze and float(freeze) > 0 and qty > Decimal(str(freeze)):
            raise CommandRefused("Quantity exceeds the instrument freeze limit")
        tick = Decimal(str(getattr(info, "tick_size", 0.05) or 0.05))
        if not tick.is_finite() or tick <= 0:
            raise CommandRefused("Instrument tick size is unavailable")
        required = (["price"] if data["pricetype"] in ("LIMIT", "SL") else []) + (
            ["trigger_price"] if data["pricetype"] in ("SL", "SL-M") else []
        )
        for field in required:
            price = Decimal(str(data.get(field, 0)))
            if not price.is_finite() or price <= 0 or price % tick:
                raise CommandRefused("Price must be positive and match the instrument tick size")
        if data["pricetype"] == "SL":
            limit = Decimal(str(data["price"]))
            trigger = Decimal(str(data["trigger_price"]))
            if (data["action"] == "BUY" and limit < trigger) or (
                data["action"] == "SELL" and limit > trigger
            ):
                raise CommandRefused("Stop-limit price is on the wrong side of its trigger")
    except (ArithmeticError, ValueError, TypeError) as error:
        if isinstance(error, CommandRefused):
            raise
        raise CommandRefused("Invalid quantity or price") from None


def command_fingerprint(command):
    return hashlib.sha256(
        json.dumps(command, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()
    ).hexdigest()

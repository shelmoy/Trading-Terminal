"""Read-only watchlist catalog from this instance's broker symbol master."""

import re
from datetime import date, datetime
from zoneinfo import ZoneInfo

from sqlalchemy import or_, select

from database.symbol import SymToken, engine

_MONTHS = {
    name: n
    for n, name in enumerate(
        ("JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"), 1
    )
}


def _expiry(value: str | None) -> date | None:
    match = re.fullmatch(r"(\d{1,2})-([A-Z]{3})-(\d{2}|\d{4})", (value or "").upper())
    if not match:
        return None
    day, month, year = match.groups()
    try:
        return date(int(year) + (2000 if len(year) == 2 else 0), _MONTHS[month], int(day))
    except (KeyError, ValueError):
        return None


def get_broker_watchlist_catalog(broker: str) -> dict:
    """Expose instruments, never broker tokens. Expiry-day contracts stay visible.

    No separate catalog cache: reopening/refreshing reads the most recent master
    downloaded by the broker's existing master-contract process.
    """
    today = datetime.now(ZoneInfo("Asia/Kolkata")).date()
    stmt = select(
        SymToken.symbol,
        SymToken.name,
        SymToken.exchange,
        SymToken.expiry,
        SymToken.lotsize,
        SymToken.instrumenttype,
        SymToken.tick_size,
    ).where(
        or_(
            SymToken.exchange.in_(("NSE_INDEX", "BSE_INDEX")),
            SymToken.exchange.in_(("MCX", "NFO", "BFO")) & SymToken.symbol.endswith("FUT"),
        )
    )
    commodities: dict[str, dict] = {}
    indices: dict[str, dict] = {}
    index_futures: list[dict] = []
    with engine.connect() as connection:
        for row in connection.execute(stmt).mappings():
            symbol, exchange = row["symbol"], row["exchange"]
            contract = {
                "symbol": symbol,
                "exchange": exchange,
                "name": row["name"] or symbol,
                "lotsize": row["lotsize"],
                "instrumenttype": row["instrumenttype"],
                "tick_size": row["tick_size"],
            }
            if exchange == "MCX":
                expiry = _expiry(row["expiry"])
                if expiry is None or expiry < today:
                    continue
                name = row["name"] or re.sub(r"\d{2}[A-Z]{3}\d{2,4}FUT$", "", symbol)
                key = f"{exchange}:{name}"
                group = commodities.setdefault(
                    key,
                    {
                        "id": key,
                        "name": name,
                        "kind": "commodity_index"
                        if name.startswith("MCX") and name.endswith("DEX")
                        else "commodity",
                        "contracts": [],
                    },
                )
                contract["expiry"] = expiry.isoformat()
                contract["expiry_label"] = row["expiry"]
                group["contracts"].append(contract)
            elif exchange in ("NSE_INDEX", "BSE_INDEX"):
                key = f"{exchange}:{symbol}"
                indices[key] = {"id": key, "name": symbol, "kind": "index", "contracts": [contract]}
            else:
                expiry = _expiry(row["expiry"])
                if expiry is not None and expiry >= today:
                    contract["expiry"] = expiry.isoformat()
                    contract["expiry_label"] = row["expiry"]
                    index_futures.append(contract)

    # Join only exact index underlyings from the broker master; stock futures
    # must not appear as indices just because they share the derivatives segment.
    for contract in sorted(index_futures, key=lambda item: (item["expiry"], item["symbol"])):
        spot_exchange = "NSE_INDEX" if contract["exchange"] == "NFO" else "BSE_INDEX"
        group = indices.get(f"{spot_exchange}:{contract['name']}")
        if group and not any(item["symbol"] == contract["symbol"] for item in group["contracts"]):
            group["contracts"].append(contract)

    for group in commodities.values():
        group["contracts"].sort(key=lambda item: (item["expiry"], item["symbol"]))
        # Defensive against duplicated rows in a downloaded master.
        group["contracts"] = list({item["symbol"]: item for item in group["contracts"]}.values())
    priority = {
        name: n
        for n, name in enumerate(
            ("NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY", "NIFTYNXT50", "SENSEX", "BANKEX")
        )
    }
    return {
        "broker": broker,
        "as_of": today.isoformat(),
        "commodities": sorted(commodities.values(), key=lambda group: group["name"]),
        "indices": sorted(
            indices.values(),
            key=lambda group: (priority.get(group["name"], 100), group["name"], group["id"]),
        ),
    }

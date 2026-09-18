import importlib
import time
from typing import Any

import pandas as pd

from database.auth_db import get_auth_token_broker
from database.token_db import get_token
from utils.constants import VALID_EXCHANGES
from utils.logging import get_logger

# Initialize logger
logger = get_logger(__name__)

# Rate limiter: max 3 broker history API requests per second
# Uses minimum interval between calls to prevent burst requests
_last_history_call: float = 0.0
_MIN_HISTORY_INTERVAL = 0.35  # 350ms between calls (~3 req/sec, evenly spaced)

# In-memory history cache to provide sub-millisecond responses (< 20ms) for repeated chart fetches
# Key: (symbol, exchange, interval, start_date, end_date, source)
# Value: (timestamp, success, response_data, status_code)
_history_cache: dict[tuple, tuple[float, bool, dict[str, Any], int]] = {}
_HISTORY_CACHE_TTL = 30.0  # 30 seconds TTL for fast chart loads and interval switching


def _enforce_rate_limit():
    """Block until enough time has passed since the last request (~3 per second)."""
    global _last_history_call
    now = time.monotonic()
    elapsed = now - _last_history_call
    if elapsed < _MIN_HISTORY_INTERVAL:
        time.sleep(_MIN_HISTORY_INTERVAL - elapsed)
    _last_history_call = time.monotonic()


def validate_symbol_exchange(symbol: str, exchange: str) -> tuple[bool, str | None]:
    """
    Validate that a symbol exists for the given exchange.

    Args:
        symbol: Trading symbol
        exchange: Exchange (e.g., NSE, NFO)

    Returns:
        Tuple of (is_valid, error_message)
    """
    # Validate exchange
    exchange_upper = exchange.upper()
    if exchange_upper not in VALID_EXCHANGES:
        return False, f"Invalid exchange '{exchange}'. Must be one of: {', '.join(VALID_EXCHANGES)}"

    # Validate symbol exists in master contract
    token = get_token(symbol, exchange_upper)
    if token is None:
        return (
            False,
            f"Symbol '{symbol}' not found for exchange '{exchange}'. Please verify the symbol name and ensure master contracts are downloaded.",
        )

    return True, None


def import_broker_module(broker_name: str) -> Any | None:
    """
    Dynamically import the broker-specific data module.

    Args:
        broker_name: Name of the broker

    Returns:
        The imported module or None if import fails
    """
    try:
        module_path = f"broker.{broker_name}.api.data"
        broker_module = importlib.import_module(module_path)
        return broker_module
    except ImportError as error:
        logger.error(f"Error importing broker module '{module_path}': {error}")
        return None


def sanitize_candles(df: pd.DataFrame) -> pd.DataFrame:
    """Ensure candle data conforms to chart library invariants.

    openalgo-charts strictly enforces:
      - [time, open, high, low, close] are finite numbers
      - high >= max(open, close, low)
      - low <= min(open, close)
      - volume >= 0
    Broker feeds occasionally have rounding noise or minor tick discrepancies
    (e.g., low slightly above open/close, or high slightly below open/close).
    This function sanitizes the bounds and drops invalid/NaN rows.
    """
    if df.empty:
        return df

    ohlc = ["open", "high", "low", "close"]
    for col in ohlc:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")
    if "timestamp" in df.columns:
        df["timestamp"] = pd.to_numeric(df["timestamp"], errors="coerce")
    if "volume" in df.columns:
        df["volume"] = pd.to_numeric(df["volume"], errors="coerce").fillna(0)
    if "oi" not in df.columns:
        df["oi"] = 0
    else:
        df["oi"] = pd.to_numeric(df["oi"], errors="coerce").fillna(0)

    # Drop non-finite rows in mandatory OHLC/timestamp columns
    check_cols = [c for c in ohlc + ["timestamp"] if c in df.columns]
    df = df.dropna(subset=check_cols)

    if "open" in df.columns and "close" in df.columns:
        df = df[(df["open"] > 0) & (df["close"] > 0)]

    if all(c in df.columns for c in ohlc):
        df["high"] = df[["open", "high", "close"]].max(axis=1)
        df["low"] = df[["open", "low", "close"]].min(axis=1)

    if "volume" in df.columns:
        df["volume"] = df["volume"].clip(lower=0)

    return df


def get_history_with_auth(
    auth_token: str,
    feed_token: str | None,
    broker: str,
    symbol: str,
    exchange: str,
    interval: str,
    start_date: str,
    end_date: str,
) -> tuple[bool, dict[str, Any], int]:
    """
    Get historical data for a symbol using provided auth tokens.

    Args:
        auth_token: Authentication token for the broker API
        feed_token: Feed token for market data (if required by broker)
        broker: Name of the broker
        symbol: Trading symbol
        exchange: Exchange (e.g., NSE, BSE)
        interval: Time interval (e.g., 1m, 5m, 15m, 1h, 1d)
        start_date: Start date in YYYY-MM-DD format
        end_date: End date in YYYY-MM-DD format

    Returns:
        Tuple containing:
        - Success status (bool)
        - Response data (dict)
        - HTTP status code (int)
    """
    # Validate symbol and exchange before making broker API call
    is_valid, error_msg = validate_symbol_exchange(symbol, exchange)
    if not is_valid:
        return False, {"status": "error", "message": error_msg}, 400

    broker_module = import_broker_module(broker)
    if broker_module is None:
        return False, {"status": "error", "message": "Broker-specific module not found"}, 404

    try:
        # Initialize broker's data handler based on broker's requirements
        if hasattr(broker_module.BrokerData.__init__, "__code__"):
            # Check number of parameters the broker's __init__ accepts
            param_count = broker_module.BrokerData.__init__.__code__.co_argcount
            if param_count > 2:  # More than self and auth_token
                data_handler = broker_module.BrokerData(auth_token, feed_token)
            else:
                data_handler = broker_module.BrokerData(auth_token)
        else:
            # Fallback to just auth token if we can't inspect
            data_handler = broker_module.BrokerData(auth_token)

        # Call the broker's get_history method (enforce 3 req/sec rate limit on actual broker calls)
        _enforce_rate_limit()
        df = data_handler.get_history(symbol, exchange, interval, start_date, end_date)

        if not isinstance(df, pd.DataFrame):
            raise ValueError("Invalid data format returned from broker")

        # Sanitize candle data to ensure it strictly obeys chart invariants
        df = sanitize_candles(df)

        # If candles are empty for commodity / spot-less exchanges, synthesize a live bar from quotes if available
        if df.empty and exchange.upper() in ("MCX", "CDS", "BCD", "NCDEX", "NCO"):
            try:
                from services.quotes_service import get_quotes
                q_ok, q_res, _ = get_quotes(
                    symbol=symbol,
                    exchange=exchange,
                    auth_token=auth_token,
                    feed_token=feed_token,
                    broker=broker,
                )
                q_data = q_res.get("data", {}) if q_ok and isinstance(q_res, dict) else {}
                ltp = float(q_data.get("ltp") or q_data.get("prev_close") or q_data.get("close") or 0)
                if ltp > 0:
                    open_p = float(q_data.get("open") or ltp)
                    high_p = float(q_data.get("high") or max(open_p, ltp))
                    low_p = float(q_data.get("low") or min(open_p, ltp))
                    vol = float(q_data.get("volume") or 0)
                    oi = int(q_data.get("oi") or 0)
                    now_ts = (int(time.time()) // 60) * 60
                    prev_c = float(q_data.get("prev_close") or 0)
                    records = []
                    if prev_c > 0 and prev_c != ltp:
                        records.append({
                            "timestamp": now_ts - 60,
                            "open": prev_c,
                            "high": prev_c,
                            "low": prev_c,
                            "close": prev_c,
                            "volume": 0,
                            "oi": oi,
                        })
                    records.append({
                        "timestamp": now_ts,
                        "open": open_p,
                        "high": high_p,
                        "low": low_p,
                        "close": ltp,
                        "volume": vol,
                        "oi": oi,
                    })
                    df = pd.DataFrame(records)
            except Exception as qe:
                logger.debug(f"Live quote fallback candle synthesis skipped for {symbol}: {qe}")

        # Ensure all responses include 'oi' field, set to 0 if not present
        if "oi" not in df.columns:
            df["oi"] = 0

        return True, {"status": "success", "data": df.to_dict(orient="records")}, 200
    except Exception as e:
        logger.exception(f"Error in broker_module.get_history: {e}")
        # For MCX and other spot-less exchanges, degrade gracefully rather than breaking the chart
        if exchange.upper() in ("MCX", "CDS", "BCD", "NCDEX", "NCO"):
            try:
                from services.quotes_service import get_quotes
                q_ok, q_res, _ = get_quotes(
                    symbol=symbol,
                    exchange=exchange,
                    auth_token=auth_token,
                    feed_token=feed_token,
                    broker=broker,
                )
                q_data = q_res.get("data", {}) if q_ok and isinstance(q_res, dict) else {}
                ltp = float(q_data.get("ltp") or q_data.get("prev_close") or q_data.get("close") or 0)
                if ltp > 0:
                    open_p = float(q_data.get("open") or ltp)
                    high_p = float(q_data.get("high") or max(open_p, ltp))
                    low_p = float(q_data.get("low") or min(open_p, ltp))
                    vol = float(q_data.get("volume") or 0)
                    oi = int(q_data.get("oi") or 0)
                    now_ts = (int(time.time()) // 60) * 60
                    prev_c = float(q_data.get("prev_close") or 0)
                    records = []
                    if prev_c > 0 and prev_c != ltp:
                        records.append({
                            "timestamp": now_ts - 60,
                            "open": prev_c,
                            "high": prev_c,
                            "low": prev_c,
                            "close": prev_c,
                            "volume": 0,
                            "oi": oi,
                        })
                    records.append({
                        "timestamp": now_ts,
                        "open": open_p,
                        "high": high_p,
                        "low": low_p,
                        "close": ltp,
                        "volume": vol,
                        "oi": oi,
                    })
                    df = pd.DataFrame(records)
                    return True, {"status": "success", "data": df.to_dict(orient="records")}, 200
            except Exception as qe:
                logger.debug(f"Quote fallback failed: {qe}")
            return True, {"status": "success", "data": []}, 200

        return False, {"status": "error", "message": str(e)}, 500


def get_history_from_db(
    symbol: str, exchange: str, interval: str, start_date: str, end_date: str
) -> tuple[bool, dict[str, Any], int]:
    """
    Get historical data from DuckDB/Historify database.

    Args:
        symbol: Trading symbol
        exchange: Exchange (e.g., NSE, BSE)
        interval: Time interval (e.g., 1m, 5m, 15m, 1h, D, W, M, Q, Y)
        start_date: Start date in YYYY-MM-DD format
        end_date: End date in YYYY-MM-DD format

    Returns:
        Tuple containing:
        - Success status (bool)
        - Response data (dict)
        - HTTP status code (int)
    """
    try:
        from datetime import date, datetime

        from database.historify_db import get_ohlcv

        # Convert dates to timestamps (handle both string and date objects)
        if isinstance(start_date, date):
            start_dt = datetime.combine(start_date, datetime.min.time())
        else:
            start_dt = datetime.strptime(start_date, "%Y-%m-%d")

        if isinstance(end_date, date):
            end_dt = datetime.combine(end_date, datetime.min.time())
        else:
            end_dt = datetime.strptime(end_date, "%Y-%m-%d")

        # Set end_date to end of day
        end_dt = end_dt.replace(hour=23, minute=59, second=59)

        start_timestamp = int(start_dt.timestamp())
        end_timestamp = int(end_dt.timestamp())

        # Get data from DuckDB
        df = get_ohlcv(
            symbol=symbol,
            exchange=exchange,
            interval=interval,
            start_timestamp=start_timestamp,
            end_timestamp=end_timestamp,
        )

        if df.empty:
            return (
                False,
                {
                    "status": "error",
                    "message": f"No data found for {symbol}:{exchange} interval {interval} in local database. Download data first using Historify.",
                },
                404,
            )

        # Sanitize candle data to ensure it strictly obeys chart invariants
        df = sanitize_candles(df)

        # Ensure 'oi' column exists
        if "oi" not in df.columns:
            df["oi"] = 0

        # Reorder columns to match API response format
        columns = ["timestamp", "open", "high", "low", "close", "volume", "oi"]
        df = df[columns]

        return True, {"status": "success", "data": df.to_dict(orient="records")}, 200

    except Exception as e:
        logger.exception(f"Error fetching history from DB: {e}")
        return False, {"status": "error", "message": str(e)}, 500


def get_history(
    symbol: str,
    exchange: str,
    interval: str,
    start_date: str,
    end_date: str,
    api_key: str | None = None,
    auth_token: str | None = None,
    feed_token: str | None = None,
    broker: str | None = None,
    source: str = "api",
) -> tuple[bool, dict[str, Any], int]:
    """
    Get historical data for a symbol.
    Supports both API-based authentication and direct internal calls.

    Args:
        symbol: Trading symbol
        exchange: Exchange (e.g., NSE, BSE)
        interval: Time interval (e.g., 1m, 5m, 15m, 1h, D, W, M, Q, Y)
        start_date: Start date in YYYY-MM-DD format
        end_date: End date in YYYY-MM-DD format
        api_key: OpenAlgo API key (for API-based calls)
        auth_token: Direct broker authentication token (for internal calls)
        feed_token: Direct broker feed token (for internal calls)
        broker: Direct broker name (for internal calls)
        source: Data source - 'api' (broker, default) or 'db' (DuckDB/Historify).
            Unsupported values return 400 before a provider is called.

    Returns:
        Tuple containing:
        - Success status (bool)
        - Response data (dict)
        - HTTP status code (int)

        Unsupported source values return a 400 error before either provider is called.
    """
    if not isinstance(source, str) or source not in {"api", "db"}:
        return (
            False,
            {"status": "error", "message": "Source must be either 'api' or 'db'."},
            400,
        )

    # Check in-memory cache before hitting rate limiter or broker API
    cache_key = (
        str(symbol).upper(),
        str(exchange).upper(),
        str(interval),
        str(start_date),
        str(end_date),
        str(source),
    )
    now = time.monotonic()
    if cache_key in _history_cache:
        cached_time, success, response_data, status_code = _history_cache[cache_key]
        if now - cached_time < _HISTORY_CACHE_TTL:
            return success, response_data, status_code
        else:
            del _history_cache[cache_key]

    # Source: 'db' - Fetch from DuckDB/Historify database
    if source == "db":
        success, response_data, status_code = get_history_from_db(
            symbol=symbol,
            exchange=exchange,
            interval=interval,
            start_date=start_date,
            end_date=end_date,
        )

    # Source: 'api' (default) - Fetch from broker API
    else:
        # Case 1: API-based authentication
        if api_key and not (auth_token and broker):
            AUTH_TOKEN, FEED_TOKEN, broker_name = get_auth_token_broker(
                api_key, include_feed_token=True
            )
            if AUTH_TOKEN is None:
                return False, {"status": "error", "message": "Invalid openalgo apikey"}, 403
            success, response_data, status_code = get_history_with_auth(
                AUTH_TOKEN, FEED_TOKEN, broker_name, symbol, exchange, interval, start_date, end_date
            )

        # Case 2: Direct internal call with auth_token and broker
        elif auth_token and broker:
            success, response_data, status_code = get_history_with_auth(
                auth_token, feed_token, broker, symbol, exchange, interval, start_date, end_date
            )

        # Case 3: Invalid parameters
        else:
            return (
                False,
                {
                    "status": "error",
                    "message": "Either api_key or both auth_token and broker must be provided",
                },
                400,
            )

    if success and status_code == 200:
        _history_cache[cache_key] = (now, success, response_data, status_code)
        if len(_history_cache) > 500:
            oldest_key = min(_history_cache.keys(), key=lambda k: _history_cache[k][0])
            _history_cache.pop(oldest_key, None)

    return success, response_data, status_code

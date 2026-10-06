import importlib
import os
import pickle
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import pandas as pd
import pytz

from database.auth_db import get_auth_token_broker
from database.token_db import get_token
from services.broker_busy import BrokerBusyError, broker_busy_result
from utils import real_threading
from utils.broker_backpressure import check_queue_wait
from utils.constants import VALID_EXCHANGES
from utils.logging import get_logger
from utils.thread_safe_cache import LockedTTLCache

# Initialize logger
logger = get_logger(__name__)

# Server-side 0-1ms history response cache:
# Keeps recently requested candle histories in memory (3000 items, 15 min TTL)
# and persists them to db/fast_history_cache.pkl so server restarts and index switches
# resolve instantaneously in 0-1ms without hitting broker rate limits.
_history_cache = LockedTTLCache(maxsize=3000, ttl=900)
# Fast lookup by (SYMBOL, EXCHANGE, INTERVAL) -> (start_date_str, end_date_str, timestamp, result_tuple)
_history_latest_by_sym_iv: dict[tuple[str, str, str], tuple[str, str, float, tuple[bool, dict[str, Any], int]]] = {}
_history_latest_lock = real_threading.Lock()
_inflight_locks: dict[tuple[str, str, str, str, str], real_threading.Event] = {}
_inflight_guard = real_threading.Lock()

_DISK_CACHE_PATH = Path("db/fast_history_cache.pkl")
_disk_persist_lock = real_threading.Lock()
_last_disk_persist = 0.0


def _load_disk_history_cache() -> None:
    try:
        if not _DISK_CACHE_PATH.exists():
            return
        with _DISK_CACHE_PATH.open("rb") as f:
            payload = pickle.load(f)
        if not isinstance(payload, dict):
            return
        now = time.time()
        entries = payload.get("entries") or {}
        for k, item in entries.items():
            if not isinstance(item, tuple) or len(item) != 4:
                continue
            s_date, e_date, saved_at, res = item
            if now - saved_at < 3600 * 12 and isinstance(res, tuple) and len(res) == 3 and res[0]:
                with _history_latest_lock:
                    _history_latest_by_sym_iv[k] = (s_date, e_date, saved_at, res)
                _history_cache[(k[0], k[1], k[2], s_date, e_date)] = res
        logger.info(f"Loaded {len(_history_latest_by_sym_iv)} warm history series from {_DISK_CACHE_PATH}")
    except Exception as e:
        logger.debug(f"Could not load fast history cache from disk: {e}")


def _save_disk_history_cache(force: bool = False) -> None:
    global _last_disk_persist
    now = time.time()
    if not force and now - _last_disk_persist < 5.0:
        return
    with _disk_persist_lock:
        if not force and time.time() - _last_disk_persist < 5.0:
            return
        _last_disk_persist = time.time()
        try:
            _DISK_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
            with _history_latest_lock:
                snapshot = dict(list(_history_latest_by_sym_iv.items())[-400:])
            tmp_path = _DISK_CACHE_PATH.with_suffix(".pkl.tmp")
            with tmp_path.open("wb") as f:
                pickle.dump({"entries": snapshot}, f, protocol=pickle.HIGHEST_PROTOCOL)
            os.replace(tmp_path, _DISK_CACHE_PATH)
        except Exception as e:
            logger.debug(f"Could not save fast history cache to disk: {e}")


_load_disk_history_cache()

# Rate limiter: allows a 3-request burst for multi-pane workspaces (SPOT + CE + PE)
# and paces sustained history API requests evenly.
_MIN_HISTORY_INTERVAL = 0.35  # 350ms between sustained calls (~3 req/sec)
_next_history_slot: float = 0.0
_history_burst_tokens: float = 3.0
_history_last_book: float = 0.0
_history_slot_lock = real_threading.Lock()


def _enforce_rate_limit(*, background: bool = False):
    """Wait for this request's turn (~3 per second, with 3-request burst after idle)."""
    global _next_history_slot, _history_burst_tokens, _history_last_book
    with _history_slot_lock:
        now = time.monotonic()
        elapsed = max(0.0, now - _history_last_book)
        _history_last_book = now
        _history_burst_tokens = min(3.0, _history_burst_tokens + elapsed * 2.0)
        if not background and _history_burst_tokens >= 1.0:
            _history_burst_tokens -= 1.0
            step = 0.03
        else:
            step = _MIN_HISTORY_INTERVAL
        slot = max(now, _next_history_slot)
        wait = slot - now
        if not background:
            check_queue_wait(wait, kind="data")
        _next_history_slot = slot + step
    if wait > 0:
        time.sleep(wait)


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

        # Call the broker's get_history method
        df = data_handler.get_history(symbol, exchange, interval, start_date, end_date)

        if not isinstance(df, pd.DataFrame):
            raise ValueError("Invalid data format returned from broker")

        # Ensure all responses include 'oi' field, set to 0 if not present
        if "oi" not in df.columns:
            df["oi"] = 0

        return True, {"status": "success", "data": df.to_dict(orient="records")}, 200
    except BrokerBusyError as e:
        return broker_busy_result(e, f"History request for {exchange}:{symbol}")
    except Exception as e:
        logger.exception(f"Error in broker_module.get_history: {e}")
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
    background: bool = False,
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

    # Source: 'db' - Fetch from DuckDB/Historify database
    if source == "db":
        return get_history_from_db(
            symbol=symbol,
            exchange=exchange,
            interval=interval,
            start_date=start_date,
            end_date=end_date,
        )

    # Fast-path 0-1ms in-memory cache lookup (before rate limiting or broker network calls)
    sym_u = symbol.upper()
    exch_u = exchange.upper()
    s_str = str(start_date)
    e_str = str(end_date)
    cache_key = (sym_u, exch_u, interval, s_str, e_str)
    sym_iv_key = (sym_u, exch_u, interval)

    if not background:
        is_single_day_tail = s_str == e_str
        cached_result = _history_cache.get(cache_key)
        if cached_result is not None and not is_single_day_tail:
            return cached_result
        with _history_latest_lock:
            latest_entry = _history_latest_by_sym_iv.get(sym_iv_key)
        if latest_entry is not None:
            c_start, c_end, c_time, c_res = latest_entry
            age_sec = time.time() - c_time
            if is_single_day_tail:
                # During live market, 1m bar-close tail repairs (start_date == end_date)
                # only reuse cache if < 12s old so new minute closes always get fresh broker bars
                if age_sec < 12 and cached_result is not None:
                    return cached_result
            elif age_sec < 900 and e_str >= c_end and s_str >= c_start and c_start < c_end:
                return c_res

    # Coalesce concurrent identical requests so simultaneous panes/tabs never double-hit the broker
    wait_event: real_threading.Event | None = None
    own_event: real_threading.Event | None = None
    with _inflight_guard:
        existing_ev = _inflight_locks.get(cache_key)
        if existing_ev is not None:
            wait_event = existing_ev
        else:
            own_event = real_threading.Event()
            _inflight_locks[cache_key] = own_event

    if wait_event is not None:
        wait_event.wait(timeout=12.0)
        cached_after = _history_cache.get(cache_key)
        if cached_after is not None:
            return cached_after

    try:
        # Source: 'api' (default) - Fetch from broker API
        try:
            if background:
                _enforce_rate_limit(background=True)
            else:
                _enforce_rate_limit()
        except BrokerBusyError as e:
            return broker_busy_result(e, f"History request for {exchange}:{symbol}")

        # Case 1: API-based authentication
        if api_key and not (auth_token and broker):
            AUTH_TOKEN, FEED_TOKEN, broker_name = get_auth_token_broker(
                api_key, include_feed_token=True
            )
            if AUTH_TOKEN is None:
                return False, {"status": "error", "message": "Invalid openalgo apikey"}, 403
            res = get_history_with_auth(
                AUTH_TOKEN, FEED_TOKEN, broker_name, symbol, exchange, interval, start_date, end_date
            )
            # Kotak Neo exposes MCX quotes and live ticks but currently refuses
            # candle history for its mcx_fo segment. If the user has imported
            # that contract into Historify, use the local candles instead of
            # failing the chart. Never synthesize history from a single LTP.
            if (
                not res[0]
                and str(broker_name or "").lower() == "kotak"
                and str(exchange).upper() == "MCX"
            ):
                local_res = get_history_from_db(
                    symbol=symbol,
                    exchange=exchange,
                    interval=interval,
                    start_date=start_date,
                    end_date=end_date,
                )
                if local_res[0]:
                    logger.info(
                        "Using Historify candles for Kotak MCX %s:%s after broker history refusal",
                        exchange,
                        symbol,
                    )
                    res = local_res
                else:
                    broker_message = (res[1] or {}).get("message") if isinstance(res[1], dict) else None
                    local_message = (local_res[1] or {}).get("message") if isinstance(local_res[1], dict) else None
                    res = (
                        False,
                        {
                            "status": "error",
                            "message": (
                                f"Kotak Neo does not provide MCX candle history for {symbol}. "
                                "Download this MCX contract through Historify to chart it locally. "
                                f"Broker response: {broker_message or 'history unavailable'}. "
                                f"Local lookup: {local_message or 'no local candles'}"
                            ),
                        },
                        res[2],
                    )
        # Case 2: Direct internal call with auth_token and broker
        elif auth_token and broker:
            res = get_history_with_auth(
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

        if res[0] and res[2] == 200:
            rows = (res[1] or {}).get("data") if isinstance(res[1], dict) else None
            if rows:
                now_ts = time.time()
                _history_cache[cache_key] = res
                with _history_latest_lock:
                    prev_entry = _history_latest_by_sym_iv.get(sym_iv_key)
                    if s_str == e_str and prev_entry is not None and prev_entry[0] < prev_entry[1]:
                        # Single-day live tail repair: merge fresh today bars into multi-day history
                        p_start, _p_end, _p_time, p_res = prev_entry
                        p_rows = (p_res[1] or {}).get("data") if isinstance(p_res[1], dict) else None
                        first_new_ts = rows[0].get("timestamp") if isinstance(rows[0], dict) else None
                        if p_rows and first_new_ts is not None:
                            kept = [
                                r for r in p_rows
                                if isinstance(r, dict) and (r.get("timestamp") or 0) < first_new_ts
                            ]
                            merged_res = (
                                True,
                                {"status": "success", "data": kept + list(rows)},
                                200,
                            )
                            _history_latest_by_sym_iv[sym_iv_key] = (
                                p_start,
                                max(_p_end, e_str),
                                now_ts,
                                merged_res,
                            )
                            _history_cache[(sym_u, exch_u, interval, p_start, max(_p_end, e_str))] = merged_res
                    else:
                        _history_latest_by_sym_iv[sym_iv_key] = (s_str, e_str, now_ts, res)
                _save_disk_history_cache()
        return res
    finally:
        if own_event is not None:
            with _inflight_guard:
                _inflight_locks.pop(cache_key, None)
            own_event.set()


_SCALPER_PREWARM_UNDERLYINGS = (
    ("NIFTY", "NSE_INDEX", "NFO"),
    ("BANKNIFTY", "NSE_INDEX", "NFO"),
    ("FINNIFTY", "NSE_INDEX", "NFO"),
    ("MIDCPNIFTY", "NSE_INDEX", "NFO"),
    ("SENSEX", "BSE_INDEX", "BFO"),
)
_prewarmer_started = False
_prewarmer_lock = real_threading.Lock()


def _scalper_prewarm_worker() -> None:
    """Background daemon that keeps 1m history warm for all 5 Scalper indices (SPOT + ATM CE/PE)."""
    time.sleep(3.0)
    ist = pytz.timezone("Asia/Kolkata")
    while True:
        try:
            from database.auth_db import Auth, get_api_key_for_tradingview
            from services.expiry_service import get_expiry_dates
            from services.option_chain_service import get_option_chain

            auth_row = Auth.query.filter_by(is_revoked=False).first()
            api_key = get_api_key_for_tradingview(auth_row.name) if auth_row and auth_row.name else None
            if not api_key:
                time.sleep(15.0)
                continue

            today = datetime.now(ist).date()
            start_1m = (today - timedelta(days=5)).strftime("%Y-%m-%d")
            end_1m = today.strftime("%Y-%m-%d")

            for uid, spot_exch, fo_exch in _SCALPER_PREWARM_UNDERLYINGS:
                # 1. Ensure SPOT 1m is warm
                spot_key = (uid, spot_exch, "1m")
                with _history_latest_lock:
                    existing_spot = _history_latest_by_sym_iv.get(spot_key)
                if not existing_spot or time.time() - existing_spot[2] > 240:
                    get_history(
                        symbol=uid,
                        exchange=spot_exch,
                        interval="1m",
                        start_date=start_1m,
                        end_date=end_1m,
                        api_key=api_key,
                        background=True,
                    )
                    time.sleep(0.9)

                # 2. Resolve nearest expiry & ATM CE/PE symbols
                ok_exp, exp_res, _ = get_expiry_dates(
                    symbol=uid, exchange=fo_exch, instrumenttype="options", api_key=api_key
                )
                exp_list = (exp_res.get("data") if isinstance(exp_res, dict) else None) or []
                if not ok_exp or not exp_list:
                    continue
                nearest_exp = str(exp_list[0]).replace("-", "").replace(" ", "").upper()
                ok_chain, chain_res, _ = get_option_chain(
                    underlying=uid,
                    exchange=fo_exch,
                    expiry_date=nearest_exp,
                    strike_count=5,
                    api_key=api_key,
                    with_quotes=False,
                )
                if not ok_chain or not isinstance(chain_res, dict):
                    continue
                chain_rows = chain_res.get("chain") or []
                atm_val = chain_res.get("atm_strike")
                if not chain_rows:
                    continue
                atm_idx = next(
                    (i for i, r in enumerate(chain_rows) if r.get("strike") == atm_val),
                    len(chain_rows) // 2,
                )
                # Warm ATM first, then ATM-1 and ATM+1
                indices_to_warm = [atm_idx]
                if atm_idx - 1 >= 0:
                    indices_to_warm.append(atm_idx - 1)
                if atm_idx + 1 < len(chain_rows):
                    indices_to_warm.append(atm_idx + 1)

                for idx in indices_to_warm:
                    row = chain_rows[idx]
                    for leg_key in ("ce", "pe"):
                        leg = row.get(leg_key) or {}
                        sym = leg.get("symbol")
                        if not sym:
                            continue
                        s_key = (sym.upper(), fo_exch, "1m")
                        with _history_latest_lock:
                            existing_leg = _history_latest_by_sym_iv.get(s_key)
                        if not existing_leg or time.time() - existing_leg[2] > 240:
                            get_history(
                                symbol=sym,
                                exchange=fo_exch,
                                interval="1m",
                                start_date=start_1m,
                                end_date=end_1m,
                                api_key=api_key,
                                background=True,
                            )
                            time.sleep(0.9)

            _save_disk_history_cache(force=True)
        except Exception as e:
            logger.debug(f"Scalper prewarm cycle skipped: {e}")
        time.sleep(60.0)


def start_scalper_prewarmer() -> None:
    global _prewarmer_started
    with _prewarmer_lock:
        if _prewarmer_started:
            return
        _prewarmer_started = True
        t = real_threading.Thread(
            target=_scalper_prewarm_worker, name="scalper-history-prewarmer", daemon=True
        )
        t.start()


start_scalper_prewarmer()

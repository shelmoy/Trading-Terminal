"""Process-wide FYERS pacing for data and account/transaction API categories.

Standard data limits are 5/second and 50/minute; Prime permits 10/second
and 500/minute. Default to Standard and leave headroom below its minute cap.
FYERS_API_PLAN=prime explicitly opts into Prime pacing. Transaction and
account APIs keep their existing independent pacing. A broker 429 installs
a shared cooldown and never causes rapid 50ms retries.

Source: https://support.fyers.in/portal/en/kb/articles/what-are-the-fyers-api-rate-limits-for-standard-and-prime-plans
"""

import os
import threading
import time

from utils.broker_backpressure import BrokerBusyError, cap_server_delay, check_queue_wait

_lock = threading.Lock()
_last_call_time = 0.0
_last_data_call_time = 0.0
_blocked_until = {"data": 0.0, "order": 0.0}

# Preserve account/transaction pacing independently of market-data traffic.
MIN_INTERVAL = 0.125
# FYERS Standard data: 5/sec and 50/min; leave room below both ceilings.
# Prime is explicit opt-in, never inferred from access to a data endpoint.
DATA_MIN_INTERVAL = 0.15 if os.getenv("FYERS_API_PLAN", "standard").lower() == "prime" else 1.35

MAX_RETRIES = 3
BASE_BACKOFF = 1.0  # seconds; exponential fallback when no Retry-After header: 1, 2, 4


def apply_rate_limit(kind="data"):
    """Block the calling thread until it is safe to make another Fyers API call.

    Shared process-wide (module-level lock + timestamp) so every caller
    across broker.fyers.api paces against the same clock, regardless of how
    many separate BrokerData/order_api calls are in flight at once.

    Every caller books the slot after the last one, so a burst queues without
    limit. Under the gthread worker each queued caller holds a request thread,
    so one whose slot is further away than
    ``utils.broker_backpressure.max_queue_wait(kind)`` is refused before it
    books anything. Under eventlet and the dev server there is no bound.

    Args:
        kind: ``"data"``, or ``"order"`` for order placement and changes.

    Raises:
        BrokerBusyError: Under gthread, when the slot is too far away.
    """
    global _last_call_time, _last_data_call_time
    with _lock:
        now = time.time()
        category = "order" if kind == "order" else "data"
        last = _last_call_time if category == "order" else _last_data_call_time
        interval = MIN_INTERVAL if category == "order" else DATA_MIN_INTERVAL
        sleep_time = max(0.0, last + interval - now, _blocked_until[category] - now)
        if category == "data" and sleep_time > 5.0:
            raise BrokerBusyError(
                "FYERS market-data requests are being paced. Please wait before retrying.",
                retry_after=sleep_time,
            )
        check_queue_wait(sleep_time, kind)
        if category == "order":
            _last_call_time = now + sleep_time
        else:
            _last_data_call_time = now + sleep_time

    if sleep_time > 0:
        time.sleep(sleep_time)


def retry_delay_from_headers(headers, attempt, kind="data"):
    """Compute how long to wait before retrying a 429.

    Fyers documents both `Retry-After` (seconds) and `X-Retry-After-Ms`
    (milliseconds) response headers on rate-limited requests -- prefer those
    over a blind exponential guess when present.

    The broker's delay is honoured as asked, except under the gthread worker
    when it is longer than ``max_queue_wait(kind)``: sleeping it there would
    hold a request thread for as long as the broker likes (three retries of a
    60 second Retry-After is three minutes), so the retry is abandoned instead.

    Raises:
        BrokerBusyError: Under gthread, when the broker asks for a longer wait
            than the bound.
    """
    delay = _requested_delay(headers, attempt)
    with _lock:
        category = "order" if kind == "order" else "data"
        _blocked_until[category] = max(_blocked_until[category], time.time() + delay)
    if cap_server_delay(delay, kind) is None:
        raise BrokerBusyError(
            "Fyers asked OpenAlgo to slow down and wait longer than a request "
            "can be held. This request was not retried. Try again in a minute.",
            retry_after=delay,
        )
    return delay


def _requested_delay(headers, attempt):
    retry_after_ms = headers.get("X-Retry-After-Ms") or headers.get("x-retry-after-ms")
    if retry_after_ms:
        try:
            return max(float(retry_after_ms) / 1000.0, BASE_BACKOFF * 2**attempt)
        except ValueError:
            pass

    retry_after = headers.get("Retry-After") or headers.get("retry-after")
    if retry_after:
        try:
            return max(float(retry_after), BASE_BACKOFF * 2**attempt)
        except ValueError:
            pass

    return BASE_BACKOFF * (2**attempt)

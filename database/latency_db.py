import logging
import os
from datetime import datetime, timedelta

from sqlalchemy import JSON, Column, DateTime, Float, Integer, String, create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import scoped_session, sessionmaker
from sqlalchemy.pool import NullPool
from sqlalchemy.sql import func

from utils.thread_safe_cache import LockedTTLCache

logger = logging.getLogger(__name__)

# Use a separate database for latency logs
LATENCY_DATABASE_URL = os.getenv("LATENCY_DATABASE_URL", "sqlite:///db/latency.db")

# Conditionally create engine based on DB type
if LATENCY_DATABASE_URL and "sqlite" in LATENCY_DATABASE_URL:
    # SQLite: Use NullPool to prevent connection pool exhaustion
    latency_engine = create_engine(
        LATENCY_DATABASE_URL, poolclass=NullPool, connect_args={"check_same_thread": False}
    )
else:
    # For other databases like PostgreSQL, use connection pooling
    latency_engine = create_engine(
        LATENCY_DATABASE_URL, pool_size=50, max_overflow=100, pool_timeout=10
    )

latency_session = scoped_session(
    sessionmaker(autocommit=False, autoflush=False, bind=latency_engine)
)

# Percentiles need raw values in Python (numpy), so those queries are bounded
# to a recent window — order latency rows are kept forever and an unbounded
# fetch grows with the install's lifetime. Aggregates (counts/averages/SLA)
# remain all-time SQL aggregations.
PERCENTILE_WINDOW_DAYS = 30

# The dashboard polls stats; cache the computed result briefly so polling
# does not re-scan the table on every request.
_stats_cache = LockedTTLCache(maxsize=16, ttl=5)
LatencyBase = declarative_base()
LatencyBase.query = latency_session.query_property()


def get_ist_today_cutoff():
    """Returns the UTC datetime corresponding to 00:00:00 IST today."""
    try:
        import pytz

        ist = pytz.timezone("Asia/Kolkata")
        now_ist = datetime.now(ist)
        start_of_today_ist = now_ist.replace(hour=0, minute=0, second=0, microsecond=0)
        return start_of_today_ist.astimezone(pytz.utc).replace(tzinfo=None)
    except Exception:
        now_utc = datetime.utcnow()
        now_ist_approx = now_utc + timedelta(hours=5, minutes=30)
        start_ist_approx = now_ist_approx.replace(hour=0, minute=0, second=0, microsecond=0)
        return start_ist_approx - timedelta(hours=5, minutes=30)



class OrderLatency(LatencyBase):
    """Model for tracking end-to-end order execution latency"""

    __tablename__ = "order_latency"

    id = Column(Integer, primary_key=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    order_id = Column(String(100), nullable=False)
    user_id = Column(Integer)
    broker = Column(String(50))
    symbol = Column(String(50))
    order_type = Column(String(20))  # MARKET, LIMIT, etc.

    # Round-trip time (comparable to Postman/Bruno)
    rtt_ms = Column(Float)

    # Our processing overhead
    validation_latency_ms = Column(Float)  # Pre-request processing
    response_latency_ms = Column(Float)  # Post-response processing
    overhead_ms = Column(Float)  # Total overhead

    # Total time including overhead
    total_latency_ms = Column(Float, nullable=False)

    # Request details
    request_body = Column(JSON)  # Original request
    response_body = Column(JSON)  # Broker response
    status = Column(String(20))  # SUCCESS, FAILED, PARTIAL
    error = Column(String(500))  # Error message if any

    @staticmethod
    def log_latency(
        order_id,
        user_id,
        broker,
        symbol,
        order_type,
        latencies,
        request_body,
        response_body,
        status,
        error=None,
    ):
        """Log order execution latency"""
        try:
            # The error column is a String, but callers may hand us a non-string
            # payload — e.g. a failed request's response "message" can be a
            # marshmallow validation-errors dict ({'symbol': ['Missing data...']}).
            # SQLite cannot bind a dict/list to a text column, so coerce any
            # non-string error to str and bound it to the column width.
            if error is not None and not isinstance(error, str):
                error = str(error)
            if isinstance(error, str) and len(error) > 500:
                error = error[:500]

            log = OrderLatency(
                order_id=order_id,
                user_id=user_id,
                broker=broker,
                symbol=symbol,
                order_type=order_type,
                rtt_ms=latencies.get("rtt", 0),
                validation_latency_ms=latencies.get("validation", 0),
                response_latency_ms=latencies.get("broker_response", 0),
                overhead_ms=latencies.get("overhead", 0),
                total_latency_ms=latencies.get("total", 0),
                request_body=request_body,
                response_body=response_body,
                status=status,
                error=error,
            )
            latency_session.add(log)
            latency_session.commit()
            _stats_cache.clear()
            return True
        except Exception as e:
            logger.exception(f"Error logging latency: {str(e)}")
            latency_session.rollback()
            return False

    @staticmethod
    def get_recent_logs(limit=100, time_range="today"):
        """Get recent latency logs ordered by timestamp, optionally filtered by time_range."""
        try:
            query = OrderLatency.query
            if time_range == "today":
                cutoff = get_ist_today_cutoff()
                query = query.filter(OrderLatency.timestamp >= cutoff)
            elif time_range == "7d":
                cutoff = datetime.utcnow() - timedelta(days=7)
                query = query.filter(OrderLatency.timestamp >= cutoff)

            query = query.order_by(OrderLatency.timestamp.desc())
            if limit is not None:
                query = query.limit(limit)
            return query.all()
        except Exception as e:
            logger.exception(f"Error getting recent latency logs: {str(e)}")
            return []

    @staticmethod
    def reset_latency(scope="today"):
        """Reset latency logs: 'today' deletes records from today's IST session; 'all' deletes all."""
        try:
            if scope == "today":
                cutoff = get_ist_today_cutoff()
                deleted = (
                    latency_session.query(OrderLatency)
                    .filter(OrderLatency.timestamp >= cutoff)
                    .delete(synchronize_session=False)
                )
            else:
                deleted = latency_session.query(OrderLatency).delete(synchronize_session=False)

            latency_session.commit()
            _stats_cache.clear()
            logger.info(f"Reset {scope} latency logs: {deleted} rows removed")
            return deleted
        except Exception as e:
            logger.exception(f"Error resetting latency logs: {e}")
            latency_session.rollback()
            return 0

    @staticmethod
    def get_latency_stats(time_range="today"):
        """Get latency statistics for the given time range ('today', '7d', 'all'). Defaults to 'today' (resets daily)."""
        cache_key = f"stats_{time_range}"
        cached = _stats_cache.get(cache_key)
        if cached is not None:
            return cached

        try:
            import numpy as np
            import pytz
            from sqlalchemy import case, func

            cutoff = None
            if time_range == "today":
                cutoff = get_ist_today_cutoff()
            elif time_range == "7d":
                cutoff = datetime.utcnow() - timedelta(days=7)

            percentile_cutoff = (
                cutoff if cutoff is not None else (datetime.utcnow() - timedelta(days=PERCENTILE_WINDOW_DAYS))
            )

            # Query overall stats with optional cutoff
            query = latency_session.query(
                func.count(OrderLatency.id).label("total"),
                func.sum(case((OrderLatency.status == "FAILED", 1), else_=0)).label("failed"),
                func.avg(OrderLatency.rtt_ms).label("avg_rtt"),
                func.avg(OrderLatency.overhead_ms).label("avg_overhead"),
                func.avg(OrderLatency.total_latency_ms).label("avg_total"),
                func.min(OrderLatency.total_latency_ms).label("min_total"),
                func.max(OrderLatency.total_latency_ms).label("max_total"),
                func.sum(case((OrderLatency.total_latency_ms < 100, 1), else_=0)).label("under_100"),
                func.sum(case((OrderLatency.total_latency_ms < 150, 1), else_=0)).label("under_150"),
                func.sum(case((OrderLatency.total_latency_ms < 200, 1), else_=0)).label("under_200"),
            )
            if cutoff is not None:
                query = query.filter(OrderLatency.timestamp >= cutoff)

            overall_stats = query.first()

            total_orders = overall_stats.total or 0
            failed_orders = overall_stats.failed or 0
            avg_rtt = overall_stats.avg_rtt or 0
            avg_overhead = overall_stats.avg_overhead or 0
            avg_total = overall_stats.avg_total or 0
            min_total = overall_stats.min_total or 0
            max_total = overall_stats.max_total or 0
            orders_under_100ms = overall_stats.under_100 or 0
            orders_under_150ms = overall_stats.under_150 or 0
            orders_under_200ms = overall_stats.under_200 or 0

            # Calculate SLA percentages
            sla_100ms = (orders_under_100ms / total_orders * 100) if total_orders else 0
            sla_150ms = (orders_under_150ms / total_orders * 100) if total_orders else 0
            sla_200ms = (orders_under_200ms / total_orders * 100) if total_orders else 0

            p50_total = p90_total = p95_total = p99_total = 0
            if total_orders > 0:
                p_query = latency_session.query(OrderLatency.total_latency_ms).filter(
                    OrderLatency.total_latency_ms.isnot(None),
                    OrderLatency.timestamp >= percentile_cutoff,
                )
                total_latencies = [row[0] for row in p_query.all()]

                if total_latencies:
                    p50_total = float(np.percentile(total_latencies, 50))
                    p90_total = float(np.percentile(total_latencies, 90))
                    p95_total = float(np.percentile(total_latencies, 95))
                    p99_total = float(np.percentile(total_latencies, 99))

            # Broker stats query
            broker_query = (
                latency_session.query(
                    OrderLatency.broker,
                    func.count(OrderLatency.id).label("total"),
                    func.sum(case((OrderLatency.status == "FAILED", 1), else_=0)).label("failed"),
                    func.avg(OrderLatency.rtt_ms).label("avg_rtt"),
                    func.avg(OrderLatency.overhead_ms).label("avg_overhead"),
                    func.avg(OrderLatency.total_latency_ms).label("avg_total"),
                    func.sum(case((OrderLatency.total_latency_ms < 150, 1), else_=0)).label("under_150"),
                )
                .filter(OrderLatency.broker.isnot(None))
            )
            if cutoff is not None:
                broker_query = broker_query.filter(OrderLatency.timestamp >= cutoff)
            broker_agg = broker_query.group_by(OrderLatency.broker).all()

            broker_stats = {}
            broker_latencies = {}
            if broker_agg:
                broker_names = [b.broker for b in broker_agg]
                b_lat_query = (
                    latency_session.query(OrderLatency.broker, OrderLatency.total_latency_ms)
                    .filter(
                        OrderLatency.broker.in_(broker_names),
                        OrderLatency.total_latency_ms.isnot(None),
                        OrderLatency.timestamp >= percentile_cutoff,
                    )
                )
                for row in b_lat_query.all():
                    if row.broker not in broker_latencies:
                        broker_latencies[row.broker] = []
                    broker_latencies[row.broker].append(row.total_latency_ms)

            for broker_row in broker_agg:
                broker = broker_row.broker
                broker_total = broker_row.total or 0
                broker_under_150 = broker_row.under_150 or 0
                broker_sla = (broker_under_150 / broker_total * 100) if broker_total else 0

                broker_p50 = broker_p99 = 0
                if broker in broker_latencies and broker_latencies[broker]:
                    broker_p50 = float(np.percentile(broker_latencies[broker], 50))
                    broker_p99 = float(np.percentile(broker_latencies[broker], 99))

                broker_stats[broker] = {
                    "total_orders": broker_total,
                    "failed_orders": broker_row.failed or 0,
                    "avg_rtt": float(broker_row.avg_rtt or 0),
                    "avg_overhead": float(broker_row.avg_overhead or 0),
                    "avg_total": float(broker_row.avg_total or 0),
                    "p50_total": broker_p50,
                    "p99_total": broker_p99,
                    "sla_150ms": broker_sla,
                }

            ist = pytz.timezone("Asia/Kolkata")
            now_ist = datetime.now(ist)

            stats = {
                "time_range": time_range,
                "session_date": now_ist.strftime("%d-%m-%Y"),
                "daily_reset_time": "00:00 IST",
                "total_orders": total_orders,
                "failed_orders": failed_orders,
                "success_rate": ((total_orders - failed_orders) / total_orders * 100)
                if total_orders
                else 0,
                "avg_rtt": float(avg_rtt),
                "avg_overhead": float(avg_overhead),
                "avg_total": float(avg_total),
                "min_total": float(min_total),
                "max_total": float(max_total),
                "p50_total": float(p50_total),
                "p90_total": float(p90_total),
                "p95_total": float(p95_total),
                "p99_total": float(p99_total),
                "sla_100ms": float(sla_100ms),
                "sla_150ms": float(sla_150ms),
                "sla_200ms": float(sla_200ms),
                "broker_stats": broker_stats,
            }
            _stats_cache[cache_key] = stats
            return stats
        except Exception as e:
            logger.exception(f"Error getting latency stats: {str(e)}")
            return {
                "time_range": time_range,
                "session_date": "",
                "daily_reset_time": "00:00 IST",
                "total_orders": 0,
                "failed_orders": 0,
                "success_rate": 0,
                "avg_rtt": 0,
                "avg_overhead": 0,
                "avg_total": 0,
                "min_total": 0,
                "max_total": 0,
                "p50_total": 0,
                "p90_total": 0,
                "p95_total": 0,
                "p99_total": 0,
                "sla_100ms": 0,
                "sla_150ms": 0,
                "sla_200ms": 0,
                "broker_stats": {},
            }


def init_latency_db():
    """Initialize the latency database"""
    # Extract directory from database URL and create if it doesn't exist
    db_path = LATENCY_DATABASE_URL.replace("sqlite:///", "")
    db_dir = os.path.dirname(db_path)
    if db_dir:
        os.makedirs(db_dir, exist_ok=True)

    from database.db_init_helper import init_db_with_logging

    init_db_with_logging(LatencyBase, latency_engine, "Latency DB", logger)


def purge_old_data_logs(days=7):
    """
    Purge non-order endpoint latency logs older than specified days.
    Order execution logs (PLACE, SMART, MODIFY, CANCEL, etc.) are kept forever.
    """
    # Order types to keep forever. Must stay in step with the set in
    # utils.latency_monitor: a type present there but missing here is purged
    # after a week despite being an order.
    ORDER_TYPES = {
        "PLACE",
        "SMART",
        "MODIFY",
        "CANCEL",
        "CLOSE",
        "CANCEL_ALL",
        "BASKET",
        "SPLIT",
        "OPTIONS",
        "OPTIONS_MULTI",
        "GTT_PLACE",
        "GTT_MODIFY",
        "GTT_CANCEL",
    }

    try:
        from datetime import timedelta

        cutoff = datetime.utcnow() - timedelta(days=days)

        # Delete non-order logs older than cutoff
        deleted = (
            latency_session.query(OrderLatency)
            .filter(OrderLatency.timestamp < cutoff, ~OrderLatency.order_type.in_(ORDER_TYPES))
            .delete(synchronize_session=False)
        )

        latency_session.commit()
        logger.debug(f"Purged {deleted} old data endpoint latency logs (older than {days} days)")
        return deleted
    except Exception as e:
        logger.exception(f"Error purging old latency logs: {str(e)}")
        latency_session.rollback()
        return 0

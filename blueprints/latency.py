import csv
import io
from collections import defaultdict
from datetime import datetime

import numpy as np
import pytz
from flask import Blueprint, Response, jsonify, render_template, request, session
from sqlalchemy import func

from database.latency_db import OrderLatency, get_ist_today_cutoff, latency_session
from limiter import limiter
from utils.logging import get_logger
from utils.session import check_session_validity

logger = get_logger(__name__)

latency_bp = Blueprint("latency_bp", __name__, url_prefix="/latency")


def convert_to_ist(timestamp):
    """Convert UTC timestamp to IST"""
    if isinstance(timestamp, str):
        timestamp = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    utc = pytz.timezone("UTC")
    ist = pytz.timezone("Asia/Kolkata")
    if timestamp.tzinfo is None:
        timestamp = utc.localize(timestamp)
    return timestamp.astimezone(ist)


def format_ist_time(timestamp):
    """Format timestamp in IST with 12-hour format"""
    ist_time = convert_to_ist(timestamp)
    return ist_time.strftime("%d-%m-%Y %I:%M:%S %p")


def get_histogram_data(broker=None, time_range="today"):
    """Get histogram data for RTT distribution"""
    try:
        query = OrderLatency.query
        if time_range == "today":
            cutoff = get_ist_today_cutoff()
            query = query.filter(OrderLatency.timestamp >= cutoff)
        elif time_range == "7d":
            from datetime import timedelta

            cutoff = datetime.utcnow() - timedelta(days=7)
            query = query.filter(OrderLatency.timestamp >= cutoff)

        if broker:
            query = query.filter_by(broker=broker)

        # Get all RTT values
        rtts = [
            r[0]
            for r in query.with_entities(OrderLatency.rtt_ms)
            .filter(OrderLatency.rtt_ms.isnot(None))
            .all()
        ]

        if not rtts:
            return {"bins": [], "counts": [], "avg_rtt": 0, "min_rtt": 0, "max_rtt": 0}

        # Calculate statistics
        avg_rtt = sum(rtts) / len(rtts)
        min_rtt = min(rtts)
        max_rtt = max(rtts)

        # Create histogram bins
        bin_count = min(30, max(5, len(rtts) // 2))
        bin_width = (max_rtt - min_rtt) / bin_count if max_rtt > min_rtt else 1

        # Create histogram using numpy
        counts, bins = np.histogram(rtts, bins=bin_count, range=(min_rtt, max_rtt))

        # Convert to list for JSON serialization
        counts = counts.tolist()
        bins = bins.tolist()

        # Create bin labels (use the start of each bin)
        bin_labels = [f"{bins[i]:.1f}" for i in range(len(bins) - 1)]

        data = {
            "bins": bin_labels,
            "counts": counts,
            "avg_rtt": float(avg_rtt),
            "min_rtt": float(min_rtt),
            "max_rtt": float(max_rtt),
        }

        # logger.info(f"Histogram data for broker {broker}: {data}")  # Commented out to reduce log verbosity
        return data

    except Exception as e:
        logger.exception(f"Error getting histogram data: {e}")
        return {"bins": [], "counts": [], "avg_rtt": 0, "min_rtt": 0, "max_rtt": 0}


def generate_csv(logs):
    """Generate CSV file from latency logs with trader-friendly column names"""
    output = io.StringIO()
    writer = csv.writer(output)

    # Write header with accurate, trader-friendly names
    writer.writerow(
        [
            "Date & Time (IST)",
            "Broker",
            "Order ID",
            "Symbol",
            "Order Type",
            "Broker Confirmation (ms)",
            "Platform Overhead (ms)",
            "Total Latency (ms)",
            "Status",
            "Error (if any)",
        ]
    )

    # Write data
    for log in logs:
        writer.writerow(
            [
                format_ist_time(log.timestamp),
                log.broker or "N/A",
                log.order_id,
                log.symbol or "N/A",
                log.order_type,
                round(log.rtt_ms, 2),
                round(log.overhead_ms, 2),
                round(log.total_latency_ms, 2),
                log.status,
                log.error or "",
            ]
        )

    return output.getvalue()


@latency_bp.route("/", methods=["GET"])
@check_session_validity
@limiter.limit("60/minute")
def latency_dashboard():
    """Display latency monitoring dashboard"""
    stats = OrderLatency.get_latency_stats()
    recent_logs = OrderLatency.get_recent_logs(limit=100)

    # Get histogram data for each broker
    broker_histograms = {}
    brokers = [b[0] for b in OrderLatency.query.with_entities(OrderLatency.broker).distinct().all()]
    for broker in brokers:
        if broker:  # Skip None values
            broker_histograms[broker] = get_histogram_data(broker)

    # logger.info(f"Broker histograms data: {broker_histograms}")  # Commented out to reduce log verbosity

    # Format timestamps in IST and convert to JSON-serializable format
    logs_json = []
    for log in recent_logs:
        log.formatted_timestamp = format_ist_time(log.timestamp)
        logs_json.append(
            {
                "id": log.id,
                "order_id": log.order_id,
                "broker": log.broker,
                "symbol": log.symbol,
                "order_type": log.order_type,
                "rtt_ms": log.rtt_ms,
                "validation_latency_ms": log.validation_latency_ms,
                "response_latency_ms": log.response_latency_ms,
                "overhead_ms": log.overhead_ms,
                "total_latency_ms": log.total_latency_ms,
                "status": log.status,
                "error": log.error,
                "timestamp": convert_to_ist(log.timestamp).isoformat(),
            }
        )

    return render_template(
        "latency/dashboard.html",
        stats=stats,
        logs=recent_logs,
        logs_json=logs_json,
        broker_histograms=broker_histograms,
    )


@latency_bp.route("/api/logs", methods=["GET"])
@check_session_validity
@limiter.limit("60/minute")
def get_logs():
    """API endpoint to get latency logs (supports ?range=today|7d|all)"""
    try:
        time_range = request.args.get("range", "today")
        limit = min(int(request.args.get("limit", 100)), 1000)
        logs = OrderLatency.get_recent_logs(limit=limit, time_range=time_range)
        return jsonify(
            [
                {
                    "timestamp": convert_to_ist(log.timestamp).isoformat(),
                    "id": log.id,
                    "order_id": log.order_id,
                    "broker": log.broker,
                    "symbol": log.symbol,
                    "order_type": log.order_type,
                    "rtt_ms": log.rtt_ms,
                    "validation_latency_ms": log.validation_latency_ms,
                    "response_latency_ms": log.response_latency_ms,
                    "overhead_ms": log.overhead_ms,
                    "total_latency_ms": log.total_latency_ms,
                    "status": log.status,
                    "error": log.error,
                }
                for log in logs
            ]
        )
    except Exception as e:
        logger.exception(f"Error fetching latency logs: {e}")
        return jsonify({"error": str(e)}), 500


@latency_bp.route("/api/stats", methods=["GET"])
@check_session_validity
@limiter.limit("60/minute")
def get_stats():
    """API endpoint to get latency statistics (supports ?range=today|7d|all, defaults to 'today')"""
    try:
        time_range = request.args.get("range", "today")
        stats = OrderLatency.get_latency_stats(time_range=time_range)

        # Add histogram data for each broker
        broker_histograms = {}
        for broker in stats.get("broker_stats", {}):
            broker_histograms[broker] = get_histogram_data(broker, time_range=time_range)

        stats["broker_histograms"] = broker_histograms
        # Overall histogram for all orders in this time range
        stats["overall_histogram"] = get_histogram_data(time_range=time_range)
        return jsonify(stats)
    except Exception as e:
        logger.exception(f"Error fetching latency stats: {e}")
        return jsonify({"error": str(e)}), 500


@latency_bp.route("/api/broker/<broker>/stats", methods=["GET"])
@check_session_validity
@limiter.limit("60/minute")
def get_broker_stats(broker):
    """API endpoint to get broker-specific latency statistics"""
    try:
        time_range = request.args.get("range", "today")
        stats = OrderLatency.get_latency_stats(time_range=time_range)
        broker_stats = stats.get("broker_stats", {}).get(broker, {})
        if not broker_stats:
            return jsonify({"error": "Broker not found"}), 404

        # Add histogram data
        broker_stats["histogram"] = get_histogram_data(broker, time_range=time_range)
        return jsonify(broker_stats)
    except Exception as e:
        logger.exception(f"Error fetching broker stats: {e}")
        return jsonify({"error": str(e)}), 500


@latency_bp.route("/api/reset", methods=["POST"])
@check_session_validity
@limiter.limit("10/minute")
def reset_logs():
    """Reset latency tracking records (scope: 'today' or 'all')"""
    try:
        data = request.get_json(silent=True) or {}
        scope = data.get("scope", "today")
        deleted = OrderLatency.reset_latency(scope=scope)
        return jsonify(
            {
                "status": "success",
                "message": f"Successfully reset {scope} latency logs ({deleted} records removed)",
                "deleted": deleted,
            }
        )
    except Exception as e:
        logger.exception(f"Error resetting latency logs: {e}")
        return jsonify({"error": str(e)}), 500


@latency_bp.route("/export", methods=["GET"])
@check_session_validity
@limiter.limit("10/minute")
def export_logs():
    """Export latency logs to CSV (supports ?range=today|7d|all)"""
    try:
        time_range = request.args.get("range", "today")
        # Get all logs for the specified time range
        logs = OrderLatency.get_recent_logs(limit=None, time_range=time_range)

        # Generate CSV
        csv_data = generate_csv(logs)

        # Create the response
        response = Response(
            csv_data,
            mimetype="text/csv",
            headers={"Content-Disposition": f"attachment; filename=latency_logs_{time_range}.csv"},
        )

        return response

    except Exception as e:
        logger.exception(f"Error exporting latency logs: {e}")
        return jsonify({"error": str(e)}), 500


@latency_bp.teardown_app_request
def shutdown_session(exception=None):
    latency_session.remove()

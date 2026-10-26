"""Isolated HSM binary decoder regressions; no app, sockets or order APIs."""
import ast
import logging
from pathlib import Path
import struct

import pytest

SOURCE = Path(__file__).resolve().parents[1] / "broker/fyers/streaming/fyers_hsm_websocket.py"


def decoder():
    tree = ast.parse(SOURCE.read_text(encoding="utf-8"))
    # Importing auth_db starts application resources; the decoder does not need it.
    tree.body = [n for n in tree.body if not (isinstance(n, ast.ImportFrom)
        and n.module in ("database.auth_db", "utils.logging"))]
    scope = {"get_logger": logging.getLogger}
    exec(compile(tree, str(SOURCE), "exec"), scope)
    feed = scope["FyersHSMWebSocket"].__new__(scope["FyersHSMWebSocket"])
    feed.disconnect = lambda: None
    feed.logger = logging.getLogger("decoder-test")
    feed.subscriptions = {}; feed.index_data = {}; feed.scrips_data = {}; feed.depth_data = {}
    feed.symbol_mappings = {"if|nse_cm|Nifty 50": "NSE:NIFTY50-INDEX",
        "if|bse_cm|SENSEX": "BSE:SENSEX-INDEX"}
    feed.on_message_callback = lambda data: None
    return feed


def snapshot(topic_id, topic, ltp):
    topic_bytes = topic.encode()
    fields = struct.pack(">6i", ltp, ltp-100, ltp+100, ltp-200, ltp-50, 0)
    strings = ("nse_cm", "26000", "Nifty 50") if "nse_cm" in topic else ("bse_cm", "1", "SENSEX")
    trailer = b"\0\0" + struct.pack(">HB", 1, 2)
    for text in strings:
        value = text.encode(); trailer += bytes([len(value)]) + value
    return b"S" + struct.pack("H", topic_id) + bytes([len(topic_bytes)]) + topic_bytes + b"\x06" + fields + trailer


def frame(*packets):
    return bytearray(b"\0" * 7 + struct.pack("!H", len(packets)) + b"".join(packets))


@pytest.mark.parametrize("reverse", [False, True])
def test_batched_index_snapshots_and_following_updates(reverse):
    feed = decoder(); received = []
    feed.on_message_callback = lambda data: received.append(dict(data))
    packets = [snapshot(11, "if|nse_cm|Nifty 50", 2250000), snapshot(12, "if|bse_cm|SENSEX", 7300000)]
    feed._parse_data_feed(frame(*(packets[::-1] if reverse else packets)))
    assert set(feed.index_data) == {11, 12}
    assert len(received) == 2
    assert received[0]["multiplier"] == 1
    assert received[0]["precision"] == 2
    assert {r["original_symbol"] for r in received} == {"NSE:NIFTY50-INDEX", "BSE:SENSEX-INDEX"}
    updates = [b"U" + struct.pack("H", topic) + b"\x01" + struct.pack(">i", price)
        for topic, price in [(11,2250125),(12,7300250)]]
    feed._parse_data_feed(frame(*updates))
    assert feed.index_data[11]["ltp"] == 2250125
    assert feed.index_data[12]["ltp"] == 7300250
    assert {r["original_symbol"] for r in received[2:]} == {"NSE:NIFTY50-INDEX", "BSE:SENSEX-INDEX"}


@pytest.mark.parametrize("cut", [1, 5, 12])
def test_truncated_index_snapshot_does_not_publish_partial_state(cut):
    feed = decoder(); received = []
    feed.on_message_callback = received.append
    packet = snapshot(11, "if|nse_cm|Nifty 50", 2250000)
    feed._parse_data_feed(frame(packet[:-cut]))
    assert not received
    assert not feed.index_data

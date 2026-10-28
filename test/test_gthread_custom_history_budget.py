"""The custom chart burst preserves sustained broker pacing and releases DBs."""

from types import SimpleNamespace

import pytest
from sqlalchemy import Boolean, Column, Integer, String, event
from sqlalchemy.orm import declarative_base, scoped_session, sessionmaker

from database import auth_db
from database.engine_factory import create_db_engine
from services import history_service as hs
from utils import runtime
from utils.broker_backpressure import BrokerBusyError


@pytest.fixture
def clock(monkeypatch):
    now = [1000.0]
    waits = []
    monkeypatch.setattr(hs, "time", SimpleNamespace(monotonic=lambda: now[0], sleep=waits.append))
    monkeypatch.setattr(hs, "_next_history_slot", 0.0)
    monkeypatch.setattr(hs, "_next_history_admission", 0.0)
    return now, waits


def test_three_pane_burst_does_not_add_sustained_request_capacity(clock):
    _now, waits = clock
    for _ in range(9):
        hs._enforce_rate_limit()
    assert len(waits) == 8
    assert waits[:2] == pytest.approx([0.03, 0.06])
    # Request four already waits a full ticket; no fourth immediate call.
    assert waits[2] >= hs._MIN_HISTORY_INTERVAL - 1e-9
    assert waits[-1] >= 6 * hs._MIN_HISTORY_INTERVAL - 1e-9
    assert all(b - a >= hs._MIN_HISTORY_INTERVAL - 1e-9 for a, b in zip(waits[2:], waits[3:], strict=False))


def test_background_work_cannot_borrow_the_chart_burst(clock):
    _now, waits = clock
    for _ in range(4):
        hs._enforce_rate_limit(background=True)
    assert waits == pytest.approx([0.35, 0.70, 1.05])


def test_queue_refusal_changes_neither_reservation_clock(clock, monkeypatch):
    monkeypatch.setattr(runtime, "gthread_active", lambda: True)
    monkeypatch.setattr(hs, "_next_history_slot", 1030.0)
    monkeypatch.setattr(hs, "_next_history_admission", 1020.0)
    with pytest.raises(BrokerBusyError):
        hs._enforce_rate_limit()
    assert hs._next_history_slot == 1030.0
    assert hs._next_history_admission == 1020.0
    assert clock[1] == []


def test_idle_recovery_still_admits_a_fresh_three_pane_burst(clock):
    now, waits = clock
    for _ in range(8):
        hs._enforce_rate_limit()
    now[0] += 60
    waits.clear()
    for _ in range(3):
        hs._enforce_rate_limit()
    assert waits == pytest.approx([0.03, 0.06])


@pytest.mark.parametrize("failure", [False, True])
def test_prewarm_auth_releases_real_connections_on_success_and_failure(tmp_path, monkeypatch, failure):
    engine = create_db_engine("sqlite:///" + str(tmp_path / "prewarm-auth.db"))
    Base = declarative_base()

    class Auth(Base):
        __tablename__ = "prewarm_auth"
        id = Column(Integer, primary_key=True)
        name = Column(String)
        broker = Column(String)
        is_revoked = Column(Boolean, default=False)

    session = scoped_session(sessionmaker(bind=engine))
    Auth.query = session.query_property()
    Base.metadata.create_all(engine)
    with session() as seed:
        seed.add(Auth(name="test-user", broker="fyers", is_revoked=False))
        seed.commit()
    session.remove()
    counters = {"out": 0, "in": 0}
    event.listen(engine, "checkout", lambda *args: counters.__setitem__("out", counters["out"] + 1))
    event.listen(engine, "checkin", lambda *args: counters.__setitem__("in", counters["in"] + 1))
    monkeypatch.setattr(auth_db, "db_session", session)
    monkeypatch.setattr(auth_db, "Auth", Auth)

    def key(_user):
        if failure:
            raise RuntimeError("simulated key read failure")
        return "test-only-key"

    monkeypatch.setattr(auth_db, "get_api_key_for_tradingview", key)
    try:
        for _ in range(100):
            if failure:
                with pytest.raises(RuntimeError, match="simulated"):
                    hs._scalper_prewarm_auth()
            else:
                assert hs._scalper_prewarm_auth() == ("test-only-key", "fyers")
            assert not session.registry.has()
            assert counters["in"] == counters["out"]
        assert counters["out"] == 100
    finally:
        session.remove()
        engine.dispose()


@pytest.mark.parametrize("gthread", [False, True])
def test_fyers_data_budget_does_not_consume_order_capacity(monkeypatch, gthread):
    from broker.fyers.api import rate_limiter as limiter

    waits = []
    monkeypatch.setattr(runtime, "gthread_active", lambda: gthread)
    monkeypatch.setattr(limiter, "time", SimpleNamespace(time=lambda: 1000.0, sleep=waits.append))
    monkeypatch.setattr(limiter, "_last_data_call_time", 1010.0)
    monkeypatch.setattr(limiter, "_last_call_time", 0.0)
    monkeypatch.setattr(limiter, "_blocked_until", {"data": 0.0, "order": 0.0})
    with pytest.raises(BrokerBusyError):
        limiter.apply_rate_limit("data")
    assert limiter._last_data_call_time == 1010.0
    assert waits == []
    limiter.apply_rate_limit("order")
    assert limiter._last_call_time == 1000.0
    assert waits == []

"""Chart execution tests use disposable SQLite and a fake dispatch, never broker APIs."""

import json
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace

import pytest

from database.chart_commands_db import CommandLedger
from database.engine_factory import create_db_engine
from services.chart_command_service import execute
from utils.chart_commands import CommandRefused, validate_order, version
from utils.chart_execution_context import chart_analyze_mode, chart_execution_mode


@pytest.fixture
def ledger(tmp_path):
    engine = create_db_engine(f"sqlite:///{tmp_path / 'commands.db'}")
    book = CommandLedger(engine)
    book.init_db()
    yield book
    engine.dispose()


def command(**patch):
    return {
        "commandId": str(uuid.uuid4()),
        "issuedAt": time.time(),
        "mode": "analyze",
        "scope": "a",
        "operation": "place",
        "payload": {"symbol": "S", "exchange": "NSE"},
        **patch,
    }


def accepted(_):
    return True, {"status": "success", "orderid": "BROKER1"}, 200


def test_one_dispatch_for_concurrent_releases(ledger):
    calls = []
    draft = command()

    def send(value):
        calls.append(value)
        time.sleep(0.02)
        return accepted(value)

    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(
            pool.map(
                lambda _: execute(draft, scope="a", mode="analyze", ledger=ledger, dispatch=send),
                range(32),
            )
        )
    assert len(calls) == 1
    assert all(body["state"] in ("accepted", "uncertain") for body, _ in results)
    assert (
        execute(draft, scope="a", mode="analyze", ledger=ledger, dispatch=send)[0]["orderId"]
        == "BROKER1"
    )
    assert len(calls) == 1


def test_payload_reuse_refused_and_account_isolated(ledger):
    draft = command()
    assert execute(draft, scope="a", mode="analyze", ledger=ledger, dispatch=accepted)[1] == 200
    changed = {**draft, "payload": {"symbol": "OTHER"}}
    assert execute(changed, scope="a", mode="analyze", ledger=ledger, dispatch=accepted)[1] == 409
    assert execute(changed, scope="b", mode="analyze", ledger=ledger, dispatch=accepted)[1] == 200


def test_uncertain_delivery_never_retries_after_restart(ledger):
    calls = []
    draft = command()

    def timeout(value):
        calls.append(value)
        raise TimeoutError()

    assert (
        execute(draft, scope="a", mode="analyze", ledger=ledger, dispatch=timeout)[0]["state"]
        == "uncertain"
    )
    restarted = CommandLedger(ledger.engine)
    assert execute(draft, scope="a", mode="analyze", ledger=restarted, dispatch=timeout)[1] == 202
    assert len(calls) == 1


def test_crashed_claim_is_not_resent(ledger):
    from utils.chart_commands import command_fingerprint

    draft = command()
    ledger.claim("a", draft["commandId"], command_fingerprint(draft))
    assert (
        execute(
            draft,
            scope="a",
            mode="analyze",
            ledger=ledger,
            dispatch=lambda _: pytest.fail("re-dispatched crash claim"),
        )[0]["state"]
        == "uncertain"
    )


@pytest.mark.parametrize(
    "patch",
    [
        {"mode": "live"},
        {"issuedAt": 0},
        {"issuedAt": float("nan")},
        {"commandId": "bad"},
        {"operation": "reverse"},
    ],
)
def test_refused_before_dispatch(ledger, patch):
    result, code = execute(
        command(**patch),
        scope="a",
        mode="analyze",
        ledger=ledger,
        dispatch=lambda _: pytest.fail("unsafe command reached dispatch"),
    )
    assert result["state"] == "rejected" and code == 409


def test_success_without_broker_id_is_uncertain(ledger):
    body, code = execute(
        command(),
        scope="a",
        mode="analyze",
        ledger=ledger,
        dispatch=lambda _: (True, {"status": "success"}, 200),
    )
    assert code == 202 and body["state"] == "uncertain"


def test_broker_rejection_is_persisted(ledger):
    draft = command()
    body, code = execute(
        draft,
        scope="a",
        mode="analyze",
        ledger=ledger,
        dispatch=lambda _: (False, {"status": "error", "message": "Margin shortfall"}, 400),
    )
    assert code == 400 and body["state"] == "rejected"
    assert json.loads(ledger.read("a", draft["commandId"])["result"]) == body


def test_versions_ignore_marks_but_detect_fills_and_product():
    row = {"symbol": "S", "exchange": "NSE", "quantity": 10, "price": 100, "product": "MIS"}
    assert version(row) == version({**row, "ltp": 105, "pnl": 50})
    for key, value in [
        ("quantity", 5),
        ("product", "CNC"),
        ("filled_quantity", 2),
        ("order_status", "complete"),
    ]:
        assert version(row) != version({**row, key: value})


def test_tick_lot_stop_validation():
    info = SimpleNamespace(lotsize=75, tick_size=0.05)
    data = {
        "symbol": "S",
        "exchange": "NFO",
        "action": "BUY",
        "quantity": 75,
        "product": "NRML",
        "pricetype": "SL",
        "price": 100.05,
        "trigger_price": 100,
    }
    validate_order(data, info)
    for patch in [
        {"quantity": 1},
        {"price": 100.001},
        {"price": 99.95},
        {"product": "CNC"},
        {"exchange": "NSE_INDEX"},
    ]:
        with pytest.raises(CommandRefused):
            validate_order({**data, **patch}, info)


def test_flat_position_does_not_unlock_a_still_working_close_order(ledger):
    draft = command(
        operation="close",
        payload={"symbol": "S", "exchange": "NFO", "product": "NRML", "quantity": 75},
    )
    execute(draft, scope="a", mode="analyze", ledger=ledger, dispatch=accepted)
    row = {
        "symbol": "S",
        "exchange": "NFO",
        "product": "NRML",
        "orderid": "BROKER1",
        "order_status": "open",
    }
    ledger.reconcile("a", [row], [])
    assert ledger.pending("a")
    ledger.reconcile("a", [{**row, "order_status": "complete"}], [])
    assert not ledger.pending("a")


@pytest.mark.parametrize("alive", [True, None])
def test_live_or_unverified_worker_cannot_be_unlocked_by_request_age(ledger, alive):
    draft = command()
    from utils.chart_commands import command_fingerprint

    ledger.claim(
        "a",
        draft["commandId"],
        command_fingerprint(draft),
        intent={**draft, "_worker": {"pid": 42, "startedAt": 1.0}},
    )
    ledger.recover_abandoned("a", alive=lambda _: alive)
    assert ledger.read("a", draft["commandId"])["state"] == "submitting"
    assert ledger.pending("a")


def test_dead_worker_recovers_to_uncertain_without_releasing_or_resending(ledger):
    draft = command()
    from utils.chart_commands import command_fingerprint

    ledger.claim(
        "a",
        draft["commandId"],
        command_fingerprint(draft),
        intent={**draft, "_worker": {"pid": 42, "startedAt": 1.0}},
    )
    ledger.recover_abandoned("other", alive=lambda _: False)
    assert ledger.read("a", draft["commandId"])["state"] == "submitting"
    ledger.recover_abandoned("a", alive=lambda _: False)
    assert ledger.read("a", draft["commandId"])["state"] == "uncertain"
    assert ledger.pending("a")

    def dispatch(_):
        raise AssertionError("Must not resend")

    assert (
        execute(draft, scope="a", mode="analyze", ledger=ledger, dispatch=dispatch)[0]["state"]
        == "uncertain"
    )


def test_context_restores_and_does_not_cross_threads():
    assert chart_analyze_mode() is None
    with chart_execution_mode(True):
        with ThreadPoolExecutor(max_workers=1) as pool:
            assert pool.submit(chart_analyze_mode).result() is None
        with chart_execution_mode(False):
            assert chart_analyze_mode() is False
        assert chart_analyze_mode() is True
    assert chart_analyze_mode() is None


def test_different_ids_cannot_overlap_same_instrument(ledger):
    first = command()
    second = command()
    execute(first, scope="a", mode="analyze", ledger=ledger, dispatch=accepted)
    body, code = execute(
        second,
        scope="a",
        mode="analyze",
        ledger=ledger,
        dispatch=lambda _: pytest.fail("overlapping instrument mutation"),
    )
    assert code == 409 and "pending confirmation" in body["message"]
    # A separate exchange/product is independently executable.
    second["payload"] = {**second["payload"], "exchange": "BSE"}
    assert execute(second, scope="a", mode="analyze", ledger=ledger, dispatch=accepted)[1] == 200


def test_accepted_claim_releases_only_when_book_confirms(ledger):
    first = command()
    execute(first, scope="a", mode="analyze", ledger=ledger, dispatch=accepted)
    ledger.reconcile("a", [], [])
    assert execute(command(), scope="a", mode="analyze", ledger=ledger, dispatch=accepted)[1] == 409
    ledger.reconcile("a", [{**first["payload"], "orderid": "BROKER1", "order_status": "open"}], [])
    assert execute(command(), scope="a", mode="analyze", ledger=ledger, dispatch=accepted)[1] == 200


def test_uncertain_claim_never_guesses_association_from_price(ledger):
    execute(
        command(),
        scope="a",
        mode="analyze",
        ledger=ledger,
        dispatch=lambda _: (True, {"status": "success"}, 200),
    )
    ledger.reconcile("a", [{"orderid": "BROKER1", "order_status": "open", "price": 100}], [])
    assert execute(command(), scope="a", mode="analyze", ledger=ledger, dispatch=accepted)[1] == 409


def test_rejection_releases_resource_but_retains_result(ledger):
    first = command()
    execute(
        first,
        scope="a",
        mode="analyze",
        ledger=ledger,
        dispatch=lambda _: (False, {"status": "error", "message": "Rejected"}, 400),
    )
    assert execute(command(), scope="a", mode="analyze", ledger=ledger, dispatch=accepted)[1] == 200
    assert ledger.read("a", first["commandId"])["state"] == "rejected"


def test_schema_gate_and_non_destructive_initialization(tmp_path):
    engine = create_db_engine(f"sqlite:///{tmp_path / 'new.db'}")
    try:
        book = CommandLedger(engine)
        assert not book.ready()
        book.init_db()
        assert book.ready()
        draft = command()
        execute(draft, scope="a", mode="analyze", ledger=book, dispatch=accepted)
        book.init_db()
        assert book.read("a", draft["commandId"])["state"] == "accepted"
    finally:
        engine.dispose()


def test_freeze_whole_units_and_invalid_master_values():
    info = SimpleNamespace(lotsize=1, tick_size=0.05)
    order = {
        "symbol": "S",
        "exchange": "MCX",
        "action": "BUY",
        "quantity": 10,
        "product": "NRML",
        "pricetype": "LIMIT",
        "price": 100,
    }
    validate_order(order, info, freeze_qty=10)
    with pytest.raises(CommandRefused):
        validate_order({**order, "quantity": 11}, info, freeze_qty=10)
    with pytest.raises(CommandRefused):
        validate_order({**order, "quantity": 1.5}, info)
    with pytest.raises(CommandRefused):
        validate_order({**order, "exchange": "NSE"}, info)
    with pytest.raises(CommandRefused):
        validate_order(order, SimpleNamespace(lotsize=-1, tick_size=0.05))


@pytest.mark.parametrize("identifier", [None, True, 0, "undefined", "null", {}, " ", "not an id"])
def test_malformed_broker_id_never_means_accepted(ledger, identifier):
    body, code = execute(
        command(),
        scope="a",
        mode="analyze",
        ledger=ledger,
        dispatch=lambda _: (True, {"status": "success", "orderid": identifier}, 200),
    )
    assert body["state"] == "uncertain" and code == 202


def test_secret_fields_are_refused_before_durable_claim(ledger):
    draft = command(payload={"symbol": "S", "exchange": "NSE", "apikey": "fake-credential"})
    assert execute(draft, scope="a", mode="analyze", ledger=ledger, dispatch=accepted)[1] == 409
    assert ledger.read("a", draft["commandId"]) is None


def test_ledger_releases_connections_under_repeated_rejected_commands(ledger):
    from sqlalchemy import event

    checked = {"out": 0, "in": 0}
    event.listen(
        ledger.engine, "checkout", lambda *_: checked.__setitem__("out", checked["out"] + 1)
    )
    event.listen(ledger.engine, "checkin", lambda *_: checked.__setitem__("in", checked["in"] + 1))
    for _ in range(100):
        execute(
            command(),
            scope="a",
            mode="analyze",
            ledger=ledger,
            dispatch=lambda _: (False, {"status": "error", "message": "mock rejection"}, 400),
        )
    assert checked["out"] >= 300 and checked["in"] == checked["out"]


def test_migration_preserves_existing_data_and_backup(tmp_path):
    import sqlite3
    from contextlib import closing

    from upgrade.migrate_chart_commands import migrate

    source = tmp_path / "existing.db"
    with closing(sqlite3.connect(source)) as conn:
        conn.execute("CREATE TABLE existing (value TEXT)")
        conn.execute("INSERT INTO existing VALUES ('keep')")
        conn.commit()
    backup = migrate(source, tmp_path / "private-backups")
    for path in (source, backup):
        with closing(sqlite3.connect(path)) as conn:
            assert conn.execute("SELECT value FROM existing").fetchone()[0] == "keep"
            assert conn.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
    with closing(sqlite3.connect(backup)) as conn:
        assert not conn.execute(
            "SELECT name FROM sqlite_master WHERE name='chart_trading_commands'"
        ).fetchone()


def test_relogin_changes_draft_generation_but_retains_uncertain_claim(ledger):
    from utils.chart_commands import execution_scopes

    account, session = execution_scopes("user", "fyers", "configured-app", "daily-token-1", "live")
    renewed, new_session = execution_scopes(
        "user", "fyers", "configured-app", "daily-token-2", "live"
    )
    assert account == renewed and session != new_session
    draft = command(scope=session, mode="live")
    execute(
        draft,
        scope=account,
        mode="live",
        ledger=ledger,
        dispatch=lambda _: (True, {"status": "success"}, 200),
    )
    assert (
        execute(
            command(scope=new_session, mode="live"),
            scope=renewed,
            mode="live",
            ledger=ledger,
            dispatch=accepted,
        )[1]
        == 409
    )
    pending = ledger.pending(account)
    assert len(pending) == 1 and pending[0]["state"] == "uncertain"
    assert "configured-app" not in json.dumps(pending) and "daily-token" not in json.dumps(pending)
    assert execution_scopes("user", "fyers", "different-app", "daily-token-2", "live")[0] != account
    assert (
        execution_scopes("user", "fyers", "configured-app", "daily-token-2", "analyze")[0]
        != account
    )


def test_same_order_id_on_wrong_exchange_cannot_clear_claim(ledger):
    draft = command()
    execute(draft, scope="a", mode="analyze", ledger=ledger, dispatch=accepted)
    ledger.reconcile("a", [{**draft["payload"], "exchange": "BSE", "orderid": "BROKER1"}], [])
    assert len(ledger.pending("a")) == 1


def unresolved(ledger):
    draft = command(
        payload={
            "symbol": "S",
            "exchange": "NFO",
            "product": "NRML",
            "action": "BUY",
            "quantity": 75,
            "pricetype": "MARKET",
        }
    )
    execute(
        draft,
        scope="a",
        mode="analyze",
        ledger=ledger,
        dispatch=lambda _: (True, {"status": "success"}, 200),
    )
    row = {
        **draft["payload"],
        "orderid": "VERIFIED-BROKER-ID",
        "order_status": "open",
        "price": 100,
    }
    row["version"] = version(row)
    return draft, row


def test_explicit_broker_id_resolution_never_resends_order(ledger):
    from services.chart_command_service import resolve_delivery

    draft, row = unresolved(ledger)
    result = resolve_delivery(
        ledger=ledger,
        scope="a",
        command_id=draft["commandId"],
        broker_order_id=row["orderid"],
        expected_version=row["version"],
        books={"orders": [row], "positions": []},
    )
    assert result["state"] == "resolved" and result["brokerState"] == "open"
    assert not ledger.pending("a")
    assert (
        execute(
            draft,
            scope="a",
            mode="analyze",
            ledger=ledger,
            dispatch=lambda _: pytest.fail("replayed resolved mutation"),
        )[0]["state"]
        == "resolved"
    )


@pytest.mark.parametrize(
    "patch",
    [
        {"exchange": "BFO"},
        {"product": "MIS"},
        {"symbol": "OTHER"},
        {"action": "SELL"},
        {"quantity": 150},
        {"version": "changed"},
    ],
)
def test_resolution_requires_unchanged_selected_identity(ledger, patch):
    from services.chart_command_service import resolve_delivery

    draft, row = unresolved(ledger)
    with pytest.raises(CommandRefused):
        resolve_delivery(
            ledger=ledger,
            scope="a",
            command_id=draft["commandId"],
            broker_order_id=row["orderid"],
            expected_version=row["version"],
            books={"orders": [{**row, **patch}], "positions": []},
        )
    assert len(ledger.pending("a")) == 1


def test_absence_or_matching_prices_never_resolves_unknown_delivery(ledger):
    from services.chart_command_service import resolve_delivery

    draft, row = unresolved(ledger)
    for identifier in (None, "OTHER-ID"):
        with pytest.raises(CommandRefused):
            resolve_delivery(
                ledger=ledger,
                scope="a",
                command_id=draft["commandId"],
                broker_order_id=identifier,
                expected_version=row["version"],
                books={"orders": [row], "positions": []},
            )
    assert len(ledger.pending("a")) == 1


def test_submitting_handler_cannot_be_unlocked_while_it_might_complete(ledger):
    from services.chart_command_service import resolve_delivery
    from utils.chart_commands import command_fingerprint

    draft = command()
    ledger.claim("a", draft["commandId"], command_fingerprint(draft), intent=draft)
    with pytest.raises(CommandRefused, match="completed uncertain"):
        resolve_delivery(
            ledger=ledger,
            scope="a",
            command_id=draft["commandId"],
            broker_order_id="B1",
            expected_version="version",
            books={"orders": [], "positions": []},
        )
    assert len(ledger.pending("a")) == 1


def test_resolution_compare_and_set_only_one_wins(ledger):
    from services.chart_command_service import resolve_delivery

    draft, row = unresolved(ledger)

    def resolve(_):
        try:
            return resolve_delivery(
                ledger=ledger,
                scope="a",
                command_id=draft["commandId"],
                broker_order_id=row["orderid"],
                expected_version=row["version"],
                books={"orders": [row], "positions": []},
            )["state"]
        except CommandRefused:
            return "refused"

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(resolve, range(2)))
    assert results.count("resolved") == 1 and results.count("refused") == 1


def test_unavailable_book_is_never_treated_as_no_working_orders():
    from utils.chart_commands import normalize_books

    for orders, positions in [(None, []), ({}, []), ({"orders": None}, []), ([], None)]:
        with pytest.raises(CommandRefused):
            normalize_books(orders, positions)


def test_book_numbers_are_normalized_without_losing_partial_fills():
    from utils.chart_commands import normalize_books

    row = {
        "symbol": "S",
        "exchange": "NFO",
        "product": "NRML",
        "orderid": 123,
        "quantity": "75.0",
        "filled_quantity": "25",
        "price": "100.05",
        "order_status": "partially_filled",
    }
    normalized = normalize_books({"orders": [row]}, [])["orders"][0]
    assert normalized["quantity"] == 75 and normalized["filled_quantity"] == 25
    assert (
        normalized["price"] == 100.05
        and normalized["order_status"] == "partially filled"
        and normalized["orderid"] == "123"
    )
    for value in (None, True, float("nan"), float("inf"), 1.5):
        with pytest.raises(CommandRefused):
            normalize_books([{**row, "quantity": value}], [])


def test_unresolved_claims_are_bounded_without_discarding_unknown_delivery(ledger):
    from utils.chart_commands import command_fingerprint

    for index in range(128):
        draft = command(payload={"symbol": f"S{index}", "exchange": "NSE", "product": "MIS"})
        assert ledger.claim("a", draft["commandId"], command_fingerprint(draft), intent=draft)
    extra = command(payload={"symbol": "OVER_LIMIT", "exchange": "NSE", "product": "MIS"})
    assert not ledger.claim("a", extra["commandId"], command_fingerprint(extra), intent=extra)
    assert len(ledger.pending("a")) == 128


def test_broker_exchange_and_contract_expiry_refusals():
    from utils.chart_commands import validate_broker_capability

    order = {
        "symbol": "S",
        "exchange": "NFO",
        "product": "NRML",
        "quantity": 75,
        "action": "BUY",
        "pricetype": "LIMIT",
        "price": 100,
    }
    with pytest.raises(CommandRefused, match="exchange"):
        validate_broker_capability("kotak", {**order, "exchange": "CDS"})
    validate_broker_capability("fyers", {**order, "exchange": "CDS"})
    for expiry in ("01-JAN-20", "not-a-date"):
        with pytest.raises(CommandRefused):
            validate_order(order, SimpleNamespace(lotsize=75, tick_size=0.05, expiry=expiry))


@pytest.mark.parametrize(
    "payload",
    [
        {"symbol": {"apikey": "fake-secret"}},
        {"quantity": [75]},
        {"price": "NaN"},
        {"quantity": True},
    ],
)
def test_non_contract_values_never_enter_the_journal(ledger, payload):
    draft = command(payload=payload)
    assert execute(draft, scope="a", mode="analyze", ledger=ledger, dispatch=accepted)[1] == 409
    assert ledger.read("a", draft["commandId"]) is None

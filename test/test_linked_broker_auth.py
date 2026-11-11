"""Linked loopback identity and the real server-started broker-login contract.

Only fake accounts/keys and mocked broker authentication are used. No broker
transport or live instance is contacted, and no orders are submitted.
"""

import json
import sqlite3
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from urllib.parse import parse_qs, urlencode, urlsplit

import pytest
from flask import Flask
from test_broker_keys import _app, _csrf
from test_broker_keys import commit as commit
from test_broker_keys import environment as environment
from test_broker_keys import stores as stores

import blueprints.brlogin as brlogin
import database.user_db as user_db
import utils.broker_instances as instances
from blueprints.broker_instances import broker_instances_bp

BASE = "http://127.0.0.1:5001"
PRIMARY = "http://127.0.0.1:5000"


@pytest.fixture
def linked(stores, environment, tmp_path, monkeypatch):
    monkeypatch.setenv("VALID_BROKERS", "kotak,fyers")
    environment.write(
        {
            "BROKER_API_KEY": "FYAPP-100",
            "BROKER_API_SECRET": "fake-fyers-secret",
            "REDIRECT_URL": BASE + "/fyers/callback",
        }
    )
    monkeypatch.setenv("HOST_SERVER", BASE)
    monkeypatch.setenv("BROKER_INSTANCES", json.dumps({"kotak": PRIMARY, "fyers": BASE}))
    primary_db = tmp_path / "primary.db"
    with sqlite3.connect(primary_db) as db:
        db.executescript("""
            CREATE TABLE users(username TEXT,email TEXT,is_admin INTEGER,
                totp_enabled INTEGER,totp_required_for_login INTEGER);
            INSERT INTO users VALUES('trader','test@example.invalid',1,0,0);
            CREATE TABLE active_sessions(username TEXT,session_id TEXT);
            INSERT INTO active_sessions VALUES('trader','primary-device');
            CREATE TABLE session_revocations(username TEXT,revoked_at TEXT,pre_broker_revoked_at TEXT);
        """)
    primary_env = tmp_path / "primary.env"
    primary_env.write_text(
        "HOST_SERVER='" + PRIMARY + "'\nAPP_KEY='primary-test-key'\n"
        "SESSION_COOKIE_NAME='primary_session'\nDATABASE_URL='sqlite:///"
        + primary_db.as_posix()
        + "'\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("BROKER_LOGIN_SOURCE_ENV", str(primary_env))
    monkeypatch.setattr(
        user_db,
        "find_user_by_exact_username",
        lambda username: SimpleNamespace(email="test@example.invalid", is_admin=True),
    )
    primary = Flask("primary-fixture")
    primary.secret_key = "primary-test-key"
    app = _app(csrf=True)
    app.config["SESSION_COOKIE_NAME"] = "fyers_session"
    app.register_blueprint(broker_instances_bp)
    app.before_request(instances.guard_managed_login)
    app.add_url_rule("/broker", "broker-fixture", lambda: "broker page")
    client = app.test_client()
    identity = {
        "user": "trader",
        "logged_in": True,
        "session_id": "primary-device",
        "auth_at": datetime.now(UTC).isoformat(),
        "login_time": datetime.now(UTC).isoformat(),
    }

    def cookie(**changes):
        value = {**identity, **changes}
        for key in [k for k, v in value.items() if v is None]:
            value.pop(key)
        signed = primary.session_interface.get_signing_serializer(primary).dumps(value)
        client.set_cookie("primary_session", signed, domain="127.0.0.1")
        return signed

    def call(method, path, **kwargs):
        return client.open(path, method=method, base_url=BASE, **kwargs)

    cookie()
    return SimpleNamespace(
        app=app,
        client=client,
        identity=identity,
        cookie=cookie,
        call=call,
        database=primary_db,
        environment=environment,
    )


def _start(linked):
    linked.call("GET", "/auth/instance-login")
    csrf = linked.call("GET", "/auth/csrf-token").get_json()["csrf_token"]
    return linked.call(
        "POST", "/auth/broker/login", json={"broker": "fyers"}, headers={"X-CSRFToken": csrf}
    )


def _revoke(linked, column="revoked_at", *, at=None):
    assert column in {"revoked_at", "pre_broker_revoked_at"}
    with sqlite3.connect(linked.database) as db:
        db.execute(
            f"INSERT INTO session_revocations(username,{column}) VALUES(?,?)",
            ("trader", (at or datetime.now(UTC)).astimezone(UTC).replace(tzinfo=None).isoformat()),
        )


def test_get_handoff_imports_actual_proof_time_without_starting_broker(linked):
    result = linked.call("GET", "/auth/instance-login")
    assert result.status_code == 302 and result.location == "/broker?broker=fyers"
    with linked.client.session_transaction(base_url=BASE) as sess:
        assert sess["user"] == "trader"
        assert datetime.fromisoformat(sess["auth_at"]) >= datetime.fromisoformat(
            linked.identity["auth_at"]
        )
        assert sess["login_authority_auth_at"] == linked.identity["auth_at"]
        assert not sess.get("broker_login") and not sess.get("logged_in")
    assert linked.call("GET", "/api/broker/list").status_code == 200


def test_fyers_start_requires_csrf_and_callback_uses_new_pending_state_once(linked, monkeypatch):
    linked.call("GET", "/auth/instance-login")
    assert linked.call("POST", "/auth/broker/login", json={"broker": "fyers"}).status_code == 400
    calls, completed = [], []
    linked.app.broker_auth_functions = {
        "fyers_auth": lambda code: (calls.append(code) or "fake-token", None)
    }
    monkeypatch.setattr(
        brlogin,
        "handle_auth_success",
        lambda token, user, broker, **kw: (
            completed.append((token, user, broker)) or "mock-complete"
        ),
    )
    result = _start(linked)
    assert result.status_code == 200
    url = urlsplit(result.get_json()["url"])
    assert url.hostname == "api-t1.fyers.in"
    query = parse_qs(url.query)
    assert query["redirect_uri"] == [BASE + "/fyers/callback"]
    assert query["client_id"] == ["FYAPP-100"]
    state = query["state"][0]
    bad = linked.call("GET", "/fyers/callback?auth_code=fake&state=wrong")
    assert bad.status_code == 302 and not calls
    path = "/fyers/callback?" + urlencode({"auth_code": "fake-code", "state": state})
    assert linked.call("GET", path).get_data(as_text=True) == "mock-complete"
    assert calls == ["fake-code"] and completed == [("fake-token", "trader", "fyers")]
    assert "login_not_started" in linked.call("GET", path).location
    assert len(calls) == 1


def test_old_start_bookmark_cannot_create_oauth_state(linked):
    result = linked.call("GET", "/auth/fyers/start")
    assert result.location == "/auth/instance-login"
    with linked.client.session_transaction(base_url=BASE) as sess:
        assert "broker_login" not in sess and "fyers_oauth_state" not in sess


def test_malformed_fyers_app_id_stops_login_before_redirect(linked):
    linked.environment.write(
        {
            "BROKER_API_KEY": "fake-account-name",
            "BROKER_API_SECRET": "fake-secret",
            "REDIRECT_URL": BASE + "/fyers/callback",
        }
    )

    result = _start(linked)

    assert result.status_code == 409
    assert "full FYERS App ID" in result.json["message"]
    assert "fake-account-name" not in result.get_data(as_text=True)
    with linked.client.session_transaction(base_url=BASE) as sess:
        assert "broker_login" not in sess


@pytest.mark.parametrize("private_callback", [False, True])
def test_fyers_desktop_relay_depends_on_the_actual_callback(
    linked, monkeypatch, private_callback
):
    from database import mobile_login

    private = "https://terminal.example.ts.net:8443"
    monkeypatch.setenv("PRIVATE_ACCESS_MODE", "dual")
    monkeypatch.setenv("PUBLIC_ORIGIN", private)
    monkeypatch.setenv(
        "BROKER_PUBLIC_ORIGINS",
        json.dumps({"kotak": "https://terminal.example.ts.net", "fyers": private}),
    )
    redirect_url = (private if private_callback else BASE) + "/fyers/callback"
    linked.environment.write(
        {
            "BROKER_API_KEY": "FYAPP-200",
            "BROKER_API_SECRET": "fake-secret",
            "REDIRECT_URL": redirect_url,
        }
    )
    relayed = []
    monkeypatch.setattr(
        mobile_login,
        "begin",
        lambda state, binding, *, return_kind: relayed.append((state, return_kind)),
    )

    result = _start(linked)

    assert result.status_code == 200
    query = parse_qs(urlsplit(result.json["url"]).query)
    assert query["redirect_uri"] == [redirect_url]
    assert relayed == ([(query["state"][0], "desktop")] if private_callback else [])


@pytest.mark.parametrize(
    "changes",
    [
        {"user": "another"},
        {"pending_totp_user": "trader"},
        {"session_id": "removed"},
        {"auth_at": "invalid"},
        {"auth_at": (datetime.now(UTC) + timedelta(hours=1)).isoformat()},
        {"logged_in": False, "auth_at": None},
        {"logged_in": False, "auth_at": (datetime.now(UTC) - timedelta(days=2)).isoformat()},
        {"login_time": (datetime.now(UTC) - timedelta(days=2)).isoformat()},
    ],
)
def test_untrusted_expired_or_incomplete_primary_identity_is_not_imported(linked, changes):
    linked.cookie(**changes)
    assert linked.call("GET", "/auth/instance-login").location.startswith(PRIMARY + "/login?")
    with linked.client.session_transaction(base_url=BASE) as sess:
        assert "user" not in sess


def test_primary_password_change_during_oauth_refuses_before_broker_exchange(linked):
    result = _start(linked)
    state = parse_qs(urlsplit(result.get_json()["url"]).query)["state"][0]
    calls = []
    linked.app.broker_auth_functions = {"fyers_auth": lambda code: calls.append(code)}
    _revoke(linked)
    result = linked.call("GET", "/fyers/callback?auth_code=fake&state=" + state)
    assert result.location == "/auth/instance-login" and not calls


def test_primary_revocation_during_broker_exchange_is_checked_at_commit(linked, commit):
    import database.auth_db as auth_db

    def exchange(code):
        _revoke(linked)
        return "fake-token-never-stored", None

    linked.app.broker_auth_functions = {"fyers_auth": exchange}
    result = _start(linked)
    state = parse_qs(urlsplit(result.get_json()["url"]).query)["state"][0]
    answer = linked.call("GET", "/fyers/callback?auth_code=fake&state=" + state)
    assert "signed_out" in answer.location
    assert auth_db.Auth.query.filter_by(name="trader").count() == 0


def test_new_sso_login_after_local_signout_does_not_revive_old_local_cookie(linked):
    import database.auth_db as auth_db

    linked.call("GET", "/auth/instance-login")
    old_cookie = linked.client.get_cookie("fyers_session", domain="127.0.0.1").value
    auth_db.revoke_all_sessions("trader")
    linked.call("GET", "/auth/instance-login")
    assert linked.call("GET", "/api/broker/list").status_code == 200
    with linked.client.session_transaction(base_url=BASE) as sess:
        assert sess["login_authority_auth_at"] == linked.identity["auth_at"]
        assert datetime.fromisoformat(sess["auth_at"]) > auth_db.get_sessions_revoked_at("trader")
    linked.client.set_cookie("fyers_session", old_cookie, domain="127.0.0.1")
    assert (
        linked.call("GET", "/api/broker/list", headers={"Accept": "application/json"}).status_code
        == 401
    )


def test_completed_fyers_browser_honors_primary_revocation_and_not_newer_cookie(linked):
    linked.call("GET", "/auth/instance-login")
    with linked.client.session_transaction(base_url=BASE) as sess:
        sess.update(logged_in=True, broker="fyers", login_time=datetime.now(UTC).isoformat())
    _revoke(linked)
    linked.cookie(auth_at=(datetime.now(UTC) + timedelta(milliseconds=1)).isoformat())
    result = linked.call("GET", "/api/broker/list")
    assert result.status_code == 401
    with linked.client.session_transaction(base_url=BASE) as sess:
        assert "user" not in sess


def test_pre_broker_authority_revocation_ends_imported_identity(linked):
    linked.cookie(logged_in=False, session_id=None)
    linked.call("GET", "/auth/instance-login")
    _revoke(linked, "pre_broker_revoked_at")
    assert linked.call("GET", "/api/broker/list").status_code == 401


def test_missing_primary_device_cannot_keep_existing_fyers_cookie(linked):
    linked.call("GET", "/auth/instance-login")
    with sqlite3.connect(linked.database) as db:
        db.execute("DELETE FROM active_sessions")
    assert linked.call("GET", "/api/broker/list").status_code == 401


def test_tampered_cookie_or_missing_required_totp_cannot_link(linked):
    with sqlite3.connect(linked.database) as db:
        db.execute("UPDATE users SET totp_enabled=1,totp_required_for_login=1")
    assert linked.call("GET", "/auth/instance-login").location.startswith(PRIMARY)
    linked.cookie(totp_verified_at=datetime.now(UTC).isoformat())
    assert linked.call("GET", "/auth/instance-login").location.startswith("/broker?")
    linked.client.set_cookie("primary_session", "tampered", domain="127.0.0.1")
    assert linked.call("GET", "/api/broker/list").status_code == 401


def test_remote_client_cannot_import_loopback_cookie(linked):
    assert (
        linked.call(
            "GET", "/auth/instance-login", environ_overrides={"REMOTE_ADDR": "192.0.2.1"}
        ).status_code
        == 403
    )


def test_before_three_am_rejects_a_cookie_from_previous_trading_day(linked, monkeypatch):
    import pytz

    now = datetime.now(pytz.timezone("Asia/Kolkata")).replace(hour=1, minute=0)
    fake_clock = SimpleNamespace(
        now=lambda tz: now.astimezone(tz), fromisoformat=datetime.fromisoformat
    )
    monkeypatch.setattr(instances, "datetime", fake_clock)
    old = (now - timedelta(days=2)).isoformat()
    linked.cookie(auth_at=old, login_time=old)
    assert linked.call("GET", "/auth/instance-login").location.startswith(PRIMARY)


def test_valid_pre_broker_identity_outlives_legacy_fifteen_minute_heuristic(linked, monkeypatch):
    import pytz

    now = datetime.now(pytz.timezone("Asia/Kolkata")).replace(hour=10, minute=0)
    monkeypatch.setattr(
        instances,
        "datetime",
        SimpleNamespace(
            now=lambda tz: now.astimezone(tz),
            fromisoformat=datetime.fromisoformat,
        ),
    )
    linked.cookie(
        logged_in=False,
        session_id=None,
        login_time=None,
        auth_at=(now - timedelta(minutes=30)).isoformat(),
    )
    assert linked.call("GET", "/auth/instance-login").location.startswith("/broker?")
    assert linked.call("GET", "/api/broker/list").status_code == 200
    _revoke(linked, "pre_broker_revoked_at", at=now)
    assert linked.call("GET", "/api/broker/list").status_code == 401


def test_readonly_primary_connections_close_on_success_and_refusal(linked, monkeypatch):
    real_connect = sqlite3.connect
    opened, closed = [], []

    class Connection:
        def __init__(self, connection):
            self.connection = connection

        def execute(self, *a, **kw):
            return self.connection.execute(*a, **kw)

        def close(self):
            self.connection.close()
            closed.append(self)

    def connect(*a, **kw):
        assert "mode=ro" in a[0] and kw["timeout"] == 2
        item = Connection(real_connect(*a, **kw))
        opened.append(item)
        return item

    monkeypatch.setattr(instances, "sqlite3", SimpleNamespace(connect=connect, Error=sqlite3.Error))
    cookie = linked.cookie()
    with linked.app.test_request_context(
        BASE + "/auth/instance-login",
        headers={"Cookie": "primary_session=" + cookie},
        environ_base={"REMOTE_ADDR": "127.0.0.1"},
    ):
        for _ in range(100):
            assert instances._primary_identity() is not None
    with real_connect(linked.database) as db:
        db.execute("DELETE FROM users")
    with linked.app.test_request_context(
        BASE + "/auth/instance-login",
        headers={"Cookie": "primary_session=" + cookie},
        environ_base={"REMOTE_ADDR": "127.0.0.1"},
    ):
        for _ in range(100):
            assert instances._primary_identity() is None
    assert len(opened) == len(closed) == 200


def test_primary_link_does_not_stage_keys_or_refuse_for_its_live_strategy(
    stores, environment, monkeypatch
):
    monkeypatch.delenv("BROKER_LOGIN_SOURCE_ENV", raising=False)
    monkeypatch.setenv("HOST_SERVER", PRIMARY)
    monkeypatch.setenv("BROKER_INSTANCES", json.dumps({"fyers": BASE}))
    app = _app(csrf=True)
    client = app.test_client()
    with client.session_transaction() as sess:
        sess.update(user="trader", auth_at=datetime.now(UTC).isoformat(), broker="kotak")
    import utils.broker_switch as switch

    monkeypatch.setattr(
        switch,
        "refusal_for_login",
        lambda *a: pytest.fail("A linked instance is not a broker switch"),
    )
    result = client.post(
        "/auth/broker/login", json={"broker": "fyers"}, headers={"X-CSRFToken": _csrf(client)}
    )
    assert result.get_json()["url"] == BASE + "/auth/instance-login"
    with client.session_transaction() as sess:
        assert sess["broker"] == "kotak" and "broker_login" not in sess
    listed = client.get("/api/broker/list").get_json()["data"]["brokers"]
    entry = next(row for row in listed if row["id"] == "fyers")
    assert entry["instance_url"] == BASE + "/auth/instance-login" and not entry["fields"]
    assert (
        client.put(
            "/api/broker/credentials/fyers",
            json={"api_key": "fake"},
            headers={"X-CSRFToken": _csrf(client)},
        ).status_code
        == 409
    )
    assert (
        client.delete(
            "/api/broker/credentials/fyers", headers={"X-CSRFToken": _csrf(client)}
        ).status_code
        == 409
    )


@pytest.mark.parametrize(
    "origin",
    [
        "https://evil.invalid",
        "http://127.0.0.1:5001/path",
        "http://user@127.0.0.1:5001",
        "http://localhost:5001",
        "http://127.0.0.1:5001?x=y",
    ],
)
def test_linked_destination_is_strictly_configured_loopback(monkeypatch, origin):
    monkeypatch.setenv("BROKER_INSTANCES", json.dumps({"fyers": origin}))
    monkeypatch.setenv("HOST_SERVER", PRIMARY)
    assert instances.instance_login_url("fyers") is None

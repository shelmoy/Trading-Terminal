"""Native handoff tests: fake users, disposable DBs, no broker transport."""

import json
from urllib.parse import parse_qs, urlsplit

import pytest
from test_broker_keys import _app, _csrf, _signed_in
from test_broker_keys import commit as commit
from test_broker_keys import environment as environment
from test_broker_keys import stores as stores

from blueprints.mobile import mobile_bp
from database import mobile_login
from utils.mobile_origins import cloud_origins, private_origin

ORIGINS = {
    "kotak": "https://terminal.example.ts.net",
    "fyers": "https://terminal.example.ts.net:8443",
}


@pytest.fixture
def native(stores, environment, monkeypatch):
    environment.write(
        {
            "BROKER_API_KEY": "FYAPP-100",
            "BROKER_API_SECRET": "fake-secret",
            "REDIRECT_URL": ORIGINS["fyers"] + "/fyers/callback",
        }
    )
    monkeypatch.setenv("PUBLIC_ORIGIN", ORIGINS["fyers"])
    monkeypatch.setenv("BROKER_PUBLIC_ORIGINS", json.dumps(ORIGINS))
    monkeypatch.setenv("VALID_BROKERS", "fyers,kotak")
    app = _app(csrf=True)
    app.register_blueprint(mobile_bp)
    app.broker_auth_functions["fyers_auth"] = lambda code: ("fake-access", None)
    # There must never be an accidental actual transport in this fixture.
    import utils.broker_switch as switches

    monkeypatch.setattr(switches, "_blockers", lambda _: (0, 0, 0, 0))
    return app, _signed_in(app)


def start(client):
    res = client.post(
        "/mobile/fyers/start", json={"broker": "fyers"}, headers={"X-CSRFToken": _csrf(client)}
    )
    assert res.status_code == 200, res.get_data(as_text=True)
    return parse_qs(urlsplit(res.json["url"]).query)["state"][0]


def receive(app, state):
    external = app.test_client()  # Chrome has no WebView cookies.
    res = external.get(
        "/fyers/callback", query_string={"state": state, "auth_code": "private-code"}
    )
    assert res.status_code == 302
    assert "private-code" not in res.location
    return parse_qs(urlsplit(res.location).query).get("ticket", [None])[0]


def test_handoff_original_session_only_and_once(native, commit):
    app, client = native
    ticket = receive(app, start(client))
    assert ticket
    other = _signed_in(app)
    start(other)
    assert (
        other.post(
            "/mobile/fyers/complete", json={"ticket": ticket}, headers={"X-CSRFToken": _csrf(other)}
        ).status_code
        == 409
    )
    res = client.post(
        "/mobile/fyers/complete", json={"ticket": ticket}, headers={"X-CSRFToken": _csrf(client)}
    )
    assert res.status_code in (200, 302), res.get_data(as_text=True)
    assert len(commit) == 1
    replay = client.post(
        "/mobile/fyers/complete", json={"ticket": ticket}, headers={"X-CSRFToken": _csrf(client)}
    )
    assert replay.status_code in (401, 409)
    assert len(commit) == 1


def test_csrf_required(native):
    _, client = native
    assert client.post("/mobile/fyers/start", json={"broker": "fyers"}).status_code == 400


def test_duplicate_callback_cannot_replace_first_ticket(native):
    app, client = native
    state = start(client)
    assert receive(app, state)
    assert receive(app, state) is None


def test_cancel_and_logout_cannot_complete(native, commit):
    app, client = native
    ticket = receive(app, start(client))
    assert (
        client.post("/mobile/fyers/cancel", headers={"X-CSRFToken": _csrf(client)}).status_code
        == 200
    )
    assert (
        client.post(
            "/mobile/fyers/complete",
            json={"ticket": ticket},
            headers={"X-CSRFToken": _csrf(client)},
        ).status_code
        == 401
    )
    assert not commit


def test_expired_ticket_refused(native, monkeypatch):
    app, client = native
    ticket = receive(app, start(client))
    now = mobile_login.time.time()
    monkeypatch.setattr(mobile_login.time, "time", lambda: now + 601)
    assert (
        client.post(
            "/mobile/fyers/complete",
            json={"ticket": ticket},
            headers={"X-CSRFToken": _csrf(client)},
        ).status_code
        == 409
    )


def test_logout_revocation_during_chrome_login_refuses_commit(native, commit):
    from database.auth_db import revoke_all_sessions

    app, client = native
    ticket = receive(app, start(client))
    revoke_all_sessions("trader")
    res = client.post(
        "/mobile/fyers/complete",
        json={"ticket": ticket},
        headers={"X-CSRFToken": _csrf(client), "Accept": "application/json"},
    )
    assert res.status_code in (400, 401, 302)
    assert not commit


def test_cloud_guard_requires_internal_host_and_own_browser_origin(monkeypatch):
    from flask import Flask

    from utils.mobile_origins import guard_cloud_origin

    monkeypatch.setenv("HOST_SERVER", "http://127.0.0.1:5000")
    monkeypatch.setenv("PUBLIC_ORIGIN", ORIGINS["kotak"])
    monkeypatch.setenv("BROKER_PUBLIC_ORIGINS", json.dumps(ORIGINS))
    app = Flask(__name__)
    app.before_request(guard_cloud_origin)
    app.add_url_rule("/form", view_func=lambda: "ok", methods=["POST"])
    client = app.test_client()
    assert (
        client.post(
            "/form", base_url="http://127.0.0.1:5000", headers={"Origin": ORIGINS["kotak"]}
        ).status_code
        == 200
    )
    assert (
        client.post(
            "/form", base_url="http://127.0.0.1:5000", headers={"Origin": ORIGINS["fyers"]}
        ).status_code
        == 403
    )
    assert (
        client.post(
            "/form", base_url="https://evil.example", headers={"Origin": ORIGINS["kotak"]}
        ).status_code
        == 403
    )
    assert (
        client.post(
            "/form",
            base_url="http://127.0.0.1:5000",
            headers={"Origin": ORIGINS["kotak"]},
            environ_overrides={"REMOTE_ADDR": "198.51.100.1"},
        ).status_code
        == 403
    )


@pytest.mark.parametrize(
    "url",
    [
        "http://terminal.example.ts.net",
        "https://evil.com",
        "https://terminal.example.ts.net@evil.com",
        "https://terminal.example.ts.net:5000",
        "https://terminal.example.ts.net/path",
        "https://terminal.example.ts.net?x=1",
        "https://terminal.example.ts.net#x",
    ],
)
def test_origin_refuses_unsafe_configuration(url):
    assert private_origin(url) is None


def test_partial_cloud_configuration_fails_closed(monkeypatch):
    monkeypatch.setenv("PUBLIC_ORIGIN", ORIGINS["kotak"])
    monkeypatch.delenv("BROKER_PUBLIC_ORIGINS", raising=False)
    with pytest.raises(ValueError):
        cloud_origins()


def test_ticket_registry_bounded_encrypted_and_single_use(native):
    from sqlalchemy import func, select
    from sqlalchemy.orm import Session

    for n in range(100):
        mobile_login.begin(f"fake-state-{n}", f"binding-{n}")
    with Session(mobile_login.broker_keys_db.engine) as db:
        assert db.scalar(select(func.count()).select_from(mobile_login.MobileLoginTicket)) <= 16
    ticket = mobile_login.receive("fake-state-99", "secret-code")
    with Session(mobile_login.broker_keys_db.engine) as db:
        row = db.get(mobile_login.MobileLoginTicket, mobile_login.digest("fake-state-99"))
        assert "secret-code" not in row.payload and ticket not in row.ticket_hash
    assert mobile_login.consume(ticket, "wrong") is None
    assert mobile_login.consume(ticket, "binding-99")["code"] == "secret-code"
    assert mobile_login.consume(ticket, "binding-99") is None

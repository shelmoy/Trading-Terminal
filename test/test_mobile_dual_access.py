"""Desktop HTTP + phone HTTPS login isolation, with disposable stores/transports."""

import json
import os
from datetime import UTC, datetime
from urllib.parse import parse_qs, urlsplit

import pytest
from flask import Flask, session
from test_broker_keys import _app, _csrf, _signed_in
from test_broker_keys import commit as commit
from test_broker_keys import environment as environment
from test_broker_keys import stores as stores
from test_linked_broker_auth import linked as linked

from blueprints.mobile import intercept_browser_return, mobile_bp
from utils.mobile_origins import (
    guard_cloud_origin,
    install_dual_session_interface,
    request_websocket_url,
)

LOCAL = "http://127.0.0.1:5001"
PUBLIC = "https://terminal.example.ts.net:8443"
HEADER = {"X-Terminal-Private-Origin": PUBLIC}


def configure(monkeypatch):
    monkeypatch.setenv("PRIVATE_ACCESS_MODE", "dual")
    monkeypatch.setenv("HOST_SERVER", LOCAL)
    monkeypatch.setenv("PUBLIC_ORIGIN", PUBLIC)
    monkeypatch.setenv(
        "BROKER_PUBLIC_ORIGINS",
        json.dumps({"kotak": PUBLIC.removesuffix(":8443"), "fyers": PUBLIC}),
    )


def test_local_cookie_and_private_secure_cookie_are_independent(monkeypatch):
    configure(monkeypatch)
    app = Flask(__name__)
    app.secret_key = "fake-secret"
    app.config["SERVER_NAME"] = "127.0.0.1:5001"
    install_dual_session_interface(app)

    @app.get("/touch")
    def touch():
        session["count"] = session.get("count", 0) + 1
        return str(session["count"])

    client = app.test_client()
    local = client.get("/touch")
    assert local.data == b"1" and local.headers["Set-Cookie"].startswith("session=")
    assert "; Secure;" not in local.headers["Set-Cookie"]
    phone = client.get("/touch", headers=HEADER)
    assert phone.data == b"1" and phone.headers["Set-Cookie"].startswith("__Secure-session=")
    assert "; Secure;" in phone.headers["Set-Cookie"]
    assert client.get("/touch").data == b"2"
    assert client.get("/touch", headers=HEADER).data == b"2"
    assert app.config["SESSION_COOKIE_NAME"] == "session"


def test_dual_origins_and_websocket_routes(monkeypatch):
    configure(monkeypatch)
    monkeypatch.setenv("WEBSOCKET_URL", "ws://127.0.0.1:8766")
    app = Flask(__name__)
    app.before_request(guard_cloud_origin)
    app.add_url_rule("/ws-config", view_func=request_websocket_url, methods=["POST", "GET"])
    client = app.test_client()
    assert (
        client.post("/ws-config", base_url=LOCAL, headers={"Origin": LOCAL}).data
        == b"ws://127.0.0.1:8766"
    )
    assert (
        client.post("/ws-config", base_url=LOCAL, headers={**HEADER, "Origin": PUBLIC}).data
        == b"wss://terminal.example.ts.net:8443/ws"
    )
    assert client.post("/ws-config", base_url=LOCAL, headers={"Origin": PUBLIC}).status_code == 403
    assert (
        client.post("/ws-config", base_url=LOCAL, headers={**HEADER, "Origin": LOCAL}).status_code
        == 403
    )
    assert (
        client.get(
            "/ws-config",
            base_url=LOCAL,
            headers=HEADER,
            environ_overrides={"REMOTE_ADDR": "198.51.100.1"},
        ).status_code
        == 403
    )


def test_desktop_login_returns_to_original_local_cookie(stores, environment, commit, monkeypatch):
    configure(monkeypatch)
    environment.write(
        {
            "BROKER_API_KEY": "FYAPP-100",
            "BROKER_API_SECRET": "fake-secret",
            "REDIRECT_URL": PUBLIC + "/fyers/callback",
        }
    )
    monkeypatch.setenv("VALID_BROKERS", "fyers,kotak")
    import utils.broker_switch as switches

    monkeypatch.setattr(switches, "_blockers", lambda _: (0, 0, 0, 0))
    app = _app(csrf=True)
    app.config["SERVER_NAME"] = "127.0.0.1:5001"
    install_dual_session_interface(app)
    app.register_blueprint(mobile_bp)
    app.before_request(guard_cloud_origin)
    app.before_request(intercept_browser_return)
    app.broker_auth_functions["fyers_auth"] = lambda code: ("fake-access", None)
    desktop = _signed_in(app)
    start = desktop.post(
        "/auth/broker/login",
        json={"broker": "fyers"},
        headers={"Origin": LOCAL, "X-CSRFToken": _csrf(desktop)},
    )
    assert start.status_code == 200
    params = parse_qs(urlsplit(start.json["url"]).query)
    assert params["redirect_uri"] == [PUBLIC + "/fyers/callback"]
    external = app.test_client()
    result = external.get(
        "/fyers/callback",
        query_string={"state": params["state"][0], "auth_code": "fake-code"},
        headers=HEADER,
    )
    assert result.status_code == 302
    assert result.location.startswith(LOCAL + "/broker?")
    ticket = parse_qs(urlsplit(result.location).query)["desktop_ticket"][0]
    impostor = _signed_in(app)
    # A valid app account alone cannot claim another browser's broker return.
    refused = impostor.post(
        "/mobile/fyers/complete",
        json={"ticket": ticket},
        headers={"Origin": LOCAL, "X-CSRFToken": _csrf(impostor)},
    )
    assert refused.status_code == 401
    completed = desktop.post(
        "/mobile/fyers/complete",
        json={"ticket": ticket},
        headers={"Origin": LOCAL, "X-CSRFToken": _csrf(desktop)},
    )
    assert completed.status_code in (200, 302), completed.get_data(as_text=True)
    assert len(commit) == 1
    duplicate = desktop.post(
        "/mobile/fyers/complete",
        json={"ticket": ticket},
        headers={"Origin": LOCAL, "X-CSRFToken": _csrf(desktop)},
    )
    assert duplicate.status_code in (401, 409) and len(commit) == 1


def test_private_phone_login_still_uses_original_secure_webview(
    stores, environment, commit, monkeypatch
):
    configure(monkeypatch)
    environment.write(
        {
            "BROKER_API_KEY": "FYAPP-100",
            "BROKER_API_SECRET": "fake-secret",
            "REDIRECT_URL": PUBLIC + "/fyers/callback",
        }
    )
    monkeypatch.setenv("VALID_BROKERS", "fyers,kotak")
    import utils.broker_switch as switches

    monkeypatch.setattr(switches, "_blockers", lambda _: (0, 0, 0, 0))
    app = _app(csrf=True)
    app.config["SERVER_NAME"] = "127.0.0.1:5001"
    install_dual_session_interface(app)
    app.register_blueprint(mobile_bp)
    app.before_request(guard_cloud_origin)
    app.before_request(intercept_browser_return)
    app.broker_auth_functions["fyers_auth"] = lambda code: ("fake-access", None)
    phone = app.test_client()
    signed = app.session_interface.get_signing_serializer(app).dumps(
        {"user": "trader", "auth_at": datetime.now(UTC).isoformat()}
    )
    phone.set_cookie("__Secure-session", signed, domain="127.0.0.1", secure=True)
    csrf = phone.get("/auth/csrf-token", headers=HEADER).json["csrf_token"]
    headers = {**HEADER, "Origin": PUBLIC, "X-CSRFToken": csrf}
    started = phone.post("/mobile/fyers/start", json={"broker": "fyers"}, headers=headers)
    assert started.status_code == 200, started.get_data(as_text=True)
    state = parse_qs(urlsplit(started.json["url"]).query)["state"][0]
    external = app.test_client()
    returned = external.get(
        "/fyers/callback", query_string={"state": state, "auth_code": "fake-code"}, headers=HEADER
    )
    assert returned.location.startswith("in.shelmoy.tradingterminal://oauth/fyers?")
    ticket = parse_qs(urlsplit(returned.location).query)["ticket"][0]
    completed = phone.post("/mobile/fyers/complete", json={"ticket": ticket}, headers=headers)
    assert completed.status_code in (200, 302), completed.get_data(as_text=True)
    assert len(commit) == 1


@pytest.mark.parametrize("private", [False, True])
def test_shared_primary_identity_works_on_both_origins(linked, monkeypatch, private):
    configure(monkeypatch)
    source = __import__("pathlib").Path(os.environ["BROKER_LOGIN_SOURCE_ENV"])
    source.write_text(
        source.read_text(encoding="utf-8")
        + "\nPRIVATE_ACCESS_MODE='dual'\nPUBLIC_ORIGIN='https://terminal.example.ts.net'\n",
        encoding="utf-8",
    )
    install_dual_session_interface(linked.app)
    signed = linked.cookie()
    if private:
        linked.client.set_cookie(
            "__Secure-primary_session", signed, domain="127.0.0.1", secure=True
        )
    response = linked.call("GET", "/auth/instance-login", headers=HEADER if private else {})
    assert response.status_code == 302 and response.location.startswith("/broker?")
    cookies = response.headers.getlist("Set-Cookie")
    expected = "__Secure-fyers_session=" if private else "fyers_session="
    assert any(cookie.startswith(expected) for cookie in cookies)
    probe = linked.call(
        "GET",
        "/api/broker/list",
        headers={**(HEADER if private else {}), "Accept": "application/json"},
    )
    assert probe.status_code == 200

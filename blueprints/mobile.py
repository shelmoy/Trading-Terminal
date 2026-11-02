"""Opt-in Android protocol. Existing session, CSRF and broker login remain authoritative."""

import json
import os
from functools import wraps
from urllib.parse import urlencode

from flask import Blueprint, abort, g, jsonify, redirect, request, session

from database import mobile_login
from limiter import limiter
from utils.mobile_origins import browser_origin, cloud_origins
from utils.session import check_signed_in

mobile_bp = Blueprint("mobile", __name__, url_prefix="/mobile")
RETURN_URI = "in.shelmoy.tradingterminal://oauth/fyers"


def enabled(f):
    @wraps(f)
    def wrapped(*args, **kwargs):
        if not cloud_origins():
            abort(404)
        return f(*args, **kwargs)

    return wrapped


def binding():
    marker = session.get("broker_login") or {}
    if (
        not session.get("user")
        or marker.get("broker") != "fyers"
        or not marker.get("nonce")
        or not session.get("auth_at")
    ):
        abort(401)
    return mobile_login.digest(
        json.dumps(
            [
                session["user"],
                session["auth_at"],
                session.get("session_id"),
                marker["nonce"],
            ],
            separators=(",", ":"),
        )
    )


@mobile_bp.after_request
def private_response(response):
    response.headers["Cache-Control"] = "no-store"
    response.headers["Referrer-Policy"] = "no-referrer"
    return response


@mobile_bp.get("/bootstrap")
@enabled
@check_signed_in
def bootstrap():
    # Each WebView reports its own status; do not mix another account's tokens.
    from database.auth_db import get_auth_token
    from utils.broker_keys import env_broker

    broker = env_broker()
    connected = bool(
        session.get("logged_in")
        and session.get("broker") == broker
        and get_auth_token(session["user"])
    )
    return jsonify(
        protocol=1,
        origins=cloud_origins(),
        origin=browser_origin(),
        broker=broker,
        connected=connected,
    )


@mobile_bp.post("/fyers/start")
@enabled
@check_signed_in
@limiter.limit("5 per minute")
def start():
    if not os.getenv("REDIRECT_URL", "").endswith("/fyers/callback"):
        abort(409)
    if (request.get_json(silent=True) or {}).get("broker") != "fyers":
        abort(400)
    from blueprints.auth import start_broker_login

    response = start_broker_login()
    # Preserve refusals, already-connected outcomes, broker switch safeguards.
    if isinstance(response, tuple) or response.status_code != 200:
        return response
    body = response.get_json()
    if not body.get("url", "").startswith("https://api-t1.fyers.in/api/v3/generate-authcode?"):
        return response
    mobile_login.begin(session["broker_login"]["state"], binding())
    return response


def fyers_browser_return():
    """Intercept only registered native flows, before desktop cookie checks."""
    if not cloud_origins() or request.method != "GET":
        return None
    state = request.args.get("state", "")
    if not mobile_login.known(state):
        return None
    ticket = mobile_login.receive(state, request.args.get("auth_code", ""))
    response = redirect(
        RETURN_URI
        + "?"
        + urlencode({"ticket": ticket} if ticket else {"error": "login_not_completed"})
    )
    response.headers["Cache-Control"] = "no-store"
    response.headers["Referrer-Policy"] = "no-referrer"
    return response


@mobile_bp.post("/fyers/complete")
@enabled
@check_signed_in
@limiter.limit("5 per minute")
def complete():
    payload = mobile_login.consume((request.get_json(silent=True) or {}).get("ticket"), binding())
    if not payload or payload["state"] != session["broker_login"].get("state"):
        abort(409)
    # Continue through the original staged keys, broker slot, one-use state,
    # revocation and final managed-login commit checks. No alternate token writer.
    g.mobile_fyers_code = payload["code"]
    g.mobile_fyers_state = payload["state"]
    from blueprints.brlogin import broker_callback

    return broker_callback("fyers")


@mobile_bp.post("/fyers/cancel")
@enabled
@check_signed_in
def cancel():
    mobile_login.cancel(binding())
    session.pop("broker_login", None)
    return jsonify(status="success")

"""Opt-in broker routing and shared app login for trusted loopback instances.

Broker databases, tokens and session cookies remain separate. A secondary
instance verifies the original instance's signed app cookie and reads its user
identity through a read-only SQLite connection. Passwords and TOTP secrets are
never copied. This feature deliberately supports local loopback instances only.
"""

import json
import os
import re
import secrets
import sqlite3
from contextlib import closing
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import urlsplit

import pytz
from dotenv import dotenv_values
from flask import abort, jsonify, redirect, request, session
from flask.sessions import SecureCookieSessionInterface
from itsdangerous import BadData, URLSafeTimedSerializer


def loopback_origin(value):
    try:
        parsed = urlsplit(value or "")
        port = parsed.port
    except ValueError:
        return None
    if (
        parsed.scheme not in {"http", "https"}
        or parsed.hostname != "127.0.0.1"
        or not port
        or parsed.username is not None
        or parsed.password is not None
        or parsed.path not in {"", "/"}
        or parsed.query
        or parsed.fragment
    ):
        return None
    return f"{parsed.scheme}://127.0.0.1:{port}"


def configured_instances():
    try:
        raw = json.loads(os.getenv("BROKER_INSTANCES", "{}"))
    except (ValueError, TypeError):
        return {}
    if not isinstance(raw, dict):
        return {}
    return {
        broker: origin
        for broker, value in raw.items()
        if isinstance(broker, str)
        and re.fullmatch(r"[a-z][a-z0-9_]*", broker)
        and isinstance(value, str)
        and (origin := loopback_origin(value))
    }


def instance_login_url(broker):
    """A configured other loopback instance, never a destination from a request."""
    origin = configured_instances().get(broker)
    own_origin = loopback_origin(os.getenv("HOST_SERVER"))
    if not origin or not own_origin or origin == own_origin:
        return None
    from utils.mobile_origins import external_instance_origin
    return f"{external_instance_origin(origin)}/auth/instance-login"


def login_authority():
    """Return explicitly configured primary settings, never a browser-supplied path."""
    filename = os.getenv("BROKER_LOGIN_SOURCE_ENV", "")
    if not filename:
        return None
    source = Path(filename)
    if not source.is_absolute() or not source.is_file():
        raise ValueError("The original OpenAlgo login configuration is unavailable.")
    config = dotenv_values(source)
    origin = loopback_origin(config.get("HOST_SERVER"))
    own_origin = loopback_origin(os.getenv("HOST_SERVER"))
    if not origin or not own_origin or origin == own_origin:
        raise ValueError("Shared OpenAlgo login requires separate loopback instances.")
    if origin not in configured_instances().values():
        raise ValueError("The original OpenAlgo instance is not in BROKER_INSTANCES.")
    return source, config, origin


def managed_login_enabled():
    return bool(os.getenv("BROKER_LOGIN_SOURCE_ENV"))


def _instant(value, *, naive_utc=False):
    if not isinstance(value, str) or not value:
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return pytz.UTC.localize(parsed) if naive_utc else None
    return parsed


def _primary_identity():
    """Verify primary cookie, daily boundary, device and durable revocations.

    The primary store is read-only and its connection closes on every exit.
    No password, broker key, token or second-factor secret is copied.
    """
    authority = login_authority()
    if authority is None:
        return None
    source, config, origin = authority
    # Do not accept a forwarded Host or a remotely reached server for local SSO.
    if request.remote_addr not in {"127.0.0.1", "::1"} or request.host_url.rstrip(
        "/"
    ) != loopback_origin(os.getenv("HOST_SERVER")):
        abort(403)
    key = config.get("APP_KEY")
    cookie_name = config.get("SESSION_COOKIE_NAME") or "session"
    from utils.mobile_origins import browser_origin
    from utils.mobile_origins import private_request
    secure_source = private_request() if config.get("PRIVATE_ACCESS_MODE") == "dual" else browser_origin(origin, config).startswith("https:")
    if secure_source:
        cookie_name = f"__Secure-{cookie_name}"
    cookie = request.cookies.get(cookie_name)
    if not key or not cookie:
        return None
    interface = SecureCookieSessionInterface()
    serializer = URLSafeTimedSerializer(
        key,
        salt=interface.salt,
        serializer=interface.serializer,
        signer_kwargs={
            "key_derivation": interface.key_derivation,
            "digest_method": interface.digest_method,
        },
    )
    try:
        identity = serializer.loads(cookie, max_age=86400)
        if not isinstance(identity, dict) or identity.get("pending_totp_user"):
            return None
        username = identity.get("user")
        if not isinstance(username, str) or not username or len(username) > 80:
            return None
        # A legacy completed broker session has a login_time. A pre-broker
        # identity with no auth_at must sign in again, as upstream requires.
        signed_in = _instant(identity.get("auth_at"))
        if identity.get("auth_at") is None and identity.get("logged_in"):
            signed_in = _instant(identity.get("login_time"))
        now = datetime.now(pytz.timezone("Asia/Kolkata"))
        if signed_in is None or signed_in > now + timedelta(seconds=5):
            return None
        hour, minute = map(int, (config.get("SESSION_EXPIRY_TIME") or "03:00").split(":"))
        boundary = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
        if now < boundary:
            boundary -= timedelta(days=1)
        disabled = str(config.get("DISABLE_SESSION_EXPIRY", "false")).lower() == "true"
        if not disabled and signed_in < boundary:
            return None
        if identity.get("logged_in"):
            logged_at = _instant(identity.get("login_time"))
            if logged_at is None or logged_at > now + timedelta(seconds=5):
                return None
            if not disabled and logged_at < boundary:
                return None
        # Upstream app authentication, including a sign-in before broker
        # connection, lasts to the daily boundary and honors durable sign-out
        # cutoffs. The legacy 15-minute cookie heuristic predates auth_at and
        # must not expire a valid linked session during the trading day.
    except (BadData, ValueError, KeyError, TypeError):
        return None

    database_url = config.get("DATABASE_URL") or ""
    if not database_url.startswith("sqlite:///"):
        raise ValueError("Local shared login currently requires a SQLite primary instance.")
    database_path = Path(database_url.removeprefix("sqlite:///"))
    if not database_path.is_absolute():
        database_path = source.parent / database_path
    with closing(
        sqlite3.connect(database_path.resolve().as_uri() + "?mode=ro", uri=True, timeout=2)
    ) as connection:
        record = connection.execute(
            "SELECT username, email, is_admin, totp_enabled, totp_required_for_login "
            "FROM users WHERE username = ?",
            (username,),
        ).fetchone()
        if identity.get("logged_in"):
            active = connection.execute(
                "SELECT 1 FROM active_sessions WHERE username = ? AND session_id = ?",
                (username, identity.get("session_id", "")),
            ).fetchone()
            if active is None:
                return None
        revocations = connection.execute(
            "SELECT revoked_at, pre_broker_revoked_at FROM session_revocations WHERE username = ?",
            (username,),
        ).fetchone()
    if record is None:
        return None
    if record[3] and record[4] and not identity.get("totp_verified_at"):
        return None
    revoked, pre_broker = (
        tuple(_instant(value, naive_utc=True) for value in revocations)
        if revocations
        else (None, None)
    )
    if revoked is not None and signed_in <= revoked:
        return None
    if not identity.get("logged_in") and pre_broker is not None and signed_in <= pre_broker:
        return None
    return {
        "record": record,
        "origin": origin,
        "signed_in": signed_in,
        "revoked": revoked,
        "pre_broker_revoked": pre_broker,
        "primary_logged_in": bool(identity.get("logged_in")),
        "boundary": None if disabled else boundary,
    }


def import_primary_login():
    """Establish only the app identity using verified primary authentication."""
    from database.user_db import add_user, db_session, find_user_by_exact_username

    identity = _primary_identity()
    if identity is None:
        return False
    record = identity["record"]
    username, origin = record[0], identity["origin"]
    local_user = find_user_by_exact_username(username)
    if local_user is not None and local_user.email != record[1]:
        raise ValueError("This broker instance already has a different account identity.")
    if local_user is None:
        # A local identity row is required by broker/API tables. Its random
        # password is unusable: local credential routes are disabled below.
        local_user = add_user(
            username, record[1], secrets.token_urlsafe(64), is_admin=bool(record[2])
        )
        if local_user is None:
            raise ValueError("Could not link the original OpenAlgo account.")
        from blueprints.apikey import generate_api_key
        from database.auth_db import upsert_api_key

        if not upsert_api_key(username, generate_api_key()):
            raise ValueError("Could not create this broker instance's API key.")
    elif local_user.is_admin != bool(record[2]):
        local_user.is_admin = bool(record[2])
        db_session.commit()
    if session.get("user") != username:
        session.clear()
    session["user"] = username
    session["login_authority"] = origin
    # The SSO sign-in is new here, while its original proof time remains
    # bound separately. A primary revocation must reject that original proof
    # even if this instance's broker login stamps a newer auth_at later.
    from utils.session import mark_signed_in

    mark_signed_in()
    session["login_authority_auth_at"] = identity["signed_in"].isoformat()
    session["login_authority_pre_broker"] = not identity["primary_logged_in"]
    return True


def _managed_identity_current():
    identity = _primary_identity()
    bound = _instant(session.get("login_authority_auth_at"))
    if identity is None or bound is None:
        return False
    if identity["record"][0] != session.get("user") or identity["origin"] != session.get(
        "login_authority"
    ):
        return False
    if identity["boundary"] is not None and bound < identity["boundary"]:
        return False
    cutoffs = [identity["revoked"]]
    if session.get("login_authority_pre_broker"):
        cutoffs.append(identity["pre_broker_revoked"])
    return all(cutoff is None or bound > cutoff for cutoff in cutoffs)


def managed_login_current():
    """Recheck SSO at the final login commit, after a slow broker exchange."""
    if not managed_login_enabled() or not session.get("login_authority"):
        return True
    try:
        return _managed_identity_current()
    except (ValueError, OSError, sqlite3.Error):
        return False


def guard_managed_login():
    """Keep setup, password and second-factor management at the primary instance."""
    if not managed_login_enabled():
        return None
    path = request.path
    if session.get("user") and session.get("login_authority"):
        try:
            valid = _managed_identity_current()
        except (ValueError, OSError, sqlite3.Error):
            return jsonify(
                status="error", message="The original OpenAlgo login could not be verified."
            ), 503
        if not valid:
            session.clear()
            if request.method != "GET" or path.startswith(("/api/", "/auth/broker/")):
                return jsonify(
                    status="error", message="Sign in to your original OpenAlgo account again."
                ), 401
            if path != "/auth/instance-login":
                return redirect("/auth/instance-login")
    managed_paths = {"/login", "/setup", "/reset-password", "/auth/change", "/auth/change-password"}
    managed_prefixes = ("/auth/login", "/auth/reset-password", "/auth/2fa/")
    if path not in managed_paths and not path.startswith(managed_prefixes):
        return None
    if request.method == "GET" and not path.startswith("/auth/2fa/"):
        return redirect("/auth/instance-login")
    authority = login_authority()
    from utils.mobile_origins import external_instance_origin
    return jsonify(
        status="error",
        message="Use your original OpenAlgo account to manage login, password and two-factor settings.",
        redirect=f"{external_instance_origin(authority[2])}/profile",
    ), 403

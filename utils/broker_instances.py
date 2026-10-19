"""Opt-in broker routing and shared app login for trusted loopback instances.

Broker databases, tokens and session cookies remain separate. A secondary
instance verifies the original instance's signed app cookie and reads its user
identity through a read-only SQLite connection. Passwords and TOTP secrets are
never copied. This feature deliberately supports local loopback instances only.
"""

import json
import os
from datetime import datetime
from pathlib import Path
import re
import secrets
import sqlite3
from urllib.parse import urlsplit

from dotenv import dotenv_values
from flask import abort, jsonify, redirect, request, session
from flask.sessions import SecureCookieSessionInterface
from itsdangerous import BadData, URLSafeTimedSerializer
import pytz


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


def import_primary_login():
    """Establish only the app identity, after verifying its primary signed cookie."""
    from database.user_db import add_user, db_session, find_user_by_exact_username

    authority = login_authority()
    if authority is None:
        return False
    source, config, origin = authority
    # Do not accept a forwarded Host or a remotely reached server for local SSO.
    if (
        request.remote_addr not in {"127.0.0.1", "::1"}
        or request.host_url.rstrip("/") != loopback_origin(os.getenv("HOST_SERVER"))
    ):
        abort(403)
    key = config.get("APP_KEY")
    cookie_name = config.get("SESSION_COOKIE_NAME") or "session"
    if origin.startswith("https:"):
        cookie_name = f"__Secure-{cookie_name}"
    cookie = request.cookies.get(cookie_name)
    if not key or not cookie:
        return False
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
            return False
        username = identity.get("user")
        if not isinstance(username, str) or not username or len(username) > 80:
            return False
        if identity.get("logged_in"):
            logged_at = datetime.fromisoformat(identity["login_time"])
            if logged_at.tzinfo is None:
                return False
            now = datetime.now(pytz.timezone("Asia/Kolkata"))
            hour, minute = map(int, (config.get("SESSION_EXPIRY_TIME") or "03:00").split(":"))
            boundary = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
            disabled = str(config.get("DISABLE_SESSION_EXPIRY", "false")).lower() == "true"
            if not disabled and now >= boundary and logged_at < boundary:
                return False
        else:
            # Password/2FA completed, but broker login is still pending.
            serializer.loads(cookie, max_age=900)
    except (BadData, ValueError, KeyError, TypeError):
        return False

    database_url = config.get("DATABASE_URL") or ""
    if not database_url.startswith("sqlite:///"):
        raise ValueError("Local shared login currently requires a SQLite primary instance.")
    database_path = Path(database_url.removeprefix("sqlite:///"))
    if not database_path.is_absolute():
        database_path = source.parent / database_path
    with sqlite3.connect(database_path.resolve().as_uri() + "?mode=ro", uri=True) as connection:
        record = connection.execute(
            "SELECT username, email, is_admin, totp_enabled, totp_required_for_login "
            "FROM users WHERE username = ?", (username,)
        ).fetchone()
        if identity.get("logged_in"):
            active = connection.execute(
                "SELECT 1 FROM active_sessions WHERE username = ? AND session_id = ?",
                (username, identity.get("session_id", "")),
            ).fetchone()
            if active is None:
                return False
    if record is None:
        return False
    if record[3] and record[4] and not identity.get("totp_verified_at"):
        return False
    local_user = find_user_by_exact_username(username)
    if local_user is not None and local_user.email != record[1]:
        raise ValueError("This broker instance already has a different account identity.")
    if local_user is None:
        # A local identity row is required by broker/API tables. Its random
        # password is unusable: local credential routes are disabled below.
        local_user = add_user(username, record[1], secrets.token_urlsafe(64), is_admin=bool(record[2]))
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
    return True


def guard_managed_login():
    """Keep setup, password and second-factor management at the primary instance."""
    if not managed_login_enabled():
        return None
    path = request.path
    managed_paths = {"/login", "/setup", "/reset-password", "/auth/change", "/auth/change-password"}
    managed_prefixes = ("/auth/login", "/auth/reset-password", "/auth/2fa/")
    if path not in managed_paths and not path.startswith(managed_prefixes):
        return None
    if request.method == "GET" and not path.startswith("/auth/2fa/"):
        return redirect("/auth/instance-login")
    authority = login_authority()
    return jsonify(
        status="error",
        message="Use your original OpenAlgo account to manage login, password and two-factor settings.",
        redirect=f"{authority[2]}/profile",
    ), 403

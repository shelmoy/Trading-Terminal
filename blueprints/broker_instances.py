"""Browser routes for the explicitly configured local broker instances."""

import os
import re
import secrets
import sqlite3
import time
from urllib.parse import urlencode

from flask import Blueprint, abort, jsonify, redirect, session

from utils.broker_instances import import_primary_login, login_authority, managed_login_enabled
from utils.session import is_session_valid

broker_instances_bp = Blueprint("broker_instances", __name__, url_prefix="/auth")


@broker_instances_bp.route("/instance-login", methods=["GET"])
def instance_login():
    """Reuse the app identity, then begin this instance's own broker login."""
    broker_match = re.search(r"/([a-z0-9_]+)/callback$", os.getenv("REDIRECT_URL", ""))
    if broker_match is None:
        return jsonify(status="error", message="Broker callback is not configured."), 503
    broker = broker_match.group(1)
    if session.get("logged_in") and session.get("broker") == broker and is_session_valid():
        from database.auth_db import get_auth_token

        if get_auth_token(session.get("user")):
            return redirect("/dashboard")
    if managed_login_enabled():
        try:
            if not import_primary_login():
                authority = login_authority()
                return redirect(f"{authority[2]}/broker")
        except (ValueError, OSError, sqlite3.Error):
            return jsonify(status="error", message="The original OpenAlgo login could not be linked. Check the local instance configuration."), 503
    if not session.get("user"):
        return redirect("/login")
    # A broker that needs reconnecting must not hit brlogin's already-logged-in
    # shortcut. Its old DB token is retained until successful authentication.
    session.pop("logged_in", None)
    session.pop("broker", None)
    if broker == "fyers":
        return redirect("/auth/fyers/start")
    return redirect(f"/{broker}/callback")


@broker_instances_bp.route("/fyers/start", methods=["GET"])
def fyers_start():
    if not os.getenv("REDIRECT_URL", "").endswith("/fyers/callback"):
        abort(404)
    if not session.get("user"):
        return redirect("/auth/instance-login")
    if session.get("logged_in") and is_session_valid():
        from database.auth_db import get_auth_token

        if get_auth_token(session.get("user")):
            return redirect("/dashboard")
    if managed_login_enabled():
        try:
            if not import_primary_login():
                authority = login_authority()
                return redirect(f"{authority[2]}/broker")
        except (ValueError, OSError, sqlite3.Error):
            return jsonify(status="error", message="The original OpenAlgo login could not be linked."), 503
    session.pop("logged_in", None)
    session.pop("broker", None)
    client_id = os.getenv("BROKER_API_KEY", "")
    if not client_id or not os.getenv("BROKER_API_SECRET"):
        return jsonify(status="error", message="FYERS App ID and App Secret are not configured."), 503
    state = secrets.token_urlsafe(32)
    session["fyers_oauth_state"] = state
    session["fyers_oauth_started"] = time.time()
    return redirect("https://api-t1.fyers.in/api/v3/generate-authcode?" + urlencode({
        "client_id": client_id,
        "redirect_uri": os.getenv("REDIRECT_URL"),
        "response_type": "code",
        "state": state,
    }))

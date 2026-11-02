"""Browser routes for the explicitly configured local broker instances."""

import os
import re
import sqlite3
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
                return redirect(f"{authority[2]}/login?{urlencode({'broker': broker})}")
        except (ValueError, OSError, sqlite3.Error):
            return jsonify(
                status="error",
                message="The original OpenAlgo login could not be linked. Check the local instance configuration.",
            ), 503
    if not session.get("user"):
        return redirect("/login")
    # A GET handoff establishes only app identity. The native broker page
    # starts its own broker through the upstream CSRF-checked POST; a link or
    # bookmark must never create a pending OAuth login or send an OTP.
    return redirect("/broker?" + urlencode({"broker": broker}))


@broker_instances_bp.route("/fyers/start", methods=["GET"])
def fyers_start():
    """Compatibility bookmark; broker login now needs an explicit CSRF POST."""
    if not os.getenv("REDIRECT_URL", "").endswith("/fyers/callback"):
        abort(404)
    return redirect("/auth/instance-login")

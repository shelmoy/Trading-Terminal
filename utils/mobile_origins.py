"""Explicit private-cloud browser origins, separate from loopback SSO authority.

No request header becomes configuration. The local reverse proxy must preserve
the internal Host; it is not trusted to choose an identity or destination.
"""

import json
import os
import re
from urllib.parse import urlsplit


def dual_access():
    return os.getenv("PRIVATE_ACCESS_MODE", "") == "dual"


def private_request():
    """Only the owned loopback proxy marks private HTTPS requests."""
    from flask import has_request_context, request

    if not has_request_context():
        return False
    from utils.broker_instances import loopback_origin

    expected = private_origin(os.getenv("PUBLIC_ORIGIN", ""))
    return bool(
        expected
        and request.remote_addr in {"127.0.0.1", "::1"}
        and request.host_url.rstrip("/") == loopback_origin(os.getenv("HOST_SERVER"))
        and request.headers.get("X-Terminal-Private-Origin") == expected
    )


def local_browser_request():
    from flask import has_request_context

    return dual_access() and has_request_context() and not private_request()


def private_origin(value):
    if not isinstance(value, str):
        return None
    try:
        p = urlsplit(value)
        port = p.port or 443
    except ValueError:
        return None
    if (
        p.scheme != "https"
        or not p.hostname
        or not re.fullmatch(r"[a-z0-9-]+\.[a-z0-9-]+\.ts\.net", p.hostname)
        or port not in (443, 8443)
        or p.username is not None
        or p.password is not None
        or p.path not in ("", "/")
        or p.query
        or p.fragment
    ):
        return None
    return f"https://{p.hostname}" + (":8443" if port == 8443 else "")


def cloud_origins():
    """Fail closed on partial/invalid configuration, disabled by default."""
    own = os.getenv("PUBLIC_ORIGIN", "")
    raw = os.getenv("BROKER_PUBLIC_ORIGINS", "")
    if os.getenv("PRIVATE_ACCESS_MODE", "") not in {"", "dual"}:
        raise ValueError("Unsupported private access mode")
    if not own and not raw:
        if dual_access():
            raise ValueError("Dual access requires explicit private origins")
        return {}
    try:
        values = json.loads(raw)
    except (ValueError, TypeError) as exc:
        raise ValueError("Invalid private broker origins") from exc
    if not isinstance(values, dict) or set(values) != {"kotak", "fyers"}:
        raise ValueError("Configure exactly Kotak and FYERS private origins")
    result = {k: private_origin(v) for k, v in values.items()}
    if (
        not all(result.values())
        or private_origin(own) not in result.values()
        or result["kotak"] + ":8443" != result["fyers"]
    ):
        raise ValueError("Private broker origins must share one HTTPS tailnet host on 443/8443")
    return result


def browser_origin(internal=None, config=None):
    """Trusted configured URL for browser links/cookies; never changes HOST_SERVER."""
    values = os.environ if config is None else config
    external = values.get("PUBLIC_ORIGIN", "")
    if external:
        origin = private_origin(external)
        if not origin:
            raise ValueError("Invalid private public origin")
        return origin
    return internal or values.get("HOST_SERVER", "http://127.0.0.1:5000")


def external_instance_origin(internal):
    from utils.broker_instances import configured_instances

    mapping = cloud_origins()
    if not mapping or local_browser_request():
        return internal
    for broker, origin in configured_instances().items():
        if origin == internal and broker in mapping:
            return mapping[broker]
    raise ValueError("Unconfigured internal broker origin")


def guard_cloud_origin():
    """The cloud proxy is loopback-only; mutations require this origin + existing CSRF."""
    from flask import abort, request

    if not cloud_origins():
        return None
    from utils.broker_instances import loopback_origin

    if request.remote_addr not in {"127.0.0.1", "::1"} or request.host_url.rstrip(
        "/"
    ) != loopback_origin(os.getenv("HOST_SERVER")):
        abort(403)
    # Public APIs retain their existing token authentication. Mobile forms and
    # native completion use session cookies and must originate at their own port.
    if request.method not in {"GET", "HEAD", "OPTIONS"} and not request.path.startswith("/api/v1/"):
        source = request.headers.get("Origin")
        if not source:
            ref = urlsplit(request.headers.get("Referer", ""))
            source = f"{ref.scheme}://{ref.netloc}"
        if (
            dual_access()
            and request.headers.get("X-Terminal-Private-Origin")
            and not private_request()
        ):
            abort(403)
        expected = os.getenv("HOST_SERVER") if local_browser_request() else browser_origin()
        if source != expected:
            abort(403)


def install_dual_session_interface(app):
    """Choose cookie name/security per request without mutating shared config."""
    from flask.sessions import SecureCookieSessionInterface

    class DualSessionInterface(SecureCookieSessionInterface):
        def get_cookie_name(self, app):
            name = super().get_cookie_name(app)
            return "__Secure-" + name if private_request() else name

        def get_cookie_secure(self, app):
            return private_request() or super().get_cookie_secure(app)

    app.session_interface = DualSessionInterface()


def request_websocket_url():
    if dual_access() and private_request():
        return browser_origin().replace("https://", "wss://") + "/ws"
    return os.getenv("WEBSOCKET_URL", "ws://localhost:8765")

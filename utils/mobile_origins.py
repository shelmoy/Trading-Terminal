"""Explicit private-cloud browser origins, separate from loopback SSO authority.

No request header becomes configuration. The local reverse proxy must preserve
the internal Host; it is not trusted to choose an identity or destination.
"""

import json
import os
import re
from urllib.parse import urlsplit


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
    if not own and not raw:
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
    if not mapping:
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
        if source != browser_origin():
            abort(403)

"""Render laptop-only private access. Does not edit .env or start/restart servers."""

import argparse
import json
import re
from pathlib import Path


def render(host: str, output: Path, primary: Path, fyers: Path):
    if not re.fullmatch(r"[a-z0-9-]+\.[a-z0-9-]+\.ts\.net", host):
        raise ValueError("Use the exact Tailscale MagicDNS hostname")
    if not primary.is_absolute() or not fyers.is_absolute() or primary == fyers:
        raise ValueError("Use distinct absolute installation paths")
    origins = {"kotak": f"https://{host}", "fyers": f"https://{host}:8443"}
    internal = {"kotak": "http://127.0.0.1:5000", "fyers": "http://127.0.0.1:5001"}
    servers = {}
    output.mkdir(parents=True, exist_ok=True)
    for i, broker in enumerate(origins):
        own = origins[broker]
        servers[broker] = {
            "listen": [f"127.0.0.1:{15000 + i}"],
            "automatic_https": {"disable": True},
            "routes": [
                {
                    "match": [{"path": ["/ws", "/ws/*"]}],
                    "terminal": True,
                    "handle": [
                        {
                            "handler": "subroute",
                            "routes": [
                                {
                                    "match": [{"header": {"Origin": [own]}}],
                                    "handle": [
                                        {
                                            "handler": "reverse_proxy",
                                            "upstreams": [{"dial": f"127.0.0.1:{8765 + i}"}],
                                        }
                                    ],
                                },
                                {"handle": [{"handler": "static_response", "status_code": 403}]},
                            ],
                        }
                    ],
                },
                {
                    "handle": [
                        {
                            "handler": "reverse_proxy",
                            "headers": {
                                "request": {
                                    "set": {
                                        "Host": [f"127.0.0.1:{5000 + i}"],
                                        "X-Terminal-Private-Origin": [own],
                                    }
                                }
                            },
                            "upstreams": [{"dial": f"127.0.0.1:{5000 + i}"}],
                        }
                    ]
                },
            ],
        }
        settings = {
            "HOST_SERVER": internal[broker],
            "PRIVATE_ACCESS_MODE": "dual",
            "PUBLIC_ORIGIN": own,
            "BROKER_INSTANCES": json.dumps(internal, separators=(",", ":")),
            "BROKER_PUBLIC_ORIGINS": json.dumps(origins, separators=(",", ":")),
            "REDIRECT_URL": own + f"/{broker}/callback",
        }
        if broker == "fyers":
            settings["BROKER_LOGIN_SOURCE_ENV"] = str(primary / ".env")
        # No secret values are accepted. Existing cookie names, encryption and
        # broker keys must survive the separately backed-up activation step.
        (output / f"{broker}.settings.json").write_text(
            json.dumps(settings, indent=2), encoding="utf-8"
        )
    proxy = {
        "admin": {"disabled": True},
        "logging": {"logs": {"default": {"level": "ERROR", "exclude": ["http.log.error"]}}},
        "apps": {"http": {"servers": servers}},
    }
    (output / "caddy.json").write_text(json.dumps(proxy, indent=2), encoding="utf-8")
    (output / "serve-commands.txt").write_text(
        "tailscale serve --bg --https=443 http://127.0.0.1:15000\n"
        "tailscale serve --bg --https=8443 http://127.0.0.1:15001\n",
        encoding="utf-8",
    )
    (output / "android-build-property.txt").write_text(f"-PterminalHost={host}\n", encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", required=True)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--primary", required=True, type=Path)
    parser.add_argument("--fyers", required=True, type=Path)
    args = parser.parse_args()
    render(args.host, args.output, args.primary, args.fyers)

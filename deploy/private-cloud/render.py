"""Render private deployment files only; never provisions or activates resources.

Run on Windows. No credentials are input or written. Review the account's ₹0
estimate and resource allowance before deploying the generated configuration.
"""

import argparse
import json
import re
from pathlib import Path


def render(host, output):
    if not re.fullmatch(r"[a-z0-9-]+\.[a-z0-9-]+\.ts\.net", host):
        raise ValueError("Expected the server's exact MagicDNS .ts.net hostname")
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    origins = {"kotak": f"https://{host}", "fyers": f"https://{host}:8443"}
    internal = {"kotak": "http://127.0.0.1:5000", "fyers": "http://127.0.0.1:5001"}
    for n, broker in enumerate(origins):
        origin = origins[broker]
        settings = {
            "HOST_SERVER": internal[broker],
            "PUBLIC_ORIGIN": origin,
            "BROKER_INSTANCES": json.dumps(internal, separators=(",", ":")),
            "BROKER_PUBLIC_ORIGINS": json.dumps(origins, separators=(",", ":")),
            "SESSION_COOKIE_NAME": f"terminal_{broker}",
            "REDIRECT_URL": f"{origin}/{broker}/callback",
            "WEBSOCKET_URL": origin.replace("https://", "wss://") + "/ws",
            "WEBSOCKET_HOST": "127.0.0.1",
            "WEBSOCKET_PORT": str(8765 + n),
            "ZMQ_HOST": "127.0.0.1",
            "ZMQ_PORT": str(5555 + n),
            "FLASK_DEBUG": "False",
            "NGROK_ENABLED": "False",
        }
        if broker == "fyers":
            settings["BROKER_LOGIN_SOURCE_ENV"] = "/srv/trading/kotak/.env"
        (output / f"{broker}.settings.json").write_text(
            json.dumps(settings, indent=2) + "\n", encoding="utf-8"
        )
        # Secrets stay in each private .env. Do not use systemd EnvironmentFile:
        # the repository launcher parses the existing dotenv syntax itself.
        unit = f"""[Unit]
Description=Trading Terminal {broker}
After=network-online.target tailscaled.service
Wants=network-online.target
[Service]
Type=simple
User=trading
Group=trading
WorkingDirectory=/srv/trading/{broker}
ExecStart=/bin/bash /srv/trading/{broker}/install/openalgo-gunicorn.sh --venv /srv/trading/{broker}/.venv --bind 127.0.0.1:{5000 + n} --proxy-mode subprocess
Restart=on-failure
RestartSec=10
TimeoutStopSec=60
KillMode=control-group
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
[Install]
WantedBy=multi-user.target
"""
        (output / f"terminal-{broker}.service").write_text(unit, encoding="utf-8")
        nginx = f"""# HTTP loopback hop behind private Tailscale TLS. Never listen on 0.0.0.0.
server {{
    listen 127.0.0.1:{15000 + n};
    server_name localhost;
    client_max_body_size 10m;
    access_log off; # OAuth query strings must never enter access logs.
    location /ws {{
        if ($http_origin != "{origin}") {{ return 403; }}
        proxy_pass http://127.0.0.1:{8765 + n};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 3600s;
    }}
    location / {{
        proxy_pass http://127.0.0.1:{5000 + n};
        proxy_set_header Host 127.0.0.1:{5000 + n};
        proxy_set_header X-Forwarded-For "";
        proxy_set_header X-Forwarded-Host "";
        proxy_set_header X-Forwarded-Proto "";
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 3600s;
    }}
}}
"""
        (output / f"{broker}.nginx.conf").write_text(nginx, encoding="utf-8")
    (output / "tailscale-serve.txt").write_text(
        "# Run only after private-only exposure and app health are verified.\n"
        "tailscale serve --bg --https=443 http://127.0.0.1:15000\n"
        "tailscale serve --bg --https=8443 http://127.0.0.1:15001\n"
        "# Never use tailscale funnel.\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", required=True)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    render(args.host, args.output)

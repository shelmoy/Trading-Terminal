"""Run one local OpenAlgo instance with its own environment and working folder."""

import argparse
import os
import runpy
import sys
from pathlib import Path

from dotenv import dotenv_values, load_dotenv


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--app", required=True)
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--ws-port", type=int, required=True)
    parser.add_argument("--zmq-port", type=int, required=True)
    args = parser.parse_args()
    app = Path(args.app).resolve(strict=True)
    if app.name != "app.py":
        raise SystemExit("Expected an OpenAlgo app.py file")
    root = app.parent
    env_file = root / ".env"
    if not env_file.is_file():
        raise SystemExit("The instance .env file is missing")

    # Do not inherit another broker's OpenAlgo settings from a calling terminal.
    # Only this child process is changed; Windows and the parent keep their env.
    protected = {"PATH", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "USERPROFILE"}
    sample = root / ".sample.env"
    if sample.is_file():
        for key in dotenv_values(sample, interpolate=False):
            if key.upper() not in protected:
                os.environ.pop(key, None)
    load_dotenv(env_file, override=True)
    for key, expected in (
        ("FLASK_PORT", args.port),
        ("WEBSOCKET_PORT", args.ws_port),
        ("ZMQ_PORT", args.zmq_port),
    ):
        if os.environ.get(key) != str(expected):
            raise SystemExit(f"{key} differs from the controller's instance configuration")
    os.environ["PYTHONUTF8"] = "1"
    os.environ["PYTHONUNBUFFERED"] = "1"
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    os.chdir(root)
    sys.path.insert(0, str(root))
    sys.argv = [str(app)]
    runpy.run_path(str(app), run_name="__main__")


if __name__ == "__main__":
    main()

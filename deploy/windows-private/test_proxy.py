"""Isolated Windows proxy checks against fake local HTTP servers only."""

import argparse
import importlib.util
import json
import subprocess
import tempfile
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


def main(caddy):
    spec = importlib.util.spec_from_file_location(
        "laptop_renderer", Path(__file__).with_name("render.py")
    )
    renderer = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(renderer)
    servers = []
    received = []

    class FakeBroker(BaseHTTPRequestHandler):
        def do_GET(self):
            received.append(dict(self.headers))
            self.send_response(200)
            self.end_headers()
            self.wfile.write(
                json.dumps(
                    {"host": self.headers.get("Host"), "origin": self.headers.get("Origin")}
                ).encode()
            )

        def log_message(self, *_):
            pass

    with tempfile.TemporaryDirectory(prefix="terminal-proxy-") as directory:
        directory = Path(directory)
        renderer.render(
            "terminal.example.ts.net", directory, directory / "kotak", directory / "fyers"
        )
        config = json.loads((directory / "caddy.json").read_text())
        for i, name in enumerate(["kotak", "fyers"]):
            upstream = ThreadingHTTPServer(("127.0.0.1", 0), FakeBroker)
            servers.append(upstream)
            threading.Thread(target=upstream.serve_forever, daemon=True).start()
            entry = config["apps"]["http"]["servers"][name]
            # Validate the production config stays loopback-only and has no admin port.
            assert entry["listen"] == [f"127.0.0.1:{15000 + i}"]
            entry["listen"] = [f"127.0.0.1:{15380 + i}"]
            target = f"127.0.0.1:{upstream.server_port}"
            entry["routes"][0]["handle"][0]["routes"][0]["handle"][0]["upstreams"][0]["dial"] = (
                target
            )
            entry["routes"][1]["handle"][0]["upstreams"][0]["dial"] = target
        assert config["admin"]["disabled"]
        (directory / "caddy.json").write_text(json.dumps(config))
        child = subprocess.Popen(
            [str(caddy), "run", "--config", str(directory / "caddy.json")],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        try:
            for _ in range(100):
                if child.poll() is not None:
                    raise RuntimeError("Fixture proxy exited")
                try:
                    urllib.request.urlopen("http://127.0.0.1:15380/", timeout=0.2).close()
                    break
                except OSError:
                    time.sleep(0.05)
            for i in [0, 1]:
                origin = "https://terminal.example.ts.net" + (":8443" if i else "")
                url = f"http://127.0.0.1:{15380 + i}"
                with urllib.request.urlopen(
                    urllib.request.Request(url + "/mobile/bootstrap", headers={"Origin": origin}),
                    timeout=3,
                ) as response:
                    result = json.load(response)
                    assert result["host"] == f"127.0.0.1:{5000 + i}"
                    assert result["origin"] == origin
                count = len(received)
                try:
                    urllib.request.urlopen(
                        urllib.request.Request(
                            url + "/ws", headers={"Origin": "https://evil.invalid"}
                        ),
                        timeout=3,
                    )
                    raise AssertionError("Unapproved WebSocket origin reached backend")
                except urllib.error.HTTPError as exc:
                    assert exc.code == 403
                assert len(received) == count
                with urllib.request.urlopen(
                    urllib.request.Request(url + "/ws", headers={"Origin": origin}), timeout=3
                ) as response:
                    assert response.status == 200
            print("Passed 8 fake-backend routing/origin checks; no live broker contacted.")
        finally:
            child.terminate()
            child.wait(timeout=10)
            for upstream in servers:
                upstream.shutdown()
                upstream.server_close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--caddy", required=True, type=Path)
    main(parser.parse_args().caddy)

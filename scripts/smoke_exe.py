"""Windows CI smoke test for the actual PyInstaller-built exe (never prints)."""

from __future__ import annotations

import os
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python scripts/smoke_exe.py dist/T02-Studio.exe")
    executable = Path(sys.argv[1]).resolve()
    if not executable.is_file():
        raise SystemExit(f"No built executable: {executable}")

    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    env = {**os.environ, "T02_BIND_HOST": "127.0.0.1",
           "T02_PORT": str(port), "T02_NO_BROWSER": "1"}
    process = subprocess.Popen([str(executable)], env=env)
    try:
        base = f"http://127.0.0.1:{port}"
        deadline = time.monotonic() + 90
        while True:
            if process.poll() is not None:
                raise RuntimeError(f"EXE exited early: {process.returncode}")
            try:
                with urllib.request.urlopen(base + "/", timeout=2) as response:
                    html = response.read().decode("utf-8")
                    if "T02 Studio" not in html or response.status != 200:
                        raise AssertionError("Editor HTML was not bundled correctly")
                break
            except (ConnectionError, TimeoutError, urllib.error.URLError):
                if time.monotonic() >= deadline:
                    raise TimeoutError("EXE did not start the local editor in 90 seconds")
                time.sleep(0.5)

        for path, expected in [("/static/studio.js", b"projectData"),
                               ("/static/studio-alt.css", b"body")]:
            with urllib.request.urlopen(base + path, timeout=5) as response:
                assert response.status == 200 and expected in response.read(), path
        with urllib.request.urlopen(base + "/api/printers", timeout=5) as response:
            assert b'"ports"' in response.read(), "Printer discovery route failed"
        print("PASS: standalone EXE served the English editor, CSS, JS, and printer discovery")
    finally:
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=10)


if __name__ == "__main__":
    main()

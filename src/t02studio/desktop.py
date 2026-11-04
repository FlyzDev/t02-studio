"""Entry point for the double-clickable, self-contained Windows executable."""

from __future__ import annotations

import os
import threading
import time
import urllib.error
import urllib.request
import webbrowser

from t02studio.launcher import main as run_server


def _open_browser_when_ready(host: str, port: int) -> None:
    """Avoid opening a broken tab while the server is still starting."""
    url = f"http://{host}:{port}/"
    for _ in range(120):
        try:
            with urllib.request.urlopen(url + "api/status", timeout=0.5) as response:
                if response.status == 200 and b'"port_visible"' in response.read():
                    webbrowser.open(url)
                    return
        except (OSError, urllib.error.URLError):
            pass
        time.sleep(0.25)
    print(f"Could not open the browser automatically. Visit {url} manually.", flush=True)


def main() -> None:
    # Match start.ps1 defaults; do not enable unauthenticated LAN access by default.
    host = os.environ.setdefault("T02_BIND_HOST", "127.0.0.1")
    port = int(os.environ.setdefault("T02_PORT", "8062"))
    if os.environ.get("T02_NO_BROWSER") != "1":
        threading.Thread(
            target=_open_browser_when_ready, args=(host, port), daemon=True
        ).start()
    print("T02 Studio Windows edition. Keep this window open while using the editor.", flush=True)
    print("Close this window to stop the local server. No printer job starts automatically.", flush=True)
    run_server()


if __name__ == "__main__":
    main()

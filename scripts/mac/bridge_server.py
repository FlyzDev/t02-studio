"""Localhost-only, authenticated macOS RFCOMM print bridge. Python stdlib only."""
from __future__ import annotations
import hmac
import json
from pathlib import Path
import subprocess
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PROJECT = Path(__file__).resolve().parents[2]
CONFIG = PROJECT / ".env"
RUNNER = PROJECT / "build/mac/t02-rfcomm"
JOB_LOCK = threading.Lock()

def load_config():
    result = {}
    for line in CONFIG.read_text(encoding="utf-8").splitlines():
        key, sep, value = line.partition("=")
        if sep and key.strip() and not key.lstrip().startswith("#"):
            result[key.strip()] = value.strip().strip("'\"")
    return result

class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "T02LocalBridge/1"
    def log_message(self, fmt, *args):
        print("T02 Bridge: " + fmt % args, flush=True)
    def respond(self, code, data):
        blob = json.dumps(data, separators=(",", ":")).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(blob)))
        self.end_headers()
        self.wfile.write(blob)
    def authorize(self):
        if not hmac.compare_digest(self.headers.get("Authorization", ""), "Bearer " + self.server.token):
            self.respond(401, {"error":"Unauthorized local print bridge"})
            return False
        return True
    def do_GET(self):
        if self.path != "/health":
            return self.respond(404, {"error":"Not found"})
        if self.authorize():
            self.respond(200, {"status":"ready", "port":"MAC_T02", "description":"Phomemo T02 via macOS RFCOMM"})
    def do_POST(self):
        if self.path != "/print": return self.respond(404, {"error":"Not found"})
        if not self.authorize(): return
        try: length = int(self.headers.get("Content-Length", "0"))
        except ValueError: length = 0
        if not 16 <= length <= 450_000: return self.respond(413, {"error":"Invalid print job size"})
        if not JOB_LOCK.acquire(blocking=False): return self.respond(409, {"error":"Printer busy"})
        try:
            payload = self.rfile.read(length)
            if len(payload) != length or not payload.startswith(b"\x1b@\x1ba\x01"):
                return self.respond(400, {"error":"Invalid T02 raster stream"})
            try:
                done = subprocess.run([str(RUNNER), self.server.device_address], input=payload,
                        stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=150, check=False)
            except subprocess.TimeoutExpired:
                return self.respond(504, {"error":"Printer connection timed out"})
            except OSError:
                return self.respond(503, {"error":"macOS print helper unavailable"})
            if done.returncode:
                message = done.stderr.decode("utf-8", "replace").strip() or "Bluetooth transfer failed"
                return self.respond(502, {"error": message[:500]})
            self.respond(200, {"status":"sent", "bytes_written":len(payload)})
        finally:
            JOB_LOCK.release()

def main():
    cfg = load_config()
    token, address = cfg.get("T02_BRIDGE_TOKEN", ""), cfg.get("T02_BT_ADDRESS", "")
    if len(token) < 32: raise SystemExit("T02_BRIDGE_TOKEN is not configured")
    if not address: raise SystemExit("T02_BT_ADDRESS is not configured")
    if not RUNNER.is_file(): raise SystemExit("Swift helper is not built")
    server = ThreadingHTTPServer(("127.0.0.1", 8063), Handler)
    server.token, server.device_address = token, address
    server.daemon_threads = True
    print("T02 Bridge ready on 127.0.0.1:8063", flush=True)
    server.serve_forever(poll_interval=0.2)

if __name__ == "__main__":
    main()

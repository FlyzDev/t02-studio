"""Authenticated host-loopback print transport for Mac mini Docker installs."""
from __future__ import annotations

import json
import urllib.error
import urllib.request

from PIL import Image

from .printer import PrintResult, PrinterBusy, PrinterError, PrinterUnavailable
from .protocol import encode_raster

MAC_PRINTER_PORT = "MAC_T02"
BRIDGE_TIMEOUT_SECONDS = 155


def _request(path: str, token: str, url: str, data: bytes | None = None):
    request = urllib.request.Request(
        url.rstrip("/") + path,
        data=data,
        method="POST" if data is not None else "GET",
        headers={"Authorization": "Bearer " + token,
                 "Content-Type": "application/octet-stream" if data is not None else "application/json"},
    )
    return urllib.request.urlopen(request, timeout=BRIDGE_TIMEOUT_SECONDS if data is not None else 2.5)


def bridge_visible(token: str, url: str) -> bool:
    if not token:
        return False
    try:
        with _request("/health", token, url) as response:
            return json.load(response).get("port") == MAC_PRINTER_PORT
    except (OSError, ValueError, urllib.error.URLError, TimeoutError):
        return False


def bridge_port() -> dict[str, str | bool]:
    return {"port": MAC_PRINTER_PORT,
            "description": "Phomemo T02 on Mac mini",
            "transport": "Bluetooth",
            "likely_printer": True}


def print_via_bridge(image: Image.Image, port_name: str, token: str, url: str) -> PrintResult:
    if port_name != MAC_PRINTER_PORT or not token:
        raise PrinterUnavailable("Mac mini Bluetooth print bridge is not configured")
    payload = encode_raster(image)
    try:
        with _request("/print", token, url, payload) as response:
            result = json.load(response)
        if result.get("status") != "sent" or result.get("bytes_written") != len(payload):
            raise PrinterError("Printer bridge returned an incomplete result")
    except urllib.error.HTTPError as exc:
        try:
            message = json.loads(exc.read().decode()).get("error", "Printer bridge failed")
        except (ValueError, OSError):
            message = "Printer bridge failed"
        if exc.code == 409:
            raise PrinterBusy(message) from exc
        if exc.code in (401, 503, 504):
            raise PrinterUnavailable(message) from exc
        raise PrinterError(message) from exc
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise PrinterUnavailable("Mac mini Bluetooth print bridge is unreachable") from exc
    return PrintResult(port_name=port_name, bytes_written=len(payload))

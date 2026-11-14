"""Tests for the authenticated macOS Bluetooth bridge client."""
import io
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError

from PIL import Image
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from t02studio.mac_bridge import MAC_PRINTER_PORT, bridge_visible, print_via_bridge
from t02studio.printer import PrinterBusy, PrinterUnavailable


class BridgeTests(unittest.TestCase):
    def test_no_key_means_no_discovery(self):
        self.assertFalse(bridge_visible("", "http://host.docker.internal:8063"))

    def test_valid_discovery(self):
        with patch("t02studio.mac_bridge._request",
                   return_value=io.BytesIO(b'{"port":"MAC_T02","status":"ready"}')):
            self.assertTrue(bridge_visible("testtoken", "http://bridge"))

    def test_sends_raster_and_reports_bytes(self):
        image = Image.new("1", (384, 3), 1)
        def fake_request(path, token, url, data):
            self.assertEqual("/print", path)
            self.assertEqual("testtoken", token)
            self.assertTrue(data.startswith(b"\x1b@\x1ba\x01"))
            return io.BytesIO(json.dumps({"status": "sent", "bytes_written": len(data)}).encode())
        with patch("t02studio.mac_bridge._request", side_effect=fake_request):
            result = print_via_bridge(image, MAC_PRINTER_PORT, "testtoken", "http://bridge")
            self.assertGreater(result.bytes_written, 100)

    def test_wrong_port_is_rejected(self):
        with self.assertRaises(PrinterUnavailable):
            print_via_bridge(Image.new("1", (384, 3), 1), "COM6", "", "http://bridge")

    def test_busy_returns_busy_exception(self):
        error = HTTPError("http://bridge/print", 409, "busy", {},
                          io.BytesIO(b'{"error":"Printer busy"}'))
        with patch("t02studio.mac_bridge._request", side_effect=error):
            with self.assertRaises(PrinterBusy):
                print_via_bridge(Image.new("1", (384, 3), 1),
                                 MAC_PRINTER_PORT, "testtoken", "http://bridge")


if __name__ == "__main__":
    unittest.main()

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from t02studio.discovery import available_ports


class DiscoveryTests(unittest.TestCase):
    def test_prioritizes_printer_name_but_keeps_other_ports_selectable(self):
        def ports():
            return [
                SimpleNamespace(device="COM18", description="USB Serial Device", hwid="USB VID:PID=1234:5678", vid=1234),
                SimpleNamespace(device="COM7", description="Standard Serial over Bluetooth link", hwid="BTHENUM\\Dev_001", vid=None),
                SimpleNamespace(device="COM4", description="Phomemo T02 Mini", hwid="BTHENUM\\Dev_002", vid=None),
            ]

        items = available_ports(ports)
        self.assertEqual(["COM4", "COM7", "COM18"], [item["port"] for item in items])
        self.assertEqual([True, False, False], [item["likely_printer"] for item in items])
        self.assertEqual(["Bluetooth", "Bluetooth", "USB"], [item["transport"] for item in items])

    def test_invalid_and_duplicate_com_names_are_ignored(self):
        def ports():
            return [SimpleNamespace(device="COM0", description="Broken"),
                    SimpleNamespace(device="COM4", description="A"),
                    SimpleNamespace(device="com4", description="Duplicate"),
                    SimpleNamespace(device="/dev/ttyUSB0", description="Linux"),
                    SimpleNamespace(device="COM1234", description="Out of range")]

        self.assertEqual(["COM4"], [item["port"] for item in available_ports(ports)])


if __name__ == "__main__":
    unittest.main()

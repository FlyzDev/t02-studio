import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from t02studio.launcher import validate_bind_host


class PackagingTests(unittest.TestCase):
    def test_bind_address_must_be_loopback_or_home_lan(self):
        self.assertEqual("127.0.0.1", validate_bind_host("127.0.0.1"))
        self.assertEqual("192.168.1.22", validate_bind_host("192.168.1.22"))
        self.assertEqual("10.5.7.9", validate_bind_host("10.5.7.9"))
        for wrong in ("0.0.0.0", "8.8.8.8", "bad-hostname", "::"):
            with self.subTest(wrong=wrong), self.assertRaises(ValueError):
                validate_bind_host(wrong)


if __name__ == "__main__":
    unittest.main()

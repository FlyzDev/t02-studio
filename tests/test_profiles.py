import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from t02studio.profiles import PrinterProfile, T02_PROFILE, VERIFIED_PROFILES, verified_profile


class PrinterProfileTests(unittest.TestCase):
    def test_t02_is_the_only_hardware_verified_profile(self):
        self.assertEqual((T02_PROFILE,), VERIFIED_PROFILES)
        self.assertIs(T02_PROFILE, verified_profile("phomemo-t02"))
        self.assertEqual("escpos-gsv0", T02_PROFILE.protocol)
        self.assertEqual("serial", T02_PROFILE.transport)

    def test_unknown_profile_is_fail_closed(self):
        with self.assertRaisesRegex(ValueError, "not hardware-verified"):
            verified_profile("generic-escpos")

    def test_profile_dimensions_and_transport_are_validated(self):
        with self.assertRaisesRegex(ValueError, "divisible by 8"):
            PrinterProfile(id="bad", name="Bad", width_px=385, dpi=203,
                           max_height_px=8000, protocol="escpos-gsv0", transport="network")
        with self.assertRaisesRegex(ValueError, "baud rate"):
            PrinterProfile(id="bad-serial", name="Bad", width_px=576, dpi=203,
                           max_height_px=8000, protocol="escpos-gsv0", transport="serial")

    def test_public_manifest_excludes_implementation_details(self):
        capabilities = T02_PROFILE.public_capabilities()
        self.assertEqual(384, capabilities["width_px"])
        self.assertEqual(203, capabilities["dpi"])
        self.assertNotIn("baudrate", capabilities)


if __name__ == "__main__":
    unittest.main()

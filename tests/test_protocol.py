import sys
import unittest
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from t02studio.protocol import encode_raster


class ProtocolTests(unittest.TestCase):
    def test_one_black_pixel_sets_high_bit_and_uses_48_byte_row(self):
        image = Image.new("1", (384, 1), 1)
        image.putpixel((0, 0), 0)
        payload = encode_raster(image)
        self.assertEqual(bytes([0x1B, 0x40, 0x1B, 0x61, 0x01]), payload[:5])
        self.assertEqual(bytes([0x1D, 0x76, 0x30, 0, 48, 0, 1, 0]), payload[5:13])
        self.assertEqual(0x80, payload[13])
        self.assertEqual(bytes(47), payload[14:61])
        self.assertEqual(bytes([0x1B, 0x64, 0x03]), payload[-3:])

    def test_256_rows_use_two_raster_blocks(self):
        image = Image.new("1", (384, 256), 1)
        payload = encode_raster(image)
        marker = bytes([0x1D, 0x76, 0x30, 0])
        self.assertEqual(2, payload.count(marker))
        self.assertEqual(bytes([48, 0, 255, 0]), payload[9:13])
        second = 5 + 8 + 255 * 48
        self.assertEqual(marker + bytes([48, 0, 1, 0]), payload[second:second+8])

    def test_wrong_width_and_excessive_length_fail_before_encoding(self):
        with self.assertRaisesRegex(ValueError, "384"):
            encode_raster(Image.new("1", (100, 20), 1))
        with self.assertRaisesRegex(ValueError, "uzun"):
            encode_raster(Image.new("1", (384, 8001), 1))


if __name__ == "__main__":
    unittest.main()

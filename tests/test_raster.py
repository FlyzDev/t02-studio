import io
import sys
import unittest
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from t02studio.raster import render_qr, render_text, render_upload


class RasterTests(unittest.TestCase):
    def test_text_is_readable_black_on_white_384_dot_receipt(self):
        image = render_text("Merhaba dunya!", font_size=28, padding=16)
        self.assertEqual(384, image.width)
        self.assertGreater(image.height, 35)
        grayscale = image.convert("L")
        self.assertLess(grayscale.getextrema()[0], 100)
        self.assertEqual(255, grayscale.getpixel((0, 0)))

    def test_text_wraps_and_increases_receipt_length(self):
        short = render_text("Bir cümle.", font_size=23, padding=16)
        long = render_text("Çok uzun bir satır kelimelerle uzadıkça rulo genişliğine göre kırılmalıdır. " * 3,
                           font_size=23, padding=16)
        self.assertGreater(long.height, short.height * 2)

    def test_empty_text_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "empty"):
            render_text("  \n  ")

    def test_extremely_long_text_is_rejected_before_word_wrapping(self):
        with self.assertRaisesRegex(ValueError, "too long"):
            render_text("x" * 25000)

    def test_uploaded_wide_image_is_proportional_and_dithered(self):
        source = Image.new("RGB", (768, 200), "black")
        source.paste("white", (384, 0, 768, 200))
        data = io.BytesIO()
        source.save(data, "PNG")
        output = render_upload(data.getvalue(), dither=False)
        self.assertEqual((384, 100), output.size)
        self.assertLess(output.convert("L").getpixel((20, 20)), 20)
        self.assertGreater(output.convert("L").getpixel((360, 20)), 230)

    def test_transparent_logo_keeps_white_paper_background(self):
        source = Image.new("RGBA", (384, 100), (0, 0, 0, 0))
        source.paste((0, 0, 0, 255), (100, 30, 280, 70))
        data = io.BytesIO()
        source.save(data, "PNG")
        output = render_upload(data.getvalue(), dither=False)
        self.assertEqual(255, output.convert("L").getpixel((10, 10)))
        self.assertEqual(0, output.convert("L").getpixel((180, 50)))

    def test_unreadable_image_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "valid image"):
            render_upload(b"this is not a picture")

    def test_oversized_upload_is_rejected_before_decode(self):
        with self.assertRaisesRegex(ValueError, "10 MB"):
            render_upload(b"x" * (10 * 1024 * 1024 + 1))

    def test_oversized_pixel_count_is_rejected(self):
        source = Image.new("RGB", (3000, 3000), "white")
        data = io.BytesIO()
        source.save(data, "PNG")
        with self.assertRaisesRegex(ValueError, "pixels"):
            render_upload(data.getvalue())

    def test_qr_label_is_mono_and_width_384(self):
        result = render_qr("https://example.com", caption="Demo kodu")
        self.assertEqual(384, result.width)
        self.assertGreaterEqual(result.height, 300)
        self.assertLess(result.convert("L").getextrema()[0], 100)

    def test_blank_qr_content_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "QR"):
            render_qr("")


if __name__ == "__main__":
    unittest.main()

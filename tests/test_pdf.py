import sys
import unittest
from pathlib import Path

import pymupdf as fitz

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from PIL import Image
from t02studio.pdf import parse_pages, render_pdf, render_pdf_segments, _validate_pixmap_size, _stack_segments


def make_pdf(two_pages: bool = False, graphics_only: bool = False) -> bytes:
    document = fitz.open()
    first = document.new_page(width=595, height=842)
    if graphics_only:
        first.draw_rect(fitz.Rect(50, 50, 300, 300), color=(0, 0, 0), fill=(0, 0, 0))
    else:
        first.insert_text((50, 70), "HEADER", fontsize=18)
        first.insert_text((50, 110), "Small page body should be reflowed to a readable receipt width.", fontsize=12)
    if two_pages:
        second = document.new_page(width=595, height=842)
        second.insert_text((50, 70), "SECOND PAGE", fontsize=18)
    return document.tobytes()


def first_black_band_height(image):
    """Height of first ink-bearing vertical band, independent of rendering code."""
    mono = image.convert("L")
    occupied = []
    for y in range(mono.height):
        if mono.crop((0, y, mono.width, y+1)).getextrema()[0] < 100:
            occupied.append(y)
    if not occupied:
        return 0
    top = occupied[0]
    bottom = top
    for y in occupied[1:]:
        if y - bottom > 5:
            break
        bottom = y
    return bottom - top + 1


class PdfTests(unittest.TestCase):
    def test_page_ranges_are_one_based_sorted_and_deduplicated(self):
        self.assertEqual([0, 2, 3], parse_pages("1, 3-4, 3", 5))
        self.assertEqual([0, 1, 2], parse_pages("", 3))
        with self.assertRaisesRegex(ValueError, "page"):
            parse_pages("2-99", 3)

    def test_fit_mode_preserves_a4_as_whole_width(self):
        image = render_pdf(make_pdf(), mode="fit", pages="1", options={})
        self.assertEqual(384, image.width)
        self.assertTrue(530 <= image.height <= 560)

    def test_smart_mode_reflows_heading_larger_than_fit(self):
        blob = make_pdf()
        fitted = render_pdf(blob, mode="fit", pages="1", options={})
        smart = render_pdf(blob, mode="smart", pages="1", options={})
        self.assertEqual(384, smart.width)
        self.assertGreater(first_black_band_height(smart), first_black_band_height(fitted))
        self.assertLess(smart.height, 250)

    def test_tiled_mode_keeps_original_content_larger(self):
        fitted = render_pdf(make_pdf(), mode="fit", pages="1", options={})
        tiled = render_pdf(make_pdf(), mode="tile", pages="1", options={})
        self.assertEqual(384, tiled.width)
        self.assertGreater(tiled.height, fitted.height * 2)

    def test_pdf_page_selection_changes_ink_content(self):
        blob = make_pdf(two_pages=True)
        first = render_pdf(blob, mode="smart", pages="1", options={})
        second = render_pdf(blob, mode="smart", pages="2", options={})
        self.assertNotEqual(first.tobytes(), second.tobytes())
        self.assertNotEqual(first.height, second.height)

    def test_invalid_and_encrypted_pdf_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "PDF"):
            render_pdf(b"not pdf", mode="smart", pages="1", options={})
        source = fitz.open(stream=make_pdf(), filetype="pdf")
        encrypted = source.tobytes(encryption=fitz.PDF_ENCRYPT_AES_256, owner_pw="owner", user_pw="secret")
        with self.assertRaisesRegex(ValueError, "encrypted"):
            render_pdf(encrypted, mode="smart", pages="1", options={})

    def test_scanned_pdf_does_not_pretend_text_was_extracted(self):
        with self.assertRaisesRegex(ValueError, "OCR"):
            render_pdf(make_pdf(graphics_only=True), mode="smart", pages="1", options={"ocr": False})

    def test_page_limit_and_invalid_mode(self):
        document = fitz.open()
        for _ in range(21):
            document.new_page()
        with self.assertRaisesRegex(ValueError, "20"):
            render_pdf(document.tobytes(), mode="fit", pages="", options={})
        with self.assertRaisesRegex(ValueError, "mode"):
            render_pdf(make_pdf(), mode="weird", pages="1", options={})

    def test_extreme_pdf_page_is_refused_before_raster_allocation(self):
        document = fitz.open()
        page = document.new_page(width=200, height=10_000)
        with self.assertRaisesRegex(ValueError, "long"):
            _validate_pixmap_size(page, 384)

    def test_long_documents_split_into_multiple_full_width_receipts(self):
        first = Image.new("1", (384, 5000), 1)
        second = Image.new("1", (384, 5000), 0)
        pieces = _stack_segments([[first], [second]])
        self.assertEqual(2, len(pieces))
        self.assertEqual([(384, 5000), (384, 5000)], [im.size for im in pieces])
        self.assertEqual(255, pieces[0].convert("L").getpixel((10, 10)))
        self.assertEqual(0, pieces[1].convert("L").getpixel((10, 10)))

    def test_page_boundary_is_preferred_over_filling_to_the_limit(self):
        first = Image.new("1", (384, 3600), 1)
        second = [Image.new("1", (384, 3200), 0), Image.new("1", (384, 3200), 0)]
        pieces = _stack_segments([[first], second])
        self.assertEqual([3600, 6407], [part.height for part in pieces])

    def test_single_page_remains_single_segment(self):
        segments = render_pdf_segments(make_pdf(), mode="smart", pages="1", options={})
        self.assertEqual(1, len(segments))
        self.assertEqual(render_pdf(make_pdf(), mode="smart", pages="1").tobytes(), segments[0].tobytes())


if __name__ == "__main__":
    unittest.main()

import io
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

import pymupdf as fitz
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from t02studio.printer import PrintResult, PrinterUnavailable
from t02studio.server import create_app


class ServerTests(unittest.TestCase):
    def setUp(self):
        self.jobs = []

        def fake_print(image, port):
            self.jobs.append((image.size, port))
            return PrintResult(port_name=port, bytes_written=100)

        self.app = create_app({
            "TESTING": True,
            "COM_PORT": "COM6",
            "ALLOWED_NETWORKS": ["127.0.0.0/8", "192.168.50.0/24"],
            "PRINT_FUNCTION": fake_print,
        })
        self.client = self.app.test_client()

    def test_status_is_available_without_login_on_home_lan(self):
        response = self.client.get("/api/status")
        self.assertEqual(200, response.status_code)
        self.assertEqual("COM6", response.json["port"])
        self.assertEqual(404, self.client.post("/api/login", json={"password": "anything"}).status_code)

    def test_default_network_scope_is_loopback_only(self):
        with patch.dict("os.environ", {"T02_ALLOWED_NETWORKS": ""}):
            app = create_app({"TESTING": True})
        response = app.test_client().get("/api/status", environ_base={"REMOTE_ADDR": "192.168.1.10"})
        self.assertEqual(403, response.status_code)

    def test_browser_editor_and_static_assets_are_served(self):
        page = self.client.get("/")
        self.assertEqual(200, page.status_code)
        self.assertIn(b"T02 Studio", page.data)
        self.assertIn(b"composition-canvas", page.data)
        self.assertIn(b"pdf-mode", page.data)
        self.assertIn(b"data-mode=\"free\"", page.data)
        self.assertNotIn(b"login-overlay", page.data)
        script = self.client.get("/static/studio.js")
        self.assertEqual(200, script.status_code)
        self.assertIn(b"/api/preview", script.data)
        script.close()
        classic = self.client.get("/classic")
        self.assertEqual(200, classic.status_code)
        self.assertIn(b"/static/app.js", classic.data)
        alternative = self.client.get("/alt")
        self.assertEqual(200, alternative.status_code)
        self.assertIn(b"/static/studio-alt.css", alternative.data)
        self.assertIn(b"/static/studio-alt-dark.css", alternative.data)
        self.assertIn(b"/static/studio-alt-theme.js", alternative.data)
        self.assertIn(b'data-theme="dark"', alternative.data)
        self.assertIn(b'id="theme-toggle"', alternative.data)
        self.assertIn(b"composition-canvas", alternative.data)
        self.assertIn(b'id="paper-resize"', alternative.data)
        self.assertIn(b'id="rotate-left"', alternative.data)
        self.assertIn(b'id="rotate-right"', alternative.data)
        self.assertIn(b'id="print-button"', alternative.data)
        self.assertIn(b'/static/studio.js', alternative.data)
        alternative_styles = self.client.get("/static/studio-alt.css")
        self.assertEqual(200, alternative_styles.status_code)
        self.assertIn(b".studio-shell", alternative_styles.data)
        self.assertIn(b".print-footer", alternative_styles.data)
        alternative_styles.close()
        dark_styles = self.client.get("/static/studio-alt-dark.css")
        self.assertEqual(200, dark_styles.status_code)
        self.assertIn(b'html[data-theme="dark"]', dark_styles.data)
        dark_styles.close()

    def test_composite_image_can_be_submitted_to_print_server(self):
        composite = io.BytesIO()
        Image.new("RGB", (384, 900), "white").save(composite, format="PNG")
        composite.seek(0)
        response = self.client.post("/api/print", data={
            "kind": "image", "file": (composite, "composite.png"),
            "image_mode": "fit", "job_id": "fb903890-5b12-4cda-a93b-5cbedb80c491"})
        self.assertEqual(200, response.status_code)
        self.assertEqual([(384, 900)], [dimensions for dimensions, _port in self.jobs])

    def test_off_lan_request_cannot_access_print_or_status(self):
        result = self.client.get("/api/status", environ_base={"REMOTE_ADDR": "203.0.113.10"})
        self.assertEqual(403, result.status_code)
        print_result = self.client.post("/api/print", data={
            "kind": "text", "text": "Protected", "job_id": "d0b1115a-34c5-47de-a962-6d609430e8f1"},
            environ_base={"REMOTE_ADDR": "203.0.113.10"})
        self.assertEqual(403, print_result.status_code)
        self.assertEqual([], self.jobs)

    def test_cross_site_browser_cannot_trigger_lan_print_without_login(self):
        payload = {"kind": "text", "text": "Drive-by", "job_id": "d0b1115a-34c5-47de-a962-6d609430e8f1"}
        for headers in ({"Origin": "https://evil.example"},
                        {"Sec-Fetch-Site": "cross-site"}):
            with self.subTest(headers=headers):
                response = self.client.post("/api/print", data=payload, headers=headers)
                self.assertEqual(403, response.status_code)
        self.assertEqual([], self.jobs)

    def test_text_preview_returns_384_dot_png_with_length(self):
        response = self.client.post("/api/preview", data={
            "kind": "text", "text": "T02 Studio", "font_size": "27", "padding": "14"})
        self.assertEqual(200, response.status_code)
        self.assertEqual("image/png", response.mimetype)
        self.assertEqual(b"\x89PNG", response.data[:4])
        self.assertGreater(float(response.headers["X-Print-Length-MM"]), 2)

    def test_pdf_smart_preview_is_default_and_page_selectable(self):
        document = fitz.open()
        page = document.new_page()
        page.insert_text((45, 65), "Hello receipt", fontsize=18)
        response = self.client.post("/api/preview", data={
            "kind": "pdf", "file": (io.BytesIO(document.tobytes()), "test.pdf"), "pages": "1"})
        self.assertEqual(200, response.status_code)
        self.assertEqual("smart", response.headers["X-PDF-Mode"])

    def test_pdf_multi_segment_preview_and_print_only_selected_segment(self):
        with patch("t02studio.server.render_pdf_segments", return_value=[
            Image.new("1", (384, 4000), 1), Image.new("1", (384, 3200), 0)
        ]) as convert:
            response = self.client.post("/api/preview", data={
                "kind": "pdf", "file": (io.BytesIO(b"synthetic"), "any.pdf"), "segment": "1"})
            self.assertEqual(200, response.status_code)
            self.assertEqual("2", response.headers["X-Total-Segments"])
            self.assertEqual("1", response.headers["X-Segment-Index"])
            job = self.client.post("/api/print", data={
                "kind": "pdf", "file": (io.BytesIO(b"synthetic"), "any.pdf"),
                "segment": "1", "job_id": "d0b1115a-34c5-47de-a962-6d609430e8f1"})
            self.assertEqual(200, job.status_code)
            self.assertEqual([(384, 3200)], [dimensions for dimensions, _port in self.jobs])
            self.assertEqual(2, convert.call_count)

    def test_qr_preview_and_invalid_pdf_get_distinct_responses(self):
        qr = self.client.post("/api/preview", data={
            "kind": "qr", "qr_value": "https://example.com", "caption": "Demo"})
        self.assertEqual(200, qr.status_code)
        bad_pdf = self.client.post("/api/preview", data={
            "kind": "pdf", "file": (io.BytesIO(b"broken"), "broken.pdf")})
        self.assertEqual(400, bad_pdf.status_code)
        self.assertIn("PDF", bad_pdf.json["error"])

    def test_print_idempotency_prevents_duplicate_physical_jobs(self):
        payload = {"kind": "text", "text": "Only one receipt", "job_id": "d0b1115a-34c5-47de-a962-6d609430e8f1"}
        response = self.client.post("/api/print", data=payload)
        self.assertEqual(200, response.status_code)
        self.assertEqual("printed", response.json["status"])
        again = self.client.post("/api/print", data=payload)
        self.assertEqual(409, again.status_code)
        self.assertEqual(1, len(self.jobs))

    def test_bad_print_input_does_not_call_hardware(self):
        response = self.client.post("/api/print", data={"kind": "text", "text": "", "job_id": "any"})
        self.assertEqual(400, response.status_code)
        self.assertEqual([], self.jobs)

    def test_unavailable_printer_returns_error_not_fake_success(self):
        def unavailable(image, port):
            raise PrinterUnavailable("COM6 kapalı")

        self.app.config["PRINT_FUNCTION"] = unavailable
        response = self.client.post("/api/print", data={
            "kind": "text", "text": "Test", "job_id": "3b0bac69-8c98-48e5-bd36-3a6a8bcc4c76"})
        self.assertEqual(503, response.status_code)
        self.assertIn("COM6", response.json["error"])


if __name__ == "__main__":
    unittest.main()

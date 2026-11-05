import sys
import threading
import unittest
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from t02studio.printer import PrinterBusy, PrinterError, PrinterUnavailable, print_image
from t02studio.profiles import PrinterProfile, T02_PROFILE


class RecordingSerial:
    def __init__(self, **kwargs):
        self.kwargs = kwargs
        self.data = bytearray()
        self.closed = False

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.closed = True

    def write(self, data):
        self.data.extend(data)
        return len(data)

    def flush(self):
        return None


class PrinterTests(unittest.TestCase):
    def setUp(self):
        self.image = Image.new("1", (384, 3), 1)

    def test_serial_packet_is_sent_exactly_once(self):
        connection = RecordingSerial()
        def factory(**kwargs):
            connection.kwargs = kwargs
            return connection
        result = print_image(self.image, "COM6", serial_factory=factory)
        self.assertGreater(result.bytes_written, 100)
        self.assertEqual(len(connection.data), result.bytes_written)
        self.assertEqual(b"\x1b\x40", bytes(connection.data[:2]))
        self.assertEqual(T02_PROFILE.baudrate, connection.kwargs["baudrate"])
        self.assertTrue(connection.closed)

    def test_unverified_profile_never_opens_a_port(self):
        sample = PrinterProfile(id="laboratory-384", name="Unverified test printer",
                                width_px=384, dpi=203, max_height_px=8000,
                                protocol="escpos-gsv0", transport="serial", baudrate=9600)
        ports_opened = []
        with self.assertRaisesRegex(PrinterUnavailable, "not been verified"):
            print_image(self.image, "COM6",
                        serial_factory=lambda **kw: ports_opened.append(kw), profile=sample)
        self.assertEqual([], ports_opened)

    def test_long_receipt_is_streamed_in_small_serial_writes(self):
        image = Image.new("1", (384, 800), 0)
        connection = RecordingSerial()
        sizes = []
        original_write = connection.write

        def record_write(data):
            sizes.append(len(data))
            return original_write(data)

        connection.write = record_write
        result = print_image(image, "COM6", serial_factory=lambda **kwargs: connection)
        self.assertGreater(len(sizes), 10)
        self.assertLessEqual(max(sizes), 1024)
        self.assertEqual(sum(sizes), result.bytes_written)

    def test_missing_bluetooth_port_gives_actionable_error(self):
        def unavailable(**kwargs):
            raise OSError("Port COM6 unavailable")
        with self.assertRaisesRegex(PrinterUnavailable, "COM6"):
            print_image(self.image, "COM6", serial_factory=unavailable)

    def test_partial_or_interrupted_write_fails_without_retry(self):
        connection = RecordingSerial()
        calls = []

        def short_write(data):
            calls.append(1)
            return len(data) - 1

        connection.write = short_write
        with self.assertRaisesRegex(PrinterError, "interrupted"):
            print_image(self.image, "COM6", serial_factory=lambda **kwargs: connection)
        self.assertEqual(1, len(calls))

    def test_second_simultaneous_print_is_rejected(self):
        entered = threading.Event()
        release = threading.Event()
        outcomes = []

        class SlowSerial(RecordingSerial):
            def write(self, data):
                entered.set()
                release.wait(timeout=3)
                return super().write(data)

        slow = SlowSerial()
        worker = threading.Thread(target=lambda: outcomes.append(
            print_image(self.image, "COM6", serial_factory=lambda **kwargs: slow)))
        worker.start()
        self.assertTrue(entered.wait(2))
        try:
            with self.assertRaises(PrinterBusy):
                print_image(self.image, "COM6", serial_factory=lambda **kwargs: RecordingSerial())
        finally:
            release.set()
            worker.join(timeout=3)
        self.assertEqual(1, len(outcomes))


if __name__ == "__main__":
    unittest.main()

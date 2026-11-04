"""One-at-a-time Windows Bluetooth serial jobs with explicit failure states."""

from __future__ import annotations

import re
import threading
from dataclasses import dataclass
from typing import Callable

from PIL import Image

from .protocol import encode_raster

_PRINT_LOCK = threading.Lock()
SERIAL_CHUNK_BYTES = 1024


class PrinterError(RuntimeError):
    pass


class PrinterUnavailable(PrinterError):
    pass


class PrinterBusy(PrinterError):
    pass


@dataclass(frozen=True)
class PrintResult:
    port_name: str
    bytes_written: int


def print_image(image: Image.Image, port_name: str = "COM6",
                serial_factory: Callable | None = None) -> PrintResult:
    if not re.fullmatch(r"COM\d{1,3}", port_name, flags=re.IGNORECASE):
        raise ValueError("Geçersiz COM portu")
    if not _PRINT_LOCK.acquire(blocking=False):
        raise PrinterBusy("Yazıcı başka bir baskıyla meşgul")
    try:
        payload = encode_raster(image)
        if serial_factory is None:
            try:
                import serial
            except ImportError as exc:
                raise PrinterUnavailable("pyserial yüklü değil") from exc
            serial_factory = serial.Serial
        try:
            connection = serial_factory(port=port_name, baudrate=9600,
                                        timeout=2, write_timeout=15)
        except (OSError, RuntimeError, ValueError) as exc:
            raise PrinterUnavailable(
                f"{port_name} açılamadı. T02 açık ve Bluetooth bağlı mı? ({exc})") from exc
        try:
            with connection as serial_port:
                for offset in range(0, len(payload), SERIAL_CHUNK_BYTES):
                    chunk = payload[offset:offset + SERIAL_CHUNK_BYTES]
                    written = serial_port.write(chunk)
                    if written != len(chunk):
                        raise PrinterError("Baskı gönderimi tamamlanamadı; yeniden denemeden önce yazıcıyı kontrol edin")
                serial_port.flush()
        except PrinterError:
            raise
        except (OSError, RuntimeError, ValueError) as exc:
            raise PrinterError(
                f"Baskı gönderimi tamamlanamadı; tekrar göndermeden önce kâğıdı kontrol edin ({exc})") from exc
        return PrintResult(port_name=port_name, bytes_written=len(payload))
    finally:
        _PRINT_LOCK.release()

"""One-at-a-time Windows Bluetooth serial jobs with explicit failure states."""

from __future__ import annotations

import re
import threading
from dataclasses import dataclass
from typing import Callable

from PIL import Image

from .profiles import PrinterProfile, T02_PROFILE
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
                serial_factory: Callable | None = None,
                *, profile: PrinterProfile = T02_PROFILE) -> PrintResult:
    if profile != T02_PROFILE or not profile.hardware_verified or profile.transport != "serial":
        raise PrinterUnavailable("This printer profile has not been verified for physical printing")
    if not re.fullmatch(r"COM\d{1,3}", port_name, flags=re.IGNORECASE):
        raise ValueError("Invalid COM port")
    if not _PRINT_LOCK.acquire(blocking=False):
        raise PrinterBusy("The printer is busy with another job")
    try:
        payload = encode_raster(image, profile=profile)
        if serial_factory is None:
            try:
                import serial
            except ImportError as exc:
                raise PrinterUnavailable("pyserial is not installed") from exc
            serial_factory = serial.Serial
        try:
            connection = serial_factory(port=port_name, baudrate=profile.baudrate,
                                        timeout=2, write_timeout=15)
        except (OSError, RuntimeError, ValueError) as exc:
            raise PrinterUnavailable(
                f"Could not open {port_name}. Is the T02 powered on and paired over Bluetooth? ({exc})") from exc
        try:
            with connection as serial_port:
                for offset in range(0, len(payload), SERIAL_CHUNK_BYTES):
                    chunk = payload[offset:offset + SERIAL_CHUNK_BYTES]
                    written = serial_port.write(chunk)
                    if written != len(chunk):
                        raise PrinterError("Print transfer was interrupted; check the printer before retrying")
                serial_port.flush()
        except PrinterError:
            raise
        except (OSError, RuntimeError, ValueError) as exc:
            raise PrinterError(
                f"Print transfer was interrupted; check the paper before retrying ({exc})") from exc
        return PrintResult(port_name=port_name, bytes_written=len(payload))
    finally:
        _PRINT_LOCK.release()
